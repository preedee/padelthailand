/* ============================================
   View 3 — Knockout Bracket
   Uses dedicated Knockout Stage Standings tab
   Shows brackets for Power and Club divisions
   ============================================ */

const Bracket = (() => {

  const ROUND_ORDER = ['Quarters', 'Semi Finals', '3rd Place', 'Finals'];
  const ROUND_DISPLAY = {
    'Quarters': 'Quarter-Finals',
    'Semi Finals': 'Semi-Finals',
    '3rd Place': '3rd Place',
    'Finals': 'Final'
  };

  function render(container, matches) {
    const knockout = Data.getKnockout();
    const divisionNames = Object.keys(knockout);

    if (divisionNames.length === 0) {
      container.innerHTML = '<div class="loading">No knockout bracket data available</div>';
      return;
    }

    const html = `<div class="bracket-container">
      ${divisionNames.map(div => renderDivision(div, knockout[div])).join('')}
    </div>`;

    container.innerHTML = html;
  }

  function renderDivision(divName, divData) {
    // Get main playoff matches (from PLAYOFFS section)
    const playoffMatches = divData.matches.filter(m =>
      m.section.includes('PLAYOFFS') ||
      ROUND_ORDER.includes(m.round)
    );

    // Group by round
    const rounds = {};
    playoffMatches.forEach(m => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    const presentRounds = ROUND_ORDER.filter(r => rounds[r] && rounds[r].length > 0);

    // Get tier matches (Tier 3, 4, 5)
    const tierMatches = divData.matches.filter(m =>
      m.round.startsWith('Tier')
    );

    // Group tier matches by section
    const tiers = {};
    tierMatches.forEach(m => {
      if (!tiers[m.section]) tiers[m.section] = [];
      tiers[m.section].push(m);
    });

    return `
      <div class="bracket-division">
        <div class="bracket-division__title">${divName} Division Playoffs</div>
        <div class="bracket">
          ${presentRounds.map(roundKey => renderRound(roundKey, rounds[roundKey])).join('')}
          ${renderChampion(divData.standings)}
        </div>
        ${Object.keys(tiers).length > 0 ? renderTiers(tiers) : ''}
      </div>`;
  }

  function renderRound(roundKey, roundMatches) {
    return `<div class="bracket__round">
      <div class="bracket__round-title">${ROUND_DISPLAY[roundKey] || roundKey}</div>
      <div class="bracket__matches">
        ${roundMatches.map(m => renderBracketMatch(m)).join('')}
      </div>
    </div>`;
  }

  function renderBracketMatch(match) {
    const isTeam1Winner = match.winner && match.team1 &&
      match.winner.trim() === match.team1.trim();
    const isTeam2Winner = match.winner && match.team2 &&
      match.winner.trim() === match.team2.trim();

    const team1Class = isTeam1Winner ? 'bracket-match__team--winner' :
                       isTeam2Winner ? 'bracket-match__team--loser' : '';
    const team2Class = isTeam2Winner ? 'bracket-match__team--winner' :
                       isTeam1Winner ? 'bracket-match__team--loser' : '';

    const team1Name = match.team1 || 'TBD';
    const team2Name = match.team2 || 'TBD';
    const team1TBD = !match.team1 ? 'bracket-match__team--tbd' : '';
    const team2TBD = !match.team2 ? 'bracket-match__team--tbd' : '';

    return `<div class="bracket-match">
      <div class="bracket-match__team ${team1Class} ${team1TBD}">
        <span class="bracket-match__team-name">${team1Name}</span>
        <span class="bracket-match__score">${match.score1 || ''}</span>
      </div>
      <div class="bracket-match__team ${team2Class} ${team2TBD}">
        <span class="bracket-match__team-name">${team2Name}</span>
        <span class="bracket-match__score">${match.score2 || ''}</span>
      </div>
    </div>`;
  }

  function renderChampion(standings) {
    if (!standings || standings.length === 0) return '';

    const champion = standings[0];
    if (!champion) return '';

    return `<div class="bracket__round">
      <div class="bracket__round-title">Champion</div>
      <div class="bracket__matches">
        <div class="bracket-match bracket-match--champion">
          <div class="bracket-match__team bracket-match__team--winner bracket-match__team--champion-display">
            <span class="bracket-match__team-name">${champion.place} ${champion.team}</span>
          </div>
        </div>
        ${standings.slice(1, 4).map(s => `
          <div class="bracket-match bracket-match--standing">
            <div class="bracket-match__team">
              <span class="bracket-match__team-name bracket-match__place">${s.place} ${s.team}</span>
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
          <div class="bracket-tier__title">${section}</div>
          <div class="bracket-tier__matches">
            ${matches.map(m => renderBracketMatch(m)).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  return { render };
})();
