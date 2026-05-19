/* ============================================
   Commissioner Laptop — Tournament Draft UI
   Single-file orchestrator.

   Modules (in this file):
     - State          : single source of truth
     - Bootstrap      : wait for Sheet + Supabase, then mount
     - Registrations  : direct gviz fetch (separate from data.js to keep it small)
     - HeaderBanner   : title + LIVE pill + state + timer
     - PoolList       : filtered/sorted/searched available players + hover chip
     - PoolFilterBar  : gender/hand/side chips + sort + count
     - HistoryPanel   : reverse-chronological picks; UNDO on most recent only
     - ConfirmModal   : oversized commit dialog
     - ControlsBar    : start/pause/resume/complete/reset
     - Timer          : 4 Hz tick → display update; no DB writes
     - Subscriptions  : Realtime drafts + draft_picks → state mutations
   ============================================ */

(function () {
'use strict';

const TOURNAMENT_SLUG = 'community-cup';
const SHEET_ID = '1ZvTjeu-rgNFGG5lX-DY5k8riy_ezPIAtcSNr5BjY4DQ';

// ── STATE ─────────────────────────────────────────────────────────

const state = {
  draft: null,                      // drafts row
  picks: [],                        // all draft_picks rows (incl. undone)
  communities: [],                  // Communities tab
  registrations: [],                // Registrations tab (the draft pool source)
  avatarsByUserId: {},              // Users tab — userId → avatar URL
  captainUserIds: new Set(),        // TPS User IDs of captains (excluded from pool)
  filters: { gender: null, hand: null, side: null, prefs: [] },
  sort: 'rating-desc',
  search: '',
  pendingPick: null,                // player obj when modal open
  topMatchUserId: null,             // player highlighted by current search
  loaded: { sheet: false, supabase: false },
  error: null,
};

const subscribers = { drafts: null, picks: null };
let timerInterval = null;
let _client = null;

// ── BOOTSTRAP ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  setLoadingMsg('Initializing…');
  try {
    requireGlobals();
    setLoadingMsg('Connecting to Supabase…');
    await initSupabase();
    setLoadingMsg('Fetching draft state…');
    await loadDraftState();
    setLoadingMsg('Fetching Sheet data…');
    await loadSheetData();          // parallel direct fetch — no Data.startPolling needed
    subscribeToRealtime();
    // M4 fix: eagerly join the pending-pick broadcast channel and wait for
    // SUBSCRIBED. Without this, the first pick's broadcast can fire while
    // the channel is still JOINING and silently drop (Supabase doesn't
    // buffer broadcast sends pre-subscribe). Best-effort with 2s timeout —
    // if the channel can't subscribe we boot anyway; sends fall through to
    // the existing best-effort path in _sendWithReady.
    if (state.draft) {
      DraftSupabase.prewarmBroadcastChannel(state.draft.id)
        .catch(err => console.warn('[commissioner] broadcast prewarm:', err && err.message));
    }
    startTimerTick();
    bindGlobalEvents();
    state.loaded.sheet = true;
    renderAll();
    console.log('[Commissioner] boot complete', {
      communities: state.communities.length,
      players: state.registrations.length,
      captains: state.captainUserIds.size,
      draft: state.draft ? state.draft.status : null,
    });
  } catch (err) {
    console.error('[Commissioner] boot failed:', err);
    setLoadingMsg(`⚠️ ${err.message || err}`);
    showToast(err.message || 'Boot failed — check console', 'error');
  }
}

function setLoadingMsg(msg) {
  const el = document.getElementById('pool-list');
  if (el) el.innerHTML = `<div class="loading">${msg}</div>`;
}

async function loadSheetData() {
  // Fetch Communities, Teams and Players, Registrations, Users directly via gviz CSV.
  // Run them in parallel and report which one(s) failed.
  const fetches = [
    fetchGviz('Communities').then(parseCSVRows).catch(e => { throw new Error('Communities fetch failed: ' + e.message); }),
    fetchGviz('Teams and Players').then(parseCSVRows).catch(e => { throw new Error('Teams and Players fetch failed: ' + e.message); }),
    fetchGviz('Registrations').then(parseRegistrationsCSV).catch(e => { throw new Error('Registrations fetch failed: ' + e.message); }),
  ];
  const [communityRows, playerRows, regRows] = await Promise.all(fetches);

  state.communities = parseCommunities(communityRows);
  state.captainUserIds = parseCaptainIds(playerRows);
  state.captainsByCommunity = parseCaptainsByCommunity(playerRows);
  state.registrations = regRows;
  // Avatar lookup is now derived from Registrations + Teams and Players, not
  // from a separate Users tab. Both source tabs already carry an Avatar
  // column natively, so the Users tab was pure redundancy + a staleness
  // risk (separate place to forget to update).
  state.avatarsByUserId = buildAvatarsByUserId(regRows, playerRows);

  enrichCommunitiesWithCaptains();

  console.log('[Commissioner] sheet data loaded', {
    communities: state.communities.length,
    captains: state.captainUserIds.size,
    registrations: state.registrations.length,
    avatars: Object.keys(state.avatarsByUserId).length,
  });
}

// Captains grouped by Community ID. Used by the gender-slot guard so we
// can count the captain's gender against the 5-per-gender team limit
// without round-tripping through Data.getPlayers() (which is unpopulated
// in commissioner — see boot()).
function parseCaptainsByCommunity(playerRows) {
  const map = {};
  for (const r of playerRows) {
    if (String(r['Is Captain'] || '').trim().toUpperCase() !== 'Y') continue;
    const communityId = String(r['Community ID'] || '').trim();
    if (!communityId) continue;
    if (!map[communityId]) map[communityId] = [];
    map[communityId].push({
      userId:  String(r['TPS User ID'] || '').trim(),
      gender:  normalizeGender(r['Gender']),
    });
  }
  return map;
}

// Build userId → avatar URL from the two tabs that natively carry it:
// Registrations (pool players, includes captains via duplicate listing) and
// Teams and Players (captain rows, primary source for those 16 IDs). On
// conflict, Registrations wins because Registrations is what the operator
// updates per-tournament — captains' Teams and Players row may be older.
function buildAvatarsByUserId(regRows, playerRows) {
  const map = {};
  // Start with captains (Teams and Players)
  for (const r of playerRows) {
    const id = String(r['TPS User ID'] || '').trim();
    const av = String(r['Avatar'] || '').trim();
    if (id && av && av !== 'null' && av !== '#N/A') map[id] = av;
  }
  // Registrations wins on conflict
  for (const reg of regRows) {
    if (reg.userId && reg.avatar) map[reg.userId] = reg.avatar;
  }
  return map;
}

function parseAvatarsByUserId(rows) {
  // DEPRECATED — kept for back-compat in case anything still calls it. The
  // Users tab is no longer fetched; buildAvatarsByUserId is the replacement.
  const map = {};
  for (const r of rows) {
    const id = String(r['id'] || '').trim();
    const url = String(r['avatar'] || '').trim();
    if (id && url && url !== 'null' && url !== '#N/A') {
      map[id] = url;
    }
  }
  return map;
}

async function fetchGviz(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&headers=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for "${sheetName}"`);
  return res.text();
}

// Parse a CSV with quoted fields, return [{header: value, ...}, ...]
function parseCSVRows(text) {
  const lines = parseCsvLines(text);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (fields[idx] || '').trim(); });
    out.push(row);
  }
  return out;
}

function parseCsvLines(text) {
  const lines = [];
  let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      cur += ch;
      if (q && text[i + 1] === '"') { cur += '"'; i++; } else { q = !q; }
    } else if (ch === '\n' && !q) { lines.push(cur); cur = ''; }
    else if (ch === '\r' && !q) {}
    else { cur += ch; }
  }
  if (cur.trim()) lines.push(cur);
  return lines;
}

function splitCsvLine(line) {
  const fields = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; }
    } else if (ch === ',' && !q) { fields.push(cur); cur = ''; }
    else { cur += ch; }
  }
  fields.push(cur);
  return fields;
}

function parseCommunities(rows) {
  return rows
    .filter(r => (r['Community ID'] || '').trim())
    .map(r => ({
      id: r['Community ID'].trim(),
      name: (r['Name'] || '').trim(),
      group: (r['Group'] || '').trim(),
      color: '#FFB703',  // brand gold — was r['Color']; Sheet column ignored by design
      // ?v=2 cache-busts the GitHub Pages CDN after the logo artwork refresh.
      logoPath: (r['Logo Path'] || '').trim().replace(/^(.+)$/, '$1?v=3'),
      seed: parseInt(r['Seed'], 10) || null,
    }));
}

// Join state.captainsByCommunity (userId+gender per community, from "Teams
// and Players") with state.registrations (carries level) so the seed-preview
// modal can show each community's captain pair + their averageLevel. Pure
// additive — only writes new fields onto state.communities entries; existing
// fields untouched. Safe to call after both sources are populated.
function enrichCommunitiesWithCaptains() {
  const regByUserId = new Map();
  for (const r of state.registrations) {
    if (r.userId) regByUserId.set(r.userId, r);
  }
  for (const c of state.communities) {
    const captains = state.captainsByCommunity[c.id] || [];
    for (const cap of captains) {
      const reg = regByUserId.get(cap.userId);
      if (!reg) continue;
      const slot = cap.gender === 'F' ? 'captainF' : 'captainM';
      c[slot] = {
        userId: cap.userId,
        name: reg.name,
        level: reg.level,
        avatar: state.avatarsByUserId[cap.userId] || '',
      };
    }
    const lvls = [c.captainM, c.captainF]
      .filter(x => x && x.level != null)
      .map(x => x.level);
    c.averageLevel = lvls.length ? lvls.reduce((a, b) => a + b, 0) / lvls.length : null;
  }
}

function parseCaptainIds(playerRows) {
  const captains = playerRows.filter(p =>
    String(p['Is Captain'] || '').trim().toUpperCase() === 'Y'
  );
  return new Set(
    captains.map(p => String(p['TPS User ID'] || '').trim()).filter(Boolean)
  );
}

function requireGlobals() {
  if (!window.supabase) throw new Error('Supabase JS SDK not loaded');
  if (!window.SUPABASE_URL) throw new Error('SUPABASE_URL missing — check js/draft-config.js');
  if (!window.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — check commissioner-config.local.js');
  if (!window.DraftSupabase) throw new Error('DraftSupabase missing — check js/draft-supabase.js');
  if (!window.DraftUtils) throw new Error('DraftUtils missing — check js/draft-utils.js');
}

async function initSupabase() {
  _client = DraftSupabase.init({
    url: window.SUPABASE_URL,
    key: window.SUPABASE_SERVICE_ROLE_KEY,
  });
}

async function loadDraftState() {
  state.draft = await DraftSupabase.fetchDraft(TOURNAMENT_SLUG);
  if (!state.draft) throw new Error(`No drafts row found for slug '${TOURNAMENT_SLUG}'`);
  state.picks = await DraftSupabase.fetchPicksWithUndone(state.draft.id);
  state.loaded.supabase = true;
  renderAll();
}

// Map a Registrations CSV (header row → rows of dicts) to player objects.
function parseRegistrationsCSV(text) {
  const rows = parseCSVRows(text);
  return rows
    .filter(r => (r['Name'] || '').trim())
    .map(r => {
      const levelStr = (r['Level (current)'] || '').trim();
      const m = levelStr.match(/^\s*([\d.]+)/);
      const avatar = String(r['Avatar'] || '').trim();
      return {
        userId: (r['User ID'] || '').trim(),
        name: (r['Name'] || '').trim(),
        gender: normalizeGender(r['Gender'] || ''),
        level: m ? parseFloat(m[1]) : null,
        levelTier: levelStr.includes(' - ') ? levelStr.split(' - ')[1].trim() : '',
        hand: normalizeHandSide(r['Hand'] || ''),
        side: normalizeSide(r['Side'] || ''),
        nationality: (r['Nationality'] || '').trim(),
        avatar: (avatar && avatar !== 'null' && avatar !== '#N/A') ? avatar : '',
        prefs: [r['Community 1st'], r['Community 2nd'], r['Community 3rd']]
          .map(s => (s || '').trim()).filter(Boolean),
        status: (r['Statuses'] || '').trim(),
        paid: (r['Paid ?'] || '').trim().toUpperCase(),
      };
    });
}

// ── NORMALIZERS ───────────────────────────────────────────────────

function normalizeGender(g) {
  const v = String(g || '').trim().toLowerCase();
  if (v === 'female' || v === 'f') return 'F';
  if (v === 'male' || v === 'm') return 'M';
  return '';
}

// Hand: right_handed → R, left_handed → L, ambidextrous → B
function normalizeHandSide(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s.startsWith('r')) return 'R';
  if (s.startsWith('l')) return 'L';
  if (s.startsWith('b') || s.includes('ambi') || s.includes('either')) return 'B';
  return '';
}

// Country name → ISO 3166-1 alpha-2 code. Covers the registrations seen
// in Community Cup; missing names fall back to no flag.
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

// 2-letter ISO code → flag-icons SVG span. Rectangular, consistent across OSes.
function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  return `<span class="fi fi-${code.toLowerCase()}"></span>`;
}

// Registrations stores community preferences as display strings ("Sabai Sabai
// Padel Collective", "Deuce", "Padel & Brew", ...). Match against communities
// by exact or substring overlap so 'Deuce' → 'deuce-padel'.
function findCommunityByName(input, communities) {
  if (!input) return null;
  const lc = String(input).trim().toLowerCase();
  if (!lc) return null;
  let m = communities.find(c => c.name && c.name.toLowerCase() === lc);
  if (m) return m;
  m = communities.find(c => {
    const cn = (c.name || '').toLowerCase();
    return cn && (cn.includes(lc) || lc.includes(cn));
  });
  if (m) return m;
  // Token overlap fallback: any meaningful token in input matches a token in community name.
  const tokens = lc.split(/\s+/).filter(t => t.length > 2);
  return communities.find(c => {
    const ct = (c.name || '').toLowerCase().split(/\s+/);
    return tokens.some(t => ct.some(x => x.includes(t) || t.includes(x)));
  }) || null;
}

// Side: forehand → F, backhand → B, both_sides/either → E.
// Check "both" / "either" FIRST — otherwise "both_sides" matches the 'b'
// prefix and returns B (backhand) by mistake.
function normalizeSide(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s.includes('both') || s.includes('either')) return 'E';
  if (s.startsWith('f')) return 'F';
  if (s.startsWith('b')) return 'B';
  return '';
}

// ── DERIVED ───────────────────────────────────────────────────────

function getCurrentTeamId() {
  if (!state.draft || state.draft.status === 'pending') return null;
  if (!state.draft.team_seed_order || state.draft.team_seed_order.length !== 8) return null;
  return DraftUtils.teamForPick(state.draft.current_pick_number, state.draft.team_seed_order);
}

function getNextTeamId() {
  if (!state.draft) return null;
  const next = state.draft.current_pick_number + 1;
  if (next > DraftUtils.TOTAL_PICKS) return null;
  if (!state.draft.team_seed_order || state.draft.team_seed_order.length !== 8) return null;
  return DraftUtils.teamForPick(next, state.draft.team_seed_order);
}

function getTeamCommunity(slug) {
  return state.communities.find(c => c.id === slug) || null;
}

// Maximum draftable rating — players above this threshold are filtered out
// of the pool entirely (and out of the "X available" count). Captains can
// still sit above it; this only applies to the draftable pool.
const POOL_MAX_LEVEL = 3.5;

// Filter: real available players (not captains, not picked, has gender+level,
// and rated at or below POOL_MAX_LEVEL). Mirrors draft-team.js parseRegistrations
// gates so commissioner and public pools stay in sync.
function getAvailablePlayers() {
  const pickedIds = new Set(
    state.picks.filter(p => !p.is_undone).map(p => p.player_id)
  );
  return state.registrations.filter(r => {
    if (!r.gender) return false;             // must have F/M
    if (r.level == null) return false;       // must have a numeric level
    if (r.level > POOL_MAX_LEVEL) return false;
    if (r.paid !== 'Y') return false;        // Registrations "Paid ?" must be Y
    if ((r.status || '').toLowerCase() !== 'completed') return false;  // Statuses col P
    if (state.captainUserIds.has(r.userId)) return false;
    if (pickedIds.has(r.userId)) return false;
    return true;
  });
}

// Filter + sort + search → final pool list for display
function getDisplayedPool() {
  let list = getAvailablePlayers();
  const f = state.filters;
  if (f.gender) list = list.filter(p => p.gender === f.gender);
  // Inclusive hand/side: a player labeled "B" (ambi) or "E" (either) matches either filter
  if (f.hand) list = list.filter(p => p.hand === f.hand || p.hand === 'B');
  if (f.side) list = list.filter(p => p.side === f.side || p.side === 'E');
  if (f.prefs && f.prefs.length) {
    // Show players who listed ANY of the selected communities among their
    // up-to-3 preferred teams (Registrations "Community 1st/2nd/3rd").
    const wanted = new Set(f.prefs);
    list = list.filter(p => (p.prefs || []).some(prefName => {
      const c = findCommunityByName(prefName, state.communities);
      return c && wanted.has(c.id);
    }));
  }
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  const [col, dir] = state.sort.split('-');
  const sign = dir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    let cmp;
    if (col === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else {
      cmp = (a.level || 0) - (b.level || 0);
      if (cmp === 0) cmp = a.name.localeCompare(b.name);  // stable tiebreak
    }
    return sign * cmp;
  });
  return list;
}

// ── RENDER ALL ────────────────────────────────────────────────────

function renderAll() {
  renderHeader();
  renderControls();
  renderPool();
  renderHistory();
}

// ── HEADER BANNER ─────────────────────────────────────────────────

function renderHeader() {
  const stateEl = document.getElementById('commissioner-state');
  if (!state.draft) {
    stateEl.innerHTML = `<span class="state__label">Loading draft…</span>`;
    return;
  }
  const status = state.draft.status;
  const currentTeam = getCurrentTeamId();
  const currentCommunity = currentTeam ? getTeamCommunity(currentTeam) : null;

  if (status === 'pending') {
    stateEl.innerHTML = `<span class="state__label">Awaiting start</span>`;
  } else if (status === 'complete') {
    stateEl.innerHTML = `<span class="state__label">DRAFT COMPLETE</span>`;
  } else {
    stateEl.innerHTML = `
      <span class="state__pick-number">Pick ${state.draft.current_pick_number} / ${DraftUtils.TOTAL_PICKS}</span>
      <span class="state__team-name">${currentCommunity ? currentCommunity.name : '—'}</span>
    `;
  }
}

// ── TIMER ─────────────────────────────────────────────────────────

function startTimerTick() {
  timerInterval = setInterval(updateTimer, 250);
  updateTimer();
}

function updateTimer() {
  const el = document.getElementById('timer-display');
  if (!state.draft) { el.textContent = '--:--'; return; }
  if (state.draft.status === 'pending') { el.textContent = '--:--'; el.className = 'timer-display'; return; }
  if (state.draft.status === 'complete') { el.textContent = '0:00'; el.className = 'timer-display'; return; }
  if (!state.draft.timer_started_at) { el.textContent = '--:--'; el.className = 'timer-display'; return; }
  // Paused: freeze display (don't update). Last-rendered text persists.
  if (state.draft.is_timer_paused || state.draft.status === 'paused') return;

  const total = state.draft.pick_timer_seconds;
  const startedMs = new Date(state.draft.timer_started_at).getTime();
  const remaining = DraftUtils.remainingSeconds(startedMs, total, DraftSupabase.serverNow());

  // Clamp display at 0 — never show negative time. Past zero, blink via
  // .timer-display--expired (CSS) while the pick window stays open.
  const shown = Math.max(0, remaining);
  const mins = Math.floor(shown / 60);
  const secs = Math.floor(shown % 60);
  el.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

  const color = DraftUtils.timerColorState(remaining, total);
  const expired = remaining <= 0 ? ' timer-display--expired' : '';
  el.className = `timer-display timer-display--${color}${expired}`;
}

// ── POOL FILTER BAR ───────────────────────────────────────────────

function renderPoolFilters() {
  const el = document.getElementById('pool-filters');
  const pool = getDisplayedPool();
  el.innerHTML = `
    ${filterGroup('gender', [['F', '♀ F'], ['M', '♂ M']])}
    ${filterGroup('hand', [['L', 'L 🫲'], ['R', '🫱 R']])}
    ${filterGroup('side', [['F', '➡️ R'], ['B', 'L ⬅️']])}
    <div class="pool__sort">
      ${sortChip('rating-desc', 'BY RATING')}
      ${sortChip('name-asc', 'BY NAME')}
    </div>
    <span class="pool__count">${pool.length} available</span>
  `;
  el.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.group;
      const value = chip.dataset.value;
      if (group === 'sort') {
        // Click same column again → flip direction. Click different column → use that column's natural default.
        const [newCol] = value.split('-');
        const [curCol, curDir] = state.sort.split('-');
        if (curCol === newCol) {
          state.sort = `${curCol}-${curDir === 'asc' ? 'desc' : 'asc'}`;
        } else {
          state.sort = value;
        }
      } else {
        state.filters[group] = state.filters[group] === value ? null : value;
      }
      renderPool();
    });
  });
}

function filterGroup(group, options) {
  const current = state.filters[group];
  return `
    <div class="filter-group">
      ${options.map(([v, label]) => {
        const genderClass = group === 'gender'
          ? (v === 'F' ? 'filter-chip--female' : 'filter-chip--male')
          : '';
        const active = current === v ? 'filter-chip--active' : '';
        return `<button class="filter-chip ${genderClass} ${active}"
                data-group="${group}" data-value="${v}">${label}</button>`;
      }).join('')}
    </div>
  `;
}

function sortChip(value, label) {
  const [col] = value.split('-');
  const [curCol, curDir] = state.sort.split('-');
  const isActive = curCol === col;
  const arrow = isActive ? (curDir === 'asc' ? ' ↑' : ' ↓') : '';
  const active = isActive ? 'filter-chip--active' : '';
  return `<button class="filter-chip ${active}" data-group="sort" data-value="${value}">${label}${arrow}</button>`;
}

// PREFERS filter row — one chip per community (logo + name), multi-select.
function renderPoolPrefs() {
  const el = document.getElementById('pool-prefs');
  if (!el) return;
  if (!state.communities || !state.communities.length) {
    el.innerHTML = '';
    return;
  }
  const selected = new Set(state.filters.prefs || []);
  el.innerHTML = `<span class="pool__prefs-label">PREFERS</span>` + state.communities.map(c => {
    const active = selected.has(c.id) ? 'is-active-filter' : '';
    const initial = (c.name || '?').charAt(0).toUpperCase();
    const logo = c.logoPath
      ? `<img class="pool__prefs-chip-logo" src="${escapeHTML(c.logoPath)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pool__prefs-chip-logo',textContent:'${initial}'}))">`
      : `<span class="pool__prefs-chip-logo">${initial}</span>`;
    return `<button class="pool__prefs-chip ${active}" data-pref-id="${escapeHTML(c.id)}" title="${escapeHTML(c.name)}">
      ${logo}<span class="pool__prefs-chip-name">${escapeHTML(c.name)}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('[data-pref-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.prefId;
      const arr = state.filters.prefs;
      const idx = arr.indexOf(id);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(id);
      renderPool();
    });
  });
}

