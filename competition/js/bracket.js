/* ============================================
   View 3 & 4 — Knockout Brackets
   Power and Club divisions as separate views
   ============================================ */

const Bracket = (() => {

  const ROUND_ORDER = ['Quarters', 'Semi Finals', '3rd Place', 'Finals'];
  const ROUND_DISPLAY = {
    'Quarters': 'Quarter-Finals',
    'Semi Finals': 'Semi-Finals',
    '3rd Place': '3rd Place',
    'Finals': 'Final'
  };

  const shortDate = Data.shortDate;

  // Strip team codes like (PA3rd), (CB4th) from names
  function cleanTeamName(name) {
    if (!name) return '';
    return name.replace(/\s*\([A-Z]{2}\d*[a-z]*(?:\s*-\s*no team)?\)\s*$/, '').trim();
  }

  // Clean tier section title: "Power Tier 3 (3rd Place matches)" → "Tier 3"
  function cleanTierTitle(title) {
    return title.replace(/^(Power|Club)\s+/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
  }

  function render(container, division, title) {
    const data = Data.getKnockout(division);
    renderDivision(container, title, data);
  }

  function renderDivision(container, title, divData) {
    container.innerHTML = buildDivisionHTML(title, divData);
  }

  // Build one division's knockout bracket as an HTML string (shared by the single
  // per-division view and the combined all-divisions view).
  function buildDivisionHTML(title, divData) {
    if (!divData || divData.matches.length === 0) {
      return '<div class="loading">No knockout bracket data available</div>';
    }

    // Get main playoff matches
    const playoffMatches = divData.matches.filter(m =>
      ROUND_ORDER.includes(m.round)
    );

    // Group by round
    const rounds = {};
    playoffMatches.forEach(m => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    const presentRounds = ROUND_ORDER.filter(r => rounds[r] && rounds[r].length > 0);

    // Get tier matches
    const tierMatches = divData.matches.filter(m => m.round.startsWith('Tier'));
    const tiers = {};
    tierMatches.forEach(m => {
      if (!tiers[m.section]) tiers[m.section] = [];
      tiers[m.section].push(m);
    });

    // Render rounds, combining 3rd Place and Finals into one column
    const regularRounds = presentRounds.filter(r => r !== '3rd Place' && r !== 'Finals');
    const has3rd = rounds['3rd Place'] && rounds['3rd Place'].length > 0;
    const hasFinals = rounds['Finals'] && rounds['Finals'].length > 0;

    const html = `
      <div class="bracket-single">
        <div class="bracket-division__title">${title}</div>
        <div class="bracket">
          ${regularRounds.map(roundKey => renderRound(roundKey, rounds[roundKey])).join('')}
          ${(has3rd || hasFinals) ? renderCombinedFinalsRound(rounds['3rd Place'] || [], rounds['Finals'] || []) : ''}
          ${renderChampion(divData.standings)}
        </div>
        ${Object.keys(tiers).length > 0 ? renderTiers(tiers) : ''}
      </div>`;

    return html;
  }

  // Combined knockout view — one screen, all divisions stacked vertically
  // (mirrors renderConsolationCombined). Each division shows its full knockout.
  function renderKnockoutCombined(container, divisions) {
    const blocks = (divisions || []).map(d => {
      const data = Data.getKnockout(d.name);
      const hasData = data && data.matches && data.matches.length > 0;
      const inner = hasData
        ? buildDivisionHTML(d.name + ' — Knockout', data)
        : `<div class="bracket-division__title">${d.name} — Knockout</div><div class="loading">No knockout matches yet</div>`;
      return `<div class="bracket-combined__division">${inner}</div>`;
    });
    container.innerHTML = blocks.length
      ? `<div class="bracket-combined">${blocks.join('')}</div>`
      : '<div class="loading">No knockout bracket data available</div>';
  }

  function renderRound(roundKey, roundMatches) {
    return `<div class="bracket__round">
      <div class="bracket__round-title">${ROUND_DISPLAY[roundKey] || roundKey}</div>
      <div class="bracket__matches">
        ${roundMatches.map(m => renderBracketMatch(m)).join('')}
      </div>
    </div>`;
  }

  function renderCombinedFinalsRound(thirdPlaceMatches, finalsMatches) {
    const title = thirdPlaceMatches.length > 0 ? 'Final / 3rd Place' : 'Final';
    return `<div class="bracket__round">
      <div class="bracket__round-title">${title}</div>
      <div class="bracket__matches">
        ${finalsMatches.map(m => renderBracketMatch(m, 'bracket-match--gold')).join('')}
        ${thirdPlaceMatches.map(m => renderBracketMatch(m, 'bracket-match--bronze')).join('')}
      </div>
    </div>`;
  }

  function renderBracketMatch(match, extraClass) {
    const team1Name = cleanTeamName(match.team1) || 'TBD';
    const team2Name = cleanTeamName(match.team2) || 'TBD';
    const winnerClean = cleanTeamName(match.winner || '');
    const isTeam1Winner = winnerClean && team1Name && winnerClean === team1Name;
    const isTeam2Winner = winnerClean && team2Name && winnerClean === team2Name;

    const team1Class = isTeam1Winner ? 'bracket-match__team--winner' :
                       isTeam2Winner ? 'bracket-match__team--loser' : '';
    const team2Class = isTeam2Winner ? 'bracket-match__team--winner' :
                       isTeam1Winner ? 'bracket-match__team--loser' : '';
    const team1TBD = !match.team1 ? 'bracket-match__team--tbd' : '';
    const team2TBD = !match.team2 ? 'bracket-match__team--tbd' : '';

    const validSets = match.sets ? match.sets.filter(s => s.a > 0 || s.b > 0) : [];
    const displayScore1 = validSets.length > 0
      ? validSets.map(s => `<span class="bracket-match__set${s.a > s.b ? ' bracket-match__set--high' : ''}">${s.a}</span>`).join('')
      : `<span class="bracket-match__set">${match.score1 != null ? match.score1 : ''}</span>`;
    const displayScore2 = validSets.length > 0
      ? validSets.map(s => `<span class="bracket-match__set${s.b > s.a ? ' bracket-match__set--high' : ''}">${s.b}</span>`).join('')
      : `<span class="bracket-match__set">${match.score2 != null ? match.score2 : ''}</span>`;

    const team1Avatars = Data.getTeamAvatarsHTML(team1Name, 20);
    const team1Content = `<div class="team-with-avatars">${team1Avatars}<span class="bracket-match__team-name">${team1Name}</span></div>`;
    const team2Avatars = Data.getTeamAvatarsHTML(team2Name, 20);
    const team2Content = `<div class="team-with-avatars">${team2Avatars}<span class="bracket-match__team-name">${team2Name}</span></div>`;

    const dateStr = Data.isMultiDay() ? shortDate(match.date) : '';
    const timeStr = match.time || '';
    const dateTimeStr = dateStr ? (timeStr ? `${dateStr} · ${timeStr}` : dateStr) : timeStr;
    const dateTimeHTML = dateTimeStr ? `<div class="bracket-match__datetime">${dateTimeStr}</div>` : '';

    return `<div class="bracket-match ${extraClass || ''}">
      ${dateTimeHTML}
      <div class="bracket-match__team ${team1Class} ${team1TBD}">
        ${team1Content}
        <div class="bracket-match__score">${displayScore1}</div>
      </div>
      <div class="bracket-match__team ${team2Class} ${team2TBD}">
        ${team2Content}
        <div class="bracket-match__score">${displayScore2}</div>
      </div>
    </div>`;
  }

  function renderChampion(standings) {
    if (!standings || standings.length === 0) return '';

    const placeClasses = ['bracket-match--gold', 'bracket-match--silver', 'bracket-match--bronze'];

    return `<div class="bracket__round">
      <div class="bracket__round-title">Final Standings</div>
      <div class="bracket__matches">
        ${standings.slice(0, 3).map((s, i) => {
          const teamContent = `<div class="team-stacked__standing"><span class="team-stacked__place">${s.place}</span><span class="team-stacked__standing-team">${Data.getTeamStackedHTML(s.team, 18)}</span></div>`;
          return `<div class="bracket-match ${placeClasses[i]}">
            <div class="bracket-match__team">
              ${teamContent}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderTiers(tiers) {
    return `<div class="bracket-tiers">
      ${Object.entries(tiers).map(([section, matches]) => `
        <div class="bracket-tier">
          <div class="bracket-tier__title">${cleanTierTitle(section)}</div>
          <div class="bracket-tier__matches">
            ${matches.map(m => renderBracketMatch(m)).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  // One division's consolation bracket as HTML (title + SF/Final rounds, or empty
  // state). Driven by Data.getConsolation (Matches rows with Round ~ "Consolation").
  function buildConsolationHTML(divisionName) {
    const data = Data.getConsolation(divisionName);
    const ms = (data && data.matches) || [];
    const sf = ms.filter(m => m.round === 'Semi Finals');
    const fin = ms.filter(m => m.round === 'Finals');
    if (sf.length === 0 && fin.length === 0) {
      return `<div class="bracket-division__title">${divisionName} — Consolation</div>
        <div class="loading">No consolation matches yet</div>`;
    }
    return `<div class="bracket-division__title">${divisionName} — Consolation</div>
      <div class="bracket">
        ${sf.length ? renderRound('Semi Finals', sf) : ''}
        ${fin.length ? renderRound('Finals', fin) : ''}
      </div>`;
  }

  // Combined consolation view — one screen, all divisions side by side.
  function renderConsolationCombined(container, divisions) {
    const blocks = (divisions || []).map(d =>
      `<div class="bracket-consolation__division">${buildConsolationHTML(d.name)}</div>`
    );

    if (blocks.length === 0) {
      container.innerHTML = '<div class="loading">No consolation bracket data available</div>';
      return;
    }

    container.innerHTML = `
      <div class="bracket-single bracket-consolation">
        <div class="bracket-consolation__grid" style="display:flex;flex-wrap:wrap;gap:4vmin;justify-content:center;align-items:flex-start;">
          ${blocks.join('')}
        </div>
      </div>`;
  }

  // Per-division page — that division's Knockout bracket stacked above its
  // Consolation bracket (reuses the .bracket-combined fit layout).
  function renderDivisionFull(container, divisionName) {
    const koData = Data.getKnockout(divisionName);
    const koHTML = (koData && koData.matches && koData.matches.length > 0)
      ? buildDivisionHTML(divisionName + ' — Knockout', koData)
      : `<div class="bracket-division__title">${divisionName} — Knockout</div><div class="loading">No knockout matches yet</div>`;
    container.innerHTML = `
      <div class="bracket-combined bracket-division-page">
        <div class="bracket-combined__division">${koHTML}</div>
        <div class="bracket-combined__division bracket-combined__division--consolation">${buildConsolationHTML(divisionName)}</div>
      </div>`;
  }

  return { render, renderKnockoutCombined, renderConsolationCombined, renderDivisionFull };
})();
