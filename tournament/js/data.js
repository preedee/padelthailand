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
  let sheetIdResolved = true;

  function sheetURL(tabName, extraParams) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}${extraParams || ''}`;
  }

  let config = {};              // key → value from Config tab
  let matches = [];
  let standingsData = {};       // tab name → raw CSV rows
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
    function applyLogo(selector, url, alt) {
      const el = document.querySelector(selector);
      if (el && url && !url.includes('example.com')) {
        el.src = url;
        el.alt = alt || '';
      }
    }
    applyLogo('.header__lps-logo', config.event_logo, config.tournament_name || 'Event Logo');
    applyLogo('.header__tps-logo', config.partner_logo, 'Partner Logo');
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
    return {
      order: parseInt(row['Order']) || 0,
      division: row['Division'] || '',
      round: row['Round'] || '',
      team1Code: row['Team 1 Code'] || '',
      team1: row['Team 1'] || '',
      team1Id: row['Team 1 ID'] || '',
      team2Code: row['Team 2 Code'] || '',
      team2: row['Team 2'] || '',
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

  // ============================================================
  // Group Stage Standings — parsed from dedicated tab
  // The tab has a non-standard layout: division headers as rows,
  // then "Code","Team","MP","W","L"... repeated per group.
  // ============================================================
  function parseStandingsTab(lines) {
    const groups = {};
    let currentDivision = '';
    let currentGroup = '';

    for (const line of lines) {
      const fields = splitCSVLine(line);
      const col0 = fields[0] || '';
      const col1 = fields[1] || '';
      const col2 = fields[2] || '';

      // Division header row (e.g. "POWER DIVISION - GROUP STAGE STANDINGS Power Play 1 Code")
      // This combined header also contains the first group name
      if (col0.includes('DIVISION') && (col0.includes('STANDINGS') || col0.includes('ST&INGS') || col0.includes('GROUP STAGE'))) {
        currentDivision = col0.includes('POWER') ? 'Power' : 'Club';
        // Extract first group name if embedded (e.g. "...STANDINGS Power Play 1 Code")
        const groupMatch = col0.match(/(Power Play \d+|Club Play \d+)/);
        if (groupMatch) {
          currentGroup = groupMatch[1];
        }
        continue;
      }

      // Group header row (e.g. "Power Play 1" or "Club Play 2")
      if ((col0.startsWith('Power Play') || col0.startsWith('Club Play')) && col1 === '') {
        currentGroup = col0;
        continue;
      }

      // Column header row — skip
      if (col0 === 'Code') {
        continue;
      }

      // Data row: code, team, MP, W, L, Sets W, Sets L, Games W, Games L
      if (col1 && col2 && currentGroup) {
        const mp = parseInt(col2) || 0;
        const w = parseInt(fields[3]) || 0;
        const l = parseInt(fields[4]) || 0;
        const setsW = parseInt(fields[5]) || 0;
        const setsL = parseInt(fields[6]) || 0;
        const gamesW = parseInt(fields[7]) || 0;
        const gamesL = parseInt(fields[8]) || 0;

        if (!groups[currentGroup]) groups[currentGroup] = [];
        groups[currentGroup].push({
          code: col0,
          name: col1,
          played: mp,
          won: w,
          lost: l,
          setsWon: setsW,
          setsLost: setsL,
          gamesWon: gamesW,
          gamesLost: gamesL,
          points: w, // W count is the ranking metric
          division: currentDivision
        });
      }
    }

    return groups;
  }

  // ============================================================
  // Knockout Stage — built entirely from the Matches tab
  // Filters matches by division, groups by round, derives winners
  // and final standings from set scores.
  // ============================================================
  function getKnockoutFromMatches(divisionPrefix) {
    // divisionPrefix: 'Power' or 'Club'
    const prefix = divisionPrefix.toLowerCase();

    // Knockout main bracket: division is exactly "Power Play" or "Club Play"
    const mainDivision = divisionPrefix + ' Play';
    const mainMatches = matches.filter(m =>
      m.matchId && m.division === mainDivision &&
      ['Quarters', 'Semis', 'Semi Finals', 'Finals', '3rd Place'].includes(m.round)
    );

    // Tier matches: division starts with "Power Tier" or "Club Tier"
    const tierPrefix = divisionPrefix + ' Tier';
    const tierMatches = matches.filter(m =>
      m.matchId && m.division.startsWith(tierPrefix) && m.round.startsWith('Tier')
    );

    // Build match objects for the bracket
    const allBracketMatches = [];

    mainMatches.forEach(m => {
      const winner = getWinner(m);
      const hasScores = m.sets.some(s => s.a > 0 || s.b > 0);
      // Normalize "Semis" to "Semi Finals" for bracket display
      const round = m.round === 'Semis' ? 'Semi Finals' : m.round;
      allBracketMatches.push({
        round: round,
        team1: m.team1,
        team2: m.team2,
        sets: m.sets,
        score1: hasScores ? m.sets.reduce((sum, s) => sum + s.a, 0) : null,
        score2: hasScores ? m.sets.reduce((sum, s) => sum + s.b, 0) : null,
        score: '',
        winner: hasScores ? (winner === 1 ? m.team1 : winner === 2 ? m.team2 : '') : '',
        section: 'PLAYOFFS',
        division: divisionPrefix,
        order: m.order
      });
    });

    tierMatches.forEach(m => {
      const winner = getWinner(m);
      const hasScores = m.sets.some(s => s.a > 0 || s.b > 0);
      allBracketMatches.push({
        round: m.round,
        team1: m.team1,
        team2: m.team2,
        sets: m.sets,
        score1: hasScores ? m.sets.reduce((sum, s) => sum + s.a, 0) : null,
        score2: hasScores ? m.sets.reduce((sum, s) => sum + s.b, 0) : null,
        score: '',
        winner: hasScores ? (winner === 1 ? m.team1 : winner === 2 ? m.team2 : '') : '',
        section: m.division, // e.g. "Power Tier 3"
        division: divisionPrefix,
        order: m.order
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
        } else {
          standings.push({ place: '🥉 3rd', team: 'TBD', note: '' });
        }
      }
    }

    return { matches: allBracketMatches, standings: standings };
  }

  // ============================================================
  // Player Avatars — parsed from "Teams and Players" tab
  // Columns: ID, Name, Code, Name, P1 Name, P1 ID, P1 Avatar, P2 Name, P2 ID, P2 Avatar
  // ============================================================
  function parsePlayersTab(rows) {
    const avatars = {};
    rows.forEach(row => {
      const p1Name = (row['P1 Name'] || '').trim().replace(/^\u2060+/, ''); // strip invisible chars
      const p1Avatar = (row['P1 Avatar'] || '').trim();
      const p2Name = (row['P2 Name'] || '').trim().replace(/^\u2060+/, '');
      const p2Avatar = (row['P2 Avatar'] || '').trim();

      if (p1Name && p1Avatar && p1Avatar !== 'null') {
        avatars[p1Name] = p1Avatar;
      }
      if (p2Name && p2Avatar && p2Avatar !== 'null') {
        avatars[p2Name] = p2Avatar;
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

  // --- Derived data: Live / Recent Matches ---
  function getMatchesByCourt(matchList) {
    const courts = {};
    matchList.forEach(m => {
      // Only include matches with a Match ID (column W)
      if (!m.matchId) return;
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
      sortedCourts[court].sort((a, b) => a.order - b.order);
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
      matches = matchRows.map(toMatch).filter(m => m.order > 0);

      // Parse each standings tab
      standingsData = {};
      for (let i = 0; i < standingsTabs.length; i++) {
        if (standingsResponses[i].ok) {
          const text = await standingsResponses[i].text();
          standingsData[standingsTabs[i]] = parseCSV(text);
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
  function startPolling(callback) {
    onUpdate = callback;
    fetchData();
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
    getMatchesByCourt,
    getTeamAvatarsHTML,
    getTeamStackedHTML,
    // Dynamic standings: pass tab name to get parsed standings
    getStandings: (tabName) => parseStandingsTab(standingsData[tabName] || []),
    // Backward compat
    getPowerStandings: () => parseStandingsTab(standingsData['Power Standings'] || []),
    getClubStandings: () => parseStandingsTab(standingsData['Club Standings'] || []),
    // Dynamic knockout: pass division prefix
    getKnockout: (division) => getKnockoutFromMatches(division),
    getPowerKnockout: () => getKnockoutFromMatches('Power'),
    getClubKnockout: () => getKnockoutFromMatches('Club'),
    get matches() { return matches; },
    get lastUpdated() { return lastUpdated; },
    get configLoaded() { return configLoaded; }
  };
})();