// ── POOL LIST ─────────────────────────────────────────────────────

function renderPool() {
  renderPoolFilters();
  renderPoolPrefs();
  const listEl = document.getElementById('pool-list');
  if (!state.loaded.sheet) {
    listEl.innerHTML = `<div class="loading">Loading players…</div>`;
    return;
  }
  if (state.error) {
    listEl.innerHTML = `<div class="loading">⚠️ ${state.error}</div>`;
    return;
  }
  const pool = getDisplayedPool();
  if (pool.length === 0) {
    listEl.innerHTML = `<div class="loading">No matches</div>`;
    state.topMatchUserId = null;
    return;
  }
  state.topMatchUserId = state.search ? pool[0].userId : null;

  listEl.innerHTML = pool.map((p, i) => poolRowHTML(p, i === 0 && !!state.search)).join('');
  listEl.querySelectorAll('.pool-row').forEach(row => {
    row.addEventListener('click', () => {
      const userId = row.dataset.userId;
      const player = pool.find(x => x.userId === userId);
      if (player) openConfirmModal(player);
    });
  });
}

function sideLabelHTML(s) {
  // Convention: F = right court (➡️ R), B = left court (L ⬅️), E = both.
  const icon = s === 'F' ? '➡️' : s === 'B' ? '⬅️' : s === 'E' ? '↔️' : '';
  if (!icon) return '';
  const left  = (s === 'B' || s === 'E') ? 'L' : '';
  const right = (s === 'F' || s === 'E') ? 'R' : '';
  return `<span class="hs-letter">${left}</span><span class="hs-icon">${icon}</span><span class="hs-letter">${right}</span>`;
}

