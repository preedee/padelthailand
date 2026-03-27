/* ============================================
   View 1 — Group Standings
   Uses dedicated Group Stage Standings tab
   Qualification rules from config:
     "Male Amateur:2, Male Advanced:1+best, Female Amateur:4"
     - N = top N per group qualify
     - N+best = top N per group + best remaining team(s)
   ============================================ */

const Standings = (() => {

  // Parse qualification rules from config
  // Format: "Division:rule, Division:rule" e.g. "Male Amateur:2, Male Advanced:1+best, Female Amateur:4"
  function getQualificationRule(divisionName) {
    const rulesStr = Data.getConfig('qualification_rules', '');
    if (!rulesStr) return { perGroup: 2, best: false }; // default: top 2

    const rules = rulesStr.split(',').map(s => s.trim());
    for (const rule of rules) {
      const parts = rule.split(':');
      if (parts.length !== 2) continue;
      const name = parts[0].trim();
      const value = parts[1].trim().toLowerCase();
      if (name.toLowerCase() === divisionName.toLowerCase()) {
        if (value.includes('+best')) {
          const n = parseInt(value, 10) || 1;
          return { perGroup: n, best: true };
        }
        return { perGroup: parseInt(value, 10) || 2, best: false };
      }
    }
    return { perGroup: 2, best: false }; // default
  }

  // Generic render: pass tab name, display title, and division name for qualification lookup
  function render(container, tabName, title, divisionName) {
    const groups = Data.getStandings(tabName);
    const rule = getQualificationRule(divisionName || '');
    renderSingleDivision(container, title, groups, rule);
  }

  function renderPower(container) {
    const rule = getQualificationRule('Power');
    renderSingleDivision(container, 'Power Play Standings', Data.getPowerStandings(), rule);
  }

  function renderClub(container) {
    const rule = getQualificationRule('Club');
    renderSingleDivision(container, 'Club Play Standings', Data.getClubStandings(), rule);
  }

  function renderSingleDivision(container, title, groups, rule) {
    const groupNames = Object.keys(groups);

    if (groupNames.length === 0) {
      container.innerHTML = '<div class="loading">No group standings data available</div>';
      return;
    }

    // Sort teams within each group first
    groupNames.forEach(name => {
      groups[name].sort((a, b) =>
        b.won - a.won ||
        a.lost - b.lost ||
        (b.setsDiff || b.setsWon - b.setsLost) - (a.setsDiff || a.setsWon - a.setsLost) ||
        (b.gamesDiff || b.gamesWon - b.gamesLost) - (a.gamesDiff || a.gamesWon - a.gamesLost)
      );
    });

    // Determine qualifiers
    const qualifiedNames = new Set();

    // Top N per group
    groupNames.forEach(name => {
      groups[name].forEach((team, idx) => {
        if (idx < rule.perGroup) qualifiedNames.add(team.name);
      });
    });

    // Best remaining (for "N+best" rule)
    if (rule.best) {
      const remaining = [];
      groupNames.forEach(name => {
        groups[name].forEach((team, idx) => {
          if (idx >= rule.perGroup) {
            remaining.push(team);
          }
        });
      });
      // Sort remaining by same criteria
      remaining.sort((a, b) =>
        b.won - a.won ||
        a.lost - b.lost ||
        (b.setsDiff || b.setsWon - b.setsLost) - (a.setsDiff || a.setsWon - a.setsLost) ||
        (b.gamesDiff || b.gamesWon - b.gamesLost) - (a.gamesDiff || a.gamesWon - a.gamesLost)
      );
      if (remaining.length > 0) {
        qualifiedNames.add(remaining[0].name);
      }
    }

    // Build descriptive footnote text
    let footnote;
    const numGroups = groupNames.length;
    if (rule.best) {
      footnote = '*Top ' + rule.perGroup + ' per group + best remaining qualify for the next round';
    } else if (numGroups === 1) {
      footnote = '*Top ' + rule.perGroup + ' qualify for the next round';
    } else {
      footnote = '*Top ' + rule.perGroup + ' per group qualify for the next round';
    }

    const html = `
      <div class="standings-divisions">
        ${renderDivision(title, groupNames, groups, qualifiedNames, footnote)}
      </div>`;

    container.innerHTML = html;
  }

  function renderDivision(title, groupNames, groups, qualifiedNames, footnote) {
    return `
      <div class="standings-division">
        <div class="standings-division__title">${title}</div>
        <div class="standings-grid">
          ${groupNames.map(name => renderGroup(name, groups[name], qualifiedNames)).join('')}
          <div class="standings-footnote">${footnote}</div>
        </div>
      </div>`;
  }

  function renderGroup(name, teams, qualifiedNames) {
    const rows = teams.map(team => {
      const isQualifier = qualifiedNames.has(team.name);
      return `<tr class="${isQualifier ? 'qualifier' : ''}">
        <td><div class="team-with-avatars">${Data.getTeamAvatarsHTML(team.name, 26)}<span class="team-name">${team.name}</span></div></td>
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
