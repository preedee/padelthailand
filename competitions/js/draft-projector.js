/* ============================================
   Draft Projector — controller
   Phase 2: read-only broadcast view. Subscribes to Supabase drafts +
   draft_picks. Renders the 8-team grid, moment zone, converging bars
   on a RAF tick loop.

   URL params:
     ?slug=<slug>     tournament_slug for the drafts row (default: community-cup)
     ?sheet=<id>      Sheet ID override (forwarded to data.js)
     ?mock=1          run without Supabase/Sheet, synthesize state for UI test
     ?debug=1         enable verbose console + ?t= controls for state stepping
   ============================================ */

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 1. URL params & constants
  // ──────────────────────────────────────────────────────────
  const params   = new URLSearchParams(window.location.search);
  const SLUG     = params.get('slug') || 'community-cup';
  // Per-competition stub sets window.__DRAFT_BASE (e.g. "/competitions/tps-may2026/draft").
  // When present, team-name links point at the clean per-community URL under it;
  // otherwise they fall back to the generic engine page (team.html?community=).
  const DRAFT_BASE = (window.__DRAFT_BASE || '').replace(/\/+$/, '');
  const MOCK     = params.get('mock') === '1';
  const DEBUG    = params.get('debug') === '1';
  const N_TEAMS  = 8;
  const N_ROUNDS = 8;

  const log = (...a) => DEBUG && console.log('[projector]', ...a);

  // ──────────────────────────────────────────────────────────
  // 2. DOM refs (single lookups, cached)
  // ──────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const elBrandLogo      = $('brandLogo');
  const elTournamentName = $('tournamentName');
  const elTournamentLogo = $('tournamentLogo');
  const elReconnect      = $('reconnect');
  const elMomentBlock    = $('momentBlock');
  const elNextLogo       = $('nextLogo');
  const elNextLabel      = $('nextLabel');
  const elNextName       = $('nextName');
  const elClockLogo      = $('clockLogo');
  const elClockName      = $('clockName');
  const elClockMeta      = $('clockMeta');
  const elTimerNum       = $('timerNum');
  const elTeamsGrid      = $('teamsGrid');
  const elPickOverlay    = $('pickOverlay');

  // ──────────────────────────────────────────────────────────
  // 3. State
  // ──────────────────────────────────────────────────────────
  const state = {
    draft:       null,   // Supabase drafts row
    picks:       [],     // Supabase draft_picks (non-undone)
    communities: [],     // Sheet — [{id,name,group,color,logoPath,captainM,captainF}]
    players:     [],     // Sheet — [{communityId,playerId,name,gender,isCaptain,avatar,level}]
    justPicked:  null,   // {player_id, team_id} from last INSERT; cleared after render
    chimeFired:  false,  // latched once per pick window
    lastPickNumber: 0,   // detect pick-window transitions to reset chime latch
    pendingOverlay: null, // {playerId, teamId, …} while a confirm modal is open
    overlayPhase:   null, // 'suspense' | 'revealed' | 'exiting' | null
  };

  // ──────────────────────────────────────────────────────────
  // 4. Helpers — normalization
  // ──────────────────────────────────────────────────────────
  function normalizeGender(g) {
    if (!g) return '';
    const s = String(g).trim().toLowerCase();
    if (s === 'f' || s.startsWith('female')) return 'F';
    if (s === 'm' || s.startsWith('male'))   return 'M';
    return '';
  }
  function parseRating(s) {
    if (s == null) return null;
    const m = String(s).match(/^\s*([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }
  function firstName(full) {
    if (!full) return '';
    return String(full).trim().split(/[\s_]/)[0];
  }
  function initials(s) {
    if (!s) return '?';
    const parts = String(s).trim().split(/\s+/);
    return ((parts[0]||'')[0] || '?').toUpperCase();
  }
  function formatTimer(seconds) {
    const neg = seconds < 0;
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = Math.floor(abs % 60);
    return (neg ? '-' : '') + m + ':' + String(s).padStart(2, '0');
  }
  // Mean of the numeric `level` field across roster slots (player objects or
  // nulls). Returns a 1-decimal string, or '—' when no slot has a level.
  function averageLevel(slots) {
    const levels = slots
      .filter(p => p && typeof p.level === 'number' && !isNaN(p.level))
      .map(p => p.level);
    if (!levels.length) return '—';
    return (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1);
  }

  // Country name → ISO 3166-1 alpha-2 code. Mirrors the table on the
  // commissioner + captain pages so flags read identically everywhere.
  const COUNTRY_CODE = {
    'thailand': 'TH', 'th': 'TH',
    'brazil': 'BR', 'br': 'BR',
    'spain': 'ES', 'es': 'ES',
    'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB', 'scotland': 'GB',
    'turkey': 'TR', 'tr': 'TR',
    'russia': 'RU', 'ru': 'RU',
    'italy': 'IT', 'it': 'IT',
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'france': 'FR', 'fr': 'FR',
    'germany': 'DE', 'de': 'DE',
    'india': 'IN', 'in': 'IN',
    'japan': 'JP', 'jp': 'JP',
    'china': 'CN', 'cn': 'CN',
    'korea': 'KR', 'south korea': 'KR', 'kr': 'KR',
    'argentina': 'AR', 'mexico': 'MX', 'chile': 'CL', 'colombia': 'CO', 'peru': 'PE',
    'australia': 'AU', 'canada': 'CA', 'new zealand': 'NZ',
    'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT',
    'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
    'portugal': 'PT', 'poland': 'PL', 'czech republic': 'CZ', 'czechia': 'CZ',
    'singapore': 'SG', 'malaysia': 'MY', 'indonesia': 'ID', 'philippines': 'PH',
    'vietnam': 'VN', 'hong kong': 'HK', 'taiwan': 'TW',
    'south africa': 'ZA', 'ireland': 'IE', 'greece': 'GR', 'israel': 'IL',
    'uae': 'AE', 'united arab emirates': 'AE', 'saudi arabia': 'SA',
    'ukraine': 'UA', 'romania': 'RO', 'hungary': 'HU', 'serbia': 'RS', 'croatia': 'HR',
    'bangladesh': 'BD', 'sri lanka': 'LK', 'luxembourg': 'LU',
    'myanmar': 'MM', 'burma': 'MM', 'myanmar [burma]': 'MM',
  };
  function countryCodeFor(name) {
    if (!name) return '';
    const key = String(name).trim().toLowerCase();
    return COUNTRY_CODE[key] || (key.length === 2 ? key.toUpperCase() : '');
  }
  function flagEmoji(code) {
    if (!code || code.length !== 2) return '';
    const cp = [...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0));
    return String.fromCodePoint(...cp);
  }

  // ──────────────────────────────────────────────────────────
  // 5. Mini CSV fetcher — Teams and Players tab
  // Data layer (js/data.js) only exposes player avatars today; we need
  // full roster (name, gender, captain flag). Self-contained to avoid
  // editing data.js.
  // ──────────────────────────────────────────────────────────
  function splitCSVLine(line) {
    const fields = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i+1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (ch === ',' && !q) { fields.push(cur); cur = ''; }
      else cur += ch;
    }
    fields.push(cur);
    return fields;
  }
  function parseCSV(text) {
    const lines = []; let cur = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { cur += ch; q = !q; }
      else if (ch === '\n' && !q) { lines.push(cur); cur = ''; }
      else if (ch === '\r' && !q) { /* skip */ }
      else cur += ch;
    }
    if (cur.trim()) lines.push(cur);
    if (lines.length < 2) return [];
    const headers = splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
    return lines.slice(1).map(line => {
      const vals = splitCSVLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
      return row;
    });
  }
  function gvizUrl(tabName) {
    const urlParams = new URLSearchParams(window.location.search);
    const sheetId = window.__SHEET_ID || urlParams.get('sheet') ||
                    '1ZvTjeu-rgNFGG5lX-DY5k8riy_ezPIAtcSNr5BjY4DQ'; // TPS community cup default
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  }
  async function fetchTabRows(tabName) {
    const res = await fetch(gvizUrl(tabName));
    if (!res.ok) throw new Error(`${tabName} HTTP ${res.status}`);
    return parseCSV(await res.text());
  }
  // Reads the 80-row Teams and Players tab — the 16 captain rows have full
  // metadata via the sheet's INDEX/MATCH formulas; the other 64 rows are
  // placeholder slots (blank TPS User ID) and are dropped.
  function parseTeamsAndPlayers(rows) {
    return rows.map(r => ({
      communityId: r['Community ID'] || '',
      playerId:    r['TPS User ID']  || '',
      name:        r['Player Name']  || '',
      gender:      normalizeGender(r['Gender']),
      isCaptain:   String(r['Is Captain'] || '').trim().toUpperCase() === 'Y',
      avatar:      (r['Avatar'] && r['Avatar'] !== 'null') ? r['Avatar'] : '',
      level:       parseRating(r['Level'] || r['Rating']),
      nationality: (r['Nationality'] || '').trim(),
    })).filter(p => p.communityId && p.playerId);   // drop placeholder rows
  }
  // Reads the Registrations tab — the canonical roster for non-captain
  // players. The projector falls back to this when a drafted player's
  // TPS User ID isn't in Teams and Players (which is true for every
  // non-captain pick mid-draft).
  function parseRegistrations(rows) {
    return rows
      .filter(r => (r['User ID'] || '').trim() && (r['Paid ?'] || '').trim().toUpperCase() === 'Y')
      .map(r => ({
        communityId: '',
        playerId:    (r['User ID'] || '').trim(),
        name:        (r['Name'] || '').trim(),
        gender:      normalizeGender(r['Gender']),
        isCaptain:   false,
        avatar:      '',
        level:       parseRating(r['Level (current)']),
        nationality: (r['Nationality'] || '').trim(),
      }));
  }
  async function fetchPlayersFromSheet() {
    try {
      const [teamsRows, regRows] = await Promise.all([
        fetchTabRows('Teams and Players'),
        fetchTabRows('Registrations'),
      ]);
      const captains = parseTeamsAndPlayers(teamsRows);
      const registrants = parseRegistrations(regRows);
      // Merge by playerId — captain rows (richer: have community+avatar+isCaptain) win.
      const seen = new Set();
      const merged = [];
      for (const p of captains) {
        if (!seen.has(p.playerId)) { seen.add(p.playerId); merged.push(p); }
      }
      for (const p of registrants) {
        if (!seen.has(p.playerId)) { seen.add(p.playerId); merged.push(p); }
      }
      return merged;
    } catch (err) {
      console.warn('[projector] failed to fetch players from sheet:', err);
      return [];
    }
  }

  // The Users tab is the system-wide directory (~14k rows, ~2.7MB). We only
  // want it as a fallback for drafted players who aren't in Registrations
  // (commissioner picked a TPS user directly). Lazy + cached + single-flight.
  let _usersPromise = null;
  function fetchUsersFromSheet() {
    if (_usersPromise) return _usersPromise;
    _usersPromise = (async () => {
      try {
        const rows = await fetchTabRows('Users');
        return rows
          .filter(r => (r['id'] || '').trim())
          .map(r => ({
            communityId: '',
            playerId:    (r['id'] || '').trim(),
            name:        (r['full_name'] || '').trim(),
            gender:      normalizeGender(r['gender']),
            isCaptain:   false,
            avatar:      (r['avatar'] && r['avatar'] !== 'null') ? r['avatar'] : '',
            level:       parseRating(r['level']),
            nationality: (r['country'] || '').trim(),
          }));
      } catch (err) {
        console.warn('[projector] Users tab fetch failed:', err);
        return [];
      }
    })();
    return _usersPromise;
  }

  // After the initial render, if any pick's player_id wasn't resolved by
  // Registrations + Teams and Players, fall back to Users and merge those
  // records in. Triggers one rerender on success.
  async function maybeResolveMissingPicksFromUsers() {
    const known = new Set(state.players.map(p => p.playerId));
    const missing = state.picks
      .filter(p => !p.is_undone && !known.has(p.player_id))
      .map(p => p.player_id);
    if (missing.length === 0) return false;
    const users = await fetchUsersFromSheet();
    if (!users.length) return false;
    const wanted = new Set(missing);
    const additions = users.filter(u => wanted.has(u.playerId));
    if (!additions.length) return false;
    state.players = state.players.concat(additions);
    return true;
  }

  // ──────────────────────────────────────────────────────────
  // 6. Audio chime — Web Audio API, single-fire per pick window
  // Lazily created on first user interaction (autoplay policy).
  // ──────────────────────────────────────────────────────────
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }
  // Unlock audio on first interaction
  function unlockAudio() {
    const ctx = ensureAudio();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  }
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);

  function playChime() {
    const ctx = ensureAudio();
    if (!ctx || ctx.state === 'suspended') return;
    // Two-tone descending chime — 880Hz → 660Hz, 0.45s total, exponential decay
    const now = ctx.currentTime;
    [{ f: 880, t: 0 }, { f: 660, t: 0.18 }].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.4);
    });
  }

  // ──────────────────────────────────────────────────────────
  // 7. Derived state — what to render given the state object
  // ──────────────────────────────────────────────────────────
  // Returns array of 8 community objects in draft seed order.
  function seedOrderedCommunities() {
    const order = (state.draft && state.draft.team_seed_order) || [];
    if (!order.length) {
      // Pre-draft fallback: just return communities in their natural order
      return state.communities.slice(0, N_TEAMS);
    }
    return order.map(id => state.communities.find(c => c.id === id))
                .filter(Boolean);
  }

  function currentPickNumber() {
    return Math.max(1, Math.min(N_TEAMS * N_ROUNDS, (state.draft && state.draft.current_pick_number) || 1));
  }

  function currentTeamId() {
    const order = (state.draft && state.draft.team_seed_order) || [];
    if (order.length !== N_TEAMS) return null;
    try {
      return window.DraftUtils.teamForPick(currentPickNumber(), order);
    } catch (e) { return null; }
  }

  function nextTeamId() {
    const order = (state.draft && state.draft.team_seed_order) || [];
    if (order.length !== N_TEAMS) return null;
    const n = currentPickNumber();
    if (n >= N_TEAMS * N_ROUNDS) return null;
    try { return window.DraftUtils.teamForPick(n + 1, order); }
    catch (e) { return null; }
  }

  // Map team_id → roster from picks + captains
  function rosterFor(teamId) {
    const draftedIds = new Set();
    const drafted = [];
    state.picks.forEach(p => {
      if (p.is_undone) return;
      if (p.team_id !== teamId) return;
      draftedIds.add(p.player_id);
      const player = state.players.find(pl => pl.playerId === p.player_id) ||
                     { playerId: p.player_id, name: p.player_id, gender: '', isCaptain: false, avatar: '' };
      drafted.push({ ...player, _pickNumber: p.pick_number });
    });
    // Captains — assumed pre-assigned (Community ID set + Is Captain=Y in Sheet)
    const captains = state.players.filter(p =>
      p.communityId === teamId && p.isCaptain && !draftedIds.has(p.playerId));

    // Bucket into F / M
    const fSlots = []; const mSlots = [];
    captains.forEach(p => {
      if (p.gender === 'F') fSlots.push({ ...p, _captain: true });
      else if (p.gender === 'M') mSlots.push({ ...p, _captain: true });
    });
    drafted.forEach(p => {
      if (p.gender === 'F') fSlots.push(p);
      else if (p.gender === 'M') mSlots.push(p);
      else { /* unknown gender — best-effort: bucket to whichever is shorter */
        (fSlots.length <= mSlots.length ? fSlots : mSlots).push(p);
      }
    });
    while (fSlots.length < 5) fSlots.push(null);
    while (mSlots.length < 5) mSlots.push(null);
    return { F: fSlots.slice(0, 5), M: mSlots.slice(0, 5) };
  }

  // ──────────────────────────────────────────────────────────
  // 8. Rendering
  // ──────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function renderTeamCard(community, isLive, isNext) {
    if (!community) {
      return `<div class="team-card"><div class="tname">—</div><div class="team-logo">?</div></div>`;
    }
    const cls = ['team-card', isLive && 'live', isNext && 'next'].filter(Boolean).join(' ');
    const teamColor = community.color || '#6b7a99';
    const tInitials = initials(community.name || community.id);
    const logoHtml = community.logoPath
      ? `<img src="${escapeHtml(community.logoPath)}" alt="${escapeHtml(community.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${escapeHtml(tInitials)}'}))">`
      : escapeHtml(tInitials);
    const { F, M } = rosterFor(community.id);
    const teamHref = DRAFT_BASE
      ? `${DRAFT_BASE}/${escapeHtml(community.id)}`
      : `team.html?community=${escapeHtml(community.id)}`;

    // Average levels — recomputed every render, so they track drafts live.
    const avgTeam   = averageLevel(F.concat(M));
    const avgFemale = averageLevel(F);
    const avgMale   = averageLevel(M);

    function slotHtml(player, row) {
      if (!player) return `<div class="slot empty"></div>`;
      const justPicked = state.justPicked && state.justPicked.player_id === player.playerId;
      const cls = ['slot', 'filled', player._captain && 'captain'].filter(Boolean).join(' ');
      const av = player.avatar
        ? `<img src="${escapeHtml(player.avatar)}" alt="${escapeHtml(player.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${escapeHtml(initials(player.name))}'}))">`
        : escapeHtml(initials(player.name));
      const flag = flagEmoji(countryCodeFor(player.nationality));
      const flagHtml = flag
        ? `<div class="flag" title="${escapeHtml(player.nationality || '')}">${flag}</div>`
        : '';
      return `<div class="${cls}"${justPicked ? ' data-just-picked="1"' : ''}>
        <div class="avatar">${av}${flagHtml}</div>
        <div class="fname">${escapeHtml(firstName(player.name))}</div>
      </div>`;
    }

    return `
      <div class="${cls}" style="--team-color: ${escapeHtml(teamColor)};" data-team-id="${escapeHtml(community.id)}">
        <a class="tname" href="${teamHref}">${escapeHtml(community.name || community.id)}</a>
        <div class="team-stats">
          <div class="stat stat-female"><span class="stat-label" aria-label="Female">♀</span><span class="stat-val">${avgFemale}</span></div>
          <div class="stat stat-team"><span class="stat-label" aria-label="Team">⚥</span><span class="stat-val">${avgTeam}</span></div>
          <div class="stat stat-male"><span class="stat-label" aria-label="Male">♂</span><span class="stat-val">${avgMale}</span></div>
        </div>
        <div class="team-logo">${logoHtml}</div>
        <div class="roster10">
          <div class="row-female" style="display:contents">
            ${F.map(p => slotHtml(p, 'F')).join('')}
          </div>
          <div class="row-male" style="display:contents">
            ${M.map(p => slotHtml(p, 'M')).join('')}
          </div>
        </div>
      </div>`;
  }

  function renderMomentZone() {
    const liveId = currentTeamId();
    const nextId = nextTeamId();
    const pickN  = currentPickNumber();
    const round  = window.DraftUtils.roundForPick(pickN);

    const liveCommunity = state.communities.find(c => c.id === liveId);
    const nextCommunity = state.communities.find(c => c.id === nextId);

    elClockName.textContent = (liveCommunity && liveCommunity.name) || 'WAITING…';
    elClockMeta.textContent = `PICK ${pickN} · ROUND ${round} OF ${N_ROUNDS}`;
    elClockLogo.innerHTML = liveCommunity && liveCommunity.logoPath
      ? `<img src="${escapeHtml(liveCommunity.logoPath)}" alt="">`
      : escapeHtml(initials((liveCommunity && liveCommunity.name) || '?'));

    if (nextCommunity) {
      elNextLabel.textContent = `NEXT UP · PICK ${pickN + 1}`;
      elNextName.textContent  = nextCommunity.name || nextCommunity.id;
      elNextLogo.innerHTML = nextCommunity.logoPath
        ? `<img src="${escapeHtml(nextCommunity.logoPath)}" alt="">`
        : escapeHtml(initials(nextCommunity.name));
    } else {
      // No next team — pre-draft (no seed order yet) OR final pick already on the clock.
      const isPreDraft = !state.draft || state.draft.status === 'pending' || !state.draft.team_seed_order || state.draft.team_seed_order.length !== N_TEAMS;
      elNextLabel.textContent = isPreDraft ? 'DRAFT PENDING' : 'FINAL PICK';
      elNextName.textContent  = '—';
      elNextLogo.textContent  = '—';
    }
  }

  function renderTeamGrid() {
    const liveId = currentTeamId();
    const nextId = nextTeamId();
    const teamsInSeedOrder = seedOrderedCommunities();
    // Fill to 8 with nulls so grid stays 4x2 even pre-draft
    while (teamsInSeedOrder.length < N_TEAMS) teamsInSeedOrder.push(null);
    elTeamsGrid.innerHTML = teamsInSeedOrder.map(c =>
      renderTeamCard(c, c && c.id === liveId, c && c.id === nextId)
    ).join('');
  }

  function renderAll() {
    renderMomentZone();
    renderTeamGrid();
    // Clear just-picked latch so subsequent renders don't re-animate
    state.justPicked = null;
  }

  // ──────────────────────────────────────────────────────────
  // 8b. Pick overlay — full-screen suspense + reveal
  //
  // The commissioner broadcasts `pending` the instant their confirm modal opens
  // and `clear` if they cancel; the projector listens and runs this state
  // machine. The authoritative reveal is driven by the existing draft_picks
  // INSERT subscription — when a row arrives whose player matches the pending
  // overlay, we swap from suspense to revealed, then auto-exit. This avoids
  // any race between a broadcast event and the DB write.
  // ──────────────────────────────────────────────────────────
  const OVERLAY_HOLD_MS = 3300;  // stamp settles ~700ms + 2600ms hold
  let _overlayHoldTimer = null;

  function _overlayHTML(p) {
    const ratingTxt = p.rating != null ? ('⭐ ' + p.rating) : '—';
    const hand = p.hand === 'L' ? 'L 🫲'
               : p.hand === 'R' ? '🫱 R'
               : p.hand === 'B' ? 'L 🤲 R' : '';
    const side = p.side === 'F' ? 'L ⬅️'
               : p.side === 'B' ? '➡️ R'
               : p.side === 'E' ? 'L ↔️ R' : '';
    const statBits = [ratingTxt, hand, side].filter(Boolean).join('  ·  ');
    const genderClass = p.gender === 'F' ? 'pick-overlay__avatar--f'
                      : p.gender === 'M' ? 'pick-overlay__avatar--m' : '';
    const avatarSrc = p.playerAvatar || '';
    const avatar = avatarSrc
      ? `<img class="pick-overlay__avatar ${genderClass}" src="${escapeHtml(avatarSrc)}" alt="">`
      : `<div class="pick-overlay__avatar ${genderClass}" style="display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:700;background:var(--bg-deep);color:var(--ink);">${escapeHtml(initials(p.playerName))}</div>`;
    const logo = p.teamLogo
      ? `<img class="pick-overlay__logo-img" src="${escapeHtml(p.teamLogo)}" alt="">`
      : `<div class="pick-overlay__logo-fallback">${escapeHtml(initials(p.teamName))}</div>`;
    return `
      <div class="pick-overlay__backdrop"></div>
      <div class="pick-overlay__inner">
        <div class="pick-overlay__header" data-suspense-text="CONFIRM PICK #${p.pickNumber}" data-revealed-text="PICK #${p.pickNumber} LOCKED IN">CONFIRM PICK #${p.pickNumber}</div>
        <div class="pick-overlay__row">
          <div class="pick-overlay__block pick-overlay__player">
            ${avatar}
            <div class="pick-overlay__name">${escapeHtml(p.playerName || '')}</div>
            <div class="pick-overlay__stat">${escapeHtml(statBits)}</div>
          </div>
          <div class="pick-overlay__arrow">→</div>
          <div class="pick-overlay__block pick-overlay__team">
            ${logo}
            <div class="pick-overlay__name">${escapeHtml(p.teamName || '')}</div>
            <div class="pick-overlay__sub">Pick #${p.pickNumber}${p.gender ? '  ·  ' + escapeHtml(p.gender) : ''}</div>
          </div>
          <div class="pick-overlay__stamp">PICK #${p.pickNumber} LOCKED</div>
        </div>
      </div>
    `;
  }

  function showPendingOverlay(payload) {
    if (!payload || !elPickOverlay) return;
    if (_overlayHoldTimer) { clearTimeout(_overlayHoldTimer); _overlayHoldTimer = null; }
    state.pendingOverlay = payload;
    state.overlayPhase   = 'suspense';
    elPickOverlay.innerHTML = _overlayHTML(payload);
    elPickOverlay.classList.remove('is-revealed', 'is-exiting');
    elPickOverlay.classList.add('is-suspense');
    elPickOverlay.hidden = false;
    elPickOverlay.setAttribute('aria-hidden', 'false');
    log('overlay → suspense');
  }

  function revealPickOverlay() {
    if (!elPickOverlay || state.overlayPhase !== 'suspense') return;
    state.overlayPhase = 'revealed';
    const headerEl = elPickOverlay.querySelector('.pick-overlay__header');
    if (headerEl && headerEl.dataset.revealedText) headerEl.textContent = headerEl.dataset.revealedText;
    elPickOverlay.classList.remove('is-suspense');
    elPickOverlay.classList.add('is-revealed');
    log('overlay → revealed');
    _overlayHoldTimer = setTimeout(exitPickOverlay, OVERLAY_HOLD_MS);
  }

  // Cancel path — the suspense moment is over without a reveal. If we're
  // already in `revealed`, ignore (the auto-exit will handle it).
  function clearPendingOverlay() {
    if (!elPickOverlay) return;
    if (state.overlayPhase === 'revealed' || state.overlayPhase === 'exiting') return;
    exitPickOverlay();
  }

  function exitPickOverlay() {
    if (!elPickOverlay || !state.overlayPhase) return;
    if (_overlayHoldTimer) { clearTimeout(_overlayHoldTimer); _overlayHoldTimer = null; }
    state.overlayPhase = 'exiting';
    elPickOverlay.classList.remove('is-suspense', 'is-revealed');
    elPickOverlay.classList.add('is-exiting');
    setTimeout(() => {
      elPickOverlay.hidden = true;
      elPickOverlay.setAttribute('aria-hidden', 'true');
      elPickOverlay.classList.remove('is-exiting');
      elPickOverlay.innerHTML = '';
      state.pendingOverlay = null;
      state.overlayPhase   = null;
      log('overlay → hidden');
    }, 420);
  }

  // ──────────────────────────────────────────────────────────
  // 9. RAF tick loop — timer, bar progress, color state, chime latch
  // ──────────────────────────────────────────────────────────
  function tick() {
    const d = state.draft;
    if (d && d.timer_started_at && !d.is_timer_paused && d.status === 'active') {
      state.pausedRendered = false;  // reset latch so a future pause will paint once
      const startMs = new Date(d.timer_started_at).getTime();
      const totalS  = d.pick_timer_seconds || 45;
      const remS    = window.DraftUtils.remainingSeconds(startMs, totalS, window.DraftSupabase.serverNow());

      // Timer text
      elTimerNum.textContent = formatTimer(remS);

      // Color state
      const stateName = window.DraftUtils.timerColorState(remS, totalS);
      elMomentBlock.classList.remove('state-green', 'state-orange', 'state-red');
      elMomentBlock.classList.add('state-' + stateName);

      // Bar progress: 0% at full time → 50% at exactly 0:00 → past 50% on overshoot
      // Map remaining/total: 1.0 → 0%; 0.0 → 50%; negative → grows past 50%
      const elapsedFrac = (totalS - remS) / totalS; // 0..1 during normal, >1 in negative
      let pct;
      if (elapsedFrac <= 1) {
        pct = elapsedFrac * 50;          // 0..50
      } else {
        // Overshoot: cap at 75% so bars don't visually wrap. Each second of negative ~ 2.5%
        const overshoot = Math.min(25, (elapsedFrac - 1) * totalS * 0.5);
        pct = 50 + overshoot;
      }
      elMomentBlock.style.setProperty('--bar-progress', pct.toFixed(2) + '%');
      elMomentBlock.classList.toggle('overshoot', pct > 50);

      // Audio cue: latch on zero-crossing within current pick window
      if (state.lastPickNumber !== d.current_pick_number) {
        // New pick window — reset latch
        state.chimeFired = false;
        state.lastPickNumber = d.current_pick_number;
      }
      if (remS <= 0 && !state.chimeFired) {
        state.chimeFired = true;
        playChime();
      }
    } else if (d && d.status === 'complete') {
      elTimerNum.textContent = 'DONE';
      elMomentBlock.style.setProperty('--bar-progress', '50%');
    } else if (d && d.is_timer_paused) {
      // Paused — freeze the display. The active-state tick (above) just painted
      // the up-to-date value the frame before pause arrived, so we leave it.
      // The one case we have to handle is "projector loads INTO an already-paused
      // state" — there the DOM still shows the HTML placeholder. Paint once.
      if (!state.pausedRendered && d.timer_started_at) {
        const startMs = new Date(d.timer_started_at).getTime();
        const totalS  = d.pick_timer_seconds || 45;
        const remS    = window.DraftUtils.remainingSeconds(startMs, totalS, window.DraftSupabase.serverNow());
        elTimerNum.textContent = formatTimer(remS);
        const stateName = window.DraftUtils.timerColorState(remS, totalS);
        elMomentBlock.classList.remove('state-green', 'state-orange', 'state-red');
        elMomentBlock.classList.add('state-' + stateName);
        state.pausedRendered = true;
      }
    } else {
      // Pre-draft or no draft row
      elTimerNum.textContent = '0:' + String((d && d.pick_timer_seconds) || 45).padStart(2, '0');
      elMomentBlock.style.setProperty('--bar-progress', '0%');
      elMomentBlock.classList.remove('state-orange', 'state-red');
      elMomentBlock.classList.add('state-green');
    }

    requestAnimationFrame(tick);
  }

  // ──────────────────────────────────────────────────────────
  // 10. Subscriptions — Supabase live updates
  // ──────────────────────────────────────────────────────────
  function showReconnecting(show) {
    elReconnect.classList.toggle('show', !!show);
  }

  async function bootstrapLive() {
    if (!window.DraftSupabase) {
      console.error('[projector] DraftSupabase missing — check script load order');
      return;
    }
    try {
      window.DraftSupabase.init({
        url: window.SUPABASE_URL,
        key: window.SUPABASE_ANON_KEY,
      });
    } catch (err) {
      console.error('[projector] DraftSupabase.init failed:', err);
      showReconnecting(true);
      return;
    }

    let draftRow = null;
    try {
      draftRow = await window.DraftSupabase.fetchDraft(SLUG);
    } catch (err) {
      console.warn('[projector] fetchDraft failed:', err);
      showReconnecting(true);
    }
    if (!draftRow) {
      log('No draft row for slug', SLUG, ' yet — polling until commissioner creates one.');
      renderAll();
      // Poll until the commissioner creates the drafts row, then re-enter bootstrap.
      const waitTimer = setInterval(async () => {
        try {
          const d = await window.DraftSupabase.fetchDraft(SLUG);
          if (d) {
            clearInterval(waitTimer);
            log('Draft row appeared — bootstrapping live state.');
            bootstrapLive();
          }
        } catch (_) { /* network blip — keep polling */ }
      }, 4000);
      return;
    }
    state.draft = draftRow;
    try {
      state.picks = await window.DraftSupabase.fetchPicks(draftRow.id);
    } catch (err) {
      console.warn('[projector] fetchPicks failed:', err);
    }
    renderAll();
    // Fallback path: if a pick references a player not in Registrations
    // (commissioner picked a TPS user directly), lazily fetch Users and
    // rerender once those rows are merged in.
    maybeResolveMissingPicksFromUsers().then(changed => { if (changed) renderAll(); });

    // Subscribe
    const draftChan = window.DraftSupabase.subscribeToDraft(draftRow.id, (newRow) => {
      log('draft UPDATE received:', { paused: newRow.is_timer_paused, status: newRow.status, pick: newRow.current_pick_number });
      state.draft = newRow;
      renderAll();
    });
    const pickChan = window.DraftSupabase.subscribeToPicks(draftRow.id, (newRow, eventType) => {
      if (!newRow) return;
      log('pick', eventType, '#'+newRow.pick_number, newRow.is_undone ? '(undone)' : '');
      if (eventType === 'INSERT' && !newRow.is_undone) {
        state.picks = state.picks.concat([newRow]);
        state.justPicked = { player_id: newRow.player_id, team_id: newRow.team_id };
        // If the audience is watching a pending overlay for this pick, the
        // INSERT IS the lock-in signal — swap suspense → reveal.
        if (state.pendingOverlay
            && state.overlayPhase === 'suspense'
            && String(state.pendingOverlay.playerId) === String(newRow.player_id)) {
          revealPickOverlay();
        }
      } else if (eventType === 'UPDATE') {
        // Could be an is_undone flip
        const idx = state.picks.findIndex(p => p.id === newRow.id);
        if (idx >= 0) {
          if (newRow.is_undone) state.picks.splice(idx, 1);
          else state.picks[idx] = newRow;
        } else if (!newRow.is_undone) {
          state.picks.push(newRow);
        }
      }
      renderAll();
      maybeResolveMissingPicksFromUsers().then(changed => { if (changed) renderAll(); });
    });

    // ───── Polling fallback ─────
    // Realtime events can be dropped silently (WebSocket reconnect, RLS hiccup,
    // tab throttling). Refetch the draft + picks every 5s so any missed event
    // — pause, resume, pick — reconciles within one tick. Skipped when the
    // tab is hidden (no point updating offscreen).
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const [d, p] = await Promise.all([
          window.DraftSupabase.fetchDraft(SLUG),
          window.DraftSupabase.fetchPicks(draftRow.id),
        ]);
        if (!d) return;
        // Only re-render if state actually changed (cheap shallow check on the
        // fields that drive the UI). Avoids needless re-renders + flicker.
        const changed =
          !state.draft ||
          state.draft.is_timer_paused !== d.is_timer_paused ||
          state.draft.status !== d.status ||
          state.draft.current_pick_number !== d.current_pick_number ||
          state.draft.timer_started_at !== d.timer_started_at ||
          state.draft.pick_timer_seconds !== d.pick_timer_seconds ||
          (state.picks.length !== p.length);
        if (changed) {
          log('poll-fallback: reconciling state',
              { paused: d.is_timer_paused, status: d.status, pick: d.current_pick_number, picks: p.length });
          state.draft = d;
          state.picks = p;
          renderAll();
        }
      } catch (err) {
        // Network blip — show reconnecting and let next interval try again.
        showReconnecting(true);
        setTimeout(() => showReconnecting(false), 6000);
      }
    }, 5000);

    // Connection status — show RECONNECTING when channels report errors
    function watchChannel(chan) {
      if (!chan || typeof chan.subscribe !== 'function') return;
      // The subscribe call already happened inside subscribeToDraft/subscribeToPicks.
      // We listen for system events via chan.on('system') if available.
      if (typeof chan.on === 'function') {
        try {
          chan.on('system', {}, (payload) => {
            if (DEBUG) log('channel system event', payload);
            const status = payload && (payload.status || payload.message);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              showReconnecting(true);
            } else if (status === 'SUBSCRIBED' || status === 'ok') {
              showReconnecting(false);
            }
          });
        } catch (_) { /* SDK shape varies; non-fatal */ }
      }
    }
    watchChannel(draftChan);
    watchChannel(pickChan);

    // Browser online/offline as a coarse fallback
    window.addEventListener('offline', () => showReconnecting(true));
    window.addEventListener('online',  () => showReconnecting(false));

    // Pending-pick broadcast — the commissioner's confirm modal mirrored here
    // as a full-screen overlay. Reveal/exit is driven by the INSERT subscription
    // above; this channel only handles the *start* of suspense and the *cancel*.
    const pendingChan = window.DraftSupabase.subscribeToPendingPick(draftRow.id, {
      onPending: (payload) => { log('pending', payload && payload.playerName); showPendingOverlay(payload); },
      onClear:   ()         => { log('pending cleared'); clearPendingOverlay(); },
    });
    watchChannel(pendingChan);
  }

  // ──────────────────────────────────────────────────────────
  // 11. Bootstrap — communities (Sheet) + players + Supabase
  // ──────────────────────────────────────────────────────────
  function applyHeaderFromConfig() {
    if (!Data) return;
    const tname = Data.getConfig('tournament_name', '');
    if (tname) {
      elTournamentName.textContent = tname.toUpperCase();
      document.title = tname + ' — Live Draft';
    }
    // Left: TPS monogram from header_logo_left; Right: Community Cup mark from header_logo_right.
    const leftLogo  = Data.getConfig('header_logo_left', '');
    const rightLogo = Data.getConfig('header_logo_right', '');
    if (leftLogo && !leftLogo.includes('example.com')) {
      elBrandLogo.src = leftLogo;
      elBrandLogo.alt = 'TPS';
    }
    if (rightLogo && !rightLogo.includes('example.com')) {
      elTournamentLogo.src = rightLogo;
      elTournamentLogo.alt = tname || 'Tournament';
    }
  }

  function buildMockState() {
    const mockCommunities = [
      { id:'coco-padel',     name:'Coco Padel',         color:'#C8E6C9', logoPath:'assets/communities/coco-padel.png',     captainM:{},captainF:{} },
      { id:'deuce-padel',    name:'Deuce Padel',        color:'#FFE0B2', logoPath:'assets/communities/deuce-padel.png',    captainM:{},captainF:{} },
      { id:'padel-and-brew', name:'Padel & Brew',       color:'#FFF59D', logoPath:'assets/communities/padel-and-brew.png', captainM:{},captainF:{} },
      { id:'padel-pa',       name:'Padel Pa?',          color:'#F8BBD0', logoPath:'assets/communities/padel-pa.png',       captainM:{},captainF:{} },
      { id:'sabai-sabai',    name:'Sabai Sabai',        color:'#B2DFDB', logoPath:'assets/communities/sabai-sabai.png',    captainM:{},captainF:{} },
      { id:'social-rally',   name:'Social Rally',       color:'#FFCCBC', logoPath:'assets/communities/social-rally.png',   captainM:{},captainF:{} },
      { id:'sunshine-padel', name:'Sunshine Padel',     color:'#FFF9C4', logoPath:'assets/communities/sunshine-padel.png', captainM:{},captainF:{} },
      { id:'wall-whackers',  name:'Wall Whackers',      color:'#BBDEFB', logoPath:'assets/communities/wall-whackers.png',  captainM:{},captainF:{} },
    ];
    const mockPlayers = [];
    mockCommunities.forEach((c, ci) => {
      mockPlayers.push({ communityId: c.id, playerId: c.id+'-cap-f', name: 'Capt F'+(ci+1), gender:'F', isCaptain:true,  avatar:'', level: 3.5 + (ci % 3) * 0.5 });
      mockPlayers.push({ communityId: c.id, playerId: c.id+'-cap-m', name: 'Capt M'+(ci+1), gender:'M', isCaptain:true,  avatar:'', level: 4.0 + (ci % 3) * 0.5 });
    });
    state.communities = mockCommunities;
    state.players     = mockPlayers;
    // Mock timer start offset (seconds elapsed) — override via ?elapsed=N for state testing.
    // 0 → full 45s remaining (green); 20 → 25s left (orange); 35 → 10s left (red); 50 → -5s (red+overshoot)
    const elapsedParam = parseInt(params.get('elapsed') || '12', 10);
    const pausedParam  = params.get('paused') === '1';
    state.draft = {
      id: 'mock-draft',
      tournament_slug: 'mock',
      status: pausedParam ? 'paused' : 'active',
      pick_timer_seconds: 45,
      current_pick_number: 3,
      timer_started_at: new Date(Date.now() - elapsedParam*1000).toISOString(),
      is_timer_paused: pausedParam,
      team_seed_order: mockCommunities.map(c => c.id),
    };
    // Two picks already taken (pick 1 → seed[0], pick 2 → seed[1] in round 1)
    state.picks = [
      { id:'mp1', draft_id:'mock-draft', pick_number:1, team_id:'coco-padel',     player_id:'p-coco-1',  is_undone:false },
      { id:'mp2', draft_id:'mock-draft', pick_number:2, team_id:'deuce-padel',    player_id:'p-deuce-1', is_undone:false },
    ];
    mockPlayers.push({ communityId:'coco-padel',  playerId:'p-coco-1',  name:'Aida T',  gender:'F', isCaptain:false, avatar:'', level: 4.25 });
    mockPlayers.push({ communityId:'deuce-padel', playerId:'p-deuce-1', name:'Boom K',  gender:'M', isCaptain:false, avatar:'', level: 3.75 });

    // Demo keyboard controls (debug):
    //   n = simulate next pick
    //   r = reset
    //   p = trigger a mock pending → reveal overlay sequence (no Supabase needed)
    if (DEBUG) {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'p') {
          const mockPick = state.draft ? state.draft.current_pick_number || 1 : 1;
          showPendingOverlay({
            playerId:    'debug-player',
            playerName:  'Ferran Tadeo',
            playerAvatar: null,
            rating: '3.60', hand: 'R', side: 'E', gender: 'M',
            teamId: 'social-rally', teamName: 'Social Rally',
            teamLogo: 'assets/communities/social-rally.png',
            pickNumber: mockPick,
          });
          // Auto-reveal after a short suspense so the whole sequence is visible
          // without needing a fake pick INSERT.
          setTimeout(revealPickOverlay, 2000);
          return;
        }
        if (e.key === 'n' && state.draft.current_pick_number < 64) {
          const nextNum = state.draft.current_pick_number + 1;
          state.picks.push({
            id: 'mp'+nextNum, draft_id:'mock-draft', pick_number: state.draft.current_pick_number,
            team_id: window.DraftUtils.teamForPick(state.draft.current_pick_number, state.draft.team_seed_order),
            player_id: 'p-sim-'+nextNum, is_undone:false,
          });
          mockPlayers.push({
            communityId: window.DraftUtils.teamForPick(state.draft.current_pick_number, state.draft.team_seed_order),
            playerId:'p-sim-'+nextNum, name:'Sim '+nextNum, gender: (nextNum % 2 ? 'F' : 'M'), isCaptain:false, avatar:'', level: 3.0 + (nextNum % 5) * 0.5
          });
          state.justPicked = { player_id: 'p-sim-'+nextNum };
          state.draft = { ...state.draft, current_pick_number: nextNum, timer_started_at: new Date().toISOString() };
          renderAll();
        } else if (e.key === 'r') {
          state.draft = { ...state.draft, current_pick_number: 1, timer_started_at: new Date().toISOString() };
          state.picks = [];
          renderAll();
        }
      });
    }
  }

  async function bootstrap() {
    if (MOCK) {
      log('Running in MOCK mode');
      buildMockState();
      renderAll();
      requestAnimationFrame(tick);
      return;
    }

    // Sheet — communities + players in parallel.
    // Sheet ID resolution: window.__SHEET_ID (set inline in projector.html
    // before data.js loads) > ?sheet= param > data.js DEFAULT_SHEET_ID.
    const dataReady = new Promise((resolve) => {
      let resolved = false;
      Data.startPolling(() => {
        state.communities = Data.getCommunities();
        applyHeaderFromConfig();
        if (!resolved) { resolved = true; resolve(); }
        else { renderAll(); }   // subsequent polls re-render
      });
    });

    const playersReady = fetchPlayersFromSheet().then(ps => { state.players = ps; });

    await Promise.all([dataReady, playersReady]);
    log('Sheet data loaded:', state.communities.length, 'communities,', state.players.length, 'players');

    // First paint NOW with Sheet data — pre-draft "WAITING…" state + full team grid.
    // RAF tick runs immediately so the timer + bars never freeze.
    renderAll();
    requestAnimationFrame(tick);

    // Hydrate live state in the background; renderAll re-runs once draft + picks arrive.
    bootstrapLive().catch(err => {
      console.warn('[projector] bootstrapLive failed (will keep pre-draft view):', err);
      showReconnecting(true);
    });
  }

  // Kick off after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
