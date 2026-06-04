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
        // "N+best" → top N per group + 1 best remaining.
        // "N+Mbest" → top N per group + M best remaining (e.g. 2+2best = 8 of 3×4).
        const m = value.match(/^(\d+)\s*\+\s*(\d*)\s*best$/);
        if (m) return { perGroup: parseInt(m[1], 10) || 1, best: parseInt(m[2], 10) || 1 };
        return { perGroup: parseInt(value, 10) || 2, best: 0 };
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

  // Config-gated UI bits. Defaults preserve existing behavior for all other
  // competitions — only a comp that opts in (via its Config tab) changes.
  function qualifyNoteEnabled() {
    return String(Data.getConfig('show_qualify_note', 'true')).toLowerCase() !== 'false';
  }
  function columnLegendHTML() {
    const show = String(Data.getConfig('show_column_legend', 'false')).toLowerCase() === 'true';
    if (!show) return '';
    return `<div class="standings-legend">
        <span><strong>MP</strong> Matches Played</span>
        <span><strong>W</strong> Wins</span>
        <span><strong>L</strong> Losses</span>
        <span><strong>GD</strong> Games Difference</span>
      </div>`;
  }

  // Shared comparator for ranking teams within a group / among remaining teams.
  function compareTeams(a, b) {
    return b.won - a.won ||
      a.lost - b.lost ||
      (b.setsDiff || b.setsWon - b.setsLost) - (a.setsDiff || a.setsWon - a.setsLost) ||
      (b.gamesDiff || b.gamesWon - b.gamesLost) - (a.gamesDiff || a.gamesWon - a.gamesLost);
  }

  // Sort groups in place, compute the qualifier set + footnote for one division.
  // Returns { groupNames, qualifiedNames, footnote } — the renderable building blocks.
  function prepareDivision(groups, rule) {
    const groupNames = Object.keys(groups);

    // Sort teams within each group first
    groupNames.forEach(name => groups[name].sort(compareTeams));

    // Determine qualifiers — only if at least one team has played
    const qualifiedNames = new Set();
    const anyMatchesPlayed = groupNames.some(name =>
      groups[name].some(team => team.played > 0)
    );

    // Top N per group (only if matches have been played)
    if (anyMatchesPlayed) {
      groupNames.forEach(name => {
        const groupHasPlayed = groups[name].some(team => team.played > 0);
        if (groupHasPlayed) {
          groups[name].forEach((team, idx) => {
            if (idx < rule.perGroup) qualifiedNames.add(team.name);
          });
        }
      });
    }

    // Best remaining (for "N+best" rule)
    if (rule.best && anyMatchesPlayed) {
      const remaining = [];
      groupNames.forEach(name => {
        groups[name].forEach((team, idx) => {
          if (idx >= rule.perGroup) remaining.push(team);
        });
      });
      remaining.sort(compareTeams);
      remaining.slice(0, rule.best).forEach(t => qualifiedNames.add(t.name));
    }

    // Build descriptive footnote text
    let footnote;
    const numGroups = groupNames.length;
    if (rule.best) {
      const bestTxt = rule.best > 1 ? rule.best + ' best remaining' : 'best remaining';
      footnote = '*Top ' + rule.perGroup + ' per group + ' + bestTxt + ' qualify for the next round';
    } else if (numGroups === 1) {
      footnote = '*Top ' + rule.perGroup + ' qualify for the next round';
    } else {
      footnote = '*Top ' + rule.perGroup + ' per group qualify for the next round';
    }

    return { groupNames, qualifiedNames, footnote };
  }

  function renderSingleDivision(container, title, groups, rule) {
    if (Object.keys(groups).length === 0) {
      container.innerHTML = '<div class="loading">No group standings data available</div>';
      return;
    }
    const { groupNames, qualifiedNames, footnote } = prepareDivision(groups, rule);

    container.innerHTML = `
      <div class="standings-divisions">
        ${renderDivision(title, groupNames, groups, qualifiedNames, footnote)}
        ${columnLegendHTML()}
      </div>`;
  }

  // Combined view — render every division's group standings stacked on one page.
  // Used for big-screen comps where show_all categories at a glance (config-gated).
  function renderCombined(container, divisions) {
    const blocks = divisions.map(d => {
      const groups = Data.getStandings(d.standingsTab);
      if (!groups || Object.keys(groups).length === 0) return '';
      const rule = getQualificationRule(d.name);
      const { groupNames, qualifiedNames, footnote } = prepareDivision(groups, rule);
      // Combined view stacks every division — prefix each group card with its
      // division ("Gold Group A") so Gold/Silver are distinguishable.
      return renderDivision(d.name, groupNames, groups, qualifiedNames, footnote, d.name);
    }).filter(Boolean);

    container.innerHTML = blocks.length
      ? `<div class="standings-divisions standings-divisions--combined">${blocks.join('')}${columnLegendHTML()}</div>`
      : '<div class="loading">No group standings data available</div>';
  }

  function renderDivision(title, groupNames, groups, qualifiedNames, footnote, groupPrefix) {
    return `
      <div class="standings-division">
        <div class="standings-division__title">${title}</div>
        <div class="standings-grid">
          ${groupNames.map(name => renderGroup(name, groups[name], qualifiedNames, groupPrefix)).join('')}
          ${qualifyNoteEnabled() ? `<div class="standings-footnote">${footnote}</div>` : ''}
        </div>
      </div>`;
  }

  function renderGroup(name, teams, qualifiedNames, groupPrefix) {
    const displayName = groupPrefix ? `${groupPrefix} ${name}` : name;
    const rows = teams.map(team => {
      const isQualifier = qualifiedNames.has(team.name);
      // Prefer per-player avatar+flag (resolved in-sheet from Users by ID);
      // fall back to name-based avatars when those columns aren't present.
      const hasAvatarFlag = team.p1Avatar || team.p2Avatar || team.p1Country || team.p2Country;
      const avatarsHTML = hasAvatarFlag && Data.getTeamAvatarFlagHTML
        ? Data.getTeamAvatarFlagHTML(team, 26)
        : Data.getTeamAvatarsHTML(team.name, 26);
      return `<tr class="${isQualifier ? 'qualifier' : ''}">
        <td><div class="team-with-avatars">${avatarsHTML}<span class="team-name">${team.name}</span></div></td>
        <td>${team.played}</td>
        <td>${team.won}</td>
        <td>${team.lost}</td>
        <td>${team.gamesDiff || (team.gamesWon - team.gamesLost)}</td>
      </tr>`;
    }).join('');

    return `<div class="group-card">
      <table class="group-card__table">
        <thead>
          <tr>
            <th class="group-card__name">${displayName}</th>
            <th>MP</th>
            <th>W</th>
            <th>L</th>
            <th>GD</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  return { render, renderPower, renderClub, renderCombined };
})();
