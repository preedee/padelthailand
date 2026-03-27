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

  function applyConfig() {
    // Apply CSS custom properties
    const root = document.documentElement;
    if (config.primary_color) root.style.setProperty('--green', config.primary_color);
    if (config.support_color) root.style.setProperty('--green-support', config.support_color);

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

    // Header logos — use left/right config, fall back to event/partner
    const leftLogoUrl = config.header_logo_left || config.event_logo;
    const rightLogoUrl = config.header_logo_right || config.partner_logo;
    const leftLogoSize = config.header_logo_left_size || '100';
    const rightLogoSize = config.header_logo_right_size || '100';
    const leftEl = document.querySelector('.header__lps-logo');
    const rightEl = document.querySelector('.header__tps-logo');
    if (leftEl && leftLogoUrl && !leftLogoUrl.includes('example.com')) {
      leftEl.src = leftLogoUrl;
      leftEl.alt = config.tournament_name || 'Logo';
      leftEl.style.maxHeight = leftLogoSize + '%';
    }
    if (rightEl && rightLogoUrl && !rightLogoUrl.includes('example.com')) {
      rightEl.src = rightLogoUrl;
      rightEl.alt = 'Logo';
      rightEl.style.maxHeight = rightLogoSize + '%';
    }
    applyLogo('.footer__tps-logo', config.footer_logo, 'Footer Logo');

    // Apply favicon
    if (config.favicon && !config.favicon.includes('example.com')) {
      const faviconEl = document.querySelector('link[rel="icon"]');
      if (faviconEl) faviconEl.href = config.favicon;
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

    // Reveal dashboard now that config is applied
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) dashboard.classList.add('config-loaded');
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
      if (values.length < 3) continue;
      const row = {};
      headers.forEach((h, idx) => {
        row[h.trim()] = (values[idx] || '').trim();
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
    return {
      division: row['Division'] || '',
      round: row['Round'] || '',
      team1Code: t1Code,
      team1: (t1 && t1 !== 'TBD') ? t1 : (t1Code || t1),
      team1Id: row['Team 1 ID'] || '',
      team2Code: t2Code,
      team2: (t2 && t2 !== 'TBD') ? t2 : (t2Code || t2),
      team2Id: row['Team 2 ID'] || '',
      date: row['Date'] || '',
      time: row['Time'] || '',
      club: row['Club'] || '',
      clubId: row['Club ID'] || '',
      court: row['Court'] || '',
      courtId: row['Court ID'] || '',
      status: row['Status'] || '',
      notes: row['Notes'] || '',
      sets: [
        { a: parseInt(row['Set 1 - Team A']) || 0, b: parseInt(row['Set 1 - Team B']) || 0 },
        { a: parseInt(row['Set 2 - Team A']) || 0, b: parseInt(row['Set 2 - Team B']) || 0 },
        { a: parseInt(row['Set 3 - Team A']) || 0, b: parseInt(row['Set 3 - Team B']) || 0 }
      ],
      matchId: row['Match ID'] || '',
      updatedAt: row['Updated At'] || ''
    };
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
    let colMap = null;

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

      // Column header row — detect column positions by name
      // Only rebuild colMap if this header row has actual column names (not blank)
      if (col0 === 'Code') {
        if (col2 && col2 !== '') {
          colMap = {};
          fields.forEach((f, idx) => { colMap[f.trim()] = idx; });
        }
        continue;
      }

      // Data row — use column map if available, else fallback to positional
      if (col1 && currentGroup) {
        const c = (name) => colMap && colMap[name] !== undefined ? parseInt(fields[colMap[name]]) || 0 : 0;
        const mp = colMap ? c('MP') : (parseInt(col2) || 0);
        const w = colMap ? c('W') : (parseInt(fields[3]) || 0);
        const l = colMap ? c('L') : (parseInt(fields[4]) || 0);
        const setsW = colMap ? c('Sets W') : (parseInt(fields[5]) || 0);
        const setsL = colMap ? c('Sets L') : (parseInt(fields[6]) || 0);
        const setsDiff = colMap ? c('Sets Difference') : (parseInt(fields[7]) || 0);
        const gamesW = colMap ? c('Games W') : (parseInt(fields[8]) || 0);
        const gamesL = colMap ? c('Games L') : (parseInt(fields[9]) || 0);
        const gamesDiff = colMap ? c('Games Difference') : (parseInt(fields[10]) || 0);

        if (!groups[currentGroup]) groups[currentGroup] = [];
        groups[currentGroup].push({
          code: col0,
          name: col1,
          played: mp,
          won: w,
          lost: l,
          setsWon: setsW,
          setsLost: setsL,
          setsDiff: setsDiff,
          gamesWon: gamesW,
          gamesLost: gamesL,
          gamesDiff: gamesDiff,
          points: w
        });
      }
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
        team1, team2, sets: m.sets,
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

    return { matches: allBracketMatches, standings: standings };
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
    return playerAvatars[clean] || null;
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

  // Generate stacked avatar+name HTML (one player per row)
  function getTeamStackedHTML(teamName, size) {
    if (!teamName || teamName === 'TBD') return `<span class="bracket-match__team-name">TBD</span>`;
    const sz = size || 22;
    const cleanName = teamName.replace(/\u2060/g, '');
    const players = cleanName.split(/ & | and /);
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
    const hasTeam1 = m.team1 || m.team1Code;
    const hasTeam2 = m.team2 || m.team2Code;
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
    // Sort courts: Court 1-4 first, then others
    const sortedCourts = {};
    const courtOrder = ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
    courtOrder.forEach(c => { if (courts[c]) sortedCourts[c] = courts[c]; });
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
      const standingsTabs = getConfigList('standings_tabs');
      if (standingsTabs.length === 0) standingsTabs.push('Power Standings', 'Club Standings');

      // Fetch matches + players + all standings tabs in parallel
      const fetches = [
        fetch(sheetURL(matchesTab)),
        fetch(sheetURL(playersTab)),
        ...standingsTabs.map(tab => fetch(sheetURL(tab)))
      ];
      const responses = await Promise.all(fetches);

      const matchRes = responses[0];
      const playersRes = responses[1];
      const standingsResponses = responses.slice(2);

      if (!matchRes.ok) throw new Error(`Matches HTTP ${matchRes.status}`);

      const matchText = await matchRes.text();
      const matchRows = parseCSVWithHeaders(matchText);
      matches = matchRows.map(toMatch).filter(isValidMatch);

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
    getTeamStackedHTML,
    // Dynamic standings: try pre-computed format first, fall back to computing from match data
    getStandings: (tabName) => {
      const data = standingsData[tabName] || [];
      const parsed = parseStandingsTab(data);
      if (Object.keys(parsed).length > 0) return parsed;
      return computeStandingsFromMatchData(standingsRawText[tabName]);
    },
    getKnockout: (division) => getKnockoutFromMatches(division),
    isMultiDay: () => {
      const dates = new Set(matches.map(m => m.date).filter(Boolean));
      return dates.size > 1;
    },
    get matches() { return matches; },
    get lastUpdated() { return lastUpdated; },
    get configLoaded() { return configLoaded; }
  };
})();
