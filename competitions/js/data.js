/* ============================================
   Data Layer — CSV fetch, parse, poll (4 tabs)
   ============================================ */

const Data = (() => {
  // Sheet ID resolved from:
  // 1. ?sheet= URL param (direct override)
  // 2. ?t= URL param (slug → lookup from /tournaments.json)
  // 3. Default fallback
  const DEFAULT_SHEET_ID = '1taW8qRBwHLXm1Yvl06uRz1GGlVEfq2HMF-CyjIMmEhs';

  // Priority: window.__SHEET_ID (set by tournament stub) > ?sheet= param > default
  const urlParams = new URLSearchParams(window.location.search);
  let SHEET_ID = window.__SHEET_ID || urlParams.get('sheet') || DEFAULT_SHEET_ID;

  function sheetURL(tabName, extraParams) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}${extraParams || ''}`;
  }

  let config = {};              // key → value from Config tab
  let matches = [];
  let standingsData = {};       // tab name → raw CSV lines
  let standingsRawText = {};    // tab name → raw CSV text (for match-format fallback)
  let playerAvatars = {};       // name → avatar URL lookup
  let playerMetaByCode = {};    // team code → {p1Avatar,p1Country,p2Avatar,p2Country} from Teams and Players
  let teamCodeByName = {};      // normalized team name → team code (from group-stage match rows)
  let playerNationalities = {}; // name|id → nationality lookup (Community Cup)
  let players = [];             // Community Cup: full Teams and Players rows (1 row per player)
  let communities = [];         // Community Cup: list of community objects (8 entries)
  let seriesList = [];          // Community Cup: list of series objects (19 entries)
  let ccStandings = {};         // Community Cup: group letter → [{position,name,won,lost,gamesFor,gamesAgainst}] from the Standings tab
  let lastUpdated = null;
  let pollTimer = null;
  let onUpdate = null;
  let configLoaded = false;

  // --- Config Parser ---
  function parseConfigTab(rows) {
    const cfg = {};
    rows.forEach(row => {
      const key = (row['Key'] || '').trim().replace(/ /g, '_'); // normalize spaces to underscores
      const value = (row['Value'] || '').trim();
      if (key) cfg[key] = value;
    });
    return cfg;
  }

  function getConfig(key, fallback) {
    return config[key] !== undefined ? config[key] : (fallback !== undefined ? fallback : '');
  }

  // Parse comma-separated config value into array
  function getConfigList(key) {
    const val = getConfig(key, '');
    return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
  }

  // Community Cup format detection — gates all CC-specific parsing/fetching
  function isCommunityCupFormat() {
    return (getConfig('tournament_format', '') || '').toLowerCase() === 'community_cup';
  }

  function applyConfig() {
    // Apply CSS custom properties
    const root = document.documentElement;
    if (config.primary_color) root.style.setProperty('--green', config.primary_color);
    if (config.support_color) root.style.setProperty('--green-support', config.support_color);

    // Font-size scale — Config-driven so sizes can be tuned from the Config tab
    // without editing CSS. Each key accepts a bare number (treated as px) or any
    // CSS size, e.g. "24px" or "clamp(15px,2vh,26px)". Empty → the stylesheet's
    // responsive default applies. Consumed by the dashboard's --fs-* variables.
    const fontVars = {
      font_size_title: '--fs-title',   // section / group / court / division / round titles
      font_size_name:  '--fs-name',    // team & player names
      font_size_meta:  '--fs-meta',    // labels, dates/times, scores, column headers
      font_size_small: '--fs-small'    // small print (medal place, on-court badge)
    };
    Object.keys(fontVars).forEach(key => {
      const raw = (config[key] || '').trim();
      if (!raw) return;
      const val = /^[0-9.]+$/.test(raw) ? raw + 'px' : raw;
      root.style.setProperty(fontVars[key], val);
    });

    // Apply header text
    const titleEl = document.querySelector('.header__title h1');
    const subtitleEl = document.querySelector('.header__title p');
    if (titleEl && config.tournament_name) titleEl.textContent = config.tournament_name;
    if (subtitleEl && config.subtitle) subtitleEl.textContent = config.subtitle;

    // Apply document title
    if (config.tournament_name) {
      document.title = config.tournament_name + ' — ' + (config.subtitle || 'Dashboard');
    }

    // Apply logos (skip placeholder example.com URLs)
    function applyLogo(selector, url, alt, maxHeight) {
      const el = document.querySelector(selector);
      if (el && url && !url.includes('example.com')) {
        el.src = url;
        el.alt = alt || '';
        if (maxHeight) el.style.maxHeight = maxHeight + 'px';
      }
    }

    // Header logos
    const leftLogoUrl = config.header_logo_left;
    const rightLogoUrl = config.header_logo_right;
    const leftLogoSize = parseInt(config.header_logo_left_size || '100', 10);
    const rightLogoSize = parseInt(config.header_logo_right_size || '100', 10);
    const headerEl = document.querySelector('.header');
    const headerHeight = headerEl ? headerEl.offsetHeight - 24 : 84; // subtract padding
    const leftEl = document.querySelector('.header__lps-logo');
    const rightEl = document.querySelector('.header__tps-logo');
    if (leftEl && leftLogoUrl && !leftLogoUrl.includes('example.com')) {
      leftEl.src = leftLogoUrl;
      leftEl.alt = config.tournament_name || 'Logo';
      leftEl.style.height = Math.round(headerHeight * leftLogoSize / 100) + 'px';
    }
    if (rightEl && rightLogoUrl && !rightLogoUrl.includes('example.com')) {
      rightEl.src = rightLogoUrl;
      rightEl.alt = 'Logo';
      rightEl.style.height = Math.round(headerHeight * rightLogoSize / 100) + 'px';
    }
    // Footer logo — show if configured, hide if not
    const footerLogoEl = document.querySelector('.footer__tps-logo');
    if (footerLogoEl) {
      if (config.footer_logo && !config.footer_logo.includes('example.com')) {
        footerLogoEl.src = config.footer_logo;
        footerLogoEl.alt = 'Footer Logo';
      } else {
        footerLogoEl.style.display = 'none';
      }
    }

    // Apply favicon
    if (config.favicon && !config.favicon.includes('example.com')) {
      const faviconEl = document.querySelector('link[rel="icon"]');
      if (faviconEl) faviconEl.href = config.favicon;
    }

    // Social / link-preview image (og:image + twitter:image) from config.
    // NOTE: most link-preview crawlers read the STATIC shell og:image and don't
    // run JS, so the per-shell static value stays authoritative for them; this
    // keeps the live document in sync and covers JS-rendering consumers.
    const previewImg = config.preview_logo || config.og_image;
    if (previewImg && !previewImg.includes('example.com')) {
      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
        .forEach(m => m.setAttribute('content', previewImg));
    }

    // Apply footer text
    if (config.footer_text) {
      const footerTextEl = document.querySelector('.footer__powered-text');
      if (footerTextEl) footerTextEl.textContent = config.footer_text;
    }

    // Apply header/footer background colors and text colors
    if (config.header_bg) {
      const header = document.querySelector('.header');
      if (header) header.style.background = config.header_bg;
      // Store header_bg as CSS variable for home page
      root.style.setProperty('--header-bg', config.header_bg);
    }
    if (config.header_text_color) {
      const h1 = document.querySelector('.header__title h1');
      const p = document.querySelector('.header__title p');
      if (h1) h1.style.color = config.header_text_color;
      if (p) p.style.color = config.header_text_color;
      root.style.setProperty('--header-text', config.header_text_color);
    }
    if (config.footer_bg) {
      const footer = document.querySelector('.footer');
      if (footer) footer.style.background = config.footer_bg;
    }
    if (config.footer_text_color) {
      document.querySelectorAll('.footer__powered-text, .footer__timestamp').forEach(el => {
        el.style.color = config.footer_text_color;
      });
    }

    // Footer QR — centered "Scan Here / <QR> / With Your Phone" linking to this
    // dashboard, ON by default for EVERY dashboard (mirrors the Community Cup).
    // Opt out with config footer_qr in {off,false,none}. Reliability: set
    // footer_qr to a static image URL/path; otherwise the QR auto-generates from
    // the page URL. Guard: skip if a shell already provides its own .footer__qr.
    (function injectFooterQR() {
      const footer = document.querySelector('.footer');
      if (!footer || footer.querySelector('.footer__qr')) return;
      const raw = (config.footer_qr || '').trim();
      if (['off', 'false', 'none'].includes(raw.toLowerCase())) return;
      // Canonical dashboard URL — drop rotation #hash / ?query so the QR stays clean.
      const pageUrl = location.origin + location.pathname;
      const link = (config.footer_qr_link || '').trim() || pageUrl;
      const isImg = /^(https?:\/\/|[.\/]|assets\/)/i.test(raw);
      const qrSrc = isImg
        ? raw
        : 'https://api.qrserver.com/v1/create-qr-code/?margin=0&size=240x240&data=' + encodeURIComponent(link);
      const labelColor = config.footer_text_color || '#FFFFFF';
      const top = config.footer_qr_top || 'Scan Here';
      const bottom = config.footer_qr_bottom || 'With Your Phone';
      const a = document.createElement('a');
      a.className = 'footer__qr';
      a.href = link;
      a.title = 'Scan to open this dashboard';
      a.innerHTML =
        '<span class="footer__qr-label" style="color:' + labelColor + '">' + top + '</span>' +
        '<img src="' + qrSrc + '" alt="QR code linking to this dashboard">' +
        '<span class="footer__qr-label" style="color:' + labelColor + '">' + bottom + '</span>';
      footer.appendChild(a);
    })();

    // Apply nav bar colors
    const viewBar = document.querySelector('.view-bar');
    if (viewBar) {
      if (config.nav_bg) viewBar.style.background = config.nav_bg;
      if (config.nav_text_color || config.nav_text_inactive) {
        const style = document.createElement('style');
        let css = '';
        if (config.nav_text_inactive) {
          css += `.view-bar__tab { color: ${config.nav_text_inactive} !important; }`;
        }
        if (config.nav_text_color) {
          css += `.view-bar__tab.active { color: ${config.nav_text_color} !important; }`;
          css += `.view-bar__dot.active { background: ${config.nav_text_color} !important; }`;
        }
        if (config.nav_text_inactive) {
          css += `.view-bar__dot { background: ${config.nav_text_inactive} !important; }`;
        }
        style.textContent = css;
        document.head.appendChild(style);
      }
    }

    // Show/hide page titles based on config (default: show)
    if (config.show_page_titles && config.show_page_titles.toLowerCase() === 'false') {
      document.querySelector('.dashboard').classList.add('hide-page-titles');
    }

    // Upcoming Matches sidebar — shown by default; remove it when
    // show_upcoming = false. The .content-area flex layout reflows
    // .main-content to full width on its own (renderUpcoming is a no-op
    // once .sidebar__content is gone).
    if (config.show_upcoming && config.show_upcoming.toLowerCase() === 'false') {
      document.getElementById('sidebar-upcoming')?.remove();
    }

    // Reveal dashboard now that config is applied
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      // Dark theme: explicit theme=dark in Config OR community_cup tournament format
      const themeKey = (config.theme || '').toLowerCase();
      const isDark = themeKey === 'dark' || isCommunityCupFormat();
      if (isDark) dashboard.classList.add('theme-dark');
      dashboard.classList.add('config-loaded');
    }
  }

  // --- CSV Parser (handles quoted fields) ---
  // Splits CSV text into lines, preserving quotes so splitCSVLine can handle commas in fields
  function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        current += ch; // preserve quotes for splitCSVLine
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === '\n' && !inQuotes) {
        lines.push(current);
        current = '';
      } else if (ch === '\r' && !inQuotes) {
        // skip \r
      } else {
        current += ch;
      }
    }
    if (current.trim()) lines.push(current);
    return lines;
  }

  function splitCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  function parseCSVWithHeaders(text) {
    const lines = parseCSV(text);
    if (lines.length < 2) return [];
    const headers = splitCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = splitCSVLine(lines[i]);
      if (values.length < 1) continue;
      const row = {};
      headers.forEach((h, idx) => {
        const key = h.trim();
        const val = (values[idx] || '').trim();
        // Guard against duplicate header columns (e.g. a trailing blank
        // "Match ID"): don't let a later empty cell clobber an earlier value.
        if (Object.prototype.hasOwnProperty.call(row, key) && row[key] && !val) return;
        row[key] = val;
      });
      rows.push(row);
    }
    return rows;
  }

  // --- Map raw row to Match object ---
  function toMatch(row) {
    const t1 = row['Team 1'] || '';
    const t2 = row['Team 2'] || '';
    const t1Code = row['Team 1 Code'] || '';
    const t2Code = row['Team 2 Code'] || '';

    // Community Cup: derive team names from per-player columns when present
    function pair(p1, p2) {
      const a = (p1 || '').trim();
      const b = (p2 || '').trim();
      if (a && b) return a + ' & ' + b;
      return a || b || '';
    }
    const ccTeam1 = pair(row['Community A - Player 1 Name'], row['Community A - Player 2 Name']);
    const ccTeam2 = pair(row['Community B - Player 1 Name'], row['Community B - Player 2 Name']);

    // Scores: prefer per-set columns (Set 1/2/3 - Team A/B); fall back to the
    // single-score columns (Community A/B - Score) the Community Cup uses.
    const _num = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
    let sets = [
      { a: _num(row['Set 1 - Team A']), b: _num(row['Set 1 - Team B']) },
      { a: _num(row['Set 2 - Team A']), b: _num(row['Set 2 - Team B']) },
      { a: _num(row['Set 3 - Team A']), b: _num(row['Set 3 - Team B']) }
    ];
    if (!sets.some(s => s.a > 0 || s.b > 0) &&
        (String(row['Community A - Score'] || '').trim() !== '' ||
         String(row['Community B - Score'] || '').trim() !== '')) {
      sets = [{ a: _num(row['Community A - Score']), b: _num(row['Community B - Score']) }];
    }

    return {
      division: row['Division'] || '',
      round: row['Round'] || '',
      team1Code: t1Code,
      team1: (t1 && t1 !== 'TBD') ? t1 : (ccTeam1 || t1Code || t1),
      team1Id: row['Team 1 ID'] || '',
      team2Code: t2Code,
      team2: (t2 && t2 !== 'TBD') ? t2 : (ccTeam2 || t2Code || t2),
      team2Id: row['Team 2 ID'] || '',
      // Per-player breakdown for CC rendering (avatars + names)
      team1Players: [
        { name: (row['Community A - Player 1 Name'] || '').trim(), id: row['Community A - Player 1 ID'] || '' },
        { name: (row['Community A - Player 2 Name'] || '').trim(), id: row['Community A - Player 2 ID'] || '' },
      ],
      team2Players: [
        { name: (row['Community B - Player 1 Name'] || '').trim(), id: row['Community B - Player 1 ID'] || '' },
        { name: (row['Community B - Player 2 Name'] || '').trim(), id: row['Community B - Player 2 ID'] || '' },
      ],
      date: row['Date'] || '',
      time: row['Time'] || '',
      club: row['Club'] || '',
      clubId: row['Club ID'] || '',
      court: row['Court'] || '',
      courtId: row['Court ID'] || '',
      status: row['Status'] || '',
      notes: row['Notes'] || '',
      sets: sets,
      matchId: row['Match ID'] || '',
      updatedAt: row['Updated At'] || '',
      // Community Cup additions — empty strings for non-CC tournaments.
      // If `Series ID` column was removed, derive it from `Match ID`
      // (Match ID convention: "<seriesId>-<matchType>" e.g. "R1-A-1-Mix").
      seriesId: (row['Series ID'] || '').trim()
        || deriveSeriesIdFromMatchId(row['Match ID'] || ''),
      communityA: row['Community A'] || '',
      communityB: row['Community B'] || '',
      matchType: row['Match Type'] || '',
      matchSlot: row['Match Slot'] || ''
    };
  }

  // Derive series ID from a match ID by stripping the trailing -Mix/-M/-F
  // and optional slot number. Examples:
  //   "R1-A-1-Mix"  → "R1-A-1"
  //   "SF-1-M1"     → "SF-1"
  //   "SF-1-Mix"    → "SF-1"
  function deriveSeriesIdFromMatchId(matchId) {
    if (!matchId) return '';
    const m = String(matchId).match(/^(.+)-(?:Mix|M|F)\d*$/);
    return m ? m[1] : matchId;
  }

  // --- Winner determination ---
  function getWinner(match) {
    let team1Sets = 0;
    let team2Sets = 0;
    for (const set of match.sets) {
      if (set.a === 0 && set.b === 0) continue;
      if (set.a > set.b) team1Sets++;
      else if (set.b > set.a) team2Sets++;
    }
    if (team1Sets > team2Sets) return 1;
    if (team2Sets > team1Sets) return 2;
    return null;
  }

  // --- Shared utilities ---
  // Shorten date: "Fri 27-Mar-2026" → "Fri 27 Mar"
  function shortDate(d) {
    if (!d) return '';
    return d.replace(/-\d{4}$/, '').replace(/-/g, ' ');
  }

  // Check if a match has any non-zero set scores
  function hasScores(m) {
    return m.sets && m.sets.some(s => s.a > 0 || s.b > 0);
  }

  // ============================================================
  // Group Stage Standings — parsed from dedicated tab
  // The tab has a non-standard layout: division headers as rows,
  // then "Code","Team","MP","W","L"... repeated per group.
  // ============================================================
  function parseStandingsTab(lines) {
    const groups = {};
    let currentGroup = '';
    // True once we've passed the Overall block (i.e. seen a per-group sub-header).
    // The Overall block's data rows carry a numeric first column (Pos) and must be
    // skipped; group rows may ALSO carry a numeric first column (display position),
    // so we tell them apart by this flag, not by "blank first column".
    let pastOverall = false;
    let colMap = null;
    // Prefer a Teams&Players value, treating '', 'null' and '#N/A' as absent.
    const pickStr = (a, b) => {
      const v = (a || '').trim();
      return (v && v !== 'null' && v !== '#N/A') ? v : (b || '');
    };

    for (const line of lines) {
      const fields = splitCSVLine(line);
      const col0 = fields[0] || '';
      const col1 = fields[1] || '';
      const col2 = fields[2] || '';

      // Division/standings header row — contains "STANDINGS" or "ST&INGS" or "GROUP STAGE"
      // May embed first group name (e.g. "...STANDINGS Group A Code" or "...STANDINGS Power Play 1 Code")
      if (col0.includes('STANDINGS') || col0.includes('ST&INGS') || col0.includes('GROUP STAGE')) {
        // Try to extract group name: "Group A", "Group B", "Power Play 1", "Club Play 2", etc.
        const groupMatch = col0.match(/(Group [A-Z]\b|Power Play \d+|Club Play \d+)/i);
        if (groupMatch) {
          currentGroup = groupMatch[1];
        }
        // This row also contains column headers (e.g. col0="...Code", col1="Team", col2="TM", col3="MP"...)
        // Build colMap from it, treating col0 as "Code"
        colMap = { 'Code': 0 };
        fields.forEach((f, idx) => { if (idx > 0) colMap[f.trim()] = idx; });
        continue;
      }

      // Group header row (e.g. "Group B", "Power Play 2", "Club Play 3")
      if (/^(Group [A-Z0-9]+|Power Play \d+|Club Play \d+)$/i.test(col0.trim()) && col1 === '') {
        currentGroup = col0.trim();
        // Don't reset colMap — column order stays the same across all groups
        continue;
      }

      // Column header row — detect by the presence of both a 'Code' and a 'Team'
      // header cell. 'Code' may sit in col0 (legacy) or be shifted right by a
      // leading Pos/'-' column that aligns the group blocks with the Overall block
      // (NOX). gviz blanks text that lands in a numeric column, so the per-group
      // *repeat* of the header arrives as just Code/Team — recognise it as a header
      // (skip it) but only (re)build the column map from a COMPLETE header that
      // still carries the stat columns (has 'MP'), so we don't clobber the map.
      if (fields.some(f => (f || '').trim() === 'Code') && fields.some(f => (f || '').trim() === 'Team')) {
        if (fields.some(f => (f || '').trim() === 'MP')) {
          colMap = {};
          fields.forEach((f, idx) => { const k = (f || '').trim(); if (k) colMap[k] = idx; });
        }
        // A per-group sub-header (Code/Team repeat) marks the end of the Overall
        // block — the group blocks follow it.
        pastOverall = true;
        continue;
      }

      // Data row — resolve the group. An explicit "Group X" label (currentGroup)
      // wins; but gviz drops those label-only rows from this multi-block layout,
      // so when none is active we derive the group from a 2-letter+digits team
      // code (GA1 -> Group A). Rows carrying a numeric first column are the
      // Overall ranking block (Pos 1..12) and are skipped — the per-group blocks
      // (blank first column) are the authoritative source.
      let rowGroup = currentGroup;
      if (!rowGroup) {
        const probeCol = colMap && colMap['Code'] !== undefined ? colMap['Code'] : 0;
        const probeCode = (fields[probeCol] || '').trim();
        const firstCol = (fields[0] || '').trim();
        if ((firstCol === '' || pastOverall) && /^[A-Za-z]{2}\d+$/.test(probeCode)) {
          rowGroup = 'Group ' + probeCode.charAt(1).toUpperCase();
        }
      }
      if (col1 && rowGroup) {
        const c = (name) => colMap && colMap[name] !== undefined ? parseInt(fields[colMap[name]]) || 0 : 0;
        const s = (name) => colMap && colMap[name] !== undefined ? (fields[colMap[name]] || '').trim() : '';
        // Code/Team default to col0/col1 but follow the column map when a leading
        // column has shifted them right.
        const codeCol = colMap && colMap['Code'] !== undefined ? colMap['Code'] : 0;
        const teamCol = colMap && colMap['Team'] !== undefined ? colMap['Team'] : 1;
        const code = (fields[codeCol] || '').trim();
        const name = (fields[teamCol] || '').trim();
        // Skip blank spacer rows (a group line with no team code).
        if (!code) continue;
        // Avatar/country joined from Teams and Players by Team Code.
        const meta = playerMetaByCode[code] || {};
        const mp = colMap ? c('MP') : (parseInt(col2) || 0);
        const w = colMap ? c('W') : (parseInt(fields[3]) || 0);
        const l = colMap ? c('L') : (parseInt(fields[4]) || 0);
        const setsW = colMap ? c('Sets W') : (parseInt(fields[5]) || 0);
        const setsL = colMap ? c('Sets L') : (parseInt(fields[6]) || 0);
        const setsDiff = colMap ? c('Sets Difference') : (parseInt(fields[7]) || 0);
        const gamesW = colMap ? c('Games W') : (parseInt(fields[8]) || 0);
        const gamesL = colMap ? c('Games L') : (parseInt(fields[9]) || 0);
        const gamesDiff = colMap ? c('Games Difference') : (parseInt(fields[10]) || 0);

        if (!groups[rowGroup]) groups[rowGroup] = [];
        groups[rowGroup].push({
          code: code,
          name: name,
          played: mp,
          won: w,
          lost: l,
          setsWon: setsW,
          setsLost: setsL,
          setsDiff: setsDiff,
          gamesWon: gamesW,
          gamesLost: gamesL,
          gamesDiff: gamesDiff,
          points: w,
          // Per-player avatar + country. Preferred source is the "Teams and Players"
          // tab (joined by Team Code via playerMetaByCode); falls back to the legacy
          // in-sheet Standings columns when no Teams&Players entry exists (RPA/LPS).
          // '', 'null' and '#N/A' count as absent so the better source wins.
          p1Avatar: pickStr(meta.p1Avatar, s('P1 Avatar')),
          p1Country: pickStr(meta.p1Country, s('P1 Country')),
          p2Avatar: pickStr(meta.p2Avatar, s('P2 Avatar')),
          p2Country: pickStr(meta.p2Country, s('P2 Country'))
        });
      }
    }

    return groups;
  }

  // ============================================================
  // Community Cup — parse the dedicated "Standings" tab (authoritative,
  // live-formula records). Data rows are: Position, Community, W, L, GF, GA, Diff.
  // gviz flattens the merged title/section cells (and drops the "GROUP B"
  // label), so we DON'T rely on group-header text — instead each row is
  // assigned to a group via the community's group from the Communities tab.
  // Returns { 'A': [{position,name,won,lost,gamesFor,gamesAgainst}], 'B': [...] }
  // ============================================================
  function parseCCStandingsTab(lines) {
    const byName = {};
    communities.forEach(c => { byName[(c.name || '').trim().toLowerCase()] = c; });
    const groups = {};
    for (const line of lines) {
      const f = splitCSVLine(line);
      const c0 = (f[0] || '').trim();
      if (!/^\d+$/.test(c0)) continue;            // data rows have a numeric Position
      const name = (f[1] || '').trim();
      if (!name) continue;
      const c = byName[name.toLowerCase()];
      const grp = c ? (c.group || '').trim().toUpperCase() : '';
      if (!grp) continue;                          // unknown community → skip
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push({
        position: parseInt(c0) || 0,
        name,
        won: parseInt(f[2]) || 0,
        lost: parseInt(f[3]) || 0,
        gamesFor: parseInt(f[4]) || 0,
        gamesAgainst: parseInt(f[5]) || 0,
      });
    }
    return groups;
  }

  // ============================================================
  // Compute standings from match-format data (when standings tab
  // has match rows instead of pre-computed standings)
  // Groups are derived from team codes: 2nd char = group letter
  // e.g. MA1 → Group A, MB2 → Group B, PA1 → Group A
  // ============================================================
  function computeStandingsFromMatchData(rawText) {
    if (!rawText) return {};
    // Parse as match rows with headers
    const rows = parseCSVWithHeaders(rawText);
    if (rows.length === 0) return {};

    // Check if this looks like match data (has "Round" and "Team 1" columns)
    if (!rows[0].hasOwnProperty('Round') && !rows[0].hasOwnProperty('Team 1')) return {};

    const teams = {}; // teamName → { code, group, played, won, lost, gamesWon, gamesLost }

    rows.forEach(row => {
      const round = (row['Round'] || '').trim();
      if (!round.toLowerCase().includes('group')) return; // only group stage matches

      const t1Code = (row['Team 1 Code'] || '').trim();
      const t2Code = (row['Team 2 Code'] || '').trim();
      const t1Name = (row['Team 1'] || '').trim();
      const t2Name = (row['Team 2'] || '').trim();

      // Derive group from team code (2nd character)
      const groupChar = t1Code.length >= 2 ? t1Code[1].toUpperCase() : '?';
      const groupName = 'Group ' + groupChar;

      // Parse set scores
      const s1a = parseInt(row['Set 1 - Team A']) || 0;
      const s1b = parseInt(row['Set 1 - Team B']) || 0;
      const s2a = parseInt(row['Set 2 - Team A']) || 0;
      const s2b = parseInt(row['Set 2 - Team B']) || 0;
      const s3a = parseInt(row['Set 3 - Team A']) || 0;
      const s3b = parseInt(row['Set 3 - Team B']) || 0;

      // Check if match has been played (any scores > 0)
      const hasScores = (s1a + s1b + s2a + s2b + s3a + s3b) > 0;
      if (!hasScores) return;

      // Count sets won
      let t1Sets = 0, t2Sets = 0;
      if (s1a > 0 || s1b > 0) { if (s1a > s1b) t1Sets++; else if (s1b > s1a) t2Sets++; }
      if (s2a > 0 || s2b > 0) { if (s2a > s2b) t1Sets++; else if (s2b > s2a) t2Sets++; }
      if (s3a > 0 || s3b > 0) { if (s3a > s3b) t1Sets++; else if (s3b > s3a) t2Sets++; }

      // Total games won
      const t1Games = s1a + s2a + s3a;
      const t2Games = s1b + s2b + s3b;

      // Determine match winner
      const t1Won = t1Sets > t2Sets;

      // Initialize teams
      if (!teams[t1Name]) teams[t1Name] = { code: t1Code, group: groupName, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };
      if (!teams[t2Name]) teams[t2Name] = { code: t2Code, group: groupName, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };

      // Update stats
      teams[t1Name].played++;
      teams[t2Name].played++;
      teams[t1Name].setsWon += t1Sets;
      teams[t1Name].setsLost += t2Sets;
      teams[t2Name].setsWon += t2Sets;
      teams[t2Name].setsLost += t1Sets;
      teams[t1Name].gamesWon += t1Games;
      teams[t1Name].gamesLost += t2Games;
      teams[t2Name].gamesWon += t2Games;
      teams[t2Name].gamesLost += t1Games;

      if (t1Won) {
        teams[t1Name].won++;
        teams[t2Name].lost++;
      } else {
        teams[t2Name].won++;
        teams[t1Name].lost++;
      }
    });

    // Group teams
    const groups = {};
    Object.entries(teams).forEach(([name, t]) => {
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group].push({
        code: t.code,
        name: name,
        played: t.played,
        won: t.won,
        lost: t.lost,
        setsWon: t.setsWon,
        setsLost: t.setsLost,
        setsDiff: t.setsWon - t.setsLost,
        gamesWon: t.gamesWon,
        gamesLost: t.gamesLost,
        gamesDiff: t.gamesWon - t.gamesLost,
        points: t.won
      });
    });

    return groups;
  }

  // ============================================================
  // Knockout Stage — built entirely from the Matches tab
  // Filters matches by division, groups by round, derives winners
  // and final standings from set scores.
  // ============================================================
  function getKnockoutFromMatches(divisionPrefix) {
    // divisionPrefix: 'Power', 'Club', 'Male Amateur', 'Male Advanced', etc.
    const prefix = divisionPrefix.toLowerCase();

    // Knockout main bracket: match division that starts with the prefix
    // Handles both "Power Play" (division="Power Play", prefix="Power")
    // and "Male Amateur" (division="Male Amateur", prefix="Male Amateur")
    const knockoutRounds = ['Quarters', 'Semis', 'Semi Finals', 'Finals', '3rd Place'];
    const mainMatches = matches.filter(m => {
      const div = m.division.toLowerCase();
      if (div !== prefix && !div.startsWith(prefix + ' play')) return false;
      // Match rounds like "Quarters", "Quarters #1", "Semis #2", "Finals"
      return knockoutRounds.some(r => m.round === r || m.round.startsWith(r + ' '));
    });

    // Tier matches: division starts with prefix + " Tier"
    const tierPrefix = divisionPrefix + ' Tier';
    const tierMatches = matches.filter(m =>
      m.division.startsWith(tierPrefix) && m.round.startsWith('Tier')
    );

    // Build match objects for the bracket
    const allBracketMatches = [];

    mainMatches.forEach(m => {
      const winner = getWinner(m);
      const played = hasScores(m);
      // Normalize round: "Quarters #1" → "Quarters", "Semis #2" → "Semi Finals"
      let round = m.round.replace(/\s*#\d+$/, '');
      if (round === 'Semis') round = 'Semi Finals';
      // Fall back to team code if team name is empty or "TBD"
      const team1 = (m.team1 && m.team1 !== 'TBD') ? m.team1 : m.team1Code || 'TBD';
      const team2 = (m.team2 && m.team2 !== 'TBD') ? m.team2 : m.team2Code || 'TBD';
      allBracketMatches.push({
        round: round,
        team1: team1,
        team2: team2,
        team1Code: m.team1Code || '',
        team2Code: m.team2Code || '',
        sets: m.sets,
        score1: played ? m.sets.reduce((sum, s) => sum + s.a, 0) : null,
        score2: played ? m.sets.reduce((sum, s) => sum + s.b, 0) : null,
        score: '',
        winner: played ? (winner === 1 ? team1 : winner === 2 ? team2 : '') : '',
        section: 'PLAYOFFS',
        division: divisionPrefix,
        date: m.date,
        time: m.time
      });
    });

    tierMatches.forEach(m => {
      const winner = getWinner(m);
      const played = hasScores(m);
      const team1 = (m.team1 && m.team1 !== 'TBD') ? m.team1 : m.team1Code || 'TBD';
      const team2 = (m.team2 && m.team2 !== 'TBD') ? m.team2 : m.team2Code || 'TBD';
      allBracketMatches.push({
        round: m.round,
        team1, team2,
        team1Code: m.team1Code || '',
        team2Code: m.team2Code || '',
        sets: m.sets,
        score1: played ? m.sets.reduce((sum, s) => sum + s.a, 0) : null,
        score2: played ? m.sets.reduce((sum, s) => sum + s.b, 0) : null,
        score: '',
        winner: played ? (winner === 1 ? team1 : winner === 2 ? team2 : '') : '',
        section: m.division,
        division: divisionPrefix,
        date: m.date, time: m.time
      });
    });

    // Derive final standings from Finals and 3rd Place results
    const standings = [];
    const finalsMatch = allBracketMatches.find(m => m.round === 'Finals');
    const thirdMatch = allBracketMatches.find(m => m.round === '3rd Place');

    if (finalsMatch) {
      if (finalsMatch.winner) {
        // Finals played — show actual results
        const finalsWinner = finalsMatch.winner;
        const finalsLoser = finalsWinner === finalsMatch.team1 ? finalsMatch.team2 : finalsMatch.team1;
        standings.push({ place: '🥇 1st', team: finalsWinner, note: divisionPrefix + ' Champion' });
        standings.push({ place: '🥈 2nd', team: finalsLoser, note: '' });
        if (thirdMatch && thirdMatch.winner) {
          standings.push({ place: '🥉 3rd', team: thirdMatch.winner, note: '' });
        } else if (thirdMatch) {
          standings.push({ place: '🥉 3rd', team: 'TBD', note: '' });
        }
      } else {
        // Finals not played — show placeholders
        standings.push({ place: '🥇 1st', team: 'TBD', note: '' });
        standings.push({ place: '🥈 2nd', team: 'TBD', note: '' });
        if (thirdMatch && thirdMatch.winner) {
          standings.push({ place: '🥉 3rd', team: thirdMatch.winner, note: '' });
        } else if (thirdMatch) {
          standings.push({ place: '🥉 3rd', team: 'TBD', note: '' });
        }
      }
    }

    // Provisional seeding flag: the quarterfinal slots may be filled from LIVE
    // group standings (sheet formulas) before the group stage is finished. We
    // surface this so the bracket can warn that QF seeds are not yet final.
    // True when: the division's group stage is NOT complete AND the QF round
    // already shows real teams (a "A & B" name rather than a Seed/Winner/TBD
    // placeholder). Self-clears once every group match has a score.
    const groupMatches = matches.filter(m => {
      const div = (m.division || '').toLowerCase();
      return (div === prefix || div.startsWith(prefix + ' play')) && /group/i.test(m.round || '');
    });
    const groupComplete = groupMatches.length > 0 && groupMatches.every(m => hasScores(m));
    const qfHasRealTeams = allBracketMatches.some(m =>
      m.round === 'Quarters' && (/ & | and /.test(m.team1 || '') || / & | and /.test(m.team2 || '')));
    const provisional = !groupComplete && qfHasRealTeams;

    return { matches: allBracketMatches, standings: standings, provisional: provisional, groupComplete: groupComplete };
  }

  // ============================================================
  // Consolation bracket from the Matches tab. Gated by config
  // `show_consolation`; division-mode only. Consolation matches have
  // Division = the category (e.g. "Gold") and Round containing
  // "Consolation" (e.g. "Consolation SF", "Consolation Final").
  // Round is normalized to 'Semi Finals' vs 'Finals' for column layout.
  // ============================================================
  function getConsolationFromMatches(divisionPrefix) {
    const prefix = (divisionPrefix || '').toLowerCase();
    const consMatches = matches.filter(m => {
      const div = (m.division || '').toLowerCase();
      if (div !== prefix && !div.startsWith(prefix + ' play')) return false;
      return (m.round || '').toLowerCase().includes('consolation');
    });

    const out = [];
    consMatches.forEach(m => {
      const winner = getWinner(m);
      const played = hasScores(m);
      const roundLower = (m.round || '').toLowerCase();
      const round = roundLower.includes('final') ? 'Finals' : 'Semi Finals';
      const team1 = (m.team1 && m.team1 !== 'TBD') ? m.team1 : m.team1Code || 'TBD';
      const team2 = (m.team2 && m.team2 !== 'TBD') ? m.team2 : m.team2Code || 'TBD';
      out.push({
        round,
        team1, team2,
        team1Code: m.team1Code || '',
        team2Code: m.team2Code || '',
        sets: m.sets,
        score1: played ? m.sets.reduce((sum, s) => sum + s.a, 0) : null,
        score2: played ? m.sets.reduce((sum, s) => sum + s.b, 0) : null,
        score: '',
        winner: played ? (winner === 1 ? team1 : winner === 2 ? team2 : '') : '',
        section: 'CONSOLATION',
        division: divisionPrefix,
        date: m.date, time: m.time
      });
    });

    // Consolation final standings (mirrors the knockout's): winner of the
    // consolation Final = 1st, loser = 2nd. Placeholders before it's played.
    const standings = [];
    const finalMatch = out.find(m => m.round === 'Finals');
    if (finalMatch) {
      if (finalMatch.winner) {
        const w = finalMatch.winner;
        const l = w === finalMatch.team1 ? finalMatch.team2 : finalMatch.team1;
        standings.push({ place: '🥇 1st', team: w, note: divisionPrefix + ' Consolation Winner' });
        standings.push({ place: '🥈 2nd', team: l, note: '' });
      } else {
        standings.push({ place: '🥇 1st', team: 'TBD', note: '' });
        standings.push({ place: '🥈 2nd', team: 'TBD', note: '' });
      }
    }

    return { matches: out, standings: standings };
  }

  // ============================================================
  // Community Cup — Communities tab parser
  // Each row = one community (8 expected)
  // Required columns: Community ID, Name. Others optional.
  // ============================================================
  function parseCommunitiesTab(rows) {
    return rows
      .filter(row => (row['Community ID'] || '').trim())
      .map(row => ({
        id: (row['Community ID'] || '').trim(),
        name: (row['Name'] || '').trim(),
        group: (row['Group'] || '').trim(),
        color: '#FFB703',  // brand gold — was row['Color']; Sheet column ignored by design
        // ?v=2 cache-busts the GitHub Pages CDN after the logo artwork refresh.
        logoPath: (row['Logo Path'] || '').trim().replace(/^(.+)$/, '$1?v=4'),
        seed: parseInt(row['Seed'], 10) || null,
        captainM: {
          name: (row['Captain M Name'] || '').trim(),
          tpsId: (row['Captain M ID'] || '').trim(),
          nationality: (row['Captain M Nationality'] || '').trim()
        },
        captainF: {
          name: (row['Captain F Name'] || '').trim(),
          tpsId: (row['Captain F ID'] || '').trim(),
          nationality: (row['Captain F Nationality'] || '').trim()
        }
      }));
  }

  // ============================================================
  // Community Cup — Series tab parser
  // Each row = one series (19 expected: 12 R1 + 4 SF + 3 finals)
  // Community A/B may hold angle-bracket placeholders like <A1>, <SF-1-W>
  // until resolved by organizer post-R1.
  // ============================================================
  function parseSeriesTab(rows) {
    return rows
      .filter(row => (row['Series ID'] || '').trim())
      .map(row => ({
        id: (row['Series ID'] || '').trim(),
        round: (row['Round'] || '').trim(),
        group: (row['Group'] || '').trim(),
        stage: (row['Stage'] || '').trim(),
        communityA: (row['Community A'] || '').trim(),
        communityB: (row['Community B'] || '').trim(),
        startTime: (row['Start Time'] || '').trim(),
        result: (row['Result'] || '').trim(),
        winner: (row['Winner'] || '').trim(),
        notes: (row['Notes'] || '').trim()
      }));
  }

  // ============================================================
  // Community Cup — derived helpers
  // ============================================================
  function getCommunityById(id) {
    if (!id) return null;
    return communities.find(c => c.id === id) || null;
  }

  function getSeriesById(seriesId) {
    if (!seriesId) return null;
    return seriesList.find(s => s.id === seriesId) || null;
  }

  function getMatchesBySeriesId(seriesId) {
    if (!seriesId) return [];
    return matches.filter(m => m.seriesId === seriesId);
  }

  // Compute series result from constituent match outcomes.
  // Returns { aWins, bWins, label: "2-1", winnerCommunityId, complete }
  // A series is complete when more than half the matches have results — but
  // we report based on what's played so far. Complete is true when remaining
  // matches cannot change the outcome.
  function computeSeriesResult(seriesId) {
    const series = getSeriesById(seriesId);
    const seriesMatches = getMatchesBySeriesId(seriesId);
    if (!series || seriesMatches.length === 0) {
      return { aWins: 0, bWins: 0, label: '0-0', winnerCommunityId: '', complete: false };
    }

    let aWins = 0;
    let bWins = 0;
    seriesMatches.forEach(m => {
      if (!hasScores(m)) return;
      const winner = getWinner(m);  // 1 = team1, 2 = team2, null = tie/unfinished
      if (winner === 1) aWins++;
      else if (winner === 2) bWins++;
    });

    const totalMatches = seriesMatches.length;
    const decided = aWins + bWins;
    const remaining = totalMatches - decided;
    const majority = Math.floor(totalMatches / 2) + 1;
    const complete = aWins >= majority || bWins >= majority || decided === totalMatches;

    let winnerCommunityId = '';
    if (complete) {
      winnerCommunityId = aWins > bWins ? series.communityA : (bWins > aWins ? series.communityB : '');
    }

    return {
      aWins, bWins,
      label: `${aWins}-${bWins}`,
      winnerCommunityId,
      complete,
      remaining
    };
  }

  // Resolve a bracket result-pointer token (e.g. "<SF-1-W>", "<CSF-2-L>") to a
  // real community id once the referenced series has clinched (majority of
  // matches won). Returns null if it isn't such a token, the series is unknown,
  // or the series hasn't been decided yet — so callers keep their TBD/label
  // fallback until then. This is what auto-advances a winner into the next round
  // without anyone editing the sheet.
  function resolveSlotCommunityId(token) {
    if (!token || typeof token !== 'string') return null;
    const m = token.match(/^<((?:C?SF)-\d+)-([WL])>$/);
    if (!m) return null;
    const seriesId = m[1], which = m[2];
    const series = getSeriesById(seriesId);
    if (!series) return null;
    const result = computeSeriesResult(seriesId);
    if (!result.complete || !result.winnerCommunityId) return null;
    const loserId = result.winnerCommunityId === series.communityA
      ? series.communityB : series.communityA;
    return which === 'W' ? result.winnerCommunityId : loserId;
  }

  // ============================================================
  // Player Avatars — parsed from "Teams and Players" tab
  // Dynamically finds avatar and name columns by header name
  // ============================================================
  function parsePlayersTab(rows) {
    const avatars = {};
    if (rows.length === 0) return avatars;

    // Find column headers containing "Avatar" and their associated name columns
    const headers = Object.keys(rows[0]);
    const avatarCols = headers.filter(h => h.toLowerCase().includes('avatar'));

    // For each avatar column, find the best name column:
    // Try "P1 Name"/"P2 Name" first, then look for name column just before the avatar column
    const p1AvatarCol = avatarCols.find(h => h.toLowerCase().includes('p1')) || avatarCols[0];
    const p2AvatarCol = avatarCols.find(h => h.toLowerCase().includes('p2')) || avatarCols[1];

    // Find name columns — try standard names first, then fall back to positional
    function findNameCol(avatarCol, candidates) {
      for (const c of candidates) {
        if (headers.includes(c)) return c;
      }
      // Fall back: look for a name-like column near the avatar column
      const avatarIdx = headers.indexOf(avatarCol);
      if (avatarIdx > 0) {
        // Walk backwards to find a column with "name" in its header
        for (let i = avatarIdx - 1; i >= 0; i--) {
          const h = headers[i].toLowerCase();
          if (h.includes('name') && !h.includes('last') && !h.includes('team')) return headers[i];
        }
      }
      return null;
    }

    const p1NameCol = findNameCol(p1AvatarCol, ['P1 Name', 'First Name']);
    const p2NameCol = findNameCol(p2AvatarCol, ['P2 Name', 'Partner Name:', 'Partner Name']);

    rows.forEach(row => {
      if (p1NameCol && p1AvatarCol) {
        const name = (row[p1NameCol] || '').trim().replace(/^\u2060+/, '');
        const avatar = (row[p1AvatarCol] || '').trim();
        if (name && avatar && avatar !== 'null' && avatar !== '#N/A') {
          avatars[name] = avatar;
        }
      }
      if (p2NameCol && p2AvatarCol) {
        const name = (row[p2NameCol] || '').trim().replace(/^\u2060+/, '');
        const avatar = (row[p2AvatarCol] || '').trim();
        if (name && avatar && avatar !== 'null' && avatar !== '#N/A') {
          avatars[name] = avatar;
        }
      }
    });
    return avatars;
  }

  function getPlayerAvatar(playerName) {
    if (!playerName) return null;
    const clean = playerName.trim().replace(/^\u2060+/, '');
    // Placeholder names must never resolve to a real player's avatar. "TBD" is
    // reused across unfilled slots, so a single name\u2192avatar entry for it would
    // otherwise paint every TBD with one stranger's face.
    if (!clean || clean.toUpperCase() === 'TBD') return null;
    return playerAvatars[clean] || null;
  }

  // ============================================================
  // Per-team avatar + country \u2014 parsed POSITIONALLY from the
  // "Teams and Players" tab (cols G/H = P1 Avatar/Country, K/L = P2).
  // That tab repeats the headers ID/Avatar/Country once per player, so
  // header-keyed parsing collapses them \u2014 we must index by column position.
  // Layout is located by header name: the "Team Code" column is the join key,
  // and the 1st/2nd "Avatar" and "Country" columns map to player 1 / player 2.
  // Keyed by Team Code (GA1\u2026SC4) so it joins onto standings rows by `code`.
  // Returns {} (no-op) for tournaments whose tab lacks these columns.
  // ============================================================
  function parsePlayersMeta(text) {
    const byCode = {};
    const lines = parseCSV(text);
    if (lines.length < 2) return byCode;
    const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const codeIdx = headers.indexOf('team code');
    const avatarIdx = headers.reduce((a, h, i) => { if (h === 'avatar') a.push(i); return a; }, []);
    const countryIdx = headers.reduce((a, h, i) => { if (h === 'country') a.push(i); return a; }, []);
    if (codeIdx < 0 || avatarIdx.length === 0) return byCode;
    const at = (f, idx) => (idx != null && idx >= 0 ? (f[idx] || '').trim() : '');
    for (let i = 1; i < lines.length; i++) {
      const f = splitCSVLine(lines[i]);
      const code = (f[codeIdx] || '').trim();
      if (!code) continue;
      byCode[code] = {
        p1Avatar: at(f, avatarIdx[0]),
        p1Country: at(f, countryIdx[0]),
        p2Avatar: at(f, avatarIdx[1]),
        p2Country: at(f, countryIdx[1])
      };
    }
    return byCode;
  }

  // name \u2192 nationality and id \u2192 nationality, from "Teams and Players" rows.
  // Mirrors getPlayerAvatar so match cards can show the same flags as Groups.
  function buildPlayerNationalities(rows) {
    const map = {};
    (rows || []).forEach(r => {
      const nat = (r['Nationality'] || '').trim();
      if (!nat) return;
      const name = (r['Player Name'] || '').trim().replace(/^\u2060+/, '');
      const id = (r['TPS User ID'] || '').trim();
      if (name) map['name:' + name.toLowerCase()] = nat;
      if (id) map['id:' + id] = nat;
    });
    return map;
  }

  // Look up a player's nationality by name, falling back to TPS User ID.
  function getPlayerNationality(name, id) {
    const clean = (name || '').trim().replace(/^\u2060+/, '').toLowerCase();
    if (clean && playerNationalities['name:' + clean]) return playerNationalities['name:' + clean];
    const cid = (id || '').trim();
    if (cid && playerNationalities['id:' + cid]) return playerNationalities['id:' + cid];
    return '';
  }

  // Generate avatar HTML for a team (2 players split on " and ")
  function getTeamAvatarsHTML(teamName, size) {
    if (!teamName || teamName === 'TBD') return '';
    const sz = size || 28;
    const cleanName = teamName.replace(/\u2060/g, '');
    const players = cleanName.split(/ & | and /);
    return players.map(name => {
      const trimmed = name.trim();
      const url = getPlayerAvatar(trimmed);
      const initial = trimmed.charAt(0).toUpperCase();
      if (url) {
        return `<img class="avatar" src="${url}" alt="${trimmed}" width="${sz}" height="${sz}" onerror="var s=document.createElement('span');s.className='avatar avatar--fallback';s.style.width='${sz}px';s.style.height='${sz}px';s.style.fontSize='${Math.round(sz*0.45)}px';s.textContent='${initial}';this.parentNode.replaceChild(s,this)">`;
      }
      return `<span class="avatar avatar--fallback" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.45)}px">${initial}</span>`;
    }).join('');
  }

  // Country name → ISO 3166-1 alpha-2 (subset; falls back to a 2-letter input).
  const COUNTRY_CODE = {
    'thailand':'TH','spain':'ES','united kingdom':'GB','uk':'GB','england':'GB','scotland':'GB','wales':'GB',
    'united states':'US','usa':'US','us':'US','america':'US','russia':'RU','germany':'DE','france':'FR','italy':'IT',
    'india':'IN','japan':'JP','china':'CN','south korea':'KR','korea':'KR','argentina':'AR','mexico':'MX','chile':'CL',
    'colombia':'CO','peru':'PE','brazil':'BR','australia':'AU','canada':'CA','new zealand':'NZ','netherlands':'NL',
    'belgium':'BE','switzerland':'CH','austria':'AT','sweden':'SE','norway':'NO','denmark':'DK','finland':'FI',
    'portugal':'PT','poland':'PL','czech republic':'CZ','czechia':'CZ','singapore':'SG','malaysia':'MY','indonesia':'ID',
    'philippines':'PH','vietnam':'VN','hong kong':'HK','taiwan':'TW','south africa':'ZA','ireland':'IE','greece':'GR',
    'israel':'IL','uae':'AE','united arab emirates':'AE','saudi arabia':'SA','ukraine':'UA','romania':'RO','hungary':'HU',
    'serbia':'RS','croatia':'HR','bangladesh':'BD','sri lanka':'LK','luxembourg':'LU','myanmar':'MM','burma':'MM',
    'turkey':'TR','egypt':'EG','morocco':'MA','nigeria':'NG','kenya':'KE','pakistan':'PK','nepal':'NP'
  };
  function countryCodeFor(name) {
    if (!name) return '';
    const k = String(name).trim().toLowerCase();
    return COUNTRY_CODE[k] || (k.length === 2 ? k.toUpperCase() : '');
  }
  // Unicode regional-indicator flag from a country name. No CSS dependency.
  function flagEmoji(country) {
    const cc = countryCodeFor(country);
    if (cc.length !== 2) return '';
    return String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
  }

  // Per-player avatar + country flag for a standings team. Uses per-player
  // avatar/country resolved in-sheet (team.p1Avatar/p1Country/p2Avatar/p2Country).
  // Falls back to the initial when avatar is missing/'null'.
  function getTeamAvatarFlagHTML(team, size) {
    if (!team) return '';
    const sz = size || 26;
    const names = (team.name || '').replace(/⁠/g, '').split(/ & | and /);
    const units = [
      { url: team.p1Avatar, country: team.p1Country, name: (names[0] || '').trim() },
      { url: team.p2Avatar, country: team.p2Country, name: (names[1] || '').trim() }
    ].filter(u => u.name || (u.url && u.url !== 'null' && u.url !== '#N/A'));
    if (units.length === 0) return '';
    return units.map(u => {
      const initial = (u.name || '?').charAt(0).toUpperCase();
      const valid = u.url && u.url !== 'null' && u.url !== '#N/A';
      const avatar = valid
        ? `<img class="avatar" src="${u.url}" alt="${u.name}" width="${sz}" height="${sz}" onerror="var s=document.createElement('span');s.className='avatar avatar--fallback';s.style.width='${sz}px';s.style.height='${sz}px';s.style.fontSize='${Math.round(sz*0.45)}px';s.textContent='${initial}';this.parentNode.replaceChild(s,this)">`
        : `<span class="avatar avatar--fallback" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.45)}px">${initial}</span>`;
      // Rectangular flag-icons SVG badged on the avatar's bottom-left corner
      // (same style as the Community Cup match cards / Groups page). Needs the
      // flag-icons stylesheet loaded by the shell.
      const cc = countryCodeFor(u.country);
      const flagHTML = cc
        ? `<span class="avatar-flag__badge" title="${u.country}"><span class="fi fi-${cc.toLowerCase()}"></span></span>`
        : '';
      return `<span class="avatar-flag">${avatar}${flagHTML}</span>`;
    }).join('');
  }

  // Generate stacked avatar+name HTML (one player per row)
  function getTeamStackedHTML(teamName, size) {
    if (!teamName || teamName === 'TBD') return `<div class="team-stacked team-stacked--placeholder"><span class="team-stacked__name">TBD</span></div>`;
    const sz = size || 22;
    const cleanName = teamName.replace(/\u2060/g, '');
    const players = cleanName.split(/ & | and /);
    // Single name (placeholder code like "1st Male Amateur Group A") — render with consistent height
    if (players.length === 1) {
      const trimmed = players[0].trim();
      const initial = trimmed.charAt(0).toUpperCase();
      return `<div class="team-stacked team-stacked--placeholder"><span class="avatar avatar--fallback" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.45)}px">${initial}</span><span class="team-stacked__name">${trimmed}</span></div>`;
    }
    return `<div class="team-stacked">${players.map(name => {
      const trimmed = name.trim();
      const url = getPlayerAvatar(trimmed);
      const initial = trimmed.charAt(0).toUpperCase();
      const avatarHTML = url
        ? `<img class="avatar" src="${url}" alt="${trimmed}" width="${sz}" height="${sz}" onerror="var s=document.createElement('span');s.className='avatar avatar--fallback';s.style.width='${sz}px';s.style.height='${sz}px';s.style.fontSize='${Math.round(sz*0.45)}px';s.textContent='${initial}';this.parentNode.replaceChild(s,this)">`
        : `<span class="avatar avatar--fallback" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.45)}px">${initial}</span>`;
      return `<div class="team-stacked__player">${avatarHTML}<span class="team-stacked__name">${trimmed}</span></div>`;
    }).join('')}</div>`;
  }

  // Per-code meta (avatar+country per player) from the Teams and Players tab.
  function getTeamMeta(code) {
    return (code && playerMetaByCode[code]) || null;
  }

  // Resolve a usable team code: prefer the given code, else look it up from the
  // team name (group-stage rows carry both) so knockout rows that hold a real
  // team name but no code still find the team's avatar+flag metadata.
  function resolveTeamCode(code, name) {
    if (code && playerMetaByCode[code]) return code;
    const k = (name || '').replace(/⁠/g, '').trim().toLowerCase();
    if (k && teamCodeByName[k]) return teamCodeByName[k];
    return code || '';
  }

  // INLINE avatars + flag badge for a team, keyed by Team Code — same format as
  // the Standings tab (getTeamAvatarFlagHTML). Falls back to name-based avatars
  // (no per-player country available) when no per-code meta exists (RPA/LPS).
  // Used by the knockout / consolation bracket match cards.
  function getTeamAvatarFlagByCode(code, teamName, size) {
    const meta = getTeamMeta(resolveTeamCode(code, teamName));
    if (meta && (meta.p1Avatar || meta.p2Avatar || meta.p1Country || meta.p2Country)) {
      return getTeamAvatarFlagHTML({ name: teamName, p1Avatar: meta.p1Avatar, p1Country: meta.p1Country, p2Avatar: meta.p2Avatar, p2Country: meta.p2Country }, size);
    }
    return getTeamAvatarsHTML(teamName, size);
  }

  // STACKED avatar + flag + name (one player per row), keyed by Team Code.
  // Per-player avatar+country from playerMetaByCode (same source as Standings);
  // flag badge bottom-left. Falls back to name-based avatar lookup per player so
  // coverage is maximized. Used by the All Matches division match cards.
  function getTeamStackedFlagHTML(code, teamName, size) {
    if (!teamName || teamName === 'TBD') {
      return `<div class="team-stacked team-stacked--placeholder"><span class="team-stacked__name">TBD</span></div>`;
    }
    const sz = size || 22;
    const cleanName = teamName.replace(/⁠/g, '');
    const players = cleanName.split(/ & | and /);
    // Single name (placeholder / flow label) — render as before, no flag.
    if (players.length === 1) {
      const trimmed = players[0].trim();
      const initial = trimmed.charAt(0).toUpperCase();
      return `<div class="team-stacked team-stacked--placeholder"><span class="avatar avatar--fallback" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.45)}px">${initial}</span><span class="team-stacked__name">${trimmed}</span></div>`;
    }
    const meta = getTeamMeta(resolveTeamCode(code, teamName)) || {};
    const units = [
      { name: (players[0] || '').trim(), url: meta.p1Avatar, country: meta.p1Country },
      { name: (players[1] || '').trim(), url: meta.p2Avatar, country: meta.p2Country }
    ];
    return `<div class="team-stacked">${units.map(u => {
      const initial = (u.name || '?').charAt(0).toUpperCase();
      const metaValid = u.url && u.url !== 'null' && u.url !== '#N/A';
      const url = metaValid ? u.url : getPlayerAvatar(u.name);  // fall back to name-based avatar
      const avatarHTML = url
        ? `<img class="avatar" src="${url}" alt="${u.name}" width="${sz}" height="${sz}" onerror="var s=document.createElement('span');s.className='avatar avatar--fallback';s.style.width='${sz}px';s.style.height='${sz}px';s.style.fontSize='${Math.round(sz*0.45)}px';s.textContent='${initial}';this.parentNode.replaceChild(s,this)">`
        : `<span class="avatar avatar--fallback" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.45)}px">${initial}</span>`;
      const cc = countryCodeFor(u.country);
      const flagHTML = cc
        ? `<span class="avatar-flag__badge" title="${u.country}"><span class="fi fi-${cc.toLowerCase()}"></span></span>`
        : '';
      return `<div class="team-stacked__player"><span class="avatar-flag">${avatarHTML}${flagHTML}</span><span class="team-stacked__name">${u.name}</span></div>`;
    }).join('')}</div>`;
  }

  // --- Time helper ---
  function timeToMinutes(t) {
    if (!t) return 9999;
    const parts = t.split(':');
    return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  }

  // --- Match validation ---
  // A valid match must have a date, time, and at least one identifier for each team
  function isValidMatch(m) {
    if (!m.date || !m.time) return false;
    // Community Cup matches identify teams by community, so they stay valid
    // (and render as placeholders) even before player names are entered.
    const hasTeam1 = m.team1 || m.team1Code || m.communityA;
    const hasTeam2 = m.team2 || m.team2Code || m.communityB;
    return !!(hasTeam1 && hasTeam2);
  }

  // --- Derived data: Live / Recent Matches ---
  function getMatchesByCourt(matchList) {
    const courts = {};
    matchList.forEach(m => {
      if (!isValidMatch(m)) return;
      const court = m.court || 'Unassigned';
      if (!courts[court]) courts[court] = [];
      courts[court].push(m);
    });
    // Sort courts: config `court_order` first (verbatim names), then the
    // default Court 1-4 priority, then any remaining in insertion order.
    const sortedCourts = {};
    const courtOrder = [...getConfigList('court_order'), 'Court 1', 'Court 2', 'Court 3', 'Court 4'];
    courtOrder.forEach(c => { if (courts[c] && !sortedCourts[c]) sortedCourts[c] = courts[c]; });
    Object.keys(courts).forEach(c => { if (!sortedCourts[c]) sortedCourts[c] = courts[c]; });
    for (const court of Object.keys(sortedCourts)) {
      sortedCourts[court].sort((a, b) => {
        // Sort by date then time
        if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
        return timeToMinutes(a.time) - timeToMinutes(b.time);
      });
    }
    return sortedCourts;
  }

  // --- Fetch and parse all tabs ---
  async function fetchData() {
    try {
      // Fetch config on first load
      if (!configLoaded) {
        try {
          const configRes = await fetch(sheetURL('Config', '&headers=1'));
          if (configRes.ok) {
            const configText = await configRes.text();
            const configRows = parseCSVWithHeaders(configText);
            config = parseConfigTab(configRows);

            // If config has a sheet_id, update and refetch config from the correct sheet
            if (config.sheet_id && config.sheet_id !== SHEET_ID) {
              SHEET_ID = config.sheet_id;
            }

            applyConfig();
            configLoaded = true;
          }
        } catch (e) {
          console.warn('Config tab not available, using defaults:', e);
          configLoaded = true;
        }
      }

      // Build tab names from config (with defaults)
      const matchesTab = getConfig('matches_tab', 'Matches');
      const playersTab = getConfig('players_tab', 'Teams and Players');
      const ccMode = isCommunityCupFormat();

      // In Community Cup mode we don't fetch division standings — series scores
      // and group standings are derived from the Series tab + Matches.
      const standingsTabs = ccMode ? [] : getConfigList('standings_tabs');
      if (!ccMode && standingsTabs.length === 0) {
        standingsTabs.push('Power Standings', 'Club Standings');
      }

      // Community Cup extras: Communities + Series tabs (+ the Standings tab,
      // fetched raw so the sectioned GROUP A/B layout parses line-by-line).
      const ccTabs = ccMode ? ['Communities', 'Series'] : [];

      // Fetch matches + players + standings + CC tabs in parallel
      const fetches = [
        fetch(sheetURL(matchesTab)),
        fetch(sheetURL(playersTab)),
        ...standingsTabs.map(tab => fetch(sheetURL(tab))),
        ...ccTabs.map(tab => fetch(sheetURL(tab, '&headers=1')))
      ];
      if (ccMode) fetches.push(fetch(sheetURL('Standings')));   // raw (no headers)
      const responses = await Promise.all(fetches);

      const matchRes = responses[0];
      const playersRes = responses[1];
      const standingsResponses = responses.slice(2, 2 + standingsTabs.length);
      const ccResponses = responses.slice(2 + standingsTabs.length, 2 + standingsTabs.length + ccTabs.length);
      const ccStandingsRes = ccMode ? responses[2 + standingsTabs.length + ccTabs.length] : null;

      if (!matchRes.ok) throw new Error(`Matches HTTP ${matchRes.status}`);

      const matchText = await matchRes.text();
      const matchRows = parseCSVWithHeaders(matchText);
      matches = matchRows.map(toMatch).filter(isValidMatch);

      // Index team name → code from rows that carry both (group stage). Lets the
      // brackets / All Matches resolve avatars+flags by code even when a knockout
      // row holds a real team NAME but no code (e.g. "Lara & Zeus" typed into a QF).
      teamCodeByName = {};
      const _regCode = (name, code) => {
        const k = (name || '').replace(/⁠/g, '').trim().toLowerCase();
        if (k && code && !teamCodeByName[k]) teamCodeByName[k] = code;
      };
      matches.forEach(m => { _regCode(m.team1, m.team1Code); _regCode(m.team2, m.team2Code); });

      // Parse each standings tab — store both raw lines and raw text
      standingsData = {};
      standingsRawText = {};
      for (let i = 0; i < standingsTabs.length; i++) {
        if (standingsResponses[i].ok) {
          const text = await standingsResponses[i].text();
          standingsData[standingsTabs[i]] = parseCSV(text);
          standingsRawText[standingsTabs[i]] = text;
        }
      }

      if (playersRes.ok) {
        const text = await playersRes.text();
        const rows = parseCSVWithHeaders(text);
        playerAvatars = parsePlayersTab(rows);
        // Per-team avatar+country, joined onto standings by Team Code (positional parse).
        playerMetaByCode = parsePlayersMeta(text);
        // Community Cup: also stash full rows for the draft feature.
        // Schema: Community ID, TPS User ID, Player Name, Avatar, Rating, Hand, Side, Gender, Is Captain, Nationality
        if (ccMode) {
          players = rows;
          playerNationalities = buildPlayerNationalities(rows);
        }
      }

      // Community Cup: parse Communities and Series tabs
      if (ccMode) {
        const [communitiesRes, seriesRes] = ccResponses;
        if (communitiesRes && communitiesRes.ok) {
          const text = await communitiesRes.text();
          communities = parseCommunitiesTab(parseCSVWithHeaders(text));
        }
        if (seriesRes && seriesRes.ok) {
          const text = await seriesRes.text();
          seriesList = parseSeriesTab(parseCSVWithHeaders(text));
        }
        if (ccStandingsRes && ccStandingsRes.ok) {
          const text = await ccStandingsRes.text();
          ccStandings = parseCCStandingsTab(parseCSV(text));
        }
      }

      lastUpdated = new Date();
      if (onUpdate) onUpdate(matches, lastUpdated);
    } catch (err) {
      console.error('Failed to fetch tournament data:', err);
      if (onUpdate && matches.length === 0) {
        onUpdate(null, null, err);
      }
    }
  }

  // --- Start polling ---
  async function startPolling(callback) {
    onUpdate = callback;
    await fetchData(); // Wait for first fetch so config is loaded
    const interval = parseInt(getConfig('poll_interval', '30'), 10) * 1000;
    pollTimer = setInterval(fetchData, interval);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
  }

  return {
    startPolling,
    stopPolling,
    getConfig,
    getConfigList,
    getWinner,
    shortDate,
    hasScores,
    getMatchesByCourt,
    getTeamAvatarsHTML,
    getTeamAvatarFlagHTML,
    getTeamAvatarFlagByCode,
    getTeamStackedFlagHTML,
    getTeamMeta,
    getPlayerAvatar,
    getPlayerNationality,
    getTeamStackedHTML,
    // Dynamic standings: try pre-computed format first, fall back to computing from match data
    getStandings: (tabName) => {
      const data = standingsData[tabName] || [];
      const parsed = parseStandingsTab(data);
      if (Object.keys(parsed).length > 0) return parsed;
      return computeStandingsFromMatchData(standingsRawText[tabName]);
    },
    getKnockout: (division) => getKnockoutFromMatches(division),
    getConsolation: (division) => getConsolationFromMatches(division),
    isMultiDay: () => {
      const dates = new Set(matches.map(m => m.date).filter(Boolean));
      return dates.size > 1;
    },
    // Community Cup API — empty/null/false in non-CC tournaments
    isCommunityCupFormat,
    get tournamentFormat() { return getConfig('tournament_format', 'divisions'); },
    getCommunities: () => communities,
    getCommunityById,
    getCommunityCupStandings: () => ccStandings,
    // Pure helpers exposed so groups.js can do its own 3s Communities-only
    // poll without duplicating the CSV parser or URL builder.
    sheetURL,
    parseCSVWithHeaders,
    getPlayers: () => players,
    getSeries: () => seriesList,
    getSeriesById,
    getMatchesBySeriesId,
    computeSeriesResult,
    resolveSlotCommunityId,
    get matches() { return matches; },
    get lastUpdated() { return lastUpdated; },
    get configLoaded() { return configLoaded; }
  };
})();
