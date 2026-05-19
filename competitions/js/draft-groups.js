// draft-groups.js — Live group-draw projector controller.
//
// Polls the Communities tab every 3 seconds. When a community's Group column
// transitions to 'A' or 'B', plays a full-screen .pick-overlay reveal and
// then lands the team card (identical to draft.html — logo, name, stats,
// 5F+5M roster) in the corresponding A/B grid.
//
// Data sources at boot:
//   - data.js polls the Sheet (Communities, Teams and Players, etc.)
//   - DraftSupabase.fetchPicks() loads the completed draft picks
//   - Registrations tab fetched directly for non-captain player metadata
// Render delegates to window.TeamCard.render() — shared with draft.html.

(function () {
  'use strict';

  const POLL_MS = 3000;
  const OVERLAY_SUSPENSE_MS = 400;
  const OVERLAY_HOLD_MS     = 1000;
  const OVERLAY_EXIT_MS     = 350;
  const READY_POLL_MS = 100;
  const READY_TIMEOUT_MS = 10000;
  const DRAFT_SLUG = 'community-cup';

  const state = {
    assigned: new Map(),       // id → { group: 'A'|'B', status: 'queued'|'playing'|'shown' }
    queue: [],
    busy: false,
    pollTimer: null,
    players: [],               // merged captains + draftees in TeamCard shape
    picks: [],                 // Supabase picks
    avatarsByUserId: {},
  };

  let elGridA, elGridB, elCountA, elCountB, elOverlay;

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    elGridA   = document.getElementById('teamsGridA');
    elGridB   = document.getElementById('teamsGridB');
    elCountA  = document.getElementById('groupACount');
    elCountB  = document.getElementById('groupBCount');
    elOverlay = document.getElementById('pickOverlay');

    if (typeof Data === 'undefined') {
      console.error('[groups] Data layer missing — js/data.js not loaded?');
      return;
    }
    if (!window.TeamCard) {
      console.error('[groups] TeamCard module missing — js/team-card.js not loaded?');
      return;
    }

    Data.startPolling(() => {});

    // Load Communities + raw Teams-and-Players via data.js, then in parallel
    // fetch Registrations directly and Supabase picks. All three are needed
    // to render the full draft-style team card.
    const communities = await _waitForCommunities();
    if (!communities) {
      console.warn('[groups] timed out waiting for Communities data');
      return;
    }

    await _loadFullRosterData();
    _applyHeaderFromConfig();

    _seedInitialState(communities);
    _renderCounts();

    state.pollTimer = setInterval(poll, POLL_MS);
    state.countdownTimer = setInterval(_tickCountdown, 1000);
    _tickCountdown();
    document.addEventListener('visibilitychange', _onVisibilityChange);
    window.addEventListener('pagehide', _cleanup);

    console.log('[groups] boot complete', {
      seeded: state.assigned.size,
      communities: communities.length,
      players: state.players.length,
      picks: state.picks.length,
    });
  }

  function _waitForCommunities() {
    return new Promise(resolve => {
      const start = Date.now();
      (function tick() {
        const cs = Data.getCommunities ? Data.getCommunities() : null;
        if (cs && cs.length) return resolve(cs);
        if (Date.now() - start > READY_TIMEOUT_MS) return resolve(null);
        setTimeout(tick, READY_POLL_MS);
      })();
    });
  }

  // ── Roster data prep ──────────────────────────────────────────────────────
  // Mirrors draft-projector.js bootstrapLive(): merge captain rows from the
  // Teams and Players tab with non-captain registrants from the Registrations
  // tab, then attach Supabase picks. Captains always render; drafted players
  // appear once their player_id matches a pick row.

  async function _loadFullRosterData() {
    const rawPlayerRows = (Data.getPlayers && Data.getPlayers()) || [];
    const captains = rawPlayerRows
      .map(r => ({
        communityId: r['Community ID'] || '',
        playerId:    r['TPS User ID']  || '',
        name:        r['Player Name']  || '',
        gender:      _normalizeGender(r['Gender']),
        isCaptain:   String(r['Is Captain'] || '').trim().toUpperCase() === 'Y',
        avatar:      (r['Avatar'] && r['Avatar'] !== 'null') ? r['Avatar'] : '',
        level:       _parseRating(r['Level'] || r['Rating']),
        nationality: (r['Nationality'] || '').trim(),
      }))
      .filter(p => p.communityId && p.playerId);

    let registrants = [];
    try {
      registrants = await _fetchRegistrants();
    } catch (err) {
      console.warn('[groups] Registrations fetch failed:', err);
    }

    // Merge by playerId — captains (richer metadata) win.
    const seen = new Set();
    state.players = [];
    for (const p of captains) {
      if (!seen.has(p.playerId)) { seen.add(p.playerId); state.players.push(p); }
    }
    for (const p of registrants) {
      if (!seen.has(p.playerId)) { seen.add(p.playerId); state.players.push(p); }
    }

    // Avatar lookup: registrants first (per-tournament), captains overlay.
    state.avatarsByUserId = {};
    for (const p of registrants) {
      if (p.playerId && p.avatar) state.avatarsByUserId[p.playerId] = p.avatar;
    }
    for (const p of captains) {
      if (p.playerId && p.avatar) state.avatarsByUserId[p.playerId] = p.avatar;
    }

    // Supabase picks — the live-draft outcome.
    try {
      if (window.DraftSupabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        window.DraftSupabase.init({
          url: window.SUPABASE_URL,
          key: window.SUPABASE_ANON_KEY,
        });
        const draftRow = await window.DraftSupabase.fetchDraft(DRAFT_SLUG);
        if (draftRow) {
          state.picks = await window.DraftSupabase.fetchPicks(draftRow.id);
        }
      }
    } catch (err) {
      console.warn('[groups] Supabase picks fetch failed:', err && err.message);
    }
  }

  async function _fetchRegistrants() {
    if (!Data.sheetURL || !Data.parseCSVWithHeaders) return [];
    const url = Data.sheetURL('Registrations', '&headers=1');
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Registrations HTTP ' + res.status);
    const rows = Data.parseCSVWithHeaders(await res.text());
    return rows
      .filter(r => (r['User ID'] || '').trim())
      .map(r => {
        const av = (r['Avatar'] || '').trim();
        return {
          communityId: '',
          playerId:    (r['User ID'] || '').trim(),
          name:        (r['Name'] || '').trim(),
          gender:      _normalizeGender(r['Gender']),
          isCaptain:   false,
          avatar:      (av && av !== 'null' && av !== '#N/A') ? av : '',
          level:       _parseRating(r['Level (current)']),
          nationality: (r['Nationality'] || '').trim(),
        };
      });
  }

  // Pull the same draft_brand_logo / header_logo_right overrides that
  // draft-projector.js applies, so groups.html shows the Padel Society
  // wordmark and Community Cup mark instead of the bare HTML defaults.
  function _applyHeaderFromConfig() {
    if (!Data || !Data.getConfig) return;
    const leftLogo  = Data.getConfig('draft_brand_logo', '');
    const rightLogo = Data.getConfig('header_logo_right', '');
    const tname     = Data.getConfig('tournament_name', '');
    const elBrand   = document.getElementById('brandLogo');
    const elTourn   = document.getElementById('tournamentLogo');
    if (elBrand && leftLogo && !leftLogo.includes('example.com')) {
      elBrand.src = leftLogo;
      elBrand.alt = 'TPS';
    }
    if (elTourn && rightLogo && !rightLogo.includes('example.com')) {
      elTourn.src = rightLogo;
      elTourn.alt = tname || 'Tournament';
    }
  }

  function _seedInitialState(communities) {
    for (const c of communities) {
      const g = _normalizeGroup(c.group);
      if (g === 'A' || g === 'B') {
        state.assigned.set(c.id, { group: g, status: 'shown' });
        _appendCard(c, g);
      }
    }
  }

  // ── Poll + diff ───────────────────────────────────────────────────────────
  // Direct Communities-only fetch every 3s. data.js polls the full sheet on
  // its 30s interval; we layer a tighter fetch for group-cell change detection.
  async function poll() {
    let liveCommunities;
    try {
      liveCommunities = await _fetchCommunitiesNow();
    } catch (err) {
      console.warn('[groups] poll fetch failed:', err && err.message);
      return;
    }
    if (!liveCommunities) return;

    const richById = new Map((Data.getCommunities() || []).map(c => [c.id, c]));

    for (const c of liveCommunities) {
      const g = _normalizeGroup(c.group);
      if (g !== 'A' && g !== 'B') continue;
      const existing = state.assigned.get(c.id);
      if (existing && existing.group === g) continue;

      // Group correction (A→B or B→A). Strip the old card from its grid and
      // drop any still-pending queue entry, then re-queue in the new group.
      // If status is 'playing', the in-flight overlay finishes but _drainQueue's
      // onDone mismatch guard skips landing the (now-stale) card.
      if (existing) {
        if (existing.status === 'shown') _removeCard(c.id, existing.group);
        state.queue = state.queue.filter(item => item.community.id !== c.id);
      }

      const fullCommunity = richById.get(c.id) || c;
      state.assigned.set(c.id, { group: g, status: 'queued' });
      state.queue.push({ community: fullCommunity, group: g });
    }

    _renderCounts();
    _drainQueue();
  }

  function _removeCard(communityId, fromGroup) {
    const grid = fromGroup === 'A' ? elGridA : elGridB;
    if (!grid) return;
    const card = grid.querySelector(`[data-team-id="${CSS.escape(communityId)}"]`);
    if (card) card.remove();
  }

  async function _fetchCommunitiesNow() {
    if (!Data.sheetURL || !Data.parseCSVWithHeaders) return null;
    const url = Data.sheetURL('Communities', '&headers=1') + '&t=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Communities HTTP ' + res.status);
    const text = await res.text();
    const rows = Data.parseCSVWithHeaders(text);
    return rows
      .filter(r => (r['Community ID'] || '').trim())
      .map(r => ({
        id: r['Community ID'].trim(),
        group: (r['Group'] || '').trim(),
      }));
  }

  function _drainQueue() {
    if (state.busy || state.queue.length === 0 || document.hidden) return;

    state.busy = true;
    const next = state.queue.shift();
    const rec = state.assigned.get(next.community.id);
    if (rec) rec.status = 'playing';

    _playOverlay(next.community, next.group, () => {
      const r = state.assigned.get(next.community.id);
      // Mid-overlay correction: poll() flipped the assigned group while the
      // overlay was playing. Skip landing the card — the next queue item is
      // the corrected reveal.
      if (r && r.group !== next.group) {
        state.busy = false;
        _drainQueue();
        return;
      }
      if (r) r.status = 'shown';
      _appendCard(next.community, next.group);
      _renderCounts();
      state.busy = false;
      _drainQueue();
    });
  }

  function _playOverlay(community, group, done) {
    if (!elOverlay) { done(); return; }

    elOverlay.innerHTML = _overlayHTML(community, group);
    elOverlay.classList.remove('is-revealed', 'is-exiting');
    elOverlay.classList.add('is-suspense');
    elOverlay.hidden = false;
    elOverlay.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      elOverlay.classList.remove('is-suspense');
      elOverlay.classList.add('is-revealed');
      setTimeout(() => {
        elOverlay.classList.remove('is-revealed');
        elOverlay.classList.add('is-exiting');
        setTimeout(() => {
          elOverlay.hidden = true;
          elOverlay.setAttribute('aria-hidden', 'true');
          elOverlay.classList.remove('is-exiting');
          elOverlay.innerHTML = '';
          done();
        }, OVERLAY_EXIT_MS);
      }, OVERLAY_HOLD_MS);
    }, OVERLAY_SUSPENSE_MS);
  }

  function _overlayHTML(community, group) {
    const esc = TeamCard.escapeHtml;
    const init = TeamCard.initials;
    const name = esc(community.name || community.id);
    const logo = community.logoPath
      ? `<img class="pick-overlay__logo-img" src="${esc(community.logoPath)}" alt="">`
      : `<div class="pick-overlay__logo-fallback">${esc(init(community.name || community.id))}</div>`;
    return `
      <div class="pick-overlay__backdrop"></div>
      <div class="pick-overlay__inner">
        <div class="pick-overlay__header" data-revealed-text="ASSIGNED TO">DRAWING…</div>
        <div class="pick-overlay__row" style="justify-content:center;">
          <div class="pick-overlay__block" style="flex:0 1 auto; max-width:min(720px, 90vw);">
            ${logo}
            <div class="pick-overlay__name">${name}</div>
            <div class="pick-overlay__group-banner">GROUP ${group}</div>
          </div>
        </div>
      </div>
    `;
  }

  function _appendCard(community, group) {
    const grid = group === 'A' ? elGridA : elGridB;
    if (!grid) return;
    if (grid.querySelector(`[data-team-id="${CSS.escape(community.id)}"]`)) return;
    grid.insertAdjacentHTML('beforeend', TeamCard.render(community, {
      players: state.players,
      picks: state.picks,
      avatarsByUserId: state.avatarsByUserId,
      communityBase: '',
      isLive: false,
      isNext: false,
      justPickedId: null,
      expanded: false,
    }));
  }

  function _renderCounts() {
    let a = 0, b = 0;
    for (const rec of state.assigned.values()) {
      if (rec.status !== 'shown') continue;
      if (rec.group === 'A') a++; else if (rec.group === 'B') b++;
    }
    if (elCountA) elCountA.textContent = `${a} of 4`;
    if (elCountB) elCountB.textContent = `${b} of 4`;
    document.body.classList.toggle('is-complete', a >= 4 && b >= 4);
  }

  function _onVisibilityChange() {
    if (!document.hidden) _drainQueue();
  }

  function _cleanup() {
    if (state.pollTimer)      { clearInterval(state.pollTimer);      state.pollTimer = null; }
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
  }

  // Ticks down to Saturday 2026-05-23 09:00 Bangkok. Same EVENT_TARGET_MS
  // semantics as draft-projector.js's updateCompleteCountdown — keep the
  // two pages in sync if the event time ever shifts.
  const EVENT_TARGET_MS = new Date('2026-05-23T09:00:00+07:00').getTime();
  function _tickCountdown() {
    const el = document.getElementById('groupsCountdown');
    if (!el) return;
    const ms = EVENT_TARGET_MS - Date.now();
    if (ms <= 0) { el.textContent = "LET'S GO"; return; }
    const totalSec = Math.floor(ms / 1000);
    const days  = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins  = Math.floor((totalSec % 3600) / 60);
    const secs  = totalSec % 60;
    const pad2  = (n) => String(n).padStart(2, '0');
    el.textContent = `${days}D ${pad2(hours)}H ${pad2(mins)}M ${pad2(secs)}S`;
  }

  function _normalizeGroup(s) { return String(s || '').trim().toUpperCase(); }
  function _normalizeGender(g) {
    if (!g) return '';
    const s = String(g).trim().toLowerCase();
    if (s === 'f' || s.startsWith('female')) return 'F';
    if (s === 'm' || s.startsWith('male'))   return 'M';
    return '';
  }
  function _parseRating(s) {
    if (s == null) return null;
    const m = String(s).match(/^\s*([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

})();
