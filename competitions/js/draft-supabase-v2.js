/* ============================================
   Draft Supabase Client — Worker-proxied write variant (v2)
   ────────────────────────────────────────────
   Same window.DraftSupabase surface as draft-supabase.js, but every
   write path is routed through the Draftday Commissioner API Worker
   instead of using the service-role JWT directly in the browser.

   Reads + Realtime subscriptions still use the anon-keyed Supabase
   client (same as the projector + captain pages — safe to deploy).

   Used by: commissioner-v2.html (staging) and eventually a hosted
   commissioner that doesn't need the laptop tunnel.

   Required globals:
     window.DRAFT_API_URL  — defaults to '/api/draft' (same-origin
                              when served by the Worker)
     window.supabase       — the supabase-js SDK
   ============================================ */

(function (root) {
  let _client = null;
  let _url = null;
  let _key = null;

  const API_BASE = (root.DRAFT_API_URL || '/api/draft').replace(/\/+$/, '');

  function init({ url, key }) {
    if (!root.supabase || !root.supabase.createClient) {
      throw new Error('Supabase JS SDK not loaded — include @supabase/supabase-js before draft-supabase-v2.js');
    }
    if (!url || !key) {
      throw new Error('DraftSupabase.init({ url, key }) requires both fields');
    }
    _url = url;
    _key = key;
    _client = root.supabase.createClient(url, key, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    syncServerClock();
    return _client;
  }

  function client() {
    if (!_client) throw new Error('DraftSupabase.init() must be called first');
    return _client;
  }

  // ── Server clock sync — identical to v1 ─────────────────────────────
  let _clockSkewMs = 0;

  async function syncServerClock() {
    if (!_url || !_key) return;
    let best = null;
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      let res;
      try {
        res = await fetch(`${_url}/rest/v1/`, { method: 'HEAD', headers: { apikey: _key } });
      } catch (_) { return; }
      const t1 = Date.now();
      const serverDate = res.headers.get('date');
      if (!serverDate) return;
      const rtt = t1 - t0;
      const skew = (t0 + rtt / 2) - new Date(serverDate).getTime();
      if (!best || rtt < best.rtt) best = { skew, rtt };
    }
    if (best) _clockSkewMs = best.skew;
  }

  function serverNow() { return Date.now() - _clockSkewMs; }

  // ── Reads (anon key, same as v1) ───────────────────────────────────

  async function fetchDraft(tournamentSlug) {
    const { data, error } = await client()
      .from('drafts').select('*')
      .eq('tournament_slug', tournamentSlug)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function fetchPicks(draftId) {
    const { data, error } = await client()
      .from('draft_picks').select('*')
      .eq('draft_id', draftId).eq('is_undone', false)
      .order('pick_number', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function fetchPicksWithUndone(draftId) {
    const { data, error } = await client()
      .from('draft_picks').select('*')
      .eq('draft_id', draftId)
      .order('pick_number', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // ── Realtime (anon key, same as v1) ────────────────────────────────

  function subscribeToDraft(draftId, onChange) {
    return client()
      .channel(`drafts:${draftId}`)
      .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'drafts', filter: `id=eq.${draftId}` },
          (payload) => onChange(payload.new))
      .subscribe();
  }

  function subscribeToPicks(draftId, onPick) {
    return client()
      .channel(`draft_picks:${draftId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'draft_picks', filter: `draft_id=eq.${draftId}` },
          (payload) => onPick(payload.new, payload.eventType))
      .subscribe();
  }

  // ── Pending-pick broadcast (anon key, same as v1) ──────────────────

  const _broadcastChannels = Object.create(null);
  function _broadcastChannel(draftId) {
    if (_broadcastChannels[draftId]) return _broadcastChannels[draftId];
    let resolveReady;
    const ready = new Promise((res) => { resolveReady = res; });
    const ch = client()
      .channel(`pending_pick:${draftId}`)
      .subscribe((status) => { if (status === 'SUBSCRIBED') resolveReady(); });
    const entry = { ch, ready };
    _broadcastChannels[draftId] = entry;
    return entry;
  }

  function prewarmBroadcastChannel(draftId) {
    const { ready } = _broadcastChannel(draftId);
    return Promise.race([
      ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('broadcast subscribe timed out')), 2000)),
    ]);
  }

  async function _sendWithReady(draftId, event, payload) {
    const { ch, ready } = _broadcastChannel(draftId);
    try {
      await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(), 250))]);
    } catch (_) { /* best-effort */ }
    return ch.send({ type: 'broadcast', event, payload });
  }

  function broadcastPendingPick(draftId, payload) { return _sendWithReady(draftId, 'pending', payload); }
  function broadcastClearPending(draftId)         { return _sendWithReady(draftId, 'clear', {}); }

  function subscribeToPendingPick(draftId, handlers) {
    const { onPending, onClear } = handlers || {};
    return client()
      .channel(`pending_pick:${draftId}`)
      .on('broadcast', { event: 'pending' }, ({ payload }) => { if (onPending) onPending(payload); })
      .on('broadcast', { event: 'clear'   }, ()             => { if (onClear)   onClear(); })
      .subscribe();
  }

  // ── Webhook event logging — same as v1 ─────────────────────────────

  function _logEvent(event, detail) {
    try {
      const url = (root && root.DRAFT_WEBHOOK_URL) || null;
      if (!url) return;
      const body = JSON.stringify({ ts: new Date().toISOString(), event, ...detail });
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 100);
      fetch(url, {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal, mode: 'no-cors', keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  // ── WRITES — all routed through the Worker ─────────────────────────
  // Every endpoint:
  //   - same-origin POST (no CORS) when served by the Worker
  //   - credentials:'include' so the Cloudflare Access cookie flows
  //   - Worker validates Cf-Access-Authenticated-User-Email vs allowlist
  //   - Worker holds the service-role key in its encrypted env

  async function _api(action, body) {
    const r = await fetch(`${API_BASE}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    });
    let payload = null;
    try { payload = await r.json(); } catch (_) {}
    if (!r.ok) {
      const msg = (payload && payload.error) || `worker_${r.status}`;
      const e = new Error(msg);
      e.status = r.status;
      e.body   = payload;
      throw e;
    }
    return payload;
  }

  // Legacy direct-insert path. The Worker doesn't expose an insertPick;
  // callers should use commitPick. Kept for back-compat — throws if used.
  async function insertPick() {
    throw new Error('insertPick deprecated in v2 — use commitPick (routes through commit_pick RPC)');
  }

  async function commitPick({ draftId, pickNumber, teamId, playerId }) {
    try {
      const data = await _api('commit-pick', { draftId, pickNumber, teamId, playerId });
      _logEvent('pick_committed', { pickNumber, teamId, playerId, via: 'worker' });
      return data;
    } catch (err) {
      _logEvent('pick_failed', { pickNumber, teamId, playerId, error: err.message, via: 'worker' });
      throw err;
    }
  }

  async function undoPick(pickId) {
    const data = await _api('undo-pick', { pickId });
    _logEvent('pick_undone', {
      pickId,
      pickNumber: data && data.pick_number,
      teamId:     data && data.team_id,
      playerId:   data && data.player_id,
      via: 'worker',
    });
    return data;
  }

  async function updateDraft(draftId, patch) {
    return _api('update-draft', { draftId, patch });
  }

  // ── Pause / resume — identical localStorage shift math as v1 ───────
  function _pauseKey(draftId) { return `tps_draft_pause_${draftId}`; }
  function _recordPauseStart(draftId, atMs) {
    try { localStorage.setItem(_pauseKey(draftId), String(atMs)); } catch (_) {}
  }
  function _readPauseStart(draftId) {
    try { const v = localStorage.getItem(_pauseKey(draftId)); return v ? parseInt(v, 10) : null; }
    catch (_) { return null; }
  }
  function _clearPauseStart(draftId) {
    try { localStorage.removeItem(_pauseKey(draftId)); } catch (_) {}
  }

  async function setPaused(draftId, paused) {
    if (paused) {
      _recordPauseStart(draftId, serverNow());
      _logEvent('timer_paused', { draftId, via: 'worker' });
      return updateDraft(draftId, { is_timer_paused: true, status: 'paused' });
    }
    _logEvent('timer_resumed', { draftId, via: 'worker' });
    const pausedAtMs = _readPauseStart(draftId);
    if (!pausedAtMs) {
      console.warn('[DraftSupabase v2] setPaused(false) with no recorded pause-start — timer will not be shifted.');
      return updateDraft(draftId, { is_timer_paused: false, status: 'active' });
    }
    // Read current timer_started_at via anon-key client (read is safe).
    const { data, error } = await client()
      .from('drafts').select('timer_started_at').eq('id', draftId).single();
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

  async function pauseForUndo(draftId, newCurrentPickNumber) {
    _recordPauseStart(draftId, serverNow());
    return updateDraft(draftId, {
      current_pick_number: newCurrentPickNumber,
      is_timer_paused: true,
      status: 'paused',
    });
  }

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
    _logEvent('draft_started', { draftId, teamSeedOrder, via: 'worker' });
    return result;
  }

  async function advancePick(draftId, nextPickNumber) {
    return updateDraft(draftId, {
      current_pick_number: nextPickNumber,
      timer_started_at: new Date(serverNow()).toISOString(),
    });
  }

  async function completeDraft(draftId) {
    _logEvent('draft_completed', { draftId, via: 'worker' });
    return updateDraft(draftId, { status: 'complete', completed_at: new Date().toISOString() });
  }

  async function resetDraft(draftId) {
    // Two-step: delete all picks (Worker endpoint), then reset the draft row.
    await _api('delete-all-picks', { draftId });
    const reset = await updateDraft(draftId, {
      status: 'pending',
      current_pick_number: 1,
      timer_started_at: null,
      is_timer_paused: false,
      team_seed_order: [],
      started_at: null,
      completed_at: null,
    });
    _clearPauseStart(draftId);
    _logEvent('draft_reset', { draftId, via: 'worker' });
    return reset;
  }

  // Same DraftSupabase global surface as v1 — drop-in replacement.
  root.DraftSupabase = {
    init, client, serverNow,
    fetchDraft, fetchPicks, fetchPicksWithUndone,
    subscribeToDraft, subscribeToPicks,
    broadcastPendingPick, broadcastClearPending, subscribeToPendingPick, prewarmBroadcastChannel,
    insertPick, commitPick, undoPick, updateDraft,
    startDraft, advancePick, setPaused, pauseForUndo, completeDraft, resetDraft,
    // v2 marker for sanity
    _variant: 'worker-proxied-v2',
    _apiBase: API_BASE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
