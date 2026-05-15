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
     - ControlsBar    : start/pause/resume/complete/writeback
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
  filters: { gender: null, hand: null, side: null },
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
    fetchGviz('Users').then(parseCSVRows).catch(e => { console.warn('Users fetch failed (avatars will fall back to initials):', e); return []; }),
  ];
  const [communityRows, playerRows, regRows, userRows] = await Promise.all(fetches);

  state.communities = parseCommunities(communityRows);
  state.captainUserIds = parseCaptainIds(playerRows);
  state.registrations = regRows;
  state.avatarsByUserId = parseAvatarsByUserId(userRows);

  console.log('[Commissioner] sheet data loaded', {
    communities: state.communities.length,
    captains: state.captainUserIds.size,
    registrations: state.registrations.length,
    avatars: Object.keys(state.avatarsByUserId).length,
  });
}

function parseAvatarsByUserId(rows) {
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
      color: (r['Color'] || '').trim(),
      // ?v=2 cache-busts the GitHub Pages CDN after the logo artwork refresh.
      logoPath: (r['Logo Path'] || '').trim().replace(/^(.+)$/, '$1?v=3'),
      seed: parseInt(r['Seed'], 10) || null,
    }));
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
      return {
        userId: (r['User ID'] || '').trim(),
        name: (r['Name'] || '').trim(),
        gender: normalizeGender(r['Gender'] || ''),
        level: m ? parseFloat(m[1]) : null,
        levelTier: levelStr.includes(' - ') ? levelStr.split(' - ')[1].trim() : '',
        hand: normalizeHandSide(r['Hand'] || ''),
        side: normalizeSide(r['Side'] || ''),
        nationality: (r['Nationality'] || '').trim(),
        prefs: [r['Community 1st'], r['Community 2nd'], r['Community 3rd']]
          .map(s => (s || '').trim()).filter(Boolean),
        status: (r['Statuses'] || '').trim(),
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

// 2-letter ISO code → flag emoji via regional indicator symbols.
function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  const cp = [...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0));
  return String.fromCodePoint(...cp);
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

