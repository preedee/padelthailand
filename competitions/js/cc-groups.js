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

  // Mobile tap-to-expand state, keyed by community id, mirroring the draft
  // projector. The roster (.roster10) is hidden by CSS until `.is-expanded`
  // is on the card; this set survives re-renders so an open card stays open.
  const expandedTeams = new Set();
  let tapHandlerBound = false;

  // Single delegated listener (bound once). On mobile, a tap anywhere on a
  // group card toggles expand/collapse — preventing the embedded team-name
  // link from navigating — except the explicit "View Team Page →" button.
  function bindTapToExpand() {
    if (tapHandlerBound) return;
    tapHandlerBound = true;
    document.addEventListener('click', (e) => {
      if (!window.matchMedia('(max-width: 900px)').matches) return;
      if (e.target.closest('.team-card-nav')) return;
      // No `.cc-groups` prefix here: a poll re-render can detach the tapped
      // node mid-click, severing it from its `.cc-groups` ancestor — match on
      // the card alone so we can still read its team id.
      const tapped = e.target.closest('.team-card[data-team-id]');
      if (!tapped) return;
      e.preventDefault();
      const teamId = tapped.getAttribute('data-team-id');
      // The Set is the source of truth; flip it, then apply to the LIVE card
      // node (re-queried fresh) so a mid-tap re-render can't leave the visible
      // DOM out of sync with the Set and strand a card open.
      const willExpand = !expandedTeams.has(teamId);
      if (willExpand) expandedTeams.add(teamId);
      else expandedTeams.delete(teamId);
      const esc = window.CSS && CSS.escape ? CSS.escape(teamId) : teamId.replace(/"/g, '\\"');
      const live = document.querySelector(`.cc-groups .team-card[data-team-id="${esc}"]`);
      if (live) live.classList.toggle('is-expanded', willExpand);
    });
  }

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
      expanded:        expandedTeams.has(c.id),
    })).join('');
    return `
      <div class="cc-groups__half cc-groups__half--${group.toLowerCase()}">
        <div class="cc-groups__label">Group ${group}</div>
        <div class="teams-grid cc-groups__grid">${cards || '<div class="cc-groups__empty">No teams assigned yet</div>'}</div>
      </div>`;
  }

  function render(container) {
    if (!container) return;
    bindTapToExpand();
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
    // A poll can return HTTP 200 with an empty/partial body, leaving the
    // players array empty for one cycle. Don't repaint good cards with empty
    // rosters (which looks broken on an expanded mobile card) — keep the last
    // good render until real roster data returns.
    if (!data.players.length && container.querySelector('.team-card')) return;
    container.innerHTML = `<div class="cc-groups">
      ${renderHalf(communities, 'A', data)}
      <div class="cc-groups__divider" aria-hidden="true"></div>
      ${renderHalf(communities, 'B', data)}
    </div>`;
  }

  return { render };
})();
