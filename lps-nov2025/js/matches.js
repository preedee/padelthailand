/* ============================================
   View 2 — Live / Recent Matches (by court)
   ============================================ */

const Matches = (() => {

  function render(container, matches) {
    const courts = Data.getMatchesByCourt(matches);
    const courtNames = Object.keys(courts);

    if (courtNames.length === 0) {
      container.innerHTML = '<div class="loading">No match data available</div>';
      return;
    }

    const html = `<div class="matches-grid">
      ${courtNames.map(court => renderCourt(court, courts[court])).join('')}
    </div>`;

    container.innerHTML = html;
  }

  function renderCourt(name, courtMatches) {
    // Separate by status
    const live = courtMatches.filter(m => m.status.toLowerCase() === 'live');
    const done = courtMatches.filter(m =>
      m.status.toLowerCase() === 'processed' || m.status.toLowerCase() === 'done'
    );
    const upcoming = courtMatches.filter(m =>
      m.status.toLowerCase() === 'upcoming' || m.status.toLowerCase() === ''
    );

    // Show all matches: live first, then done, then upcoming
    const cards = [];
    live.forEach(m => cards.push(renderMatchCard(m, 'live')));
    done.forEach(m => cards.push(renderMatchCard(m, 'done')));
    upcoming.forEach(m => cards.push(renderMatchCard(m, 'upcoming')));

    return `<div class="court-column">
      <div class="court-column__header">${name}</div>
      ${cards.join('')}
    </div>`;
  }

  function renderMatchCard(match, type) {
    const winner = Data.getWinner(match);
    const statusClass = type === 'live' ? 'match-card--live' : type === 'upcoming' ? 'match-card--upcoming' : '';

    const liveBadge = type === 'live'
      ? `<span class="live-badge"><span class="live-badge__dot"></span>LIVE</span>`
      : '';

    const statusLabel = type === 'upcoming'
      ? `<span class="match-card__time">${match.time || 'TBD'}</span>`
      : `<span class="match-card__time">${match.time || ''}</span>`;

    const team1Class = winner === 1 ? 'match-card__team--winner' : winner === 2 ? 'match-card__team--loser' : '';
    const team2Class = winner === 2 ? 'match-card__team--winner' : winner === 1 ? 'match-card__team--loser' : '';

    const scores1 = match.sets
      .filter(s => s.a > 0 || s.b > 0)
      .map(s => `<span class="match-card__set-score">${s.a}</span>`)
      .join('');

    const scores2 = match.sets
      .filter(s => s.a > 0 || s.b > 0)
      .map(s => `<span class="match-card__set-score">${s.b}</span>`)
      .join('');

    return `<div class="match-card ${statusClass}">
      <div class="match-card__status">
        <span class="match-card__round">${match.division} — ${match.round}</span>
        ${liveBadge || statusLabel}
      </div>
      <div class="match-card__teams">
        <div class="match-card__team ${team1Class}">
          <span class="match-card__team-name">${match.team1 || 'TBD'}</span>
          <div class="match-card__scores">${scores1}</div>
        </div>
        <div class="match-card__team ${team2Class}">
          <span class="match-card__team-name">${match.team2 || 'TBD'}</span>
          <div class="match-card__scores">${scores2}</div>
        </div>
      </div>
    </div>`;
  }

  return { render };
})();
