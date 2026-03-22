/* ============================================
   Data Layer — CSV fetch, parse, poll (4 tabs)
   ============================================ */

const Data = (() => {
  const SHEET_ID = '1taW8qRBwHLXm1Yvl06uRz1GGlVEfq2HMF-CyjIMmEhs';
  const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;
  const URLS = {
    matches:   `${BASE_URL}&sheet=Matches`,
    standings: `${BASE_URL}&sheet=Group%20Stage%20Standings`,
    powerKO:   `${BASE_URL}&sheet=Power%20Play%20Knockout%20Stage`,
    clubKO:    `${BASE_URL}&sheet=Club%20Play%20Knockout%20Stage`
  };
  const POLL_INTERVAL = 30000; // 30 seconds

  let matches = [];
  let standingsData = [];    // raw rows from standings tab
  let powerKOData = [];      // raw rows from Power knockout tab
  let clubKOData = [];       // raw rows from Club knockout tab
  let lastUpdated = null;
  let pollTimer = null;
  let onUpdate = null;

  // --- CSV Parser (handles quoted fields) ---
  function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
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
      if (col0.includes('DIVISION') && col0.includes('STANDINGS')) {
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
  // Knockout Stage — parsed from a single-division tab
  // Each tab has one division (Power or Club).
  // Layout: header, section headers (PLAYOFFS, Tier 3, etc.),
  // then "Round","Team 1","Score","Team 2","Winner" rows.
  // Also has final standings sections.
  // ============================================================
  function parseKnockoutTab(lines, divisionName) {
    const result = { matches: [], standings: [] };
    let currentSection = '';

    for (const line of lines) {
      const fields = splitCSVLine(line);
      const col0 = fields[0] || '';
      const col1 = fields[1] || '';

      // Skip division/stage header rows
      if (col0.includes('KNOCKOUT') || col0.includes('STANDINGS')) {
        if (col0.includes('FINAL STANDINGS')) {
          currentSection = 'FINAL_STANDINGS';
        }
        continue;
      }

      // Section header (e.g. "POWER PLAYOFFS", "Power Tier 3...")
      if ((col0.includes('PLAYOFFS') || col0.includes('Tier')) && col1 === '') {
        currentSection = col0;
        continue;
      }

      // Skip column header rows
      if (col0 === 'Round' || col0 === 'Place') continue;

      // Final standings data row
      if (currentSection === 'FINAL_STANDINGS' && col0 && col1) {
        result.standings.push({
          place: col0,
          team: col1,
          note: fields[2] || ''
        });
        continue;
      }

      // Match data row: Round, Team 1, Score, Team 2, Winner
      if (col0 && col1 && fields[2] && fields[3]) {
        const score = fields[2] || '';
        const scoreParts = score.split('-').map(s => parseInt(s.trim()));
        result.matches.push({
          round: col0,
          team1: col1,
          score: score.trim(),
          score1: scoreParts[0] || 0,
          score2: scoreParts[1] || 0,
          team2: fields[3],
          winner: fields[4] || '',
          section: currentSection,
          division: divisionName
        });
      }
    }

    return result;
  }

  // --- Derived data: Live / Recent Matches ---
  function getMatchesByCourt(matchList) {
    const validCourts = ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
    const courts = {};
    matchList.forEach(m => {
      // Only include matches with a Match ID (column W) and a valid court
      if (!m.matchId) return;
      if (!validCourts.includes(m.court)) return;
      const court = m.court;
      if (!courts[court]) courts[court] = [];
      courts[court].push(m);
    });
    for (const court of Object.keys(courts)) {
      courts[court].sort((a, b) => a.order - b.order);
    }
    return courts;
  }

  // --- Fetch and parse all 4 tabs ---
  async function fetchData() {
    try {
      const [matchRes, standingsRes, powerKORes, clubKORes] = await Promise.all([
        fetch(URLS.matches),
        fetch(URLS.standings),
        fetch(URLS.powerKO),
        fetch(URLS.clubKO)
      ]);

      if (!matchRes.ok) throw new Error(`Matches HTTP ${matchRes.status}`);

      const matchText = await matchRes.text();
      const matchRows = parseCSVWithHeaders(matchText);
      matches = matchRows.map(toMatch).filter(m => m.order > 0);

      if (standingsRes.ok) {
        const standingsText = await standingsRes.text();
        standingsData = parseCSV(standingsText);
      }

      if (powerKORes.ok) {
        const powerKOText = await powerKORes.text();
        powerKOData = parseCSV(powerKOText);
      }

      if (clubKORes.ok) {
        const clubKOText = await clubKORes.text();
        clubKOData = parseCSV(clubKOText);
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
    pollTimer = setInterval(fetchData, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
  }

  return {
    startPolling,
    stopPolling,
    getWinner,
    getMatchesByCourt,
    getStandings: () => parseStandingsTab(standingsData),
    getPowerKnockout: () => parseKnockoutTab(powerKOData, 'Power'),
    getClubKnockout: () => parseKnockoutTab(clubKOData, 'Club'),
    get matches() { return matches; },
    get lastUpdated() { return lastUpdated; }
  };
})();
