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

  // Shorten date: "Fri 27-Mar-2026" → "Fri 27 Mar"
  function shortDate(d) {
    if (!d) return '';
    return d.replace(/-\d{4}$/, '').replace(/-/g, ' ');
  }

  // Strip team codes like (PA3rd), (CB4th), (PD5th), (PC5th - no team) from names
  function cleanTeamName(name) {
    if (!name) return name;
    return name.replace(/\s*\([A-Z]{2}\d*[a-z]*(?:\s*-\s*no team)?\)\s*$/, '').trim();
  }

  // Clean tier section title: "Power Tier 3 (3rd Place matches)" → "Tier 3"
  function cleanTierTitle(title) {
    return title.replace(/^(Power|Club)\s+/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
  }

  // Generic render: pass division prefix and title
  function render(container, division, title) {
    const data = Data.getKnockout(division);
    renderDivision(container, title, data, true);
  }

  function renderPower(container) {
    const data = Data.getPowerKnockout();
    renderDivision(container, 'Power Play Knockout', data, true);
  }

  function renderClub(container) {
    const data = Data.getClubKnockout();
    renderDivision(container, 'Club Play Knockout', data, true);
  }

  function renderDivision(container, title, divData, stacked) {
    if (!divData || divData.matches.length === 0) {
      container.innerHTML = '<div class="loading">No knockout bracket data available</div>';
      return;
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
          ${regularRounds.map(roundKey => renderRound(roundKey, rounds[roundKey], stacked)).join('')}
          ${(has3rd || hasFinals) ? renderCombinedFinalsRound(rounds['3rd Place'] || [], rounds['Finals'] || [], stacked) : ''}
          ${renderChampion(divData.standings, stacked)}
        </div>
        ${Object.keys(tiers).length > 0 ? renderTiers(tiers, stacked) : ''}
      </div>`;

    container.innerHTML = html;
  }

  function renderRound(roundKey, roundMatches, stacked) {
    return `<div class="bracket__round">
      <div class="bracket__round-title">${ROUND_DISPLAY[roundKey] || roundKey}</div>
      <div class="bracket__matches">
        ${roundMatches.map(m => renderBracketMatch(m, '', stacked)).join('')}
      </div>
    </div>`;
  }

  function renderCombinedFinalsRound(thirdPlaceMatches, finalsMatches, stacked) {
    return `<div class="bracket__round">
      <div class="bracket__round-title">Final / 3rd Place</div>
      <div class="bracket__matches">
        ${finalsMatches.map(m => renderBracketMatch(m, 'bracket-match--gold', stacked)).join('')}
        ${thirdPlaceMatches.map(m => renderBracketMatch(m, 'bracket-match--bronze', stacked)).join('')}
      </div>
    </div>`;
  }

  function renderBracketMatch(match, extraClass, stacked) {
    const winnerClean = cleanTeamName(match.winner || '');
    const team1Clean = cleanTeamName(match.team1 || '');
    const team2Clean = cleanTeamName(match.team2 || '');
    const isTeam1Winner = winnerClean && team1Clean && winnerClean === team1Clean;
    const isTeam2Winner = winnerClean && team2Clean && winnerClean === team2Clean;

    const team1Class = isTeam1Winner ? 'bracket-match__team--winner' :
                       isTeam2Winner ? 'bracket-match__team--loser' : '';
    const team2Class = isTeam2Winner ? 'bracket-match__team--winner' :
                       isTeam1Winner ? 'bracket-match__team--loser' : '';

    const team1Name = cleanTeamName(match.team1) || 'TBD';
    const team2Name = cleanTeamName(match.team2) || 'TBD';
    const team1TBD = !match.team1 ? 'bracket-match__team--tbd' : '';
    const team2TBD = !match.team2 ? 'bracket-match__team--tbd' : '';

    // Show set-by-set scores if available (from Matches tab enrichment), else total score
    const validSets = match.sets ? match.sets.filter(s => s.a > 0 || s.b > 0) : [];
    const displayScore1 = validSets.length > 0
      ? validSets.map(s => `<span class="bracket-match__set">${s.a}</span>`).join('')
      : `<span class="bracket-match__set">${match.score1 != null ? match.score1 : ''}</span>`;
    const displayScore2 = validSets.length > 0
      ? validSets.map(s => `<span class="bracket-match__set">${s.b}</span>`).join('')
      : `<span class="bracket-match__set">${match.score2 != null ? match.score2 : ''}</span>`;

    const team1Content = stacked
      ? Data.getTeamStackedHTML(team1Name, 22)
      : `<div class="team-with-avatars">${Data.getTeamAvatarsHTML(team1Name, 22)}<span class="bracket-match__team-name">${team1Name}</span></div>`;
    const team2Content = stacked
      ? Data.getTeamStackedHTML(team2Name, 22)
      : `<div class="team-with-avatars">${Data.getTeamAvatarsHTML(team2Name, 22)}<span class="bracket-match__team-name">${team2Name}</span></div>`;

    const dateStr = shortDate(match.date);
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

  function renderChampion(standings, stacked) {
    if (!standings || standings.length === 0) return '';

    const placeClasses = ['bracket-match--gold', 'bracket-match--silver', 'bracket-match--bronze'];

    return `<div class="bracket__round">
      <div class="bracket__round-title">Final Standings</div>
      <div class="bracket__matches">
        ${standings.slice(0, 3).map((s, i) => {
          const teamContent = stacked
            ? `<div class="team-stacked__place">${s.place}</div>${Data.getTeamStackedHTML(s.team, 22)}`
            : `<div class="team-with-avatars">${Data.getTeamAvatarsHTML(s.team, 22)}<span class="bracket-match__team-name bracket-match__place">${s.place} ${s.team}</span></div>`;
          return `<div class="bracket-match ${placeClasses[i]}">
            <div class="bracket-match__team">
              ${teamContent}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderTiers(tiers, stacked) {
    return `<div class="bracket-tiers">
      ${Object.entries(tiers).map(([section, matches]) => `
        <div class="bracket-tier">
          <div class="bracket-tier__title">${cleanTierTitle(section)}</div>
          <div class="bracket-tier__matches">
            ${matches.map(m => renderBracketMatch(m, '', stacked)).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  return { render, renderPower, renderClub };
})();
