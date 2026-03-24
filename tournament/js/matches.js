/* ============================================
   View 2 — Live / Recent Matches (by court)
   ============================================ */

const Matches = (() => {

  // Shorten date: "Fri 27-Mar-2026" → "Fri 27 Mar"
  function shortDate(d) {
    if (!d) return '';
    return d.replace(/-\d{4}$/, '').replace(/-/g, ' ');
  }

  // Parse time string like "9:00", "10:30", "16:45" to minutes since midnight
  function timeToMinutes(t) {
    if (!t) return 9999;
    const parts = t.split(':');
    return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  }

  // Check if match has been played (has any set scores)
  function hasScores(m) {
    return m.sets.some(s => s.a > 0 || s.b > 0);
  }

  // Check if match is live
  function isLive(m) {
    return m.status.toLowerCase() === 'live';
  }

  // Sort matches by date then time ascending
  function sortByDateTime(a, b) {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const timeA = timeToMinutes(a.time);
    const timeB = timeToMinutes(b.time);
    if (timeA !== timeB) return timeA - timeB;
    return (parseInt(a.matchId) || 0) - (parseInt(b.matchId) || 0);
  }

  function render(container, matches) {
    const courts = Data.getMatchesByCourt(matches);
    const courtNames = Object.keys(courts);

    if (courtNames.length === 0) {
      container.innerHTML = '<div class="loading">No match data available</div>';
      return;
    }

    // Sort all matches per court by date/time
    courtNames.forEach(c => courts[c].sort(sortByDateTime));

    // Collect all unique time slots across all courts, in order
    const timeSlots = [];
    const seenSlots = new Set();
    courtNames.forEach(c => {
      courts[c].forEach(m => {
        const slot = (m.date || '') + '|' + (m.time || '');
        if (!seenSlots.has(slot)) {
          seenSlots.add(slot);
          timeSlots.push({ date: m.date, time: m.time, slot });
        }
      });
    });
    timeSlots.sort((a, b) => sortByDateTime(a, b));

    // Build index: court → slot → match
    const courtSlotMap = {};
    courtNames.forEach(c => {
      courtSlotMap[c] = {};
      courts[c].forEach(m => {
        const slot = (m.date || '') + '|' + (m.time || '');
        if (!courtSlotMap[c][slot]) courtSlotMap[c][slot] = [];
        courtSlotMap[c][slot].push(m);
      });
    });

    // Render as time-aligned grid
    const colCount = courtNames.length;
    const headerRow = courtNames.map(name =>
      `<div class="court-column__header">${name}</div>`
    ).join('');

    const rows = timeSlots.map(ts => {
      const cells = courtNames.map(court => {
        const matchesInSlot = courtSlotMap[court][ts.slot] || [];
        if (matchesInSlot.length === 0) {
          return `<div class="matches-grid__cell matches-grid__cell--empty"></div>`;
        }
        const cards = matchesInSlot.map(m => {
          const type = isLive(m) ? 'live' : hasScores(m) ? 'done' : 'upcoming';
          return renderMatchCard(m, type);
        }).join('');
        return `<div class="matches-grid__cell">${cards}</div>`;
      }).join('');
      return cells;
    }).join('');

    const html = `<div class="matches-grid" style="grid-template-columns: repeat(${colCount}, 1fr);">
      ${headerRow}
      ${rows}
    </div>`;

    container.innerHTML = html;
  }

  function renderMatchCard(match, type) {
    const winner = Data.getWinner(match);
    const roundLower = (match.round || '').toLowerCase();
    const isFinals = roundLower.includes('finals') || roundLower.includes('final');
    const isThirdPlace = roundLower.includes('3rd place');
    const roundClass = isFinals ? 'match-card--finals' : isThirdPlace ? 'match-card--third-place' : '';
    const roundLabelClass = isFinals ? 'match-card__round--finals' : isThirdPlace ? 'match-card__round--third-place' : '';
    const statusClass = type === 'live' ? 'match-card--live' : type === 'upcoming' ? 'match-card--upcoming' : '';

    const liveBadge = type === 'live'
      ? `<span class="live-badge"><span class="live-badge__dot"></span>LIVE</span>`
      : '';

    const dateStr = shortDate(match.date);
    const timeStr = match.time || (type === 'upcoming' ? 'TBD' : '');
    const dateTimeStr = dateStr ? `${dateStr} · ${timeStr}` : timeStr;
    const statusLabel = `<span class="match-card__time">${dateTimeStr}</span>`;

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

    return `<div class="match-card ${statusClass} ${roundClass}">
      <div class="match-card__status">
        <span class="match-card__round ${roundLabelClass}">${match.division} — ${match.round}</span>
        ${liveBadge || statusLabel}
      </div>
      <div class="match-card__teams">
        <div class="match-card__team ${team1Class}">
          ${Data.getTeamStackedHTML(match.team1, 20)}
          <div class="match-card__scores">${scores1}</div>
        </div>
        <div class="match-card__team ${team2Class}">
          ${Data.getTeamStackedHTML(match.team2, 20)}
          <div class="match-card__scores">${scores2}</div>
        </div>
      </div>
    </div>`;
  }

  // Sidebar: 2 matches per court (current + next, or last 2 done)
  function renderUpcoming(container, matches) {
    const validCourts = ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
    const courts = {};
    matches.forEach(m => {
      if (!m.matchId) return;
      if (!validCourts.includes(m.court)) return;
      if (!courts[m.court]) courts[m.court] = [];
      courts[m.court].push(m);
    });

    let hasContent = false;
    const sections = validCourts.map(courtName => {
      const courtMatches = (courts[courtName] || []).slice().sort(sortByDateTime);
      const live = courtMatches.filter(m => isLive(m));
      const done = courtMatches.filter(m => !isLive(m) && hasScores(m));
      const upcoming = courtMatches.filter(m => !isLive(m) && !hasScores(m));

      // Pick 2: last done first, then live, then upcoming
      const picks = [];
      if (done.length > 0) picks.push(done[done.length - 1]);
      live.forEach(m => { if (picks.length < 2) picks.push(m); });
      upcoming.forEach(m => { if (picks.length < 2) picks.push(m); });
      if (picks.length < 2 && done.length > 1) {
        picks.unshift(done[done.length - 2]);
      }

      if (picks.length === 0) return '';
      hasContent = true;

      return `
        <div class="sidebar__court-section">
          <div class="sidebar__court-label">${courtName}</div>
          ${picks.map(m => {
            const matchIsLive = isLive(m);
            const isDone = hasScores(m) && !matchIsLive;
            const winner = Data.getWinner(m);
            const t1Class = winner === 1 ? 'sidebar__team--bold' : winner === 2 ? 'sidebar__team--muted' : '';
            const t2Class = winner === 2 ? 'sidebar__team--bold' : winner === 1 ? 'sidebar__team--muted' : '';
            const scores = m.sets.filter(s => s.a > 0 || s.b > 0).map(s => `${s.a}-${s.b}`).join(' ');
            const isUpcoming = !matchIsLive && !isDone;
            return `<div class="sidebar__match ${matchIsLive ? 'sidebar__match--live' : ''}">
              <div class="sidebar__match-row">
                <span class="sidebar__match-team ${t1Class}">${m.team1 || 'TBD'}</span>
                ${isDone && scores ? `<span class="sidebar__match-score">${m.sets.filter(s=>s.a>0||s.b>0).map(s=>s.a).join(' ')}</span>` : `<span class="sidebar__match-time">${shortDate(m.date) ? shortDate(m.date) + ' · ' : ''}${m.time || ''}</span>`}
              </div>
              <div class="sidebar__match-row">
                <span class="sidebar__match-team ${t2Class}">${m.team2 || 'TBD'}</span>
                ${isDone && scores ? `<span class="sidebar__match-score">${m.sets.filter(s=>s.a>0||s.b>0).map(s=>s.b).join(' ')}</span>` : isUpcoming && (m.round === 'Finals' || m.round === '3rd Place') ? `<span class="sidebar__match-time">${m.round}</span>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>`;
    }).join('');

    if (!hasContent) {
      container.innerHTML = '<div class="loading" style="height:auto;padding:16px;font-size:13px">No matches</div>';
      return;
    }

    container.innerHTML = sections;
  }

  return { render, renderUpcoming };
})();
