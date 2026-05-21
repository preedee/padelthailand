/* ============================================
   Series module — Community Cup bracket renderer
   ============================================ */

const Series = (() => {

  // Resolve a community-slot value to a display label.
  // - "" / "TBD"                  → "TBD"
  // - "<A1>"-"<B4>"               → "Group A 1st" / "Group B 4th" etc.
  // - "<SF-1-W>" / "<CSF-2-L>"    → "Winner of SF-1" / "Loser of CSF-2"
  // - "coco-padel" etc.            → community.name from Data.getCommunityById
  function resolveLabel(value) {
    if (!value || value === 'TBD') return 'TBD';

    if (value.startsWith('<') && value.endsWith('>')) {
      const inner = value.slice(1, -1);

      // Group rank pointer: A1, A2, B1, B2, A3, A4, B3, B4
      const gr = inner.match(/^([AB])([1-4])$/);
      if (gr) {
        const ordinals = ['', '1st', '2nd', '3rd', '4th'];
        return `${ordinals[parseInt(gr[2], 10)]} Group ${gr[1]}`;
      }

      // Series-result pointer: SF-1-W, SF-2-L, CSF-1-W, CSF-2-L
      const sr = inner.match(/^(SF|CSF)-(\d+)-([WL])$/);
      if (sr) {
        const stage = sr[1] === 'CSF' ? 'Consolation SF' : 'SF';
        const which = sr[3] === 'W' ? 'Winner' : 'Loser';
        return `${which} of ${stage}-${sr[2]}`;
      }

      return inner; // unknown placeholder, show inner text
    }

    const community = Data.getCommunityById(value);
    return community ? community.name : value;
  }

  // Final-winner badges: Main Draw final → Champion (gold), Consolation final → Plate (silver).
  const CHAMPION_BADGE = { rowClass: 'cc-series-card__team--champion', badgeClass: 'cc-champion-badge', badgeText: '🏆 Champion' };
  const PLATE_BADGE    = { rowClass: 'cc-series-card__team--plate',    badgeClass: 'cc-plate-badge',    badgeText: '🏅 Plate Winner' };

  // Spell out a series ID for display: SF-1 → "Semi-Final 1", F → "Final",
  // 3P → "3rd Place", CSF-2 → "Consolation Semi-Final 2", CF → "Consolation Final".
  function seriesIdLabel(id) {
    const fixed = { 'F': 'Final', '3P': '3rd Place', 'CF': 'Consolation Final' };
    if (fixed[id]) return fixed[id];
    let m = id.match(/^SF-(\d+)$/);
    if (m) return `Semi-Final ${m[1]}`;
    m = id.match(/^CSF-(\d+)$/);
    if (m) return `Consolation Semi-Final ${m[1]}`;
    return id;
  }

  // Logo path for a community slot — only if value is a real community ID
  function resolveLogo(value) {
    if (!value || value === 'TBD') return null;
    if (value.startsWith('<')) return null;
    const community = Data.getCommunityById(value);
    return community ? community.logoPath : null;
  }

  // Render the matches inside a series as compact pills.
  // Each match becomes "M: 9-6", "F: 9-7", "Mix: 6-9" (superset = use Set 1 totals).
  function renderMatchPills(seriesId) {
    const matches = Data.getMatchesBySeriesId(seriesId);
    if (matches.length === 0) {
      return `<div class="series-card__matches series-card__matches--empty">No matches scheduled yet</div>`;
    }
    // Sort by Match Slot, then by Match Type order (M, F, Mix)
    const typeOrder = { M: 0, F: 1, Mix: 2 };
    const sorted = matches.slice().sort((a, b) => {
      const slotDiff = (parseInt(a.matchSlot) || 1) - (parseInt(b.matchSlot) || 1);
      if (slotDiff !== 0) return slotDiff;
      return (typeOrder[a.matchType] || 9) - (typeOrder[b.matchType] || 9);
    });
    const pills = sorted.map(m => {
      const a = m.sets && m.sets[0] ? m.sets[0].a : 0;
      const b = m.sets && m.sets[0] ? m.sets[0].b : 0;
      const played = (a > 0 || b > 0);
      const score = played ? `${a}-${b}` : '–';
      const typeLabel = m.matchType + (m.matchSlot && parseInt(m.matchSlot) > 1 ? '#' + m.matchSlot : '');
      return `<span class="series-card__match${played ? '' : ' series-card__match--pending'}">${typeLabel}: ${score}</span>`;
    }).join('');
    return `<div class="series-card__matches">${pills}</div>`;
  }

  // Render a single SERIES as a match-card — same design as the All Matches
  // tab (community logo + name + series score) so the two tabs stay visually
  // consistent. accentClass adds the gold (final) / bronze (3rd place) border.
  function renderSeriesCard(series, accentClass, winnerBadge) {
    const aLabel = resolveLabel(series.communityA);
    const bLabel = resolveLabel(series.communityB);
    const aLogo = resolveLogo(series.communityA);
    const bLogo = resolveLogo(series.communityB);

    const result = Data.computeSeriesResult(series.id);
    const aWins = result.aWins;
    const bWins = result.bWins;
    const aWinning = result.complete && result.winnerCommunityId === series.communityA;
    const bWinning = result.complete && result.winnerCommunityId === series.communityB;
    const aTBD = !series.communityA || series.communityA === 'TBD' || series.communityA.startsWith('<');
    const bTBD = !series.communityB || series.communityB === 'TBD' || series.communityB.startsWith('<');

    function logoHTML(logoPath, label) {
      if (logoPath) {
        return `<img class="match-card__cc-logo" src="${logoPath}" alt="${label}" onerror="this.style.display='none'">`;
      }
      const initial = (label || '?').charAt(0).toUpperCase();
      return `<span class="match-card__cc-logo match-card__cc-logo--fallback">${initial}</span>`;
    }

    function teamRow(label, logo, winning, tbd, wins, teamClass) {
      const nameClass = tbd ? ' match-card__cc-name--tbd' : '';
      const showBadge = winnerBadge && winning;
      const badgeRowClass = showBadge ? ' ' + winnerBadge.rowClass : '';
      const badge = showBadge ? `<span class="${winnerBadge.badgeClass}">${winnerBadge.badgeText}</span>` : '';
      return `<div class="match-card__team ${teamClass}${badgeRowClass}">
        <div class="match-card__cc-team">
          <div class="match-card__cc-logo-wrap">${logo}</div>
          <div class="match-card__cc-names"><div class="match-card__cc-name-row${nameClass}">${label}${badge}</div></div>
        </div>
        <div class="match-card__scores"><span class="match-card__set-score${winning ? ' match-card__set-score--high' : ''}">${wins}</span></div>
      </div>`;
    }

    const t1Class = aWinning ? 'match-card__team--winner' : bWinning ? 'match-card__team--loser' : '';
    const t2Class = bWinning ? 'match-card__team--winner' : aWinning ? 'match-card__team--loser' : '';
    const meta = `${series.startTime ? series.startTime + ' · ' : ''}${seriesIdLabel(series.id)}`;

    return `<div class="match-card cc-series-card ${accentClass || ''}" data-series-id="${series.id}">
      <div class="match-card__status">
        <span class="match-card__round">${meta}</span>
      </div>
      <div class="match-card__teams">
        ${teamRow(aLabel, logoHTML(aLogo, aLabel), aWinning, aTBD, aWins, t1Class)}
        ${teamRow(bLabel, logoHTML(bLogo, bLabel), bWinning, bTBD, bWins, t2Class)}
      </div>
    </div>`;
  }

  // Semi-Finals column → Final column flow (the championship path).
  function renderFlow(sf, grandFinal, finalWinnerBadge) {
    const sfColumn = sf.length > 0 ? `
      <div class="cc-bracket-col">
        <div class="cc-bracket-round-title">Semi-Finals</div>
        ${sf.map(s => renderSeriesCard(s)).join('')}
      </div>` : '';
    const finalColumn = grandFinal.length > 0 ? `
      <div class="cc-bracket-col cc-bracket-col--final">
        <div class="cc-bracket-round-title">Final</div>
        ${grandFinal.map(s => renderSeriesCard(s, 'match-card--finals', finalWinnerBadge)).join('')}
      </div>` : '';
    return `<div class="cc-bracket-flow">${sfColumn}${finalColumn}</div>`;
  }

  // 3rd Place — its own area, separate from the Final.
  function renderThirdPlace(thirdPlace) {
    if (thirdPlace.length === 0) return '';
    return `<div class="cc-bracket-thirdplace">
      <div class="cc-bracket-round-title">3rd Place</div>
      ${thirdPlace.map(s => renderSeriesCard(s, 'match-card--third-place')).join('')}
    </div>`;
  }

  // Main Draw bracket — own tab (Semi-Finals → Final, with 3rd Place separate).
  function renderBracket(container) {
    if (!container) return;
    const allSeries = Data.getSeries();
    if (allSeries.length === 0) {
      container.innerHTML = `<div class="loading">No series data available yet</div>`;
      return;
    }

    const mainSF = allSeries.filter(s => s.id === 'SF-1' || s.id === 'SF-2');
    const grandFinal = allSeries.filter(s => s.id === 'F');
    const thirdPlace = allSeries.filter(s => s.id === '3P');

    if (mainSF.length === 0 && grandFinal.length === 0) {
      container.innerHTML = `<div class="loading">Knockout bracket — fills in after Round 1</div>`;
      return;
    }

    container.innerHTML = `<div class="cc-bracket-page">
      ${renderFlow(mainSF, grandFinal, CHAMPION_BADGE)}
      ${renderThirdPlace(thirdPlace)}
    </div>`;
  }

  // Consolation bracket — own tab (Semi-Finals → Final).
  function renderConsolation(container) {
    if (!container) return;
    const allSeries = Data.getSeries();
    if (allSeries.length === 0) {
      container.innerHTML = `<div class="loading">No series data available yet</div>`;
      return;
    }

    const consolationSF = allSeries.filter(s => s.id === 'CSF-1' || s.id === 'CSF-2');
    const consolationFinal = allSeries.filter(s => s.id === 'CF');

    if (consolationSF.length === 0 && consolationFinal.length === 0) {
      container.innerHTML = `<div class="loading">Consolation bracket — fills in after Round 1</div>`;
      return;
    }

    container.innerHTML = `<div class="cc-bracket-page">
      ${renderFlow(consolationSF, consolationFinal, PLATE_BADGE)}
    </div>`;
  }

  return {
    renderBracket,
    renderConsolation,
    resolveLabel,
    renderSeriesCard
  };

})();
