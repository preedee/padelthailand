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
  let _url = null;
  let _key = null;

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
    _url = url;
    _key = key;
    _client = root.supabase.createClient(url, key, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    syncServerClock();  // fire-and-forget — serverNow() falls back to Date.now() until it resolves
    return _client;
  }

  function client() {
    if (!_client) throw new Error('DraftSupabase.init() must be called first');
    return _client;
  }

  // ── Server clock sync ─────────────────────────────────────────────
  // The pick timer is computed as (now - timer_started_at). For the
  // commissioner laptop and the projector to agree, `now` must reference the
  // SAME clock — otherwise any skew between the two machines' system clocks
  // shows up as a constant offset in the countdown. We sync to the Supabase
  // server clock (its REST responses carry a `Date` header) and route every
  // timer read/write through serverNow() so all devices share one reference.
  //
  // The HTTP `Date` header has 1-second resolution, so skew is accurate to
  // ~±1s — enough to collapse a multi-second drift to sub-second.
  let _clockSkewMs = 0;  // serverTime ≈ Date.now() - _clockSkewMs

  async function syncServerClock() {
    if (!_url || !_key) return;
    let best = null;  // { skew, rtt } — keep the lowest-latency sample
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      let res;
      try {
        // QA m-11 — HEAD on /rest/v1/ root 401s (no table specified), which
        // polluted the console on every page load. Switching to a real table
        // (drafts) with limit=0 + Bearer auth — same Date header, no 401 noise.
        res = await fetch(`${_url}/rest/v1/drafts?select=id&limit=0`, {
          method: 'HEAD',
          headers: { apikey: _key, Authorization: `Bearer ${_key}` },
        });
      } catch (_) {
        return;  // offline — keep the last known skew
      }
      const t1 = Date.now();
      const serverDate = res.headers.get('date');
      if (!serverDate) return;
      const rtt = t1 - t0;
      // The server sampled its clock mid-flight; estimate it at t0 + rtt/2.
      const skew = (t0 + rtt / 2) - new Date(serverDate).getTime();
      if (!best || rtt < best.rtt) best = { skew, rtt };
    }
    if (best) _clockSkewMs = best.skew;
  }

  // Current time on the shared (server) clock. Use this — never Date.now()
  // directly — anywhere a timer timestamp is read or written.
  function serverNow() {
    return Date.now() - _clockSkewMs;
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

  // ── Pending-pick broadcast (ephemeral, no DB row) ──────────────────
  // Commissioner sends a `pending` event the instant the confirm modal opens
  // so the projector can mirror the suspense moment. A `clear` event covers
  // both the cancel path and the moment the commissioner submits (the
  // authoritative reveal is then driven by the draft_picks INSERT). One
  // channel per draft, joined lazily on first send.
  // Each cache entry is { ch, ready: Promise<void> } so callers can await
  // SUBSCRIBED before sending. Supabase broadcast silently DROPS sends fired
  // while the channel is still in the JOINING state — that was the original
  // bug where the first pick of the draft would broadcast a pending event
  // that never reached the projector (M4 fix). Subsequent sends were fine
  // because the channel had finished joining.
  const _broadcastChannels = Object.create(null);
  function _broadcastChannel(draftId) {
    if (_broadcastChannels[draftId]) return _broadcastChannels[draftId];
    let resolveReady;
    const ready = new Promise((res) => { resolveReady = res; });
    const ch = client()
      .channel(`pending_pick:${draftId}`)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolveReady();
        // Other states (CHANNEL_ERROR, TIMED_OUT, CLOSED) leave `ready`
        // unresolved. Callers race against a short timeout (below), so the
        // first send falls through to a best-effort fire and we don't hang
        // the commissioner waiting for a channel that won't come up.
      });
    const entry = { ch, ready };
    _broadcastChannels[draftId] = entry;
    return entry;
  }

  // Eager pre-warm — call this once at commissioner bootstrap so the channel
  // is joined long before the first send. Returns a Promise that resolves on
  // SUBSCRIBED or rejects on a 2s timeout.
  function prewarmBroadcastChannel(draftId) {
    const { ready } = _broadcastChannel(draftId);
    return Promise.race([
      ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('broadcast subscribe timed out')), 2000)),
    ]);
  }

  // Awaits SUBSCRIBED with a tight 250ms deadline before sending. On miss,
  // sends anyway (best-effort) so a flaky channel doesn't block picks.
  async function _sendWithReady(draftId, event, payload) {
    const { ch, ready } = _broadcastChannel(draftId);
    try {
      await Promise.race([
        ready,
        new Promise((_, reject) => setTimeout(() => reject(), 250)),
      ]);
    } catch (_) { /* fall through to best-effort send */ }
    return ch.send({ type: 'broadcast', event, payload });
  }

  function broadcastPendingPick(draftId, payload) {
    return _sendWithReady(draftId, 'pending', payload);
  }

  function broadcastClearPending(draftId) {
    return _sendWithReady(draftId, 'clear', {});
  }

  // Suppress the next undo overlay on the projector — fired by the
  // commissioner's rapid-undo (U key) so the projector skips its red
  // PICK #N UNDONE reveal during rehearsal. The visible UNDO button does
  // NOT broadcast this, so the audience-facing overlay still plays for
  // legitimate undos during the live draft.
  function broadcastSilentUndo(draftId) {
    return _sendWithReady(draftId, 'silent_undo', {});
  }

  // Receiver. handlers = { onPending(payload), onClear(), onSilentUndo() }.
  function subscribeToPendingPick(draftId, handlers) {
    const { onPending, onClear, onSilentUndo } = handlers || {};
    return client()
      .channel(`pending_pick:${draftId}`)
      .on('broadcast', { event: 'pending' },     ({ payload }) => { if (onPending)     onPending(payload); })
      .on('broadcast', { event: 'clear'   },     ()            => { if (onClear)       onClear(); })
      .on('broadcast', { event: 'silent_undo' }, ()            => { if (onSilentUndo)  onSilentUndo(); })
      .subscribe();
  }

  // ── Commissioner mutations (require service_role key) ─────────────

  // ── Webhook event logging — best-effort forensic trail ─────────────
  // If commissioner-config.local.js (or any other script) has set
  // window.DRAFT_WEBHOOK_URL, every commissioner mutation fires a fire-and-
  // forget POST to that URL with a small JSON envelope. Never blocks the
  // mutation, never throws, 100ms timeout. Use it to pipe events to Slack /
  // Discord / Logflare for a post-event log if anything goes weird.
  function _logEvent(event, detail) {
    try {
      const url = (root && root.DRAFT_WEBHOOK_URL) || null;
      if (!url) return;
      const body = JSON.stringify({
        ts:    new Date().toISOString(),
        event,
        ...detail,
      });
      // AbortController gives us a hard 100ms cap so a hanging webhook can't
      // slow down the commissioner UI.
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 100);
      fetch(url, {
        method:  'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        signal:  ctrl.signal,
        // No-cors so webhook receivers that don't return CORS headers
        // (like Discord webhooks) still accept the post.
        mode: 'no-cors',
        keepalive: true,
      }).catch(() => {});
    } catch (_) { /* best-effort: never block, never throw */ }
  }

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
    _logEvent('pick_undone', { pickId, pickNumber: data && data.pick_number, teamId: data && data.team_id, playerId: data && data.player_id });
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
    const now = new Date(serverNow()).toISOString();
    const result = await updateDraft(draftId, {
      status: 'active',
      team_seed_order: teamSeedOrder,
      current_pick_number: 1,
      timer_started_at: now,
      is_timer_paused: false,
      started_at: now,
    });
    _logEvent('draft_started', { draftId, teamSeedOrder });
    return result;
  }

  // Convenience: advance to the next pick window (post-confirmation).
  async function advancePick(draftId, nextPickNumber) {
    return updateDraft(draftId, {
      current_pick_number: nextPickNumber,
      timer_started_at: new Date(serverNow()).toISOString(),
    });
  }

  // Atomic pick commit — calls the commit_pick RPC which inserts the pick AND
  // advances current_pick_number (or completes on pick 64) in a single
  // transaction with server-side order validation. Preferred over
  // insertPick + advancePick from the client; those remain available for tooling.
  //
  // Server-raised exceptions surface as PostgrestError; check err.message:
  //   - 'pick_out_of_order'    : client's pick_number didn't match server expected
  //   - 'draft_not_active'     : draft is paused/complete/pending
  //   - 'draft_not_found'      : bad draftId
  //   - duplicate-key (23505)  : player already picked (rare race after frontend filter)
  async function commitPick({ draftId, pickNumber, teamId, playerId }) {
    const { data, error } = await client().rpc('commit_pick', {
      p_draft_id:    draftId,
      p_pick_number: pickNumber,
      p_team_id:     teamId,
      p_player_id:   playerId,
    });
    if (error) {
      _logEvent('pick_failed', { pickNumber, teamId, playerId, error: error.message });
      throw error;
    }
    _logEvent('pick_committed', { pickNumber, teamId, playerId });
    return data;  // the inserted draft_picks row
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
      _recordPauseStart(draftId, serverNow());
      _logEvent('timer_paused', { draftId });
      return updateDraft(draftId, { is_timer_paused: true, status: 'paused' });
    }
    _logEvent('timer_resumed', { draftId });
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

    const pauseDurationMs = serverNow() - pausedAtMs;
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
    _recordPauseStart(draftId, serverNow());
    return updateDraft(draftId, {
      current_pick_number: newCurrentPickNumber,
      is_timer_paused: true,
      status: 'paused',
    });
  }

  // Convenience: complete the draft (status → complete).
  async function completeDraft(draftId) {
    _logEvent('draft_completed', { draftId });
    return updateDraft(draftId, { status: 'complete', completed_at: new Date().toISOString() });
  }

  // Reset the draft to a fresh `pending` state: delete all picks, clear timer,
  // wipe team_seed_order. Subscribed clients (projector + captain phones) see
  // the empty state via Realtime within ~500ms.
  async function resetDraft(draftId) {
    const c = client();
    const { error: delErr } = await c.from('draft_picks').delete().eq('draft_id', draftId);
    if (delErr) throw delErr;
    await updateDraft(draftId, {
      status: 'pending',
      current_pick_number: 1,
      timer_started_at: null,
      is_timer_paused: false,
      team_seed_order: [],
      started_at: null,
      completed_at: null,
    });
    // Belt-and-suspenders re-assert. Observed 2026-05-18: on a paused draft,
    // the combined PATCH above sometimes lands with current_pick_number/timer
    // reset but status + is_timer_paused stuck at their paused values —
    // leaving the UI showing RESUME instead of START. Root cause unknown
    // (no DB trigger, no constraint, manual PATCH of both fields works fine).
    // A second narrow PATCH of just those two fields reliably converges.
    const reset = await updateDraft(draftId, {
      status: 'pending',
      is_timer_paused: false,
    });
    _clearPauseStart(draftId);
    _logEvent('draft_reset', { draftId });
    return reset;
  }

  root.DraftSupabase = {
    init, client, serverNow,
    fetchDraft, fetchPicks, fetchPicksWithUndone,
    subscribeToDraft, subscribeToPicks,
    broadcastPendingPick, broadcastClearPending, broadcastSilentUndo, subscribeToPendingPick, prewarmBroadcastChannel,
    insertPick, commitPick, undoPick, updateDraft,
    startDraft, advancePick, setPaused, pauseForUndo, completeDraft, resetDraft,
  };
})(typeof window !== 'undefined' ? window : globalThis);
