/* ============================================
   Community Cup — Group standings renderer
   Renders 4-community standings for Group A or B
   ============================================ */

const CCStandings = (() => {

  // Compute one community's record across its R1 series in a group.
  function computeRecord(communityId, groupSeries) {
    const record = {
      seriesWon: 0, seriesLost: 0,
      matchesWon: 0, matchesLost: 0,
      gamesWon: 0, gamesLost: 0
    };

    for (const series of groupSeries) {
      const isA = series.communityA === communityId;
      const isB = series.communityB === communityId;
      if (!isA && !isB) continue;

      const result = Data.computeSeriesResult(series.id);
      record.matchesWon += isA ? result.aWins : result.bWins;
      record.matchesLost += isA ? result.bWins : result.aWins;

      if (result.complete) {
        if (result.winnerCommunityId === communityId) record.seriesWon++;
        else record.seriesLost++;
      }

      // Sum games from constituent matches (superset uses sets[0])
      const matches = Data.getMatchesBySeriesId(series.id);
      matches.forEach(m => {
        const a = (m.sets && m.sets[0]) ? m.sets[0].a : 0;
        const b = (m.sets && m.sets[0]) ? m.sets[0].b : 0;
        if (a + b === 0) return;
        record.gamesWon += isA ? a : b;
        record.gamesLost += isA ? b : a;
      });
    }

    return record;
  }

  function renderGroup(container, groupLetter) {
    if (!container) return;
    const groupCommunities = Data.getCommunities().filter(c => c.group === groupLetter);

    if (groupCommunities.length === 0) {
      container.innerHTML = `
        <div class="cc-standings">
          <h2 class="cc-standings__title">Group ${groupLetter}</h2>
          <div class="cc-standings__pending">
            Communities assigned to groups at draft — 20 May 2026
          </div>
        </div>
      `;
      return;
    }

    const groupSeries = Data.getSeries().filter(s =>
      s.group === groupLetter && s.id.startsWith('R1-')
    );

    const rows = groupCommunities.map(c => ({
      community: c,
      ...computeRecord(c.id, groupSeries)
    }));

    // Sort: seriesWon desc → match diff desc → game diff desc → name asc
    rows.sort((a, b) => {
      if (a.seriesWon !== b.seriesWon) return b.seriesWon - a.seriesWon;
      const md = (b.matchesWon - b.matchesLost) - (a.matchesWon - a.matchesLost);
      if (md !== 0) return md;
      const gd = (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
      if (gd !== 0) return gd;
      return a.community.name.localeCompare(b.community.name);
    });

    function renderLogo(c) {
      if (c.logoPath) {
        return `<img class="cc-standings__logo" src="${c.logoPath}" alt="${c.name}" onerror="this.style.display='none'">`;
      }
      const initial = (c.name || '?').charAt(0).toUpperCase();
      return `<span class="cc-standings__logo cc-standings__logo--fallback">${initial}</span>`;
    }

    const tbody = rows.map((row, i) => `
      <tr class="cc-standings__row">
        <td class="cc-standings__rank">${i + 1}</td>
        <td class="cc-standings__community">${renderLogo(row.community)}<span>${row.community.name}</span></td>
        <td class="cc-standings__cell">${row.seriesWon}-${row.seriesLost}</td>
        <td class="cc-standings__cell">${row.matchesWon}-${row.matchesLost}</td>
        <td class="cc-standings__cell">${row.gamesWon}-${row.gamesLost}</td>
      </tr>
    `).join('');

    // If groupLetter is a single character, prefix with "Group "; otherwise use as-is
    const heading = /^[A-Z0-9]$/i.test(groupLetter) ? `Group ${groupLetter}` : groupLetter;

    container.innerHTML = `
      <div class="cc-standings">
        <h2 class="cc-standings__title">${heading}</h2>
        <table class="cc-standings__table">
          <thead>
            <tr class="cc-standings__head">
              <th></th>
              <th class="cc-standings__community">Community</th>
              <th class="cc-standings__cell">Series</th>
              <th class="cc-standings__cell">Matches</th>
              <th class="cc-standings__cell">Games</th>
            </tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
        <div class="cc-standings__footnote">
          Tiebreakers: match wins → game differential → head-to-head
        </div>
      </div>
    `;
  }

  // Detect distinct group names from the Communities tab (column C / "Group").
  // Returns names in sort order, excluding empty/TBD.
  function getGroupNames() {
    const names = Data.getCommunities()
      .map(c => (c.group || '').trim())
      .filter(g => g && g.toUpperCase() !== 'TBD');
    return [...new Set(names)].sort();
  }

  // Render all groups side-by-side as columns in one container.
  function renderAll(container) {
    if (!container) return;
    const groupNames = getGroupNames();

    if (groupNames.length === 0) {
      container.innerHTML = `
        <div class="cc-standings">
          <div class="cc-standings__pending">
            Communities assigned to groups at draft — 20 May 2026
          </div>
        </div>
      `;
      return;
    }

    // Build a per-group column shell and let renderGroup fill each
    const columnsHTML = groupNames
      .map((name, i) => `<div class="cc-standings-col" data-group="${name}" id="cc-standings-col-${i}"></div>`)
      .join('');
    container.innerHTML = `<div class="cc-standings-multi" style="--cc-group-count: ${groupNames.length};">${columnsHTML}</div>`;

    groupNames.forEach((name, i) => {
      const col = container.querySelector(`#cc-standings-col-${i}`);
      renderGroup(col, name);
    });
  }

  return { renderGroup, renderAll, computeRecord, getGroupNames };

})();
