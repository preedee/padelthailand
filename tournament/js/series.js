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

  // Render a single series card.
  function renderSeriesCard(series) {
    const aLabel = resolveLabel(series.communityA);
    const bLabel = resolveLabel(series.communityB);
    const aLogo = resolveLogo(series.communityA);
    const bLogo = resolveLogo(series.communityB);

    const result = Data.computeSeriesResult(series.id);
    const aWins = result.aWins;
    const bWins = result.bWins;
    const aWinning = aWins > bWins;
    const bWinning = bWins > aWins;

    const headerRight = series.startTime
      ? `<span class="series-card__time">${series.startTime}</span>`
      : '';

    function renderLogo(logoPath, label) {
      if (logoPath) {
        return `<img class="series-card__logo" src="${logoPath}" alt="${label}" onerror="this.style.display='none'">`;
      }
      const initial = (label || '?').charAt(0).toUpperCase();
      return `<span class="series-card__logo series-card__logo--fallback">${initial}</span>`;
    }

    return `
      <div class="series-card series-card--${series.stage || 'main'}" data-series-id="${series.id}">
        <div class="series-card__header">
          <span class="series-card__id">${series.id}</span>
          ${headerRight}
        </div>
        <div class="series-card__body">
          <div class="series-card__community${aWinning ? ' series-card__community--winning' : ''}">
            ${renderLogo(aLogo, aLabel)}
            <span class="series-card__name">${aLabel}</span>
            <span class="series-card__score">${aWins}</span>
          </div>
          <div class="series-card__community${bWinning ? ' series-card__community--winning' : ''}">
            ${renderLogo(bLogo, bLabel)}
            <span class="series-card__name">${bLabel}</span>
            <span class="series-card__score">${bWins}</span>
          </div>
        </div>
        ${renderMatchPills(series.id)}
      </div>
    `;
  }

  // Render a labeled section containing a grid of series cards.
  function renderSection(title, seriesArray) {
    if (seriesArray.length === 0) return '';
    const cards = seriesArray.map(renderSeriesCard).join('');
    return `
      <section class="cc-bracket__section">
        <h2 class="cc-bracket__section-title">${title}</h2>
        <div class="cc-bracket__series-grid">${cards}</div>
      </section>
    `;
  }

  // Main entry — render the bracket view.
  function renderBracket(container) {
    if (!container) return;
    const allSeries = Data.getSeries();
    if (allSeries.length === 0) {
      container.innerHTML = `<div class="loading">No series data available yet</div>`;
      return;
    }

    const r1A = allSeries.filter(s => s.id.startsWith('R1-A-'));
    const r1B = allSeries.filter(s => s.id.startsWith('R1-B-'));
    const mainKO = allSeries.filter(s =>
      s.stage === 'main' && !s.id.startsWith('R1-')
    );
    const consolation = allSeries.filter(s => s.stage === 'consolation');

    let html = `<div class="cc-bracket">`;
    html += renderSection('Round 1 — Group A', r1A);
    html += renderSection('Round 1 — Group B', r1B);
    html += renderSection('Main Draw', mainKO);
    html += renderSection('Consolation', consolation);
    html += `</div>`;
    container.innerHTML = html;
  }

  return {
    renderBracket,
    resolveLabel,
    renderSeriesCard
  };

})();
