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

  // Strip team codes like (PA3rd), (CB4th), (PD5th), (PC5th - no team) from names
  function cleanTeamName(name) {
    if (!name) return name;
    return name.replace(/\s*\([A-Z]{2}\d*[a-z]*(?:\s*-\s*no team)?\)\s*$/, '').trim();
  }

  // Clean tier section title: "Power Tier 3 (3rd Place matches)" → "Tier 3"
  function cleanTierTitle(title) {
    return title.replace(/^(Power|Club)\s+/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
  }

  function renderPower(container) {
    const data = Data.getPowerKnockout();
    renderDivision(container, 'Power Play Knockout', data);
  }

  function renderClub(container) {
    const data = Data.getClubKnockout();
    renderDivision(container, 'Club Play Knockout', data);
  }

  function renderDivision(container, title, divData) {
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
          ${regularRounds.map(roundKey => renderRound(roundKey, rounds[roundKey])).join('')}
          ${(has3rd || hasFinals) ? renderCombinedFinalsRound(rounds['3rd Place'] || [], rounds['Finals'] || []) : ''}
          ${renderChampion(divData.standings)}
        </div>
        ${Object.keys(tiers).length > 0 ? renderTiers(tiers) : ''}
      </div>`;

    container.innerHTML = html;
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
    return `<div class="bracket__round">
      <div class="bracket__round-title">Final / 3rd Place</div>
      <div class="bracket__matches">
        ${finalsMatches.map(m => renderBracketMatch(m, 'bracket-match--gold')).join('')}
        ${thirdPlaceMatches.map(m => renderBracketMatch(m, 'bracket-match--bronze')).join('')}
      </div>
    </div>`;
  }

  function renderBracketMatch(match, extraClass) {
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

    return `<div class="bracket-match ${extraClass || ''}">
      <div class="bracket-match__team ${team1Class} ${team1TBD}">
        <div class="team-with-avatars">${Data.getTeamAvatarsHTML(team1Name, 22)}<span class="bracket-match__team-name">${team1Name}</span></div>
        <div class="bracket-match__score">${displayScore1}</div>
      </div>
      <div class="bracket-match__team ${team2Class} ${team2TBD}">
        <div class="team-with-avatars">${Data.getTeamAvatarsHTML(team2Name, 22)}<span class="bracket-match__team-name">${team2Name}</span></div>
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
        ${standings.slice(0, 3).map((s, i) => `
          <div class="bracket-match ${placeClasses[i]}">
            <div class="bracket-match__team">
              <div class="team-with-avatars">${Data.getTeamAvatarsHTML(s.team, 22)}<span class="bracket-match__team-name bracket-match__place">${s.place} ${s.team}</span></div>
            </div>
          </div>
        `).join('')}
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

  return { renderPower, renderClub };
})();
