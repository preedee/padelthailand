/* ============================================
   Community Cup — Live courts view
   5-court grid showing currently-playing + next-up
   ============================================ */

const CCLive = (() => {

  function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) || 0;
    if (isNaN(h)) return null;
    return h * 60 + m;
  }

  function getNowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  // Today's date in the same format the Sheet uses (e.g. "12 May 2026").
  function todayDateString() {
    const d = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Find current + next match for a given court.
  // Current = a match scheduled for TODAY whose time has passed and status isn't Complete.
  // Next    = earliest match scheduled for today (future) or any future day.
  function findCourtState(matches, court) {
    const today = todayDateString();
    const courtMatches = matches
      .filter(m => m.court === court)
      .map(m => ({ m, t: parseTimeToMinutes(m.time), isToday: m.date === today }))
      .filter(x => x.t !== null)
      .sort((a, b) => {
        // Today's matches first, then by time
        if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
        return a.t - b.t;
      });

    const nowMin = getNowMinutes();
    let current = null;
    let next = null;
    for (const { m, t, isToday } of courtMatches) {
      const status = (m.status || '').toLowerCase();
      if (status === 'complete') continue;
      if (isToday && t <= nowMin && !current) {
        current = m;
      } else if (!next) {
        next = m;
        break;
      }
    }
    return { current, next };
  }

  function communityLabel(communityId) {
    if (!communityId || communityId === 'TBD') return 'TBD';
    const c = Data.getCommunityById(communityId);
    return c ? c.name : communityId;
  }

  function renderTeamRow(label, players, score, showScore) {
    const playerLine = (players && players !== 'TBD')
      ? `<div class="court-card__players">${players}</div>`
      : '';
    return `
      <div class="court-card__team">
        <div class="court-card__team-name">${label}</div>
        ${playerLine}
        ${showScore ? `<div class="court-card__score">${score}</div>` : ''}
      </div>
    `;
  }

  function renderSlot(m, isCurrent) {
    if (!m) {
      return `<div class="court-card__slot court-card__slot--empty">${isCurrent ? 'Idle' : '—'}</div>`;
    }
    const aLabel = communityLabel(m.communityA);
    const bLabel = communityLabel(m.communityB);
    const aScore = (m.sets && m.sets[0]) ? m.sets[0].a : 0;
    const bScore = (m.sets && m.sets[0]) ? m.sets[0].b : 0;
    const typeLabel = m.matchType + (m.matchSlot && parseInt(m.matchSlot) > 1 ? ' #' + m.matchSlot : '');
    const timeRow = !isCurrent && m.time ? `<div class="court-card__time">${m.time}</div>` : '';
    return `
      <div class="court-card__slot court-card__slot--${isCurrent ? 'current' : 'next'}">
        <div class="court-card__match-type">${typeLabel}</div>
        ${renderTeamRow(aLabel, m.team1, aScore, isCurrent)}
        ${renderTeamRow(bLabel, m.team2, bScore, isCurrent)}
        ${timeRow}
      </div>
    `;
  }

  function renderLive(container) {
    if (!container) return;
    const courts = Data.getConfigList('courts');
    if (courts.length === 0) {
      container.innerHTML = `<div class="loading">No courts configured</div>`;
      return;
    }

    const matches = Data.matches || [];
    const cards = courts.map(court => {
      const { current, next } = findCourtState(matches, court);
      return `
        <div class="court-card">
          <div class="court-card__header">${court}</div>
          <div class="court-card__section">
            <div class="court-card__label">Now</div>
            ${renderSlot(current, true)}
          </div>
          <div class="court-card__section">
            <div class="court-card__label">Next</div>
            ${renderSlot(next, false)}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="cc-live">${cards}</div>`;
  }

  return { renderLive, findCourtState };

})();
