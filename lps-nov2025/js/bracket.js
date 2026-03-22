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

    const html = `
      <div class="bracket-single">
        <div class="bracket-division__title">${title}</div>
        <div class="bracket">
          ${presentRounds.map(roundKey => renderRound(roundKey, rounds[roundKey])).join('')}
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

  function renderBracketMatch(match) {
    const isTeam1Winner = match.winner && match.team1 &&
      match.winner.trim() === match.team1.trim();
    const isTeam2Winner = match.winner && match.team2 &&
      match.winner.trim() === match.team2.trim();

    const team1Class = isTeam1Winner ? 'bracket-match__team--winner' :
                       isTeam2Winner ? 'bracket-match__team--loser' : '';
    const team2Class = isTeam2Winner ? 'bracket-match__team--winner' :
                       isTeam1Winner ? 'bracket-match__team--loser' : '';

    const team1Name = cleanTeamName(match.team1) || 'TBD';
    const team2Name = cleanTeamName(match.team2) || 'TBD';
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

    return `<div class="bracket__round">
      <div class="bracket__round-title">Final Standings</div>
      <div class="bracket__matches">
        <div class="bracket-match bracket-match--champion">
          <div class="bracket-match__team bracket-match__team--winner bracket-match__team--champion-display">
            <span class="bracket-match__team-name">${standings[0].place} ${standings[0].team}</span>
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