function poolRowHTML(p, isTopMatch) {
  // Letter-flanks-icon convention: position of the letter mirrors the court side.
  const handLabel = p.hand === 'L' ? 'L 🫲' : p.hand === 'R' ? '🫱 R' : p.hand === 'B' ? 'L 🤲 R' : '';
  // Side: split into hs-letter/hs-icon spans so the emoji centers by box-middle
  // instead of dropping onto its own baseline. Same pattern team.html uses.
  const sideLabel = sideLabelHTML(p.side);
  const ratingLabel = p.level != null
    ? `<span class="rating-star">⭐</span><span class="rating-val">${p.level.toFixed(2)}</span>`
    : '—';
  return `
    <div class="pool-row ${isTopMatch ? 'pool-row--top-match' : ''}" data-user-id="${p.userId}">
      ${avatarHTML(p, 36)}
      <span class="pool-row__flag" title="${escapeHTML(p.nationality || '')}">${flagEmoji(countryCodeFor(p.nationality))}</span>
      <span class="pool-row__name">${escapeHTML(p.name)}</span>
      <span class="pool-row__prefs">${prefsHTML(p)}</span>
      <span class="pool-row__meta">
        <span class="pool-row__cell pool-row__cell--hand">${handLabel}</span>
        <span class="pool-row__cell pool-row__cell--side">${sideLabel}</span>
        <span class="pool-row__cell pool-row__cell--rating">${ratingLabel}</span>
      </span>
      <span class="pool-row__chip">→ CLICK TO PICK</span>
    </div>
  `;
}

