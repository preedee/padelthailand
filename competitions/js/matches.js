/* ============================================
   View 2 — Live / Recent Matches (by court)
   ============================================ */

const Matches = (() => {

  const shortDate = Data.shortDate;
  const hasScores = Data.hasScores;

  // Parse time string like "9:00", "10:30", "16:45" to minutes since midnight
  function timeToMinutes(t) {
    if (!t) return 9999;
    const parts = t.split(':');
    return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
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
    return 0;
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
    const gridCols = `grid-template-columns: repeat(${colCount}, minmax(0, 1fr));`;
    const headerRow = courtNames.map(name =>
      `<div class="court-column__header">${name}</div>`
    ).join('');

    // Helper: render rows for a set of time slots
    function renderSlotRows(slots) {
      return slots.map(ts => {
        return courtNames.map(court => {
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
      }).join('');
    }

    // Group time slots by date
    const uniqueDates = [];
    const slotsByDate = {};
    timeSlots.forEach(ts => {
      const d = ts.date || 'Unknown';
      if (!slotsByDate[d]) {
        slotsByDate[d] = [];
        uniqueDates.push(d);
      }
      slotsByDate[d].push(ts);
    });

    const isMultiDay = uniqueDates.length > 1;
    let html;

    if (isMultiDay) {
      // Multi-day: collapsible sections per day
      const daysSections = uniqueDates.map(date => {
        const dayLabel = shortDate(date);
        const rows = renderSlotRows(slotsByDate[date]);
        return `<div class="matches-day">
          <button class="matches-day__header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>${dayLabel}</span>
            <span class="matches-day__chevron">▼</span>
          </button>
          <div class="matches-grid" style="${gridCols}">
            ${rows}
          </div>
        </div>`;
      }).join('');

      html = `<div class="matches-grid__header-row" style="${gridCols}">
        ${headerRow}
      </div>
      ${daysSections}`;
    } else {
      // Single-day: no day headers, same as before
      const rows = renderSlotRows(timeSlots);
      html = `<div class="matches-grid__header-row" style="${gridCols}">
        ${headerRow}
      </div>
      <div class="matches-grid" style="${gridCols}">
        ${rows}
      </div>`;
    }

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

    const dateStr = Data.isMultiDay() ? shortDate(match.date) : '';
    const timeStr = match.time || (type === 'upcoming' ? 'TBD' : '');
    const dateTimeStr = dateStr && timeStr ? `${dateStr} · ${timeStr}` : (dateStr || timeStr);
    const statusLabel = `<span class="match-card__time">${dateTimeStr}</span>`;

    const team1Class = winner === 1 ? 'match-card__team--winner' : winner === 2 ? 'match-card__team--loser' : '';
    const team2Class = winner === 2 ? 'match-card__team--winner' : winner === 1 ? 'match-card__team--loser' : '';

    const scores1 = match.sets
      .filter(s => s.a > 0 || s.b > 0)
      .map(s => `<span class="match-card__set-score${s.a > s.b ? ' match-card__set-score--high' : ''}">${s.a}</span>`)
      .join('');

    const scores2 = match.sets
      .filter(s => s.a > 0 || s.b > 0)
      .map(s => `<span class="match-card__set-score${s.b > s.a ? ' match-card__set-score--high' : ''}">${s.b}</span>`)
      .join('');

    // Community Cup: show community logo + name instead of TBD pair strings,
    // and append match type to the round label (e.g. "Round 1 - Mixed").
    const ccMode = Data.isCommunityCupFormat && Data.isCommunityCupFormat();
    let team1HTML, team2HTML;
    // Shorten the long knockout round names for the card label (display only;
    // the sheet keeps the full values that standings/bracket logic keys off).
    const ROUND_SHORT = {
      'Semifinals': 'SF',
      'Consolation SF': 'Cons SF',
      'Consolation Final': 'Cons Finals',
      'Grand Final': 'Finals',
      '3rd Place': '3rd',
    };
    let roundLabel = ROUND_SHORT[match.round] || match.round || '';
    if (ccMode) {
      const cA = Data.getCommunityById ? Data.getCommunityById(match.communityA) : null;
      const cB = Data.getCommunityById ? Data.getCommunityById(match.communityB) : null;
      // Bracket-slot tokens (<A1>, <SF-1-W>, <SF-1-L>, ...) → readable placeholders.
      function placeholderLabel(token) {
        if (!token) return 'TBD';
        const t = String(token).replace(/[<>]/g, '').trim();
        let mm;
        if ((mm = t.match(/^([AB])([1-4])$/))) {
          return ({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' }[mm[2]]) + ' Group ' + mm[1];
        }
        if ((mm = t.match(/^(C?SF)-(\d+)-([WL])$/))) {
          return (mm[3] === 'W' ? 'Winner ' : 'Loser ') + (mm[1] === 'CSF' ? 'Cons. SF-' : 'SF-') + mm[2];
        }
        return t || 'TBD';
      }
      const aLabel = cA ? cA.name : placeholderLabel(match.communityA);
      const bLabel = cB ? cB.name : placeholderLabel(match.communityB);
      const aLogo = cA && cA.logoPath
        ? `<img class="match-card__cc-logo" src="${cA.logoPath}" alt="${aLabel}" onerror="this.style.display='none'">`
        : `<span class="match-card__cc-logo match-card__cc-logo--fallback">${(aLabel || '?').charAt(0).toUpperCase()}</span>`;
      const bLogo = cB && cB.logoPath
        ? `<img class="match-card__cc-logo" src="${cB.logoPath}" alt="${bLabel}" onerror="this.style.display='none'">`
        : `<span class="match-card__cc-logo match-card__cc-logo--fallback">${(bLabel || '?').charAt(0).toUpperCase()}</span>`;
      function renderAvatar(name) {
        const initial = ((name || '?').charAt(0).toUpperCase());
        const url = (Data.getPlayerAvatar && Data.getPlayerAvatar(name)) || null;
        if (url) {
          return `<img class="match-card__cc-avatar" src="${url}" alt="${name || ''}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'match-card__cc-avatar',textContent:'${initial}'}))">`;
        }
        return `<span class="match-card__cc-avatar">${initial}</span>`;
      }
      function firstName(full) {
        return String(full || '').trim().split(/[\s_]/)[0] || '';
      }
      function renderName(name) {
        const placeholderClass = name ? '' : ' match-card__cc-name--tbd';
        const label = name ? firstName(name) : 'TBD';
        return `<div class="match-card__cc-name-row${placeholderClass}">${label}</div>`;
      }
      const t1 = match.team1Players || [];
      const t2 = match.team2Players || [];
      team1HTML = `<div class="match-card__cc-team" aria-label="${aLabel}">
        <div class="match-card__cc-logo-wrap">${aLogo}</div>
        <div class="match-card__cc-avatars">${t1.map(p => renderAvatar(p.name)).join('')}</div>
        <div class="match-card__cc-names">${t1.map(p => renderName(p.name)).join('')}</div>
      </div>`;
      team2HTML = `<div class="match-card__cc-team" aria-label="${bLabel}">
        <div class="match-card__cc-logo-wrap">${bLogo}</div>
        <div class="match-card__cc-avatars">${t2.map(p => renderAvatar(p.name)).join('')}</div>
        <div class="match-card__cc-names">${t2.map(p => renderName(p.name)).join('')}</div>
      </div>`;
      if (match.matchType) {
        const typeText = match.matchType;  // short code: M / F / Mix
        const typeClass = 'match-card__cc-type--' + String(match.matchType).toLowerCase();
        // Knockout M/F matches carry a slot number in the Match ID (e.g. SF-1-M2);
        // show "#1"/"#2" for both. Group matches (R1-A-1-M) and Mixed have none.
        const slotMatch = String(match.matchId || '').match(/-(?:M|F)(\d+)$/);
        const slotSuffix = slotMatch ? ' #' + slotMatch[1] : '';
        roundLabel = `${roundLabel} - <span class="match-card__cc-type ${typeClass}">${typeText}${slotSuffix}</span>`;
      }
    } else {
      team1HTML = Data.getTeamStackedHTML(match.team1, 30);
      team2HTML = Data.getTeamStackedHTML(match.team2, 30);
    }

    // Round label: avoid leading "—" when there's no division text (CC mode).
    const divisionHTML = match.division
      ? `<span class="match-card__division">${match.division}</span> <span class="match-card__round-name">— ${roundLabel}</span>`
      : `<span class="match-card__round-name">${roundLabel}</span>`;

    return `<div class="match-card ${statusClass} ${roundClass}">
      <div class="match-card__status">
        <span class="match-card__round ${roundLabelClass}">${divisionHTML}</span>
        ${liveBadge || statusLabel}
      </div>
      <div class="match-card__teams">
        <div class="match-card__team ${team1Class}">
          ${team1HTML}
          <div class="match-card__scores">${scores1}</div>
        </div>
        <div class="match-card__team ${team2Class}">
          ${team2HTML}
          <div class="match-card__scores">${scores2}</div>
        </div>
      </div>
    </div>`;
  }

  // Sidebar: 2 matches per court (current + next, or last 2 done)
  function renderUpcoming(container, matches) {
    const validCourts = Data.getConfigList('courts').length > 0
      ? Data.getConfigList('courts')
      : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
    const courts = {};
    matches.forEach(m => {
      if (!m.date || !m.time) return;
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

      // Config-driven matches per court in sidebar (default: 2)
      const maxPicks = parseInt(Data.getConfig('sidebar_matches_per_court', '2'), 10);
      const picks = [];
      if (done.length > 0) picks.push(done[done.length - 1]);
      live.forEach(m => { if (picks.length < maxPicks) picks.push(m); });
      upcoming.forEach(m => { if (picks.length < maxPicks) picks.push(m); });
      for (let i = done.length - 2; i >= 0 && picks.length < maxPicks; i--) {
        picks.unshift(done[i]);
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
                ${isDone && scores ? `<span class="sidebar__match-score">${m.sets.filter(s=>s.a>0||s.b>0).map(s=>s.a).join(' ')}</span>` : `<span class="sidebar__match-time">${Data.isMultiDay() && shortDate(m.date) ? shortDate(m.date) + ' · ' : ''}${m.time || ''}</span>`}
              </div>
              <div class="sidebar__match-row">
                <span class="sidebar__match-team ${t2Class}">${m.team2 || 'TBD'}</span>
                ${isDone && scores ? `<span class="sidebar__match-score">${m.sets.filter(s=>s.a>0||s.b>0).map(s=>s.b).join(' ')}</span>` : isUpcoming && m.round ? `<span class="sidebar__match-time">${m.round}</span>` : ''}
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

  // ============================================================
  // Community Cup — All Matches table view
  // Clean tabular layout: Time · Court · Community A · Type · Community B · Score · Round
  // ============================================================
  function renderCC(container, matches) {
    if (!container) return;
    if (!matches || matches.length === 0) {
      container.innerHTML = '<div class="loading">No match data available</div>';
      return;
    }

    const sorted = matches.slice().sort(sortByDateTime);

    function communityCell(communityId, fallback) {
      const c = Data.getCommunityById && Data.getCommunityById(communityId);
      const label = c ? c.name : (communityId || fallback || 'TBD');
      const logo = c && c.logoPath
        ? `<img class="cc-matches__logo" src="${c.logoPath}" alt="${label}" onerror="this.style.display='none'">`
        : `<span class="cc-matches__logo cc-matches__logo--fallback">${(label || '?').charAt(0).toUpperCase()}</span>`;
      return `${logo}<span class="cc-matches__community-name">${label}</span>`;
    }

    const rows = sorted.map(m => {
      const aCell = communityCell(m.communityA, m.team1);
      const bCell = communityCell(m.communityB, m.team2);
      const set = (m.sets && m.sets[0]) ? m.sets[0] : { a: 0, b: 0 };
      const played = set.a > 0 || set.b > 0;
      const score = played ? `${set.a}–${set.b}` : '—';
      const typeText = m.matchType + (m.matchSlot && parseInt(m.matchSlot, 10) > 1 ? ' #' + m.matchSlot : '');
      const typeClass = `cc-matches__type cc-matches__type--${(m.matchType || '').toLowerCase()}`;
      return `<tr class="cc-matches__row">
        <td class="cc-matches__time">${m.time || ''}</td>
        <td class="cc-matches__court">${m.court || ''}</td>
        <td class="cc-matches__community cc-matches__community--a">${aCell}</td>
        <td class="cc-matches__type-cell"><span class="${typeClass}">${typeText}</span></td>
        <td class="cc-matches__community cc-matches__community--b">${bCell}</td>
        <td class="cc-matches__score">${score}</td>
        <td class="cc-matches__round">${m.round || ''}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="cc-matches">
        <table class="cc-matches__table">
          <thead>
            <tr class="cc-matches__head">
              <th>Time</th>
              <th>Court</th>
              <th>Community</th>
              <th>Type</th>
              <th>Community</th>
              <th>Score</th>
              <th>Round</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  return { render, renderUpcoming, renderCC };
})();
