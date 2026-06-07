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

  // Keep only the 7 most-recently-completed matches (by date/time) across the
  // whole view; always keep live + upcoming. Stops the All Matches grid from
  // growing without bound as results come in.
  const MAX_COMPLETED = 7;
  // The cap is config-driven via `matches_max_completed`:
  //   (empty/unset) → default 7 (live-projector behaviour, keeps the grid bounded)
  //   "all" / "0" / "unlimited" → show every completed match (full history)
  //   <positive integer> → keep that many most-recent completed matches
  // Default preserved so other competitions (e.g. Community Cup) are unchanged.
  function maxCompleted() {
    const v = String(Data.getConfig('matches_max_completed', '') || '').trim().toLowerCase();
    if (v === '') return MAX_COMPLETED;
    if (v === 'all' || v === '0' || v === 'unlimited') return Infinity;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : MAX_COMPLETED;
  }
  function capCompleted(matches) {
    const cap = maxCompleted();
    if (!Number.isFinite(cap)) return matches;   // unlimited → show all
    const done = matches.filter(m => hasScores(m) && !isLive(m)).sort(sortByDateTime);
    if (done.length <= cap) return matches;
    // Keep the most-recent `cap`, then expand back to the start of the
    // earliest kept time slot — otherwise the cap can cut through a slot and
    // leave a partial top row (e.g. only Court 5 showing). Whole rows only.
    const slotOf = m => (m.date || '') + '|' + (m.time || '');
    let start = done.length - cap;
    const boundary = slotOf(done[start]);
    while (start > 0 && slotOf(done[start - 1]) === boundary) start--;
    const keep = new Set(done.slice(start));
    return matches.filter(m => !(hasScores(m) && !isLive(m)) || keep.has(m));
  }

  // Auto-scroll is opt-in via the `matches_autoscroll` config key (default off).
  // When off the grid stays static and completed matches are capped (capCompleted).
  // When on the cap is lifted (show everything) and the view loop-scrolls — see
  // startAutoScroll below. lastMatchesHTML lets render() skip rebuilding identical
  // DOM on each ~5s poll.
  let lastMatchesHTML = '';

  function autoScrollEnabled() {
    return Data.getConfig('matches_autoscroll', 'false').toLowerCase() === 'true';
  }

  function render(container, matches) {
    // Only cap completed matches when auto-scroll is off; when on we want the full
    // list so there is something to scroll through.
    if (!autoScrollEnabled()) matches = capCompleted(matches);
    const courts = Data.getMatchesByCourt(matches);
    const courtNames = Object.keys(courts);

    if (courtNames.length === 0) {
      container.innerHTML = '<div class="loading">No match data available</div>';
      return;
    }

    // Sort all matches per court by date/time
    courtNames.forEach(c => courts[c].sort(sortByDateTime));

    // The first not-yet-played match in each court is effectively the one being
    // played right now (scores are entered after play). Mark it so the grid can
    // highlight it green as the "court in progress".
    const nextByCourt = new Set();
    courtNames.forEach(c => {
      const next = courts[c].find(m => !isLive(m) && !hasScores(m));
      if (next) nextByCourt.add(next);
    });

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
    // --court-min lets the mobile stylesheet widen each court column (defaults
    // to 0px on desktop, so the projector layout is unchanged).
    const gridCols = `grid-template-columns: repeat(${colCount}, minmax(var(--court-min, 0px), 1fr));`;
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
            return renderMatchCard(m, type, nextByCourt.has(m));
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

    // Footnote: explain the * once, only while some shown match is provisionally
    // seeded (knockout teams from a still-running group stage).
    if (matches.some(m => m.provisionalSeed)) {
      html += `<div class="matches-grid__footnote"><span class="match-card__prov-star">*</span> Seeding provisional until the group stage finishes</div>`;
    }

    // Only rebuild the DOM when the content actually changed, so the poll
    // (every ~5s) doesn't churn the grid.
    if (html !== lastMatchesHTML) {
      lastMatchesHTML = html;
      container.innerHTML = html;
    }
  }

  function renderMatchCard(match, type, isNext) {
    const winner = Data.getWinner(match);
    const roundLower = (match.round || '').toLowerCase();
    // Gold treatment is for the Main Draw final only — exclude the Consolation
    // Final (which also contains "final").
    const isConsolation = roundLower.includes('consolation');
    const isFinals = !isConsolation && roundLower.includes('final');
    const isThirdPlace = roundLower.includes('3rd place');
    const roundClass = isFinals ? 'match-card--finals' : isThirdPlace ? 'match-card--third-place' : '';
    const roundLabelClass = isFinals ? 'match-card__round--finals' : isThirdPlace ? 'match-card__round--third-place' : '';
    let statusClass = type === 'live' ? 'match-card--live' : type === 'upcoming' ? 'match-card--upcoming' : 'match-card--done';
    if (isNext) statusClass += ' match-card--next';

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
      'Round 1': 'R1',
      'Round 2': 'R2',
      'Round 3': 'R3',
      'Semifinals': 'SF',
      'Consolation SF': 'Cons SF',
      'Consolation Final': 'Cons Finals',
      'Consolation Finals': 'Cons Finals',
      'Grand Final': 'Finals',
      '3rd Place': '3rd',
    };
    let roundLabel = ROUND_SHORT[match.round] || match.round || '';
    if (ccMode) {
      // Resolve a community slot: direct id, or a clinched result-pointer token
      // (<SF-1-W>) that auto-advances to the real winner/loser once decided.
      function resolveCommunity(value) {
        let c = Data.getCommunityById ? Data.getCommunityById(value) : null;
        if (!c && Data.resolveSlotCommunityId) {
          const advancedId = Data.resolveSlotCommunityId(value);
          if (advancedId) c = Data.getCommunityById(advancedId);
        }
        return c;
      }
      const cA = resolveCommunity(match.communityA);
      const cB = resolveCommunity(match.communityB);
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
      function renderAvatar(name, id) {
        const initial = ((name || '?').charAt(0).toUpperCase());
        const url = (Data.getPlayerAvatar && Data.getPlayerAvatar(name)) || null;
        const avatarHTML = url
          ? `<img class="match-card__cc-avatar" src="${url}" alt="${name || ''}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'match-card__cc-avatar',textContent:'${initial}'}))">`
          : `<span class="match-card__cc-avatar">${initial}</span>`;
        // Flag overlay — same flag-icons style as the Groups page. Only when a
        // real name is shown (TBD slots get no flag) and the nationality is known.
        const nat = name && Data.getPlayerNationality ? Data.getPlayerNationality(name, id) : '';
        const code = (nat && window.TeamCard) ? TeamCard.countryCodeFor(nat) : '';
        const flag = code ? TeamCard.flagEmoji(code) : '';
        const flagHTML = flag
          ? `<span class="match-card__cc-flag" title="${TeamCard.escapeHtml(nat)}">${flag}</span>`
          : '';
        return `<span class="match-card__cc-avatar-wrap">${avatarHTML}${flagHTML}</span>`;
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
      // Only show real names when BOTH teams have a lineup entered. If either
      // side is missing its players, the match isn't set yet — render every
      // slot as TBD rather than a half-filled card.
      const bothHavePlayers = t1.some(p => p && p.name) && t2.some(p => p && p.name);
      const slotName = p => (bothHavePlayers && p ? p.name : '');
      team1HTML = `<div class="match-card__cc-team" aria-label="${aLabel}">
        <div class="match-card__cc-logo-wrap">${aLogo}</div>
        <div class="match-card__cc-avatars">${t1.map(p => renderAvatar(slotName(p), p && p.id)).join('')}</div>
        <div class="match-card__cc-names">${t1.map(p => renderName(slotName(p))).join('')}</div>
      </div>`;
      team2HTML = `<div class="match-card__cc-team" aria-label="${bLabel}">
        <div class="match-card__cc-logo-wrap">${bLogo}</div>
        <div class="match-card__cc-avatars">${t2.map(p => renderAvatar(slotName(p), p && p.id)).join('')}</div>
        <div class="match-card__cc-names">${t2.map(p => renderName(slotName(p))).join('')}</div>
      </div>`;
      if (match.matchType) {
        // Group rounds (R1-R3) have room for full Male/Female; knockout uses the
        // short code (M/F) since it carries a #1/#2 suffix. Mix stays "Mix".
        const isGroupStage = /^Round \d/.test(match.round || '');
        const typeText = isGroupStage
          ? ({ 'M': 'Male', 'F': 'Female' }[match.matchType] || match.matchType)
          : match.matchType;
        const typeClass = 'match-card__cc-type--' + String(match.matchType).toLowerCase();
        // Knockout M/F matches carry a slot number in the Match ID (e.g. SF-1-M2);
        // show "#1"/"#2" for both. Group matches (R1-A-1-M) and Mixed have none.
        const slotMatch = String(match.matchId || '').match(/-(?:M|F)(\d+)$/);
        const slotSuffix = slotMatch ? ' #' + slotMatch[1] : '';
        roundLabel = `${roundLabel} - <span class="match-card__cc-type ${typeClass}">${typeText}${slotSuffix}</span>`;
      }
    } else {
      // One-line team layout (inline avatars + country flags + team name),
      // same format as the Standings page. Code-keyed avatar+flag lookup with
      // a name-based fallback on older engines.
      // Provisional seeds (knockout teams pulled from a still-running group
      // stage): show the name in italics with a trailing * and a footnote below
      // the grid, so it's clear the matchup can still change.
      const prov = !!match.provisionalSeed;
      const inlineTeam = (code, name) => {
        const clean = (name || '').replace(/⁠/g, '').trim();
        const nm = name || 'TBD';
        let avatars;
        if (clean && / & | and /.test(clean)) {
          // Real two-player team ("A & B") → resolved avatars + flags by code.
          avatars = Data.getTeamAvatarFlagByCode
            ? Data.getTeamAvatarFlagByCode(code, clean, 30)
            : Data.getTeamAvatarsHTML(clean, 30);
        } else {
          // Placeholder / flow label ("Winner SF1", "Seed 1", "TBD") → TWO initial
          // circles split across the label's words (mirrors the knockout/bracket
          // views), so the card always shows a pair of avatar slots — not the lone
          // circle getTeamAvatarsHTML would render for a single-word label.
          const sz = 30;
          const words = (clean || nm).split(/\s+/).filter(Boolean);
          const i1 = (words[0] || '?').charAt(0).toUpperCase();
          const i2 = (words[1] ? words[1].charAt(0) : (words[0] || '').charAt(1) || '?').toUpperCase();
          const circle = t => `<span class="avatar avatar--fallback" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.45)}px">${t}</span>`;
          avatars = circle(i1) + circle(i2);
        }
        const nameHTML = prov
          ? `<span class="match-card__team-name match-card__team-name--provisional">${nm}<span class="match-card__prov-star">*</span></span>`
          : `<span class="match-card__team-name">${nm}</span>`;
        return `<div class="team-with-avatars">${avatars}${nameHTML}</div>`;
      };
      team1HTML = inlineTeam(match.team1Code, match.team1);
      team2HTML = inlineTeam(match.team2Code, match.team2);
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
        ${isNext ? '<div class="match-card__on-court">On<br>Court</div>' : ''}
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

  // ============================================================
  // All Matches auto-scroll (opt-in via `matches_autoscroll`)
  // Loops: pause at top → scroll down → pause at bottom → back to top, while the
  // matches view is active. app.js calls startAutoScroll when the view becomes
  // active and stopAutoScroll when it leaves. The loop reads scrollHeight /
  // clientHeight live each frame, so it tolerates late-arriving data and the poll
  // re-rendering the grid (which resets scrollTop to 0).
  // ============================================================
  let scrollRAF = null;

  function stopAutoScroll() {
    if (scrollRAF) {
      cancelAnimationFrame(scrollRAF);
      scrollRAF = null;
    }
  }

  function startAutoScroll(el) {
    stopAutoScroll();
    if (!el || !autoScrollEnabled()) return;

    // Fall back to 40 for blank/zero/negative/NaN — a non-positive speed would
    // never reach the bottom and stall the loop.
    const cfgSpeed = parseFloat(Data.getConfig('matches_autoscroll_speed', '40'));
    const pxPerSec = cfgSpeed > 0 ? cfgSpeed : 40;
    const TOP_PAUSE_MS = 2000;
    const BOTTOM_PAUSE_MS = 2000;

    el.scrollTop = 0;
    let phase = 'top-pause';     // top-pause → down → bottom-pause → (loop)
    let phaseStart = performance.now();
    let lastTs = phaseStart;

    function tick(ts) {
      const max = el.scrollHeight - el.clientHeight;
      const dt = ts - lastTs;
      lastTs = ts;

      // Nothing to scroll yet (data not loaded, or content fits) — hold at top
      // and keep polling so we start once content grows.
      if (max <= 4) {
        el.scrollTop = 0;
        phase = 'top-pause';
        phaseStart = ts;
        scrollRAF = requestAnimationFrame(tick);
        return;
      }

      if (phase === 'top-pause') {
        if (ts - phaseStart >= TOP_PAUSE_MS) phase = 'down';
      } else if (phase === 'down') {
        el.scrollTop = Math.min(max, el.scrollTop + pxPerSec * dt / 1000);
        if (el.scrollTop >= max - 1) {
          phase = 'bottom-pause';
          phaseStart = ts;
        }
      } else if (phase === 'bottom-pause') {
        if (ts - phaseStart >= BOTTOM_PAUSE_MS) {
          el.scrollTop = 0;
          phase = 'top-pause';
          phaseStart = ts;
        }
      }

      scrollRAF = requestAnimationFrame(tick);
    }

    scrollRAF = requestAnimationFrame(tick);
  }

  return { render, renderUpcoming, renderCC, startAutoScroll, stopAutoScroll };
})();
