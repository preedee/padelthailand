/* ============================================
   View 1 — Group Standings
   Uses dedicated Group Stage Standings tab
   Power Division (4 groups) + Club Division (4 groups)
   ============================================ */

const Standings = (() => {

  function render(container, matches) {
    const groups = Data.getStandings();
    const groupNames = Object.keys(groups);

    if (groupNames.length === 0) {
      container.innerHTML = '<div class="loading">No group standings data available</div>';
      return;
    }

    // Separate Power and Club divisions
    const powerGroups = groupNames.filter(g => g.startsWith('Power'));
    const clubGroups = groupNames.filter(g => g.startsWith('Club'));

    const html = `
      <div class="standings-divisions">
        ${powerGroups.length > 0 ? renderDivision('Power Division', powerGroups, groups) : ''}
        ${clubGroups.length > 0 ? renderDivision('Club Division', clubGroups, groups) : ''}
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
    // Top 2 teams are qualifiers
    const rows = teams.map((team, idx) => {
      const isQualifier = idx < 2;
      return `<tr class="${isQualifier ? 'qualifier' : ''}">
        <td>${team.name}</td>
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
            <th>Pair</th>
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

  return { render };
})();
