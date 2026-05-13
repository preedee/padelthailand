/* ============================================
   Draft Supabase Client — connect, fetch, subscribe, mutate
   Depends on @supabase/supabase-js loaded as `window.supabase`.

   Load order in HTML:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="js/draft-utils.js"></script>
     <script src="js/draft-supabase.js"></script>
   ============================================ */

(function (root) {
  let _client = null;

  // Initialize with the project URL + a key.
  //   - Read-only screens (projector, captain phones): pass the ANON key.
  //   - Commissioner laptop: pass the SERVICE_ROLE key (RLS bypassed for writes).
  function init({ url, key }) {
    if (!root.supabase || !root.supabase.createClient) {
      throw new Error('Supabase JS SDK not loaded — include @supabase/supabase-js before draft-supabase.js');
    }
    if (!url || !key) {
      throw new Error('DraftSupabase.init({ url, key }) requires both fields');
    }
    _client = root.supabase.createClient(url, key, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    return _client;
  }

  function client() {
    if (!_client) throw new Error('DraftSupabase.init() must be called first');
    return _client;
  }

  // ── Reads ──────────────────────────────────────────────────────────

  // Fetch the single draft row for a tournament slug. Returns null if missing.
  async function fetchDraft(tournamentSlug) {
    const { data, error } = await client()
      .from('drafts')
      .select('*')
      .eq('tournament_slug', tournamentSlug)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Fetch all non-undone picks for a draft, ordered by pick_number.
  async function fetchPicks(draftId) {
    const { data, error } = await client()
      .from('draft_picks')
      .select('*')
      .eq('draft_id', draftId)
      .eq('is_undone', false)
      .order('pick_number', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // Fetch all picks including undone (for history panel on commissioner laptop).
  async function fetchPicksWithUndone(draftId) {
    const { data, error } = await client()
      .from('draft_picks')
      .select('*')
      .eq('draft_id', draftId)
      .order('pick_number', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // ── Realtime subscriptions ────────────────────────────────────────

  // onChange receives the updated draft row.
  function subscribeToDraft(draftId, onChange) {
    return client()
      .channel(`drafts:${draftId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drafts', filter: `id=eq.${draftId}` },
        (payload) => onChange(payload.new),
      )
      .subscribe();
  }

  // onPick receives (newRow, eventType). eventType ∈ {INSERT, UPDATE, DELETE}.
  function subscribeToPicks(draftId, onPick) {
    return client()
      .channel(`draft_picks:${draftId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_picks', filter: `draft_id=eq.${draftId}` },
        (payload) => onPick(payload.new, payload.eventType),
      )
      .subscribe();
  }

  // ── Commissioner mutations (require service_role key) ─────────────

  // Insert a new pick. Server-side guards (per spec edge case #4):
  //   - UNIQUE(draft_id, pick_number) catches out-of-order writes
  //   - UNIQUE(draft_id, player_id) WHERE is_undone=false catches duplicates
  async function insertPick({ draftId, pickNumber, teamId, playerId }) {
    const { data, error } = await client()
      .from('draft_picks')
      .insert({ draft_id: draftId, pick_number: pickNumber, team_id: teamId, player_id: playerId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Undo the most recent pick (spec edge case #1). Caller is responsible
  // for ensuring it IS the most recent — there's no DB guard on that.
  async function undoPick(pickId) {
    const { data, error } = await client()
      .from('draft_picks')
      .update({ is_undone: true })
      .eq('id', pickId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Update draft state. Caller passes a patch object, e.g.:
  //   updateDraft(id, { status: 'active', timer_started_at: new Date().toISOString() })
  async function updateDraft(draftId, patch) {
    const { data, error } = await client()
      .from('drafts')
      .update(patch)
      .eq('id', draftId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Convenience: start the draft (pending → active).
  // Caller supplies the seed-ordered team list snapshot.
  async function startDraft(draftId, teamSeedOrder) {
    if (!Array.isArray(teamSeedOrder) || teamSeedOrder.length !== 8) {
      throw new Error('teamSeedOrder must be an array of 8 community slugs');
    }
    const now = new Date().toISOString();
    return updateDraft(draftId, {
      status: 'active',
      team_seed_order: teamSeedOrder,
      current_pick_number: 1,
      timer_started_at: now,
      is_timer_paused: false,
      started_at: now,
    });
  }

  // Convenience: advance to the next pick window (post-confirmation).
  async function advancePick(draftId, nextPickNumber) {
    return updateDraft(draftId, {
      current_pick_number: nextPickNumber,
      timer_started_at: new Date().toISOString(),
    });
  }

  // Pause / resume the timer.
  //
  // Why this is tricky: the schema has no `paused_at` column. If we only flip
  // `is_timer_paused`, then on resume `timer_started_at` is still the original
  // pick-window start — so subscribers compute `now - timer_started_at` and the
  // timer "jumps forward" by the entire pause duration.
  //
  // Fix: stash the pause-start wall-clock in localStorage (per draft id, survives
  // a commissioner reload). On resume, shift `timer_started_at` forward by the
  // pause duration in a single atomic update. After the update the math works
  // out: elapsed_at_resume == elapsed_at_pause, so the timer continues from
  // where it stopped.
  function _pauseKey(draftId) { return `tps_draft_pause_${draftId}`; }

  function _recordPauseStart(draftId, atMs) {
    try { localStorage.setItem(_pauseKey(draftId), String(atMs)); } catch (_) { /* private mode */ }
  }
  function _readPauseStart(draftId) {
    try {
      const v = localStorage.getItem(_pauseKey(draftId));
      return v ? parseInt(v, 10) : null;
    } catch (_) { return null; }
  }
  function _clearPauseStart(draftId) {
    try { localStorage.removeItem(_pauseKey(draftId)); } catch (_) { /* */ }
  }

  async function setPaused(draftId, paused) {
    if (paused) {
      _recordPauseStart(draftId, Date.now());
      return updateDraft(draftId, { is_timer_paused: true, status: 'paused' });
    }
    // Resume — shift timer_started_at forward by the pause duration so the
    // visible remaining time continues from where it was when paused.
    const pausedAtMs = _readPauseStart(draftId);
    if (!pausedAtMs) {
      // No record of pause-start (commissioner laptop changed, or storage cleared).
      // Best we can do is a plain resume; the timer will jump forward by however
      // long the pause lasted. Log so the operator knows.
      console.warn('[DraftSupabase] setPaused(false) with no recorded pause-start — timer will not be shifted.');
      return updateDraft(draftId, { is_timer_paused: false, status: 'active' });
    }
    // Fetch the current timer_started_at so we can shift it.
    const { data, error } = await client()
      .from('drafts')
      .select('timer_started_at')
      .eq('id', draftId)
      .single();
    if (error) throw error;

    const pauseDurationMs = Date.now() - pausedAtMs;
    const oldStartMs      = new Date(data.timer_started_at).getTime();
    const newStartIso     = new Date(oldStartMs + pauseDurationMs).toISOString();
    _clearPauseStart(draftId);

    return updateDraft(draftId, {
      is_timer_paused: false,
      status: 'active',
      timer_started_at: newStartIso,
    });
  }

  // Pause when commissioner undoes a pick — reuses setPaused so the
  // pause-start gets recorded for a later resume shift.
  async function pauseForUndo(draftId, newCurrentPickNumber) {
    _recordPauseStart(draftId, Date.now());
    return updateDraft(draftId, {
      current_pick_number: newCurrentPickNumber,
      is_timer_paused: true,
      status: 'paused',
    });
  }

  // Convenience: complete the draft (status → complete).
  async function completeDraft(draftId) {
    return updateDraft(draftId, { status: 'complete', completed_at: new Date().toISOString() });
  }

  root.DraftSupabase = {
    init, client,
    fetchDraft, fetchPicks, fetchPicksWithUndone,
    subscribeToDraft, subscribeToPicks,
    insertPick, undoPick, updateDraft,
    startDraft, advancePick, setPaused, pauseForUndo, completeDraft,
  };
})(typeof window !== 'undefined' ? window : globalThis);
