/* ============================================
   View 3 & 4 — Knockout Brackets
   Power and Club divisions as separate views
   ============================================ */

const Bracket = (() => {

  const ROUND_ORDER = ['Quarters', 'Semi Finals', '3rd Place', 'Finals'];
  const ROUND_DISPLAY = {
    'Quarters': 'Quarter-Finals',
    'Semi Finals': 'Semi-Finals',
    '3rd Place': '3rd Place',
    'Finals': 'Final'
  };

  const shortDate = Data.shortDate;

  // Strip team codes like (PA3rd), (CB4th) from names
  function cleanTeamName(name) {
    if (!name) return '';
    return name.replace(/\s*\([A-Z]{2}\d*[a-z]*(?:\s*-\s*no team)?\)\s*$/, '').trim();
  }

  // Clean tier section title: "Power Tier 3 (3rd Place matches)" → "Tier 3"
  function cleanTierTitle(title) {
    return title.replace(/^(Power|Club)\s+/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
  }

  function render(container, division, title) {
    const data = Data.getKnockout(division);
    renderDivision(container, title, data);
  }

  function renderDivision(container, title, divData) {
    if (!divData || divData.matches.length === 0) {
      container.innerHTML = '<div class="loading">No knockout bracket data available</div>';
      return;
    }

    // Get main playoff matches
    const playoffMatches = divData.matches.filter(m =>
      ROUND_ORDER.includes(m.round)
    );

    // Group by round
    const rounds = {};
    playoffMatches.forEach(m => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    const presentRounds = ROUND_ORDER.filter(r => rounds[r] && rounds[r].length > 0);

    // Get tier matches
    const tierMatches = divData.matches.filter(m => m.round.startsWith('Tier'));
    const tiers = {};
    tierMatches.forEach(m => {
      if (!tiers[m.section]) tiers[m.section] = [];
      tiers[m.section].push(m);
    });

    // Render rounds, combining 3rd Place and Finals into one column
    const regularRounds = presentRounds.filter(r => r !== '3rd Place' && r !== 'Finals');
    const has3rd = rounds['3rd Place'] && rounds['3rd Place'].length > 0;
    const hasFinals = rounds['Finals'] && rounds['Finals'].length > 0;

    const html = `
      <div class="bracket-single">
        <div class="bracket-section__label">Knockout</div>
        <div class="bracket-division__title">${title}</div>
        <div class="bracket">
          ${regularRounds.map(roundKey => renderRound(roundKey, rounds[roundKey])).join('')}
          ${(has3rd || hasFinals) ? renderCombinedFinalsRound(rounds['3rd Place'] || [], rounds['Finals'] || []) : ''}
          ${renderChampion(divData.standings)}
        </div>
        ${Object.keys(tiers).length > 0 ? renderTiers(tiers) : ''}
      </div>`;

    container.innerHTML = html;
  }

  function renderRound(roundKey, roundMatches, hideTitle) {
    return `<div class="bracket__round">
      ${hideTitle ? '' : `<div class="bracket__round-title">${ROUND_DISPLAY[roundKey] || roundKey}</div>`}
      <div class="bracket__matches">
        ${roundMatches.map(m => renderBracketMatch(m)).join('')}
      </div>
    </div>`;
  }

  function renderCombinedFinalsRound(thirdPlaceMatches, finalsMatches) {
    const title = thirdPlaceMatches.length > 0 ? 'Final / 3rd Place' : 'Final';
    return `<div class="bracket__round">
      <div class="bracket__round-title">${title}</div>
      <div class="bracket__matches">
        ${finalsMatches.map(m => renderBracketMatch(m, 'bracket-match--gold')).join('')}
        ${thirdPlaceMatches.map(m => renderBracketMatch(m, 'bracket-match--bronze')).join('')}
      </div>
    </div>`;
  }

  // Ordered column keys for a knockout bracket: each regular round, then the
  // combined Final/3rd-place column ('Finals'), then the 'Standings' column.
  // The inline consolation mirrors these so its rounds line up under the
  // knockout's (e.g. consolation Semi-Finals under knockout Semi-Finals).
  function knockoutColumnKeys(divData) {
    const playoff = ((divData && divData.matches) || []).filter(m => ROUND_ORDER.includes(m.round));
    const rounds = {};
    playoff.forEach(m => { (rounds[m.round] = rounds[m.round] || []).push(m); });
    const present = ROUND_ORDER.filter(r => rounds[r] && rounds[r].length > 0);
    const keys = present.filter(r => r !== '3rd Place' && r !== 'Finals');
    if ((rounds['3rd Place'] && rounds['3rd Place'].length) ||
        (rounds['Finals'] && rounds['Finals'].length)) keys.push('Finals');
    keys.push('Standings');
    return keys;
  }

  // An empty column that occupies a round slot (keeps consolation aligned with
  // the knockout when the consolation has no match for that round).
  function emptyRound() {
    return `<div class="bracket__round bracket__round--empty"></div>`;
  }

  function renderBracketMatch(match, extraClass) {
    const team1Name = cleanTeamName(match.team1) || 'TBD';
    const team2Name = cleanTeamName(match.team2) || 'TBD';
    const winnerClean = cleanTeamName(match.winner || '');
    const isTeam1Winner = winnerClean && team1Name && winnerClean === team1Name;
    const isTeam2Winner = winnerClean && team2Name && winnerClean === team2Name;

    const team1Class = isTeam1Winner ? 'bracket-match__team--winner' :
                       isTeam2Winner ? 'bracket-match__team--loser' : '';
    const team2Class = isTeam2Winner ? 'bracket-match__team--winner' :
                       isTeam1Winner ? 'bracket-match__team--loser' : '';
    const team1TBD = !match.team1 ? 'bracket-match__team--tbd' : '';
    const team2TBD = !match.team2 ? 'bracket-match__team--tbd' : '';

    const validSets = match.sets ? match.sets.filter(s => s.a > 0 || s.b > 0) : [];
    const displayScore1 = validSets.length > 0
      ? validSets.map(s => `<span class="bracket-match__set${s.a > s.b ? ' bracket-match__set--high' : ''}">${s.a}</span>`).join('')
      : `<span class="bracket-match__set">${match.score1 != null ? match.score1 : ''}</span>`;
    const displayScore2 = validSets.length > 0
      ? validSets.map(s => `<span class="bracket-match__set${s.b > s.a ? ' bracket-match__set--high' : ''}">${s.b}</span>`).join('')
      : `<span class="bracket-match__set">${match.score2 != null ? match.score2 : ''}</span>`;

    const avatar = (code, name) => {
      const clean = (name || '').replace(/⁠/g, '').trim();
      // Real two-player team ("A & B") → resolved avatars + flags by team code.
      if (/ & | and /.test(clean)) {
        return Data.getTeamAvatarFlagByCode
          ? Data.getTeamAvatarFlagByCode(code, clean, 20)
          : Data.getTeamAvatarsHTML(clean, 20);
      }
      // Placeholder / flow label ("Seed 1", "Winner QF1", "TBD") → two initial
      // circles split across the label's words, e.g. "Seed 1" → "S" + "1".
      const words = clean.split(/\s+/).filter(Boolean);
      const i1 = (words[0] || '?').charAt(0).toUpperCase();
      const i2 = (words[1] ? words[1].charAt(0) : (words[0] || '').charAt(1)).toUpperCase();
      const circle = t => `<span class="avatar avatar--fallback" style="width:20px;height:20px">${t}</span>`;
      return circle(i1) + circle(i2);
    };
    const team1Avatars = avatar(match.team1Code, team1Name);
    const team1Content = `<div class="team-with-avatars">${team1Avatars}<span class="bracket-match__team-name">${team1Name}</span></div>`;
    const team2Avatars = avatar(match.team2Code, team2Name);
    const team2Content = `<div class="team-with-avatars">${team2Avatars}<span class="bracket-match__team-name">${team2Name}</span></div>`;

    const dateStr = Data.isMultiDay() ? shortDate(match.date) : '';
    const timeStr = match.time || '';
    const dateTimeStr = dateStr ? (timeStr ? `${dateStr} · ${timeStr}` : dateStr) : timeStr;
    const dateTimeHTML = dateTimeStr ? `<div class="bracket-match__datetime">${dateTimeStr}</div>` : '';

    return `<div class="bracket-match ${extraClass || ''}">
      ${dateTimeHTML}
      <div class="bracket-match__team ${team1Class} ${team1TBD}">
        ${team1Content}
        <div class="bracket-match__score">${displayScore1}</div>
      </div>
      <div class="bracket-match__team ${team2Class} ${team2TBD}">
        ${team2Content}
        <div class="bracket-match__score">${displayScore2}</div>
      </div>
    </div>`;
  }

  function renderChampion(standings, hideTitle) {
    if (!standings || standings.length === 0) return '';

    const placeClasses = ['bracket-match--gold', 'bracket-match--silver', 'bracket-match--bronze'];

    return `<div class="bracket__round">
      ${hideTitle ? '' : `<div class="bracket__round-title">Final Standings</div>`}
      <div class="bracket__matches">
        ${standings.slice(0, 3).map((s, i) => {
          const teamContent = `<div class="team-stacked__standing"><span class="team-stacked__place">${s.place}</span><span class="team-stacked__standing-team">${Data.getTeamStackedHTML(s.team, 18)}</span></div>`;
          return `<div class="bracket-match ${placeClasses[i]}">
            <div class="bracket-match__team">
              ${teamContent}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderTiers(tiers) {
    return `<div class="bracket-tiers">
      ${Object.entries(tiers).map(([section, matches]) => `
        <div class="bracket-tier">
          <div class="bracket-tier__title">${cleanTierTitle(section)}</div>
          <div class="bracket-tier__matches">
            ${matches.map(m => renderBracketMatch(m)).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  // Combined consolation view — one screen, all divisions. Each division shows
  // its Consolation Semi-Finals column then Final column. Driven by
  // Data.getConsolation(divisionName) (Matches rows with Round ~ "Consolation").
  function renderConsolationCombined(container, divisions) {
    const blocks = (divisions || []).map(d => {
      const data = Data.getConsolation(d.name);
      const ms = (data && data.matches) || [];
      const sf = ms.filter(m => m.round === 'Semi Finals');
      const fin = ms.filter(m => m.round === 'Finals');
      if (sf.length === 0 && fin.length === 0) {
        return `<div class="bracket-consolation__division">
          <div class="bracket-division__title">${d.name} — Consolation</div>
          <div class="loading">No consolation matches yet</div>
        </div>`;
      }
      return `<div class="bracket-consolation__division">
        <div class="bracket-division__title">${d.name} — Consolation</div>
        <div class="bracket">
          ${sf.length ? renderRound('Semi Finals', sf) : ''}
          ${fin.length ? renderRound('Finals', fin) : ''}
        </div>
      </div>`;
    });

    if (blocks.length === 0) {
      container.innerHTML = '<div class="loading">No consolation bracket data available</div>';
      return;
    }

    container.innerHTML = `
      <div class="bracket-single bracket-consolation">
        <div class="bracket-consolation__grid" style="display:flex;flex-wrap:wrap;gap:4vmin;justify-content:center;align-items:flex-start;">
          ${blocks.join('')}
        </div>
      </div>`;
  }

  // Append a single division's consolation bracket beneath its knockout, inside
  // the same division view. Compact "small bracket" (SF column + Final column).
  // No-ops when the division has no consolation matches. Driven by
  // Data.getConsolation(divisionName) (Matches rows with Round ~ "Consolation").
  function appendConsolation(container, divisionName) {
    if (!container || !Data.getConsolation) return false;
    const cons = Data.getConsolation(divisionName);
    const ms = (cons && cons.matches) || [];
    const sf = ms.filter(m => m.round === 'Semi Finals');
    const fin = ms.filter(m => m.round === 'Finals');
    if (sf.length === 0 && fin.length === 0) return false;

    // Mirror the knockout's column layout so the consolation's rounds line up
    // vertically with the knockout's, and add a Final Standings column to match.
    const ko = Data.getKnockout ? Data.getKnockout(divisionName) : null;
    const cols = (ko && knockoutColumnKeys(ko)) || ['Quarters', 'Semi Finals', 'Finals', 'Standings'];

    // Round titles are HIDDEN on the consolation — its columns line up under the
    // knockout's, whose titles already label them (no duplicate labels).
    const colHTML = cols.map(key => {
      if (key === 'Semi Finals') return sf.length ? renderRound('Semi Finals', sf, true) : emptyRound();
      if (key === 'Finals')      return fin.length ? renderRound('Finals', fin, true) : emptyRound();
      if (key === 'Standings')   return renderChampion(cons.standings, true) || emptyRound();
      return emptyRound();  // knockout-only rounds (e.g. Quarter-Finals) → spacer
    }).join('');

    const block = document.createElement('div');
    block.className = 'bracket-single bracket-consolation bracket-consolation--inline';
    block.innerHTML = `
      <div class="bracket-section__label">Consolation</div>
      <div class="bracket">${colHTML}</div>`;
    container.appendChild(block);
    return true;
  }

  return { render, renderConsolationCombined, appendConsolation };
})();