// Render up to 3 small community logos for the player's preferences (1st, 2nd, 3rd).
// Each falls back to a text initial pill if the community has no logoPath.
function prefsHTML(p) {
  if (!p.prefs || !p.prefs.length) return '';
  const ranks = ['1st', '2nd', '3rd'];
  return p.prefs.slice(0, 3).map((prefName, i) => {
    const community = findCommunityByName(prefName, state.communities);
    if (!community) {
      return `<span class="pref-logo pref-logo--unknown" title="${escapeHTML(ranks[i])}: ${escapeHTML(prefName)}">?</span>`;
    }
    const title = `${ranks[i]}: ${community.name}`;
    if (community.logoPath) {
      return `<img class="pref-logo pref-logo--${i}" src="${community.logoPath}" alt="" title="${escapeHTML(title)}">`;
    }
    const initial = (community.name || '?').charAt(0).toUpperCase();
    return `<span class="pref-logo pref-logo--${i}" title="${escapeHTML(title)}">${initial}</span>`;
  }).join('');
}

// Render <img> if a real avatar URL is known, else the gender-tinted initial fallback.
function avatarHTML(p, size) {
  const url = state.avatarsByUserId[p.userId];
  const genderClass = p.gender === 'F' ? 'pool-row__avatar--f' : 'pool-row__avatar--m';
  const sz = size || 36;
  const fontSize = Math.round(sz * 0.4);
  const initial = (p.name || '?').charAt(0).toUpperCase();
  if (url) {
    return `<img class="avatar pool-row__avatar ${genderClass}"
                 src="${url}" alt=""
                 style="width:${sz}px;height:${sz}px;object-fit:cover"
                 onerror="this.outerHTML='<span class=\\'avatar avatar--fallback pool-row__avatar ${genderClass}\\' style=\\'width:${sz}px;height:${sz}px;font-size:${fontSize}px\\'>${initial}</span>'">`;
  }
  return `<span class="avatar avatar--fallback pool-row__avatar ${genderClass}"
                style="width:${sz}px;height:${sz}px;font-size:${fontSize}px">${initial}</span>`;
}

// ── HISTORY PANEL ─────────────────────────────────────────────────

/** Returns the next `count` upcoming picks per the seeded snake-draft order.
 *  During `pending`, derives a preview seed order from state.communities so
 *  the commissioner can see who picks first before clicking Start. */
function getUpcomingPicks(count) {
  if (!state.draft) return [];
  if (state.draft.status === 'complete') return [];

  let seedOrder = state.draft.team_seed_order;
  let lastPickNumber = state.draft.current_pick_number;
  if (state.draft.status === 'pending') {
    if (!state.communities || state.communities.length !== 8) return [];
    const seeded = state.communities
      .filter(c => c.seed != null && c.id)
      .sort((a, b) => a.seed - b.seed);
    if (seeded.length !== 8) return [];
    seedOrder = seeded.map(c => c.id);
    lastPickNumber = 0;
  }
  if (!seedOrder || seedOrder.length !== 8) return [];

  const out = [];
  for (let i = 1; i <= count; i++) {
    const n = lastPickNumber + i;
    if (n > DraftUtils.TOTAL_PICKS) break;
    out.push({
      pickNumber: n,
      teamId: DraftUtils.teamForPick(n, seedOrder),
    });
  }
  return out;
}

