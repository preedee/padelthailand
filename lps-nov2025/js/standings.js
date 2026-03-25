/* ============================================
   View 1 — Group Standings
   Uses dedicated Group Stage Standings tab
   Power Division (4 groups) + Club Division (4 groups)
   ============================================ */

const Standings = (() => {

  // Generic render: pass tab name and display title
  function render(container, tabName, title) {
    renderSingleDivision(container, title, Data.getStandings(tabName));
  }

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
    // Sort: Wins desc, Losses asc, set difference desc, game difference desc
    teams.sort((a, b) =>
      b.won - a.won ||
      a.lost - b.lost ||
      (b.setsDiff || b.setsWon - b.setsLost) - (a.setsDiff || a.setsWon - a.setsLost) ||
      (b.gamesDiff || b.gamesWon - b.gamesLost) - (a.gamesDiff || a.gamesWon - a.gamesLost)
    );

    // Top 2 teams are qualifiers
    const rows = teams.map((team, idx) => {
      const isQualifier = idx < 2;
      return `<tr class="${isQualifier ? 'qualifier' : ''}">
        <td><div class="team-with-avatars">${Data.getTeamAvatarsHTML(team.name, 40)}<span class="team-name">${team.name}</span></div></td>
        <td>${team.played}</td>
        <td>${team.won}</td>
        <td>${team.lost}</td>
        <td>${team.setsDiff != null ? team.setsDiff : (team.setsWon - team.setsLost)}</td>
        <td>${team.gamesDiff != null ? team.gamesDiff : (team.gamesWon - team.gamesLost)}</td>
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
            <th>SD</th>
            <th>GD</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  return { render, renderPower, renderClub };
})();
