/* ============================================
   View 1 — Group Standings
   Uses dedicated Group Stage Standings tab
   Power Division (4 groups) + Club Division (4 groups)
   ============================================ */

const Standings = (() => {

  function renderPower(container) {
    renderSingleDivision(container, 'Power Play Standings', Data.getPowerStandings());
  }

  function renderClub(container) {
    renderSingleDivision(container, 'Club Play Standings', Data.getClubStandings());
  }

  function renderSingleDivision(container, title, groups) {
    const groupNames = Object.keys(groups);

    if (groupNames.length === 0) {
      container.innerHTML = '<div class="loading">No group standings data available</div>';
      return;
    }

    const html = `
      <div class="standings-divisions">
        ${renderDivision(title, groupNames, groups)}
      </div>`;

    container.innerHTML = html;
  }

  function renderDivision(title, groupNames, groups) {
    return `
      <div class="standings-division">
        <div class="standings-division__title">${title}</div>
        <div class="standings-grid">
          ${groupNames.map(name => renderGroup(name, groups[name])).join('')}
        </div>
      </div>`;
  }

  function renderGroup(name, teams) {
    // Sort: Wins desc, Losses asc, then game difference (GW - GL) desc
    teams.sort((a, b) =>
      b.won - a.won ||
      a.lost - b.lost ||
      (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)
    );

    // Top 2 teams are qualifiers
    const rows = teams.map((team, idx) => {
      const isQualifier = idx < 2;
      return `<tr class="${isQualifier ? 'qualifier' : ''}">
        <td><div class="team-with-avatars">${Data.getTeamAvatarsHTML(team.name, 24)}<span class="team-name">${team.name}</span></div></td>
        <td>${team.played}</td>
        <td>${team.won}</td>
        <td>${team.lost}</td>
        <td>${team.gamesWon}</td>
        <td>${team.gamesLost}</td>
      </tr>`;
    }).join('');

    return `<div class="group-card">
      <div class="group-card__header">${name}</div>
      <table class="group-card__table">
        <thead>
          <tr>
            <th>Team</th>
            <th>MP</th>
            <th>W</th>
            <th>L</th>
            <th>GW</th>
            <th>GL</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  return { renderPower, renderClub };
})();