/** Rec #8 — render the "ON DECK" preview below the history list. */
function renderUpcomingPicks() {
  const el = document.getElementById('upcoming-picks');
  if (!el) return;
  const picks = getUpcomingPicks(2);
  if (picks.length === 0) { el.hidden = true; return; }
  el.hidden = false;
  const rows = picks.map(p => {
    const community = getTeamCommunity(p.teamId);
    const name = community ? community.name : p.teamId;
    return `
      <div class="upcoming-pick">
        <span class="upcoming-pick__num">#${p.pickNumber}</span>
        <span class="upcoming-pick__team">${escapeHTML(name)}</span>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="upcoming-picks__title">On deck</div>${rows}`;
}

function renderHistory() {
  const listEl = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');
  const live = state.picks.filter(p => !p.is_undone).length;
  const countText = `${live} / ${DraftUtils.TOTAL_PICKS}`;
  countEl.textContent = countText;
  const pillCountEl = document.getElementById('history-pill-count');
  if (pillCountEl) pillCountEl.textContent = countText;

  const sorted = [...state.picks].sort((a, b) => {
    if (b.pick_number !== a.pick_number) return b.pick_number - a.pick_number;
    return (a.is_undone ? 1 : 0) - (b.is_undone ? 1 : 0);
  });
  if (sorted.length === 0) {
    listEl.innerHTML = `<div class="history-list__empty">No picks yet</div>`;
    renderUpcomingPicks();
    return;
  }
  // Find most-recent non-undone pick for UNDO eligibility
  const mostRecentActive = sorted.find(p => !p.is_undone);
  listEl.innerHTML = sorted.map(pick => {
    const community = getTeamCommunity(pick.team_id);
    const reg = state.registrations.find(r => r.userId === pick.player_id);
    const playerName = reg ? reg.name : pick.player_id;
    const undoable = !pick.is_undone && pick === mostRecentActive && state.draft.status !== 'complete';
    return `
      <div class="history-row ${pick.is_undone ? 'history-row--undone' : ''}">
        <span class="history-row__pick">#${pick.pick_number}</span>
        <span class="history-row__team">${community ? community.name : pick.team_id}</span>
        <span class="history-row__player">${escapeHTML(playerName)}</span>
        ${undoable ? `<button class="history-row__undo" data-pick-id="${pick.id}">UNDO</button>` : ''}
      </div>
    `;
  }).join('');
  listEl.querySelectorAll('.history-row__undo').forEach(btn => {
    btn.addEventListener('click', () => undoPick(btn.dataset.pickId));
  });
  renderUpcomingPicks();
}

// ── CONFIRM MODAL ─────────────────────────────────────────────────

function openConfirmModal(player) {
  if (state.draft.status !== 'active') {
    showToast('Draft is not active — start or resume first', 'error');
    return;
  }
  const currentTeamId = getCurrentTeamId();
  const community = getTeamCommunity(currentTeamId);
  if (!community) {
    showToast('Cannot determine current team', 'error');
    return;
  }
  // Gender slot check
  const teamPicks = state.picks.filter(p => !p.is_undone && p.team_id === currentTeamId);
  const sameGenderCount = teamPicks.filter(p => {
    const r = state.registrations.find(r => r.userId === p.player_id);
    return r && r.gender === player.gender;
  }).length;
  // M2 fix: the previous version called Data.getPlayers() which is always []
  // here because boot() does not call Data.startPolling() — the commissioner
  // pulls Sheets via its own direct fetch path. The result was that the
  // captain's same-gender count was always 0, allowing a 6th same-gender
  // player on a roster (5 drafted + 1 captain) by late rounds.
  //
  // state.captainsByCommunity is populated in loadSheetData from the same
  // playerRows that build state.captainUserIds. Cheap O(1) lookup.
  const teamCaptains = state.captainsByCommunity[currentTeamId] || [];
  const captainSameGender = teamCaptains.some(cap => cap.gender === player.gender);
  const slotLimit = 5;
  const usedSlots = sameGenderCount + (captainSameGender ? 1 : 0);
  if (usedSlots >= slotLimit) {
    showToast(`${community.name} already has ${slotLimit} ${player.gender} players`, 'error');
    return;
  }

  state.pendingPick = { player, community, pickNumber: state.draft.current_pick_number };
  const logoSrc = community.logoPath || '';
  const handLabel = player.hand === 'L' ? 'L 🫲' : player.hand === 'R' ? '🫱 R' : player.hand === 'B' ? 'L 🤲 R' : '';
  const sideLabel = player.side === 'F' ? '➡️ R' : player.side === 'B' ? 'L ⬅️' : player.side === 'E' ? 'L ↔️ R' : '';
  const ratingLabel = player.level != null
    ? `<span class="rating-star">⭐</span><span class="rating-val">${player.level.toFixed(2)}</span>`
    : '—';
  // Mirror the suspense moment to the projector (fire-and-forget — the
  // commissioner flow proceeds even if the broadcast fails).
  try {
    DraftSupabase.broadcastPendingPick(state.draft.id, {
      playerId: player.userId,
      playerName: player.name,
      // Registrations player rows don't carry an avatar field — pull it from
      // the Users-tab map keyed by TPS User ID (state.avatarsByUserId).
      playerAvatar: state.avatarsByUserId[player.userId] || null,
      rating: player.level != null ? player.level.toFixed(2) : null,
      hand: player.hand || null,
      side: player.side || null,
      gender: player.gender || null,
      teamId: community.id,
      teamName: community.name,
      teamLogo: logoSrc || null,
      pickNumber: state.pendingPick.pickNumber,
    });
  } catch (e) { console.warn('broadcastPendingPick failed:', e); }
  const modalEl = document.getElementById('confirm-modal');
  const contentEl = document.getElementById('confirm-modal-content');
  contentEl.innerHTML = `
    <div class="confirm-modal__header">Confirm Pick #${state.pendingPick.pickNumber}</div>
    <div class="confirm-modal__body">
      <div class="confirm-modal__player">
        ${avatarHTML(player, 90)}
        <div class="confirm-modal__name">${escapeHTML(player.name)}</div>
        <div class="confirm-modal__sub">${handLabel} · ${sideLabel} · ${ratingLabel}</div>
      </div>
      <div class="confirm-modal__arrow">→</div>
      <div class="confirm-modal__team">
        ${logoSrc ? `<img class="confirm-modal__logo" src="${logoSrc}" alt="">` : `<span class="confirm-modal__logo avatar avatar--fallback" style="font-size:36px">${(community.name || '?').charAt(0)}</span>`}
        <div class="confirm-modal__name">${escapeHTML(community.name)}</div>
        <div class="confirm-modal__sub">Pick #${state.pendingPick.pickNumber} · ${player.gender}</div>
      </div>
    </div>
    <div class="confirm-modal__actions">
      <button class="btn" id="confirm-cancel">CANCEL</button>
      <button class="btn btn--primary" id="confirm-submit">CONFIRM PICK</button>
    </div>
  `;
  modalEl.classList.remove('hidden');
  modalEl.setAttribute('aria-hidden', 'false');
  // NOTE: confirm-modal-backdrop is bound once at boot in bindGlobalEvents.
  // Cancel + submit buttons are inside the innerHTML-replaced content, so
  // they must be re-bound per open.
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-submit').addEventListener('click', submitPendingPick);
  setTimeout(() => document.getElementById('confirm-submit').focus(), 100);
}

// `opts.skipBroadcast` is set when the close is part of a successful submit:
// the pick INSERT itself will drive the projector reveal, so we must NOT tell
// the projector to clear — that would race the reveal away.
function closeConfirmModal(opts) {
  const skipBroadcast = !!(opts && opts.skipBroadcast);
  if (!skipBroadcast && state.pendingPick && state.draft) {
    try { DraftSupabase.broadcastClearPending(state.draft.id); }
    catch (e) { console.warn('broadcastClearPending failed:', e); }
  }
  state.pendingPick = null;
  const modalEl = document.getElementById('confirm-modal');
  modalEl.classList.add('hidden');
  modalEl.setAttribute('aria-hidden', 'true');
}

async function submitPendingPick() {
  if (!state.pendingPick) return;
  // Idempotency guard — double-tap on Confirm during a network blip is a real
  // draft-day risk. Block re-entry until the RPC resolves.
  if (state._inflightPick) return;
  const submitBtn = document.getElementById('confirm-submit');

  const { player, community, pickNumber } = state.pendingPick;
  try {
    // Latch inside the try so an exception between here and the await can
    // never leave _inflightPick stuck true (the finally always fires).
    state._inflightPick = true;
    if (submitBtn) submitBtn.disabled = true;
    closeConfirmModal({ skipBroadcast: true });  // the INSERT drives the projector reveal
    // Atomic RPC — insert pick AND advance (or complete) in one transaction,
    // server-side order validation under FOR UPDATE lock. Replaces the previous
    // insertPick + advancePick / completeDraft two-write sequence that could
    // split-brain mid-event if the second write failed.
    await DraftSupabase.commitPick({
      draftId:    state.draft.id,
      pickNumber,
      teamId:     community.id,
      playerId:   player.userId,
    });
    // Realtime subscription will update state.draft; for instant feedback we
    // optimistically re-fetch state.
    await loadDraftState();
    showToast(`Pick #${pickNumber} confirmed`);
  } catch (err) {
    console.error('submitPendingPick failed:', err);
    // The RPC raises specific exceptions; surface them clearly to the operator.
    const msg = err && err.message ? err.message : String(err);
    let toastMsg = `Pick failed: ${msg}`;
    if (msg.includes('pick_out_of_order')) {
      toastMsg = `Pick failed: server expected a different pick number — refresh and try again`;
    } else if (msg.includes('draft_not_active')) {
      toastMsg = `Pick failed: draft is paused or complete — resume first`;
    }
    showToast(toastMsg, 'error');
    // The confirm modal was closed with skipBroadcast:true on the assumption
    // that the pick INSERT would drive the projector's overlay reveal. On
    // failure no INSERT happened, so we must tell the projector to clear its
    // suspense overlay or it sits frozen on "CONFIRM PICK #N" forever.
    try { DraftSupabase.broadcastClearPending(state.draft.id); } catch (_) {}
  } finally {
    state._inflightPick = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ── FAST PICK (rehearsal / mash-N to blow through 64 picks) ──────
// Auto-picks the first eligible player in the current displayed pool and
// commits without opening the confirm modal or broadcasting suspense — so
// the projector sees only the DB INSERT and updates its team grid silently
// (no .pick-overlay reveal). See bindGlobalEvents() for the N keybinding.

async function fastPick() {
  if (!state.draft) return;
  if (state.pendingPick || state._inflightPick || state._inflightUndo) return;
  // Auto-resume if paused — fastUndo always pauses the draft, so U-then-N
  // chains by quietly unpausing before the next pick lands.
  if (state.draft.status === 'paused') {
    try {
      await DraftSupabase.setPaused(state.draft.id, false);
      await loadDraftState();
    } catch (err) {
      showToast(`Resume failed: ${err.message || err}`, 'error');
      return;
    }
  }
  if (state.draft.status !== 'active') {
    showToast('Draft not active — start it first', 'error');
    return;
  }

  const currentTeamId = getCurrentTeamId();
  const community = getTeamCommunity(currentTeamId);
  if (!community) { showToast('Cannot determine current team', 'error'); return; }

  const teamPicks = state.picks.filter(p => !p.is_undone && p.team_id === currentTeamId);
  const teamCaptains = state.captainsByCommunity[currentTeamId] || [];
  const captainGenders = new Set(teamCaptains.map(c => c.gender));

  // Walk the displayed pool top-down; pick the first player who passes the
  // 5-per-gender slot check for this team (matches openConfirmModal's guard).
  for (const player of getDisplayedPool()) {
    const sameGenderCount = teamPicks.filter(p => {
      const r = state.registrations.find(r => r.userId === p.player_id);
      return r && r.gender === player.gender;
    }).length;
    const usedSlots = sameGenderCount + (captainGenders.has(player.gender) ? 1 : 0);
    if (usedSlots >= 5) continue;

    state.pendingPick = { player, community, pickNumber: state.draft.current_pick_number };
    await submitPendingPick();
    return;
  }
  showToast('No eligible player in pool for current team', 'error');
}

// ── UNDO ──────────────────────────────────────────────────────────
// Rapid-undo (U key) — undoes the most recent non-undone pick. Each undo
// pauses the timer per the existing pauseForUndo contract, so mashing U
// walks backwards through picks one at a time; the operator must hit the
// existing RESUME button (or START DRAFT if all undone) before N picks
// can be made again. Inflight latch prevents racing parallel undos.

async function fastUndo() {
  if (state._inflightPick || state._inflightUndo) return;
  if (!state.draft) return;
  if (state.draft.status === 'complete') {
    showToast('Cannot undo — draft is complete', 'error');
    return;
  }
  const mostRecent = [...state.picks]
    .sort((a, b) => b.pick_number - a.pick_number)
    .find(p => !p.is_undone);
  if (!mostRecent) { showToast('No picks to undo'); return; }
  try {
    state._inflightUndo = true;
    await undoPick(mostRecent.id);
  } finally {
    state._inflightUndo = false;
  }
}

async function undoPick(pickId) {
  try {
    const pick = state.picks.find(p => p.id === pickId);
    if (!pick) return;
    await DraftSupabase.undoPick(pickId);
    // Per spec: undo pauses the timer + decrements current_pick_number.
    // Routed through pauseForUndo so the pause-start is recorded — when the
    // commissioner resumes, the timer continues from where it stopped rather
    // than jumping forward by however long the pause lasted.
    await DraftSupabase.pauseForUndo(state.draft.id, pick.pick_number);
    await loadDraftState();
    showToast(`Pick #${pick.pick_number} undone — draft paused`);
  } catch (err) {
    console.error('undoPick failed:', err);
    showToast(`Undo failed: ${err.message || err}`, 'error');
  }
}

// ── CONTROLS ──────────────────────────────────────────────────────

function renderControls() {
  const el = document.getElementById('commissioner-controls');
  if (!state.draft) { el.innerHTML = ''; return; }
  const s = state.draft.status;

  // Left side — primary, status-dependent action(s)
  let left = '';
  if (s === 'pending') {
    left += `<button class="btn btn--primary" id="ctrl-start">START DRAFT</button>`;
    left += `<span class="controls__hint">Pre-draft preview — pool is read-only until you start.</span>`;
  } else if (s === 'active') {
    left += `<button class="btn" id="ctrl-pause">PAUSE TIMER</button>`;
    left += `<span class="controls__hint">Timer running — submit picks from the pool.</span>`;
  } else if (s === 'paused') {
    left += `<button class="btn btn--primary" id="ctrl-resume">RESUME</button>`;
    left += `<span class="controls__hint">Paused — click Resume to continue.</span>`;
  } else if (s === 'complete') {
    left += `<span class="state__team-name">✓ DRAFT COMPLETE</span>`;
  }

  // Right side — danger group: Force Complete (only while active/paused) + Reset (always)
  let right = `<span class="controls__warning" title="These actions cannot be undone">⚠️ Cannot be undone</span>`;
  if (s === 'active' || s === 'paused') {
    right += `<button class="btn btn--danger" id="ctrl-complete">⚠️ FORCE COMPLETE</button>`;
  }
  right += `<button class="btn btn--danger" id="ctrl-reset">⚠️ RESET DRAFT</button>`;

  el.innerHTML = `<div class="controls__left">${left}</div><div class="controls__right">${right}</div>`;
  // Null-guard every control callback — a single TypeError mid-event would
  // wedge the laptop UI. state.draft can be momentarily null if realtime
  // delivers a reset or if a callback fires before loadDraftState completes.
  bindCtrl('ctrl-start',    () => state.draft && startDraft());
  bindCtrl('ctrl-pause',    () => state.draft && DraftSupabase.setPaused(state.draft.id, true).then(loadDraftState));
  bindCtrl('ctrl-resume',   () => state.draft && DraftSupabase.setPaused(state.draft.id, false).then(loadDraftState));
  bindCtrl('ctrl-complete', () => state.draft && forceComplete());
  bindCtrl('ctrl-reset',    () => state.draft && resetDraft());
}

function bindCtrl(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

async function startDraft() {
  if (!state.communities || state.communities.length !== 8) {
    showToast('Communities not loaded yet — wait for Sheet polling', 'error');
    return;
  }
  // Build the seed-ordered list locally for preview, BEFORE writing to the DB.
  // Once status=active is written the team_seed_order is locked in — there's
  // no clean undo path other than Reset Draft. The preview modal lets the
  // operator confirm seeding is right (e.g. Milly's level discrepancy) before
  // committing.
  const seeded = state.communities
    .filter(c => c.seed != null && c.id)
    .sort((a, b) => a.seed - b.seed);
  if (seeded.length !== 8) {
    showToast(`Seed order has ${seeded.length} teams; need 8`, 'error');
    return;
  }

  const confirmed = await previewSeedOrderAndConfirm(seeded);
  if (!confirmed) return;

  try {
    await DraftSupabase.startDraft(state.draft.id, seeded.map(c => c.id));
    await loadDraftState();
    showToast('Draft started');
  } catch (err) {
    console.error('startDraft failed:', err);
    showToast(`Start failed: ${err.message || err}`, 'error');
  }
}

// Preview modal — shows the 8 communities in seed order with their averages,
// captain levels, and the implied round-1 pick order. Operator confirms
// before any DB write. Returns a Promise<boolean>.
function previewSeedOrderAndConfirm(seeded) {
  return new Promise((resolve) => {
    const existing = document.getElementById('seed-preview-backdrop');
    if (existing) existing.remove();

    // Same visual shell as the projector's seed-preview overlay
    // (js/draft-projector.js renderSeedPreview): gold-bordered rectangle,
    // two columns of 4 rows, seed# + community logo + name only.
    const rowHTML = (c, seedNum) => {
      const initial = escapeHTML((c.name || '?').charAt(0).toUpperCase());
      const logo = c.logoPath
        ? `<img src="${escapeHTML(c.logoPath)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:contain;background:#1A3A2E;flex:0 0 auto;">`
        : `<span style="width:44px;height:44px;border-radius:50%;background:#1A3A2E;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#C8D6CE;flex:0 0 auto;">${initial}</span>`;
      return `
        <tr style="border-bottom:1px solid #1A3A2E;">
          <td style="padding:10px 18px;font-family:monospace;color:#FFB703;font-weight:700;font-size:26px;">${seedNum}</td>
          <td style="padding:10px 18px;font-weight:700;font-size:20px;">
            <div style="display:flex;align-items:center;gap:14px;">
              ${logo}
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(c.name)}</span>
            </div>
          </td>
        </tr>
      `;
    };

    // colgroup pins col widths explicitly so both tables align identically on
    // mobile (where they stack). Without colgroup, table 2's hidden thead
    // breaks table-layout:fixed's column anchoring → table 2 col 1 comes out
    // narrower than table 1, shifting all logos/names left.
    const tableHTML = (subset, startSeed) => `
      <table style="border-collapse:collapse;">
        <colgroup>
          <col class="seed-col-seed">
          <col class="seed-col-community">
        </colgroup>
        <thead>
          <tr style="border-bottom:2px solid #3A5C36;">
            <th style="text-align:left;padding:8px 18px;font-size:12px;color:#6B8276;letter-spacing:0.18em;">SEED</th>
            <th style="text-align:left;padding:8px 18px;font-size:12px;color:#6B8276;letter-spacing:0.18em;">COMMUNITY</th>
          </tr>
        </thead>
        <tbody>${subset.map((c, i) => rowHTML(c, startSeed + i)).join('')}</tbody>
      </table>
    `;

    const div = document.createElement('div');
    div.id = 'seed-preview-backdrop';
    div.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);
      backdrop-filter:blur(6px);z-index:9999;
      display:flex;align-items:center;justify-content:center;
      font-family:var(--font, system-ui), sans-serif;
    `;
    div.innerHTML = `
      <div style="background:#0E2A1E;color:#FFFFFF;border:2px solid #FFB703;
                  padding:clamp(16px,4vw,24px) clamp(18px,5vw,36px);border-radius:14px;
                  width:fit-content;max-width:96vw;
                  max-height:94vh;overflow-y:auto;
                  box-shadow:0 0 80px rgba(255,183,3,0.35);">
        <div style="text-align:center;margin-bottom:clamp(12px,3vw,20px);">
          <div id="seedCountdownNum" style="font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:clamp(24px,7vw,48px);font-weight:700;color:#FF5470;letter-spacing:0.06em;font-variant-numeric:tabular-nums;text-shadow:0 0 24px rgba(255,84,112,0.35);line-height:1;white-space:nowrap;">—</div>
          <div id="seedCountdownLabel" style="font-family:'JetBrains Mono',monospace;font-size:clamp(11px,2.6vw,13px);color:#6B8276;letter-spacing:0.22em;margin-top:8px;text-transform:uppercase;">Draft Begins</div>
        </div>
        <div style="font-size:clamp(22px,5vw,32px);font-weight:700;letter-spacing:0.08em;
                    color:#FFB703;text-transform:uppercase;margin-bottom:clamp(12px,3vw,18px);text-align:center;">
          Seed Order
        </div>
        <div class="seed-preview-grid" style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px 60px;">
          ${tableHTML(seeded.slice(0, 4), 1)}
          ${tableHTML(seeded.slice(4, 8), 5)}
        </div>
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px;">
          <button id="seed-preview-cancel" style="
            padding:12px 24px;font-size:14px;font-weight:700;
            background:transparent;color:#C8D6CE;
            border:1px solid #3A5C36;border-radius:6px;cursor:pointer;">
            Cancel
          </button>
          <button id="seed-preview-confirm" style="
            padding:12px 28px;font-size:14px;font-weight:700;
            background:#FFB703;color:#0E2A1E;
            border:none;border-radius:6px;cursor:pointer;letter-spacing:0.06em;">
            CONFIRM &amp; START DRAFT
          </button>
        </div>
      </div>
      <style>
        /* Hide the second table's header when the two seed tables wrap to
           a stacked column on narrow viewports — the second SEED·COMMUNITY
           row becomes redundant once they're vertical.
           Also: both tables go width:100% so the SEED col + COMMUNITY col
           line up across rows from both tables (otherwise each table
           auto-sizes to its own widest name and columns visibly drift). */
        @media (max-width: 760px) {
          /* table-layout:fixed + colgroup pins col widths identically across
             both tables so the SEED column is the same width in table 1
             (with visible thead) and table 2 (thead hidden) — otherwise
             logos+names in rows 5-8 sit ~24px left of rows 1-4. */
          #seed-preview-backdrop .seed-preview-grid > table { width: 100%; table-layout: fixed; }
          #seed-preview-backdrop .seed-preview-grid > table:not(:first-of-type) thead { display: none; }
          #seed-preview-backdrop .seed-preview-grid > table col.seed-col-seed { width: 100px; }
        }
      </style>
    `;
    document.body.appendChild(div);

    // Anticipation countdown ticking down to live-draft start
    // (Wed 2026-05-20 19:00 Bangkok / UTC+7). Same target the projector
    // overlay shows so commissioner + audience see matching numbers.
    const DRAFT_START_MS = new Date('2026-05-20T19:00:00+07:00').getTime();
    const elCdNum   = document.getElementById('seedCountdownNum');
    const elCdLabel = document.getElementById('seedCountdownLabel');
    const tickCountdown = () => {
      if (!elCdNum || !elCdLabel) return;
      const ms = DRAFT_START_MS - Date.now();
      if (ms <= 0) {
        elCdNum.textContent = 'STARTING NOW';
        elCdLabel.textContent = 'DRAFT IS LIVE';
        return;
      }
      const totalSec = Math.floor(ms / 1000);
      const days  = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins  = Math.floor((totalSec % 3600) / 60);
      const secs  = totalSec % 60;
      const pad2 = (n) => String(n).padStart(2, '0');
      elCdNum.textContent = `${days}D ${pad2(hours)}H ${pad2(mins)}M ${pad2(secs)}S`;
    };
    tickCountdown();
    const cdInterval = setInterval(tickCountdown, 1000);

    const ok     = document.getElementById('seed-preview-confirm');
    const cancel = document.getElementById('seed-preview-cancel');
    const close = (val) => { clearInterval(cdInterval); div.remove(); resolve(val); };
    ok.addEventListener('click',     () => close(true));
    cancel.addEventListener('click', () => close(false));
    div.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
    setTimeout(() => ok.focus(), 50);
  });
}

async function fetchSeedOrder() {
  // Use the already-loaded state.communities (with seeds), sorted asc.
  const seeded = state.communities
    .filter(c => c.seed != null && c.id)
    .sort((a, b) => a.seed - b.seed);
  return seeded.map(c => c.id);
}

async function forceComplete() {
  // Destructive, irreversible. Type-to-confirm rather than a one-click prompt —
  // the friction is the point.
  if (!await typeToConfirm({
    title:   'Force-Complete Draft',
    message: 'This will mark the draft complete without finishing all picks. ' +
             'The remaining slots stay empty in the rosters.',
    keyword: 'COMPLETE',
  })) return;
  try {
    await DraftSupabase.completeDraft(state.draft.id);
    await loadDraftState();
    showToast('Draft marked complete');
  } catch (err) {
    showToast(`Complete failed: ${err.message || err}`, 'error');
  }
}

async function resetDraft() {
  const pickCount = state.picks.filter(p => !p.is_undone).length;
  const detail = pickCount > 0
    ? `This will DELETE ${pickCount} pick(s) and rewind the draft to "pending". Cannot be undone.`
    : 'This will rewind the draft to "pending". (No picks to delete.)';
  if (!await typeToConfirm({
    title:   'Reset Draft',
    message: detail,
    keyword: 'RESET',
  })) return;
  try {
    await DraftSupabase.resetDraft(state.draft.id);
    await loadDraftState();
    showToast('Draft reset to pending');
  } catch (err) {
    console.error('resetDraft failed:', err);
    showToast(`Reset failed: ${err.message || err}`, 'error');
  }
}

// Type-to-confirm modal. Operator must type the keyword exactly before the
// Confirm button enables. Used for destructive, irreversible actions
// (Reset, Force Complete). Returns a Promise<boolean>.
function typeToConfirm({ title, message, keyword }) {
  return new Promise((resolve) => {
    const backdropId = 'type-confirm-backdrop';
    const existing = document.getElementById(backdropId);
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = backdropId;
    div.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.78);
      backdrop-filter: blur(6px); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font, system-ui), sans-serif;
    `;
    div.innerHTML = `
      <div style="background:#0E2A1E;color:#FFFFFF;border:1px solid #FF5470;
                  padding:32px 40px;border-radius:14px;max-width:520px;width:90vw;
                  box-shadow:0 0 40px rgba(255,84,112,0.35);">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.04em;
                    color:#FF5470;text-transform:uppercase;margin-bottom:14px;">
          ⚠ ${title}
        </div>
        <div style="font-size:15px;color:#C8D6CE;line-height:1.5;margin-bottom:22px;">
          ${message}
        </div>
        <div style="font-size:13px;color:#FFB703;margin-bottom:8px;letter-spacing:0.04em;">
          Type <strong>${keyword}</strong> to confirm:
        </div>
        <input id="type-confirm-input" type="text" autocomplete="off"
               style="width:100%;padding:10px 14px;font-size:18px;
                      background:#061712;border:1px solid #3A5C36;
                      color:#FFFFFF;border-radius:6px;font-family:monospace;
                      letter-spacing:0.05em;margin-bottom:20px;" />
        <div style="display:flex;gap:12px;justify-content:flex-end;">
          <button id="type-confirm-cancel" style="
            padding:10px 22px;font-size:14px;font-weight:700;
            background:transparent;color:#C8D6CE;
            border:1px solid #3A5C36;border-radius:6px;cursor:pointer;">
            Cancel
          </button>
          <button id="type-confirm-ok" disabled style="
            padding:10px 22px;font-size:14px;font-weight:700;
            background:#FF5470;color:#0E2A1E;border:none;border-radius:6px;
            cursor:not-allowed;opacity:0.4;">
            ${title}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    const input = document.getElementById('type-confirm-input');
    const ok    = document.getElementById('type-confirm-ok');
    const cancel = document.getElementById('type-confirm-cancel');
    input.focus();
    input.addEventListener('input', () => {
      const armed = input.value.trim().toUpperCase() === keyword.toUpperCase();
      ok.disabled = !armed;
      ok.style.cursor  = armed ? 'pointer' : 'not-allowed';
      ok.style.opacity = armed ? '1' : '0.4';
    });
    const close = (val) => { div.remove(); resolve(val); };
    ok.addEventListener('click',     () => close(true));
    cancel.addEventListener('click', () => close(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter' && !ok.disabled) close(true);
    });
  });
}

// ── REALTIME SUBSCRIPTIONS ────────────────────────────────────────

function subscribeToRealtime() {
  if (!state.draft) return;
  if (subscribers.drafts) DraftSupabase.client().removeChannel(subscribers.drafts);
  if (subscribers.picks)  DraftSupabase.client().removeChannel(subscribers.picks);

  subscribers.drafts = DraftSupabase.subscribeToDraft(state.draft.id, (row) => {
    state.draft = row;
    renderAll();
  });

  subscribers.picks = DraftSupabase.subscribeToPicks(state.draft.id, async (row, eventType) => {
    // Re-fetch full picks list (cheaper than diffing)
    state.picks = await DraftSupabase.fetchPicksWithUndone(state.draft.id);
    renderAll();
  });

  // 5-second polling fallback. Realtime events can be dropped silently
  // (WebSocket reconnect, RLS hiccup, tab throttling). The commissioner is
  // the writer and the most state-critical screen — projector and team pages
  // both have this; commissioner needs it too. Skipped when tab is hidden.
  if (state._pollIntervalId) clearInterval(state._pollIntervalId);
  state._pollIntervalId = setInterval(async () => {
    if (document.hidden) return;
    try {
      const [d, p] = await Promise.all([
        DraftSupabase.fetchDraft(TOURNAMENT_SLUG),
        DraftSupabase.fetchPicksWithUndone(state.draft.id),
      ]);
      if (!d) return;
      // Shallow diff on the fields that actually drive the UI. Avoids
      // needless re-renders + flicker.
      const drift =
        !state.draft ||
        state.draft.is_timer_paused     !== d.is_timer_paused ||
        state.draft.status              !== d.status ||
        state.draft.current_pick_number !== d.current_pick_number ||
        state.draft.timer_started_at    !== d.timer_started_at ||
        state.draft.pick_timer_seconds  !== d.pick_timer_seconds ||
        state.picks.length              !== p.length;
      if (drift) {
        console.log('[commissioner] poll-fallback reconciled state',
          { paused: d.is_timer_paused, status: d.status,
            pick: d.current_pick_number, picks: p.length });
        state.draft = d;
        state.picks = p;
        renderAll();
      }
    } catch (_) { /* network blip — next interval retries */ }
  }, 5000);
}

// ── GLOBAL EVENTS ─────────────────────────────────────────────────

function bindGlobalEvents() {
  const search = document.getElementById('pool-search');
  search.addEventListener('input', () => {
    state.search = search.value;
    renderPool();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.topMatchUserId) {
      const player = getDisplayedPool().find(p => p.userId === state.topMatchUserId);
      if (player) openConfirmModal(player);
    }
    if (e.key === 'Escape') {
      search.value = '';
      state.search = '';
      renderPool();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.pendingPick) closeConfirmModal();
    // N — rapid-fire pick. U — rapid undo of the most recent active pick.
    // Both ignored when typing in an input/textarea so the search box still
    // accepts literal 'n'/'u'. Skipped while the confirm modal is open
    // (Escape it first).
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (inEditable) return;
      if (state.pendingPick) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); fastPick(); }
      else if (e.key === 'u' || e.key === 'U') { e.preventDefault(); fastUndo(); }
    }
  });
  // Bind backdrop dismiss ONCE here, not in openConfirmModal. The backdrop
  // element is static in commissioner.html (not replaced by innerHTML); the
  // per-open re-bind that was here previously leaked one listener per pick.
  // By pick 64 a single backdrop click fired broadcastClearPending 64 times,
  // tripping Realtime's 10 events/sec rate limit.
  const backdrop = document.getElementById('confirm-modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      if (state.pendingPick) closeConfirmModal();
    });
  }

  // Pill/scrim DOM is display:none above 480px via CSS, so these listeners
  // are inert on desktop — but body.history-open is a global state class, so
  // a resize past the breakpoint must clear it (see matchMedia below) or a
  // re-narrow would re-open the drawer with no user action.
  const pillEl = document.getElementById('history-pill');
  const scrimEl = document.getElementById('history-scrim');
  const setDrawer = (open) => {
    document.body.classList.toggle('history-open', open);
    if (pillEl) pillEl.setAttribute('aria-expanded', String(open));
  };
  if (pillEl) {
    pillEl.addEventListener('click', () => {
      setDrawer(!document.body.classList.contains('history-open'));
    });
  }
  if (scrimEl) {
    scrimEl.addEventListener('click', () => setDrawer(false));
  }
  if (window.matchMedia) {
    const mql = window.matchMedia('(max-width: 480px)');
    const onChange = (e) => { if (!e.matches) setDrawer(false); };
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function showToast(msg, kind) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${kind === 'error' ? 'toast--error' : ''}`;
  setTimeout(() => el.classList.add('hidden'), 3000);
  // ensure hidden class is removed first
  el.classList.remove('hidden');
}

})();
