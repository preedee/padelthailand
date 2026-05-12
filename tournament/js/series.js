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

  // Render a single SERIES as a bracket-match card (RPA-style bracket layout).
  // Uses the existing .bracket-match CSS hooks so styling is consistent.
  function renderSeriesCard(series, extraClass) {
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
        return `<img class="bracket-match__logo" src="${logoPath}" alt="${label}" onerror="this.style.display='none'">`;
      }
      const initial = (label || '?').charAt(0).toUpperCase();
      return `<span class="bracket-match__logo bracket-match__logo--fallback">${initial}</span>`;
    }

    const t1Class = aWinning ? 'bracket-match__team--winner'
                  : bWinning ? 'bracket-match__team--loser'
                  : (aTBD ? 'bracket-match__team--tbd' : '');
    const t2Class = bWinning ? 'bracket-match__team--winner'
                  : aWinning ? 'bracket-match__team--loser'
                  : (bTBD ? 'bracket-match__team--tbd' : '');

    const meta = `${series.id}${series.startTime ? ' · ' + series.startTime : ''}`;

    return `<div class="bracket-match ${extraClass || ''}" data-series-id="${series.id}">
      <div class="bracket-match__datetime">${meta}</div>
      <div class="bracket-match__team ${t1Class}">
        <div class="bracket-match__community">
          ${logoHTML(aLogo, aLabel)}
          <span class="bracket-match__team-name">${aLabel}</span>
        </div>
        <div class="bracket-match__score"><span class="bracket-match__set${aWinning ? ' bracket-match__set--high' : ''}">${aWins}</span></div>
      </div>
      <div class="bracket-match__team ${t2Class}">
        <div class="bracket-match__community">
          ${logoHTML(bLogo, bLabel)}
          <span class="bracket-match__team-name">${bLabel}</span>
        </div>
        <div class="bracket-match__score"><span class="bracket-match__set${bWinning ? ' bracket-match__set--high' : ''}">${bWins}</span></div>
      </div>
    </div>`;
  }

  // Render one bracket tree (Semi-Finals column → Final/3rd Place column).
  function renderBracketTree(title, sf, grandFinal, thirdPlace) {
    if (sf.length === 0 && grandFinal.length === 0) return '';
    const sfColumn = sf.length > 0 ? `
      <div class="bracket__round">
        <div class="bracket__round-title">Semi-Finals</div>
        <div class="bracket__matches">
          ${sf.map(s => renderSeriesCard(s)).join('')}
        </div>
      </div>` : '';

    const hasThird = thirdPlace.length > 0;
    const hasFinal = grandFinal.length > 0;
    const finalLabel = hasThird && hasFinal ? 'Final / 3rd Place' : (hasFinal ? 'Final' : '3rd Place');
    const finalColumn = (hasFinal || hasThird) ? `
      <div class="bracket__round">
        <div class="bracket__round-title">${finalLabel}</div>
        <div class="bracket__matches">
          ${grandFinal.map(s => renderSeriesCard(s, 'bracket-match--gold')).join('')}
          ${thirdPlace.map(s => renderSeriesCard(s, 'bracket-match--bronze')).join('')}
        </div>
      </div>` : '';

    return `<div class="bracket-single">
      <div class="bracket-division__title">${title}</div>
      <div class="bracket">
        ${sfColumn}
        ${finalColumn}
      </div>
    </div>`;
  }

  // Main entry — render the Round 2 bracket view as two parallel trees.
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
    const consolationSF = allSeries.filter(s => s.id === 'CSF-1' || s.id === 'CSF-2');
    const consolationFinal = allSeries.filter(s => s.id === 'CF');

    if (mainSF.length === 0 && consolationSF.length === 0) {
      container.innerHTML = `<div class="loading">Knockout bracket — fills in after Round 1</div>`;
      return;
    }

    const mainHTML = renderBracketTree('Main Draw', mainSF, grandFinal, thirdPlace);
    const consolationHTML = renderBracketTree('Consolation', consolationSF, consolationFinal, []);

    container.innerHTML = `<div class="cc-bracket-trees">${mainHTML}${consolationHTML}</div>`;
  }

  return {
    renderBracket,
    resolveLabel,
    renderSeriesCard
  };

})();
