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

  // Convenience: pause/resume the timer.
  async function setPaused(draftId, paused) {
    return updateDraft(draftId, { is_timer_paused: paused, status: paused ? 'paused' : 'active' });
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
    startDraft, advancePick, setPaused, completeDraft,
  };
})(typeof window !== 'undefined' ? window : globalThis);
