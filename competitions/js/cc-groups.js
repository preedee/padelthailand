/* ============================================
   cc-groups.js — Dashboard "Groups" view
   Final A/B groupings with full team cards, recreated from the standalone
   group-draw projector. Sheet-only: no Supabase. The "Teams and Players" tab
   already holds every rostered player (1 row each, with a "Pick #" column),
   so we synthesise the picks array TeamCard expects — captains come straight
   from the players array, drafted players from the synthesised picks — which
   lets TeamCard.render() draw the complete 5F + 5M roster.
   ============================================ */

const CCGroups = (() => {

  function normGender(g) {
    const s = String(g || '').trim().toLowerCase();
    if (s === 'f' || s.startsWith('female')) return 'F';
    if (s === 'm' || s.startsWith('male')) return 'M';
    return '';
  }

  function parseRating(s) {
    if (s == null) return null;
    const m = String(s).match(/^\s*([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  function normGroup(s) { return String(s || '').trim().toUpperCase(); }

  // Build the players + (synthesised) picks + avatar lookup from the Sheet.
  function buildRosterData() {
    const rows = (Data.getPlayers && Data.getPlayers()) || [];
    const players = rows
      .map(r => ({
        communityId: (r['Community ID'] || '').trim(),
        playerId:    (r['TPS User ID'] || '').trim(),
        name:        (r['Player Name'] || '').trim(),
        gender:      normGender(r['Gender']),
        isCaptain:   String(r['Is Captain'] || '').trim().toUpperCase() === 'Y',
        avatar:      (r['Avatar'] && r['Avatar'] !== 'null' && r['Avatar'] !== '#N/A') ? r['Avatar'] : '',
        level:       parseRating(r['Rating'] || r['Level']),
        nationality: (r['Nationality'] || '').trim(),
        pickNum:     parseInt(r['Pick #'], 10),
      }))
      .filter(p => p.communityId && p.playerId);

    // Captains render via the players array; everyone else needs a pick row so
    // TeamCard.rosterFor() places them. Order by the sheet's Pick # column.
    const picks = players
      .filter(p => !p.isCaptain)
      .sort((a, b) => (isNaN(a.pickNum) ? 1e9 : a.pickNum) - (isNaN(b.pickNum) ? 1e9 : b.pickNum))
      .map((p, i) => ({
        team_id:     p.communityId,
        player_id:   p.playerId,
        is_undone:   false,
        pick_number: isNaN(p.pickNum) ? i + 1 : p.pickNum,
      }));

    const avatarsByUserId = {};
    players.forEach(p => { if (p.playerId && p.avatar) avatarsByUserId[p.playerId] = p.avatar; });

    return { players, picks, avatarsByUserId };
  }

  // Team's average rating — the same value the card shows (roster average),
  // so the displayed averages read top-to-bottom in order.
  function teamAvg(community, data) {
    const { F, M } = TeamCard.rosterFor(community.id, data.players, data.picks);
    const n = parseFloat(TeamCard.averageLevel(F.concat(M)));
    return isNaN(n) ? -Infinity : n;
  }

  function renderHalf(communities, group, data) {
    const inGroup = communities
      .filter(c => normGroup(c.group) === group)
      .sort((a, b) => teamAvg(b, data) - teamAvg(a, data));  // highest average first
    const cards = inGroup.map(c => TeamCard.render(c, {
      players:         data.players,
      picks:           data.picks,
      avatarsByUserId: data.avatarsByUserId,
      communityBase:   '',
      isLive:          false,
      isNext:          false,
      justPickedId:    null,
      expanded:        false,
    })).join('');
    return `
      <div class="cc-groups__half cc-groups__half--${group.toLowerCase()}">
        <div class="cc-groups__label">Group ${group}</div>
        <div class="teams-grid cc-groups__grid">${cards || '<div class="cc-groups__empty">No teams assigned yet</div>'}</div>
      </div>`;
  }

  function render(container) {
    if (!container) return;
    if (typeof Data === 'undefined' || !window.TeamCard) {
      container.innerHTML = '<div class="loading">Groups unavailable</div>';
      return;
    }
    const communities = (Data.getCommunities && Data.getCommunities()) || [];
    if (!communities.length) {
      container.innerHTML = '<div class="loading">Loading groups…</div>';
      return;
    }
    const data = buildRosterData();
    container.innerHTML = `<div class="cc-groups">
      ${renderHalf(communities, 'A', data)}
      <div class="cc-groups__divider" aria-hidden="true"></div>
      ${renderHalf(communities, 'B', data)}
    </div>`;
  }

  return { render };
})();