// Filter: real available players (not captains, not picked, has gender+level)
function getAvailablePlayers() {
  const pickedIds = new Set(
    state.picks.filter(p => !p.is_undone).map(p => p.player_id)
  );
  return state.registrations.filter(r => {
    if (!r.gender) return false;             // must have F/M
    if (r.level == null) return false;       // must have a numeric level
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

  const sign = remaining < 0 ? '-' : '';
  const abs = Math.abs(remaining);
  const mins = Math.floor(abs / 60);
  const secs = Math.floor(abs % 60);
  el.textContent = `${sign}${mins}:${String(secs).padStart(2, '0')}`;

  const color = DraftUtils.timerColorState(remaining, total);
  el.className = `timer-display timer-display--${color}`;
}

// ── POOL FILTER BAR ───────────────────────────────────────────────

function renderPoolFilters() {
  const el = document.getElementById('pool-filters');
  const pool = getDisplayedPool();
  el.innerHTML = `
    ${filterGroup('gender', [['F', '♀ F'], ['M', '♂ M']])}
    ${filterGroup('hand', [['L', 'L 🫲'], ['R', '🫱 R']])}
    ${filterGroup('side', [['F', 'L ⬅️'], ['B', '➡️ R']])}
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

// ── POOL LIST ─────────────────────────────────────────────────────

function renderPool() {
  renderPoolFilters();
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

function poolRowHTML(p, isTopMatch) {
  // Letter-flanks-icon convention: position of the letter mirrors the court side.
  const handLabel = p.hand === 'L' ? 'L 🫲' : p.hand === 'R' ? '🫱 R' : p.hand === 'B' ? 'L 🤲 R' : '';
  const sideLabel = p.side === 'F' ? 'L ⬅️' : p.side === 'B' ? '➡️ R' : p.side === 'E' ? 'L ↔️ R' : '';
  const ratingLabel = p.level != null ? `⭐ ${p.level.toFixed(2)}` : '—';
  return `
    <div class="pool-row ${isTopMatch ? 'pool-row--top-match' : ''}" data-user-id="${p.userId}">
      ${avatarHTML(p, 36)}
      <span class="pool-row__flag" title="${escapeHTML(p.nationality || '')}">${flagEmoji(countryCodeFor(p.nationality))}</span>
      <span class="pool-row__name">${escapeHTML(p.name)}</span>
      <span class="pool-row__prefs">${prefsHTML(p)}</span>
      <span class="pool-row__meta">
        <span class="pool-row__cell">${ratingLabel}</span>
        <span class="pool-row__cell">${handLabel}</span>
        <span class="pool-row__cell">${sideLabel}</span>
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

function renderHistory() {
  const listEl = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');
  const live = state.picks.filter(p => !p.is_undone).length;
  countEl.textContent = `${live} / ${DraftUtils.TOTAL_PICKS}`;

  const sorted = [...state.picks].sort((a, b) => b.pick_number - a.pick_number);
  if (sorted.length === 0) {
    listEl.innerHTML = `<div class="history-list__empty">No picks yet</div>`;
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
  const captainSameGender = [...state.captainUserIds].some(uid => {
    const tpRow = Data.getPlayers().find(p => String(p['TPS User ID']).trim() === uid && String(p['Community ID']).trim() === currentTeamId);
    if (!tpRow) return false;
    return normalizeGender(tpRow['Gender']) === player.gender;
  });
  const slotLimit = 5;
  const usedSlots = sameGenderCount + (captainSameGender ? 1 : 0);
  if (usedSlots >= slotLimit) {
    showToast(`${community.name} already has ${slotLimit} ${player.gender} players`, 'error');
    return;
  }

  state.pendingPick = { player, community, pickNumber: state.draft.current_pick_number };
  const logoSrc = community.logoPath || '';
  const handLabel = player.hand === 'L' ? 'L 🫲' : player.hand === 'R' ? '🫱 R' : player.hand === 'B' ? 'L 🤲 R' : '';
  const sideLabel = player.side === 'F' ? 'L ⬅️' : player.side === 'B' ? '➡️ R' : player.side === 'E' ? 'L ↔️ R' : '';
  const ratingLabel = player.level != null ? `⭐ ${player.level.toFixed(2)}` : '—';
  const modalEl = document.getElementById('confirm-modal');
  const contentEl = document.getElementById('confirm-modal-content');
  contentEl.innerHTML = `
    <div class="confirm-modal__header">Confirm Pick #${state.pendingPick.pickNumber}</div>
    <div class="confirm-modal__body">
      <div class="confirm-modal__player">
        ${avatarHTML(player, 90)}
        <div class="confirm-modal__name">${escapeHTML(player.name)}</div>
        <div class="confirm-modal__sub">${ratingLabel} · ${handLabel} · ${sideLabel}</div>
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
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-modal-backdrop').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-submit').addEventListener('click', submitPendingPick);
  setTimeout(() => document.getElementById('confirm-submit').focus(), 100);
}

function closeConfirmModal() {
  state.pendingPick = null;
  const modalEl = document.getElementById('confirm-modal');
  modalEl.classList.add('hidden');
  modalEl.setAttribute('aria-hidden', 'true');
}

async function submitPendingPick() {
  if (!state.pendingPick) return;
  const { player, community, pickNumber } = state.pendingPick;
  closeConfirmModal();
  try {
    await DraftSupabase.insertPick({
      draftId: state.draft.id,
      pickNumber,
      teamId: community.id,
      playerId: player.userId,
    });
    // Advance pick OR complete the draft
    if (pickNumber >= DraftUtils.TOTAL_PICKS) {
      await DraftSupabase.completeDraft(state.draft.id);
    } else {
      await DraftSupabase.advancePick(state.draft.id, pickNumber + 1);
    }
    // Realtime subscription will update state.draft; for instant feedback we
    // optimistically re-fetch state.
    await loadDraftState();
    showToast(`Pick #${pickNumber} confirmed`);
  } catch (err) {
    console.error('submitPendingPick failed:', err);
    showToast(`Pick failed: ${err.message || err}`, 'error');
  }
}

// ── UNDO ──────────────────────────────────────────────────────────

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
    left += `<button class="btn btn--primary" id="ctrl-writeback">WRITE BACK TO SHEETS</button>`;
  }

  // Right side — danger group: Force Complete (only while active/paused) + Reset (always)
  let right = `<span class="controls__warning" title="These actions cannot be undone">⚠️ Cannot be undone</span>`;
  if (s === 'active' || s === 'paused') {
    right += `<button class="btn btn--danger" id="ctrl-complete">⚠️ FORCE COMPLETE</button>`;
  }
  right += `<button class="btn btn--danger" id="ctrl-reset">⚠️ RESET DRAFT</button>`;

  el.innerHTML = `<div class="controls__left">${left}</div><div class="controls__right">${right}</div>`;
  bindCtrl('ctrl-start', startDraft);
  bindCtrl('ctrl-pause', () => DraftSupabase.setPaused(state.draft.id, true).then(loadDraftState));
  bindCtrl('ctrl-resume', () => DraftSupabase.setPaused(state.draft.id, false).then(loadDraftState));
  bindCtrl('ctrl-complete', forceComplete);
  bindCtrl('ctrl-writeback', writeBackToSheets);
  bindCtrl('ctrl-reset', resetDraft);
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
  // Snapshot the seed order: sort communities by their Seed column (already
  // in Communities tab F-K formulas). We don't have a clean accessor in
  // Data; pull via a fresh CSV fetch with the seed column visible.
  try {
    const seedOrder = await fetchSeedOrder();
    if (seedOrder.length !== 8) {
      showToast(`Seed order has ${seedOrder.length} teams; need 8`, 'error');
      return;
    }
    await DraftSupabase.startDraft(state.draft.id, seedOrder);
    await loadDraftState();
    showToast('Draft started');
  } catch (err) {
    console.error('startDraft failed:', err);
    showToast(`Start failed: ${err.message || err}`, 'error');
  }
}

async function fetchSeedOrder() {
  // Use the already-loaded state.communities (with seeds), sorted asc.
  const seeded = state.communities
    .filter(c => c.seed != null && c.id)
    .sort((a, b) => a.seed - b.seed);
  return seeded.map(c => c.id);
}

async function forceComplete() {
  if (!confirm('Force-complete the draft? This will mark it complete without finishing all picks.')) return;
  try {
    await DraftSupabase.completeDraft(state.draft.id);
    await loadDraftState();
    showToast('Draft marked complete');
  } catch (err) {
    showToast(`Complete failed: ${err.message || err}`, 'error');
  }
}

function writeBackToSheets() {
  showToast('Write-back is not implemented yet — see docs/draft-architecture.md §4c', 'error');
}

async function resetDraft() {
  const pickCount = state.picks.filter(p => !p.is_undone).length;
  const msg = pickCount > 0
    ? `Reset the draft? This will DELETE ${pickCount} pick(s) and rewind to "pending". Cannot be undone.`
    : 'Reset the draft to "pending"? (No picks to delete.)';
  if (!confirm(msg)) return;
  try {
    await DraftSupabase.resetDraft(state.draft.id);
    await loadDraftState();
    showToast('Draft reset to pending');
  } catch (err) {
    console.error('resetDraft failed:', err);
    showToast(`Reset failed: ${err.message || err}`, 'error');
  }
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
  });
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
