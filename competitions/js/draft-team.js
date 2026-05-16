/* ============================================
   Team Page — Pool + Team views
   Read-only display for one captain during a live draft.

   URL params:
     community   — Community ID slug (required, e.g. coco-padel)
     pool        — flag — open Pool view by default
     team        — flag — open Team view by default (also the default if neither flag is given)
     tournament  — draft slug in Supabase (default: community-cup)
     sheet       — Google Sheet ID override (default: Community Cup sheet)

   Examples:
     team.html?community=coco-padel              → Team view
     team.html?community=coco-padel&pool         → Pool view
     team.html?community=coco-padel&team         → Team view (explicit)

   Data sources:
     • Google Sheets gviz CSV — Communities + Teams and Players (roster + captains)
     • Supabase Realtime      — drafts + draft_picks (live state)

   Per architecture decision 4c, draft_picks is authoritative during the draft;
   the Sheet's pre-draft Community ID is treated as stale.
   ============================================ */

(function () {
  'use strict';

  // -------- Config --------
  const DEFAULT_SHEET_ID = '1ZvTjeu-rgNFGG5lX-DY5k8riy_ezPIAtcSNr5BjY4DQ';
  const DEFAULT_TOURNAMENT_SLUG = 'community-cup';
  const N_FEMALE_SLOTS = 5;
  const N_MALE_SLOTS = 5;

  // -------- URL params --------
  const params = new URLSearchParams(window.location.search);
  // Community slug — three sources, in priority order:
  //   1. ?community=coco-padel                          (explicit query)
  //   2. /competitions/<comp>/draft/coco-padel          (last path segment — production clean URL)
  //   3. ?team=coco-padel                               (legacy; only when ?team= holds a value, not used as flag)
  // The path-segment source is what the QR codes on the projector encode.
  const legacyTeamVal = (params.get('team') || '').trim();
  const isTeamFlag = params.has('team') && legacyTeamVal === '';
  const pathSegment = (() => {
    const m = window.location.pathname.match(/\/([^/]+)\/?$/);
    if (!m) return '';
    const seg = decodeURIComponent(m[1]).toLowerCase();
    // Ignore segments that are file/page names — they're not community slugs.
    if (/\.[a-z0-9]+$/i.test(seg)) return '';
    if (seg === 'team' || seg === 'draft' || seg === 'projector' || seg === 'commissioner') return '';
    return seg;
  })();
  const COMMUNITY_SLUG = (
    params.get('community') ||
    pathSegment ||
    (isTeamFlag ? '' : legacyTeamVal) ||
    ''
  ).toLowerCase();
  // View flag — explicit ?pool wins; ?team falls through to team; default = team.
  const INITIAL_VIEW = params.has('pool') ? 'pool' : 'team';
  const TOURNAMENT_SLUG = (params.get('tournament') || DEFAULT_TOURNAMENT_SLUG).trim();
  const SHEET_ID = (params.get('sheet') || DEFAULT_SHEET_ID).trim();

  // -------- DOM refs --------
  const $app = document.getElementById('app');
  const $reconnect = document.getElementById('team-reconnect');
  const $error = document.getElementById('team-error');
  const $tournamentLogo = document.getElementById('team-tournament-logo');
  const $teamHeader = document.getElementById('team-team-header');
  const $rosterFemale = document.getElementById('team-roster-grid-female');
  // Rec #6 — hub view + back-to-hub chevron
  const $hub = document.getElementById('team-view-hub');
  const $backHub = document.getElementById('team-back-hub');
  const $rosterMale = document.getElementById('team-roster-grid-male');
  const $poolList = document.getElementById('team-pool-list');
  const $search = document.getElementById('team-search');
  const $sortGroup = document.getElementById('team-sort-group');
  const $filterGroup = document.getElementById('team-filter-group');
  const $prefsGroup = document.getElementById('team-prefs-group');

  // -------- State --------
  const state = {
    view: INITIAL_VIEW,
    communities: [],     // [{ id, name, color, logoPath, ... }]
    players: [],         // [{ communityId, tpsId, name, avatar, rating, hand, side, gender, isCaptain }]
    playersByTpsId: new Map(),  // tps_id -> player record (built once after sheet load)
    draft: null,
    picks: [],           // [{ id, draft_id, pick_number, team_id, player_id, is_undone }]
    picksHash: '',       // signature of the picks list used to skip no-op rerenders
    firstPicksRendered: false, // gate for pick-notification animation (skip on initial load)
    search: '',
    sort: 'rating-desc',
    // gender/hand/side are single-value; prefs is a multi-select array of community ids.
    filters: { gender: null, hand: null, side: null, prefs: [] },
  };

  // Live resources we need to tear down on pagehide / visibility change.
  const teardown = {
    pollHandle: null,
    channels: [],
  };

  // Label lookup tables (replace ternary chains).
  // Letter-flanks-icon convention: position of the letter mirrors the court side.
  const HAND_LABEL = { L: 'L 🫲', R: '🫱 R', B: 'L 🤲 R' };
  const SIDE_LABEL = { L: 'L ⬅️', R: '➡️ R', B: 'L ↔️ R' };

  function handLabel(h) { return HAND_LABEL[h] || '—'; }
  function sideLabel(s) { return SIDE_LABEL[s] || '—'; }
  // Returns HTML (two flex-aligned spans) so the star icon + digits line up
  // on the row baseline. Callers must NOT escapeHtml the result.
  function ratingStr(r) {
    if (r == null) return '—';
    return `<span class="rating-star">⭐</span><span class="rating-val">${r.toFixed(1)}</span>`;
  }
  function picksSignature(picks) {
    // Captures order + is_undone state so UPDATEs are detected even when length stays.
    return picks.map(p => `${p.id}:${p.is_undone ? 1 : 0}:${p.pick_number}:${p.player_id}:${p.team_id}`).join('|');
  }

  // ============================================================
  // Helpers — defensive parsers (per Phase 0 verification + brief)
  // ============================================================

  /** "Male"/"M"/"m" → "M",  "Female"/"F"/"f" → "F",  else "". */
  function normalizeGender(g) {
    const s = String(g || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'm' || s === 'male') return 'M';
    if (s === 'f' || s === 'female') return 'F';
    return '';
  }

  /** "right_handed"/"R"/"r" → "R", left → "L", both → "B". */
  function normalizeHand(h) {
    const s = String(h || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'r' || s === 'right' || s === 'right_handed') return 'R';
    if (s === 'l' || s === 'left' || s === 'left_handed')  return 'L';
    if (s === 'b' || s === 'both' || s === 'both_hands' || s === 'ambidextrous') return 'B';
    return '';
  }

  /** Court-side preference. Forehand → "L" (left/deuce court, where a
   *  right-handed player's forehand naturally lands). Backhand → "R".
   *  both_sides/either → "B". Check "both"/"either" FIRST so "both_sides"
   *  doesn't slip into the 'b' prefix as backhand. */
  function normalizeSide(s) {
    const v = String(s || '').trim().toLowerCase();
    if (!v) return '';
    if (v === 'b' || v.includes('both')  || v.includes('either')) return 'B';
    if (v === 'l' || v === 'left'  || v === 'forehand') return 'L';
    if (v === 'r' || v === 'right' || v === 'backhand') return 'R';
    return '';
  }

  /** Parse "3.04" or "2.6 - High Beginner" → 3.04 / 2.6, else null. */
  function parseRating(v) {
    if (v == null || v === '') return null;
    const m = String(v).match(/^\s*([\d.]+)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function firstName(full) {
    return String(full || '').trim().split(/\s+/)[0] || '';
  }

  function initials(name, fallback = '?') {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return fallback;
    return parts[0].slice(0, 1).toUpperCase();
  }

  function teamInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  // Country name → ISO 3166-1 alpha-2 code. Mirrors the table on the
  // commissioner page so flags read identically across both surfaces.
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
  // ISO alpha-2 → flag-icons SVG span. Empty when no code. Rectangular,
  // OS-independent rendering via the flag-icons CSS library.
  function flagEmoji(code) {
    if (!code || code.length !== 2) return '';
    return `<span class="fi fi-${code.toLowerCase()}"></span>`;
  }

  // Normalize a name for matching: lowercase, punctuation → spaces, collapse.
  //   "Padel, Pa?"  → "padel pa"      "Padel & Brew" → "padel brew"
  function normCommName(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Registration-form preference strings don't always match the Communities
  // tab names. These are the known divergences (normalized form → community id).
  // Everything else resolves by exact normalized match.
  const PREF_ALIAS = {
    'deuce': 'deuce-padel',                          // form lists just "Deuce"
    'sabai sabai padel collective': 'sabai-sabai',   // form appends "Padel Collective"
  };

  // Map a Registrations community-preference string to a community record.
  // Deterministic: exact normalized match, then the known-alias table. NO
  // fuzzy/token matching — "Padel" appears in 5 of 8 names and collided
  // (e.g. "Padel, Pa?" wrongly resolved to "Coco Padel").
  function findCommunityByName(input) {
    const norm = normCommName(input);
    if (!norm) return null;
    let m = state.communities.find(c => normCommName(c.name) === norm);
    if (m) return m;
    const aliasId = PREF_ALIAS[norm];
    if (aliasId) return state.communities.find(c => c.id === aliasId) || null;
    return null;
  }

  // Build the PREFERS filter row — one chip per community (logo + short name).
  // Multi-select. Rec #6: the pool view is now neutral for all viewers (no
  // captain-specific accent ring), so the chips look identical regardless
  // of whether a community is set in the URL.
  function renderPrefsFilterRow() {
    if (!$prefsGroup) return;
    $prefsGroup.innerHTML = state.communities.map(c => {
      const cls = ['team__chip', 'team__prefs-chip'];
      const logo = c.logoPath
        ? `<img class="team__prefs-chip-logo" src="${escapeHtml(c.logoPath)}" alt="" data-fallback="${escapeHtml((c.name || '?').charAt(0).toUpperCase())}">`
        : `<span class="team__prefs-chip-logo">${escapeHtml((c.name || '?').charAt(0).toUpperCase())}</span>`;
      // Full name — "Padel & Brew" vs "Padel Pa?" only differ past the first
      // word, so first-word abbreviation collides. The row scrolls if needed.
      const label = c.name || c.id;
      return `<button class="${cls.join(' ')}" data-pref-id="${escapeHtml(c.id)}" title="${escapeHtml(label)}">
        ${logo}<span class="team__prefs-chip-name">${escapeHtml(label)}</span>
      </button>`;
    }).join('');
    attachImgFallbacks($prefsGroup);
  }

  // Render up to 3 small community logos for the player's preferences.
  function prefsHTML(player) {
    if (!player.prefs || !player.prefs.length) return '';
    const ranks = ['1st', '2nd', '3rd'];
    return player.prefs.slice(0, 3).map((prefName, i) => {
      const c = findCommunityByName(prefName);
      if (!c) {
        return `<span class="team__pref-logo team__pref-logo--unknown" title="${escapeHtml(ranks[i])}: ${escapeHtml(prefName)}">?</span>`;
      }
      const title = `${ranks[i]}: ${c.name}`;
      if (c.logoPath) {
        return `<img class="team__pref-logo team__pref-logo--${i}" src="${escapeHtml(c.logoPath)}" alt="" title="${escapeHtml(title)}">`;
      }
      const initial = (c.name || '?').charAt(0).toUpperCase();
      return `<span class="team__pref-logo team__pref-logo--${i}" title="${escapeHtml(title)}">${initial}</span>`;
    }).join('');
  }

  // ============================================================
  // Sheet fetch — gviz CSV → array of row-objects keyed by header
  // ============================================================

  function gvizUrl(tabName) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  }

  /** Minimal CSV parser that handles quoted fields, doubled-quote escapes, and embedded commas. */
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else {
          cur += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c === '\r') { /* skip */ }
        else cur += c;
      }
    }
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
    if (rows.length === 0) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1)
      .filter(r => r.length > 0 && r.some(v => String(v).trim() !== ''))
      .map(r => {
        const o = {};
        headers.forEach((h, idx) => { o[h] = r[idx] != null ? r[idx] : ''; });
        return o;
      });
  }

  async function fetchTabRows(tabName) {
    const res = await fetch(gvizUrl(tabName), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Sheet fetch failed (${tabName}): HTTP ${res.status}`);
    const text = await res.text();
    return parseCSV(text);
  }

  function parseCommunities(rows) {
    return rows
      .filter(r => (r['Community ID'] || '').trim())
      .map(r => ({
        id: (r['Community ID'] || '').trim(),
        name: (r['Name'] || '').trim(),
        group: (r['Group'] || '').trim(),
        color: (r['Color'] || '').trim() || '#ff8a3d',
        // ?v=2 cache-busts the GitHub Pages CDN after the logo artwork refresh.
        logoPath: (r['Logo Path'] || '').trim().replace(/^(.+)$/, '$1?v=3'),
        seed: parseInt((r['Seed'] || '').trim(), 10) || null,
      }));
  }

  function parsePlayers(rows) {
    return rows
      .filter(r => (r['Community ID'] || '').trim())
      .map(r => {
        const tpsId = (r['TPS User ID'] || '').trim();
        return {
          communityId: (r['Community ID'] || '').trim(),
          tpsId,
          name: (r['Player Name'] || '').trim(),
          avatar: (r['Avatar'] || r['Player Avatar'] || '').trim(),
          rating: parseRating(r['Rating']),
          hand: normalizeHand(r['Hand']),
          side: normalizeSide(r['Side']),
          gender: normalizeGender(r['Gender']),
          isCaptain: (r['Is Captain'] || '').trim().toUpperCase() === 'Y',
          nationality: (r['Nationality'] || '').trim(),
          // A row is "real" if it has a TPS User ID (formulas resolved). Placeholders
          // like "Coco Padel Male #2" have blank TPS User ID and no metadata.
          isPlaceholder: !tpsId,
        };
      });
  }

  /** Parse the Registrations tab into the same player shape. The draft pool
   *  is the set of paid registrants who aren't captains and haven't been
   *  drafted yet. Per Phase 0 verification, the canonical roster lives here,
   *  not in Teams and Players (which is captains-only until the post-draft
   *  write-back populates it). */
  function parseRegistrations(rows) {
    return rows
      .filter(r => (r['User ID'] || '').trim() && (r['Paid ?'] || '').trim().toUpperCase() === 'Y')
      .map(r => {
        const av = (r['Avatar'] || '').trim();
        return {
          communityId: '',                                     // assigned by the draft, not by registration
          tpsId: (r['User ID'] || '').trim(),
          name: (r['Name'] || '').trim(),
          // Registrations natively carries an Avatar column — used to be
          // empty here and backfilled from the Users tab; we now read it
          // direct (Users tab retired).
          avatar: (av && av !== 'null' && av !== '#N/A') ? av : '',
          rating: parseRating(r['Level (current)']),
          hand: normalizeHand(r['Hand']),
          side: normalizeSide(r['Side']),
          gender: normalizeGender(r['Gender']),
          isCaptain: false,
          nationality: (r['Nationality'] || '').trim(),
          prefs: [r['Community 1st'], r['Community 2nd'], r['Community 3rd']]
            .map(s => (s || '').trim()).filter(Boolean),
          isPlaceholder: false,
        };
      });
  }

  // ============================================================
  // Computed selectors
  // ============================================================

  function getCommunity() {
    return state.communities.find(c => c.id === COMMUNITY_SLUG) || null;
  }

  /** Set of player_ids in non-undone picks. */
  function pickedPlayerIds() {
    const set = new Set();
    for (const p of state.picks) {
      if (!p.is_undone) set.add(p.player_id);
    }
    return set;
  }

  /** Captains for the given community (from Sheet — Is Captain=Y rows). */
  function captainsFor(communityId) {
    return state.players.filter(p => p.isCaptain && p.communityId === communityId && !p.isPlaceholder);
  }

  /** Players this team has drafted, oldest pick first, resolved to player records. */
  function draftedFor(communityId) {
    const teamPicks = state.picks
      .filter(p => !p.is_undone && p.team_id === communityId)
      .sort((a, b) => a.pick_number - b.pick_number);
    const out = [];
    for (const pk of teamPicks) {
      const player = state.playersByTpsId.get(pk.player_id);
      if (player) out.push(player);
      else out.push({ tpsId: pk.player_id, name: `#${pk.player_id}`, gender: '', rating: null, hand: '', side: '', avatar: '', isCaptain: false });
    }
    return out;
  }

  /** Available pool: real (non-placeholder) non-captain players not yet drafted.
   *  IGNORES Sheet's Community ID per architecture decision 4c — Supabase picks
   *  are authoritative during a live draft. */
  function availablePool() {
    const picked = pickedPlayerIds();
    const seen = new Set();
    return state.players.filter(p => {
      if (p.isPlaceholder) return false;
      if (p.isCaptain) return false;
      if (picked.has(p.tpsId)) return false;
      if (seen.has(p.tpsId)) return false;  // de-dupe if a player appears twice
      seen.add(p.tpsId);
      return true;
    });
  }

  /** Filter+sort+search applied to the pool. */
  function visiblePool() {
    let list = availablePool();
    const q = state.search.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    if (state.filters.gender) {
      list = list.filter(p => p.gender === state.filters.gender);
    }
    if (state.filters.hand) {
      // Inclusive: filter L shows L AND B-hand players.
      const target = state.filters.hand;
      list = list.filter(p => p.hand === target || p.hand === 'B');
    }
    if (state.filters.side) {
      const target = state.filters.side;
      list = list.filter(p => p.side === target || p.side === 'B');
    }
    if (state.filters.prefs.length) {
      // Show players who listed ANY of the selected communities among their
      // up-to-3 preferred teams (Registrations "Community 1st/2nd/3rd").
      const wanted = new Set(state.filters.prefs);
      list = list.filter(p => (p.prefs || []).some(prefName => {
        const c = findCommunityByName(prefName);
        return c && wanted.has(c.id);
      }));
    }
    // state.sort is "<field>-<dir>" — field ∈ rating|name, dir ∈ asc|desc.
    const [sortField, sortDir] = state.sort.split('-');
    const mult = sortDir === 'desc' ? -1 : 1;
    if (sortField === 'rating') {
      list = list.slice().sort((a, b) => mult * ((a.rating ?? -1) - (b.rating ?? -1)));
    } else if (sortField === 'name') {
      list = list.slice().sort((a, b) => mult * a.name.localeCompare(b.name));
    }
    return list;
  }

  // ============================================================
  // Rendering
  // ============================================================

  function showError(message) {
    $error.innerHTML = `<strong>UNABLE TO LOAD</strong>${escapeHtml(message)}`;
    $error.hidden = false;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setReconnecting(on) {
    $reconnect.hidden = !on;
  }

  /** Walk any `<img data-fallback="X">` inside `root` and replace the image
   *  with `X` as text content when it 404s or errors. Avoids the embedded
   *  inline-`onerror` pattern (fragile with quotes / scripts in user content). */
  function attachImgFallbacks(root) {
    const imgs = root.querySelectorAll('img[data-fallback]');
    for (const img of imgs) {
      img.addEventListener('error', () => {
        const fallback = img.getAttribute('data-fallback') || '';
        const span = document.createElement('span');
        span.textContent = fallback;
        img.replaceWith(span);
      }, { once: true });
    }
  }

  function setView(next) {
    state.view = (next === 'pool' || next === 'hub') ? next : 'team';
    $app.setAttribute('data-view', state.view);
    // Rec #6: show the "← HUB" chevron on team/pool views, hide it on the
    // hub itself (no point pointing back at where you are).
    if ($backHub) $backHub.hidden = (state.view === 'hub');
  }

  // Build the URL for a given view, preserving every other query param.
  //   team → no flag        e.g. .../draft/coco-padel
  //   pool → bare ?pool     e.g. .../draft/coco-padel?pool
  function viewUrl(view) {
    const url = new URL(window.location.href);
    url.searchParams.delete('pool');
    url.searchParams.delete('team');   // legacy flag, kept out of the canonical URL
    let qs = url.searchParams.toString();
    if (view === 'pool') qs = qs ? qs + '&pool' : 'pool';
    url.search = qs ? '?' + qs : '';
    return url.toString();
  }

  // Switch view AND update the address bar so Pool/Team are separately
  // bookmarkable and browser back/forward moves between them.
  function navigateToView(view) {
    setView(view);
    const target = viewUrl(view);
    if (target !== window.location.href) {
      history.pushState({ view: state.view }, '', target);
    }
  }

  function renderTournamentLogo() {
    // Header-right mark is the tournament logo (Bangkok Community Cup) — same
    // on every draft page for visual consistency, not the captain's community.
    $tournamentLogo.innerHTML = `<img src="assets/cc-logo.png" alt="Bangkok Community Cup">`;
  }

  // The canonical hub URL is set per-stub in the ← HUB chevron's href so
  // local dev (team.html) and production (tps-may2026/home.html) can both
  // work without environment detection in JS. Falls back to 'team.html' if
  // the chevron isn't present (e.g. very old stub HTMLs).
  function hubFile() {
    return ($backHub && $backHub.getAttribute('href')) || 'team.html';
  }

  // Pool and live-draft URLs are derived from the hub URL so a stub only
  // needs to set the chevron href — sibling files come along automatically.
  //   Production hub:  tps-may2026/home/        (directory-style, extensionless)
  //     → pool:        tps-may2026/pool/
  //     → draft:       tps-may2026/draft/
  //     → community:   tps-may2026/community/<slug>/
  //   Local-dev hub:   team.html                (no tournament dir; everything bare)
  //     → pool:        team.html?pool           (query-param fallback)
  //     → draft:       draft.html               (top-level file)
  //     → community:   team.html?community=X    (query-param fallback)
  function isTournamentScopedHub() { return /\/home\/?$/.test(hubFile()); }
  function tournamentDir()         { return hubFile().replace(/home\/?$/, ''); }

  function poolFile() {
    return isTournamentScopedHub() ? tournamentDir() + 'pool/' : hubFile() + '?pool';
  }
  // Live-draft broadcast page. Renamed from "projector.html" (operator
  // jargon) to "draft" (reads naturally to audience and captains).
  function projectorFile() {
    return isTournamentScopedHub() ? tournamentDir() + 'draft/' : 'draft.html';
  }
  function communityUrl(communityId) {
    if (isTournamentScopedHub()) {
      return tournamentDir() + 'community/' + encodeURIComponent(communityId) + '/';
    }
    return hubFile() + '?community=' + encodeURIComponent(communityId);
  }

  // Rec #6 — front-door hub. Renders when no ?community= is set: prominent
  // "Watch Live Draft" CTA, secondary "Browse Pool" CTA, then a 2-col grid
  // of 8 community tiles (logo + name) linking to per-community pages.
  function renderHub() {
    if (!$hub) return;
    const tiles = state.communities.map(c => {
      const fallback = (c.name || '?').charAt(0).toUpperCase();
      const logo = c.logoPath
        ? `<img src="${escapeHtml(c.logoPath)}" alt="" data-fallback="${escapeHtml(fallback)}">`
        : `<span style="font-family:'SuperBlue',serif;font-weight:700;font-size:20px;color:var(--dark-text-muted)">${escapeHtml(fallback)}</span>`;
      return `
        <a class="hub__tile" href="${communityUrl(c.id)}">
          <div class="hub__tile-logo">${logo}</div>
          <div class="hub__tile-name">${escapeHtml(c.name || c.id)}</div>
        </a>`;
    }).join('');

    $hub.innerHTML = `
      <a class="hub__watch" href="${projectorFile()}">
        <div class="hub__watch-icon">▶</div>
        <div class="hub__watch-text">
          <div class="hub__watch-title">Watch Live Draft</div>
          <div class="hub__watch-sub">See picks happen in real time</div>
        </div>
      </a>
      <a class="hub__pool" href="${poolFile()}">
        <div class="hub__pool-icon">⌕</div>
        <div class="hub__pool-text">
          <div class="hub__pool-title">Browse Player Pool</div>
          <div class="hub__pool-sub">All players available in the draft</div>
        </div>
      </a>
      <div class="hub__divider">
        <span class="hub__divider-label">Captains — tap your team</span>
      </div>
      <div class="hub__teams">${tiles}</div>`;
    attachImgFallbacks($hub);
  }

  function pillHTML(currentView) {
    return `<div class="team__pill" role="tablist" aria-label="Switch view">
      <button class="team__pill-tab" role="tab" data-view-target="pool" aria-selected="${currentView === 'pool'}">POOL</button>
      <button class="team__pill-tab" role="tab" data-view-target="team" aria-selected="${currentView === 'team'}">TEAM</button>
    </div>`;
  }

  function renderTeamHeader() {
    const c = getCommunity();
    if (!c) {
      $teamHeader.innerHTML = '';
      return;
    }
    const pickNum = state.draft && state.draft.current_pick_number ? state.draft.current_pick_number : 1;
    const teamColor = c.color || '#ff8a3d';
    const fallback = teamInitials(c.name);
    const logoHTML = c.logoPath
      ? `<img src="${escapeHtml(c.logoPath)}" alt="${escapeHtml(c.name)}" data-fallback="${escapeHtml(fallback)}">`
      : escapeHtml(fallback);
    $teamHeader.style.setProperty('--team-color', teamColor);
    $teamHeader.innerHTML = `
      <div class="team__team-logo" style="--team-color: ${escapeHtml(teamColor)}">${logoHTML}</div>
      <div class="team__team-info">
        <div class="team__team-name">${escapeHtml(c.name.toUpperCase())}</div>
        <div class="team__team-pick">PICK ${pickNum} / 64</div>
      </div>
      ${pillHTML('team')}
    `;
    attachImgFallbacks($teamHeader);
  }

  function rosterCellHTML(player, genderSlot, isCaptain) {
    const cls = ['team__roster-cell'];
    cls.push(genderSlot === 'F' ? 'is-female' : 'is-male');
    if (!player) {
      cls.push('is-empty');
      return `<div class="${cls.join(' ')}"></div>`;
    }
    cls.push(isCaptain ? 'is-captain' : 'is-filled');

    const fallback = initials(player.name);
    const avatarInner = player.avatar
      ? `<img src="${escapeHtml(player.avatar)}" alt="" data-fallback="${escapeHtml(fallback)}">`
      : escapeHtml(fallback);

    const flag = flagEmoji(countryCodeFor(player.nationality));
    const nameHTML = flag
      ? `<span class="team__cell-flag" title="${escapeHtml(player.nationality || '')}">${flag}</span> ${escapeHtml(firstName(player.name))}`
      : escapeHtml(firstName(player.name));

    return `
      <div class="${cls.join(' ')}" data-player-id="${escapeHtml(player.tpsId || '')}">
        <div class="team__cell-avatar">${avatarInner}</div>
        <div class="team__cell-fname">${nameHTML}</div>
        <div class="team__cell-rating">${ratingStr(player.rating)}</div>
        <div class="team__cell-handside">
          <span>${escapeHtml(handLabel(player.hand))}</span>
          <span class="sep">·</span>
          <span>${escapeHtml(sideLabel(player.side))}</span>
        </div>
      </div>
    `;
  }

  function renderRoster() {
    const c = getCommunity();
    if (!c) return;
    const captains = captainsFor(c.id);
    const drafted = draftedFor(c.id);

    // Female slots: female captains + female draftees, oldest first.
    const femaleFilled = [
      ...captains.filter(p => p.gender === 'F'),
      ...drafted.filter(p => p.gender === 'F'),
    ];
    const maleFilled = [
      ...captains.filter(p => p.gender === 'M'),
      ...drafted.filter(p => p.gender === 'M'),
    ];

    function buildSection(filled, count, slot) {
      const cells = [];
      for (let i = 0; i < count; i++) {
        const player = filled[i];
        if (player) {
          cells.push(rosterCellHTML(player, slot, !!player.isCaptain));
        } else {
          cells.push(rosterCellHTML(null, slot, false));
        }
      }
      return cells.join('');
    }

    $rosterFemale.style.setProperty('--team-color', c.color || '#ff8a3d');
    $rosterMale.style.setProperty('--team-color', c.color || '#ff8a3d');
    $rosterFemale.innerHTML = buildSection(femaleFilled, N_FEMALE_SLOTS, 'F');
    $rosterMale.innerHTML   = buildSection(maleFilled,   N_MALE_SLOTS,   'M');
    attachImgFallbacks($rosterFemale);
    attachImgFallbacks($rosterMale);
  }

  function renderPool() {
    const players = visiblePool();
    // Sort chip active states + direction arrow (↓ desc / ↑ asc) on the active one.
    const [sortField, sortDir] = state.sort.split('-');
    $sortGroup.querySelectorAll('.team__chip').forEach(b => {
      const active = b.dataset.sort === sortField;
      b.classList.toggle('is-active-sort', active);
      const arrow = b.querySelector('.team__sort-arrow');
      if (arrow) arrow.textContent = active ? (sortDir === 'desc' ? '↓' : '↑') : '';
    });
    // Filter chip active states
    $filterGroup.querySelectorAll('.team__chip').forEach(b => {
      const f = b.dataset.filter, v = b.dataset.value;
      b.classList.toggle('is-active-filter', state.filters[f] === v);
    });
    // Prefs chip active states (multi-select)
    if ($prefsGroup) {
      $prefsGroup.querySelectorAll('[data-pref-id]').forEach(b => {
        b.classList.toggle('is-active-filter', state.filters.prefs.includes(b.dataset.prefId));
      });
    }

    if (players.length === 0) {
      $poolList.innerHTML = `<div class="team__pool-empty">No available players</div>`;
      return;
    }

    // Mark top 3 (by current sort) with accent border.
    const html = players.map((p, idx) => {
      const isTop = state.sort === 'rating-desc' && idx < 3;
      const rowCls = ['team__player-row'];
      if (isTop) rowCls.push('is-top');

      const photoCls = ['team__player-photo'];
      if (p.gender === 'F') photoCls.push('team__player-photo--female');
      else if (p.gender === 'M') photoCls.push('team__player-photo--male');
      if (!p.avatar) photoCls.push('no-photo');

      const fallback = initials(p.name);
      const photoInner = p.avatar
        ? `<img src="${escapeHtml(p.avatar)}" alt="" data-fallback="${escapeHtml(fallback)}">`
        : escapeHtml(fallback);

      const genderTag =
        p.gender === 'F' ? `<div class="team__row-tag team__row-tag--gender-f">F</div>` :
        p.gender === 'M' ? `<div class="team__row-tag team__row-tag--gender-m">M</div>` :
                           `<div class="team__row-tag">—</div>`;

      const flag = flagEmoji(countryCodeFor(p.nationality));

      return `
        <div class="${rowCls.join(' ')}" role="listitem">
          <div class="${photoCls.join(' ')}">${photoInner}</div>
          <span class="team__row-flag" title="${escapeHtml(p.nationality || '')}">${flag}</span>
          <div class="team__player-name">${escapeHtml(p.name)}</div>
          <span class="team__row-prefs">${prefsHTML(p)}</span>
          ${genderTag}
          <div class="team__player-rating">${ratingStr(p.rating)}</div>
          <div class="team__row-tag">${escapeHtml(handLabel(p.hand))}</div>
          <div class="team__row-tag">${escapeHtml(sideLabel(p.side))}</div>
        </div>
      `;
    }).join('');
    $poolList.innerHTML = html;
    attachImgFallbacks($poolList);
  }

  function renderAll() {
    setView(state.view);
    renderTournamentLogo();
    renderTeamHeader();
    renderRoster();
    renderPool();
  }

  // ============================================================
  // Event wiring
  // ============================================================

  function onPillClick(e) {
    const t = e.target.closest('[data-view-target]');
    if (!t) return;
    navigateToView(t.dataset.viewTarget);
  }

  // Browser back/forward — re-derive the view from the (now-changed) URL.
  function onPopState() {
    const view = new URLSearchParams(window.location.search).has('pool') ? 'pool' : 'team';
    setView(view);
    renderAll();
  }

  function onSortClick(e) {
    const t = e.target.closest('[data-sort]');
    if (!t) return;
    const field = t.dataset.sort;            // 'rating' | 'name'
    const [curField, curDir] = state.sort.split('-');
    if (curField === field) {
      // Re-click the active field → flip direction.
      state.sort = `${field}-${curDir === 'asc' ? 'desc' : 'asc'}`;
    } else {
      // Switch field → start at its natural default (rating high→low, name A→Z).
      state.sort = field === 'rating' ? 'rating-desc' : 'name-asc';
    }
    renderPool();
  }

  function onFilterClick(e) {
    const t = e.target.closest('[data-filter]');
    if (!t) return;
    const f = t.dataset.filter;
    const v = t.dataset.value;
    // Toggle off when already active, else set.
    state.filters[f] = (state.filters[f] === v) ? null : v;
    renderPool();
  }

  function onPrefsClick(e) {
    const t = e.target.closest('[data-pref-id]');
    if (!t) return;
    const id = t.dataset.prefId;
    const arr = state.filters.prefs;
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);   // toggle off
    else arr.push(id);                  // toggle on (multi-select)
    renderPool();
  }

  function onSearchInput(e) {
    state.search = e.target.value;
    renderPool();
  }

  function wireEvents() {
    // Pill toggles live in two places: the static one in Pool view's search row,
    // and the dynamic one rebuilt by renderTeamHeader(). One delegated listener
    // on the app root catches both.
    $app.addEventListener('click', onPillClick);
    $sortGroup.addEventListener('click', onSortClick);
    $filterGroup.addEventListener('click', onFilterClick);
    if ($prefsGroup) $prefsGroup.addEventListener('click', onPrefsClick);
    $search.addEventListener('input', onSearchInput);

    // Online/offline plumbed to the RECONNECTING banner.
    window.addEventListener('offline', () => setReconnecting(true));
    window.addEventListener('online',  () => setReconnecting(false));

    // Browser back/forward between the Pool and Team URLs.
    window.addEventListener('popstate', onPopState);

    // Tear down channels + poll when the page is hidden/unloaded.
    window.addEventListener('pagehide', teardownLive);
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  async function loadSheetData() {
    const [commRows, playerRows, regRows] = await Promise.all([
      fetchTabRows('Communities'),
      fetchTabRows('Teams and Players'),
      fetchTabRows('Registrations'),
    ]);
    state.communities = parseCommunities(commRows);

    // Merge two sources by TPS User ID:
    //  • Teams and Players gives us captains (richer record — has avatar + Is Captain flag)
    //  • Registrations gives us the rest of the pool (rating/hand/side/gender + avatar)
    // Captain rows from Teams and Players win on conflict.
    //
    // The Users tab (system-wide ~2.7MB) used to be fetched as an avatar
    // backfill source. Retired: Registrations natively carries Avatar so the
    // separate fetch + backfill loop became pure overhead.
    const captainAndKnown = parsePlayers(playerRows);
    const registrants = parseRegistrations(regRows);
    const merged = [];
    const seen = new Set();
    for (const p of captainAndKnown) {
      if (p.isPlaceholder) continue;
      if (!p.tpsId || seen.has(p.tpsId)) continue;
      seen.add(p.tpsId);
      merged.push(p);
    }
    for (const p of registrants) {
      if (!p.tpsId || seen.has(p.tpsId)) continue;
      seen.add(p.tpsId);
      merged.push(p);
    }
    state.players = merged;

    state.playersByTpsId = new Map();
    for (const p of state.players) {
      state.playersByTpsId.set(p.tpsId, p);
    }
  }

  async function loadDraftData() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      throw new Error('Supabase config missing — js/draft-config.js not loaded.');
    }
    if (!window.DraftSupabase) {
      throw new Error('DraftSupabase not loaded — js/draft-supabase.js not loaded.');
    }
    window.DraftSupabase.init({
      url: window.SUPABASE_URL,
      key: window.SUPABASE_ANON_KEY,
    });
    const draft = await window.DraftSupabase.fetchDraft(TOURNAMENT_SLUG);
    state.draft = draft;
    if (draft) {
      const picks = await window.DraftSupabase.fetchPicks(draft.id);
      state.picks = picks;
      state.picksHash = picksSignature(picks);
    } else {
      state.picks = [];
      state.picksHash = '';
    }
  }

  /** Re-fetch picks and rerender only when the signature actually changed.
   *  Used by both realtime callbacks and the heartbeat poll. */
  async function refreshPicks() {
    if (!state.draft) return;
    const fresh = await window.DraftSupabase.fetchPicks(state.draft.id);
    const sig = picksSignature(fresh);
    if (sig !== state.picksHash) {
      // Detect new picks for THIS team before we overwrite state.picks.
      // Only fires after the first successful render — the initial boot
      // populates state.picks via bootData() (not refreshPicks), so the
      // first refreshPicks call after boot is the first one where a delta
      // is actually a NEW pick a captain should be notified about.
      const newForMe = state.firstPicksRendered ? detectNewPicksForMe(fresh) : [];

      state.picks = fresh;
      state.picksHash = sig;
      renderRoster();
      renderPool();

      if (newForMe.length) {
        notifyPicks(newForMe);
      }
      state.firstPicksRendered = true;
    }
  }

  /** Returns the player records for picks that are new (vs prior state.picks)
   *  AND belong to this captain's community. Sorted oldest → newest. */
  function detectNewPicksForMe(freshPicks) {
    const myId = (getCommunity() || {}).id;
    if (!myId) return [];
    const oldIds = new Set(state.picks.filter(p => !p.is_undone).map(p => p.id));
    const newPicks = freshPicks
      .filter(p => !p.is_undone && p.team_id === myId && !oldIds.has(p.id))
      .sort((a, b) => a.pick_number - b.pick_number);
    return newPicks.map(pk => {
      const player = state.playersByTpsId.get(pk.player_id);
      return player || { tpsId: pk.player_id, name: `#${pk.player_id}` };
    });
  }

  /** Animate the just-filled cells (staggered for multi-pick) + show toast
   *  for the most recent. Called AFTER renderRoster so cells exist in DOM. */
  function notifyPicks(players) {
    players.forEach((player, idx) => {
      setTimeout(() => {
        const cell = document.querySelector(`.team__roster-cell[data-player-id="${cssEscape(player.tpsId)}"]`);
        if (!cell) return;
        cell.classList.remove('just-picked');
        void cell.offsetWidth;            // force reflow so animation re-runs
        cell.classList.add('just-picked');
        // Strip the class after the animation completes so it can re-fire
        // on a later pick that lands in the same cell after undo+repick.
        setTimeout(() => cell.classList.remove('just-picked'), 2200);
      }, idx * 150);                       // stagger when multiple land at once
    });
    // Toast for the most recent pick only.
    const latest = players[players.length - 1];
    showPickToast(latest);
  }

  /** Minimal CSS.escape polyfill (handles the only chars TPS IDs use). */
  function cssEscape(s) {
    return String(s || '').replace(/(["\\])/g, '\\$1');
  }

  /** Slide-in / hold / slide-out toast at the top of the page. */
  function showPickToast(player) {
    const toast = document.getElementById('pick-toast');
    if (!toast || !player) return;
    const nameEl = document.getElementById('pick-toast-name');
    if (nameEl) nameEl.textContent = firstName(player.name || '');
    toast.classList.remove('show');
    void toast.offsetWidth;                // retrigger animation
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3300);
  }

  function subscribeAll() {
    if (!state.draft) return;
    const draftId = state.draft.id;

    teardown.channels.push(
      window.DraftSupabase.subscribeToPicks(draftId, async () => {
        try { await refreshPicks(); setReconnecting(false); }
        catch (e) { console.warn('Picks refetch failed', e); setReconnecting(true); }
      })
    );

    teardown.channels.push(
      window.DraftSupabase.subscribeToDraft(draftId, (newDraft) => {
        state.draft = newDraft;
        renderTeamHeader();
      })
    );

    // Heartbeat poll: belt-and-suspenders catch for missed realtime events
    // (flaky wifi, dropped websocket). Skipped while page is hidden to save battery.
    teardown.pollHandle = setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      try { await refreshPicks(); setReconnecting(false); }
      catch (_) { setReconnecting(true); }
    }, 20000);
  }

  function teardownLive() {
    if (teardown.pollHandle) {
      clearInterval(teardown.pollHandle);
      teardown.pollHandle = null;
    }
    if (window.DraftSupabase && teardown.channels.length) {
      const client = window.DraftSupabase.client();
      for (const ch of teardown.channels) {
        try { client.removeChannel(ch); } catch (_) { /* best-effort */ }
      }
      teardown.channels = [];
    }
  }

  async function boot() {
    wireEvents();

    // Sheet data is needed for ALL views (hub needs communities; team needs
    // communities+players; neutral pool needs communities+players). Loading
    // it first means we can branch on the result without re-fetching.
    try {
      await loadSheetData();
    } catch (e) {
      console.error(e);
      showError(`Could not load: ${e.message}`);
      return;
    }

    // Production neutral pool URL is /competitions/tps-may2026/pool/ — detect
    // and treat as equivalent to ?pool. The ?pool query is also produced
    // internally when a captain toggles to pool view from their team page.
    const isPoolPath = /\/pool\/?$/i.test(window.location.pathname);
    const hasPool = params.has('pool') || isPoolPath;

    // Rec #6 — Hub view (front door): no community AND not asking for pool.
    if (!COMMUNITY_SLUG && !hasPool) {
      renderHub();
      setView('hub');
      return;
    }

    // Rec #6 — Neutral pool view: ?pool with no community context. Same pool
    // data, no captain-specific PREFERS highlighting. POOL/TEAM pill is
    // suppressed via the .is-no-community class on $app (CSS hides it).
    if (!COMMUNITY_SLUG && hasPool) {
      $app.classList.add('is-no-community');
      renderPrefsFilterRow();
      setView('pool');
      try {
        await loadDraftData();
      } catch (e) {
        console.warn('Draft data unavailable; rendering pre-draft state.', e);
        setReconnecting(true);
      }
      renderPool();
      subscribeAll();
      return;
    }

    // Community param present but unknown → silently fall back to the hub
    // rather than the old red dev-error (consistent with Rec #6's spirit
    // of "no error states for end users — give them a way forward").
    if (!getCommunity()) {
      renderHub();
      setView('hub');
      return;
    }

    // Standard captain flow: community-specific team and pool views.
    setView(state.view);
    renderPrefsFilterRow();
    try {
      await loadDraftData();
    } catch (e) {
      console.warn('Draft data unavailable; rendering pre-draft state.', e);
      setReconnecting(true);
    }
    renderAll();
    subscribeAll();
  }

  // Run after DOM is ready (script is loaded at end of <body>, so DOM exists).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
