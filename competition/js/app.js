/* ============================================
   App Controller — dynamic views from config
   ============================================ */

const App = (() => {
  let VIEWS = [];           // rotating views (standings + brackets)
  let ALL_VIEWS = [];       // all views including manual-only (matches)
  let ROTATION_INTERVAL = 25000;
  let currentViewIndex = 0;
  let rotationTimer = null;
  let isRotating = true;
  let viewsBuilt = false;

  // Capture the original page path before <base> tag affects relative URLs
  const originalPath = window.location.pathname;

  // Division config: each has a standings tab, a bracket, and a slug
  let divisions = [];       // [{ name, slug, standingsTab }]
  let combinedStandings = false;  // config-gated: all divisions' standings on one view
  let combinedBrackets = false;   // config-gated: all divisions' knockout on one view
  let divisionBracketPages = false; // config-gated: per-division page = its KO + Consolation

  function init() {
    // Keyboard nav: arrow keys to switch views, space to pause/resume
    document.addEventListener('keydown', (e) => {
      if (VIEWS.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        switchToView((currentViewIndex + 1) % VIEWS.length);
        resetRotation();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        switchToView((currentViewIndex - 1 + VIEWS.length) % VIEWS.length);
        resetRotation();
      } else if (e.key === ' ') {
        e.preventDefault();
        toggleRotation();
      }
    });

    // Home link: click event logo to go back to first view and restart rotation
    const homeLink = document.getElementById('home-link');
    if (homeLink) {
      homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (VIEWS.length > 0) {
          switchToView(0);
          history.replaceState(null, '', originalPath);
          const autorotate = Data.getConfig('autorotate', 'true').toLowerCase() !== 'false';
          const isMobile = window.innerWidth < 768;
          if (!isMobile && autorotate && VIEWS.length > 1) {
            resetRotation();
          }
        }
      });
    }

    // Start data polling
    Data.startPolling(onDataUpdate);
  }

  function toSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function buildViews() {
    if (viewsBuilt) return;

    // Read divisions from config
    const divisionNames = Data.getConfigList('divisions');
    const standingsTabs = Data.getConfigList('standings_tabs');

    if (divisionNames.length === 0) return; // config not loaded yet

    // Build division info — map each division to its standings tab
    divisions = divisionNames.map((name, i) => ({
      name: name,
      slug: toSlug(name),
      standingsTab: standingsTabs[i] || name + ' Standings'
    }));

    // Check if home page is enabled
    const showHomePage = Data.getConfig('show_home_page', 'false').toLowerCase() === 'true';

    // Combined standings: show every division's standings on ONE view (config-gated,
    // only meaningful with 2+ divisions). Off by default → per-division views as before.
    combinedStandings = Data.getConfig('combined_standings', 'false').toLowerCase() === 'true'
      && divisions.length > 1;

    // Build all view IDs
    const standingsViews = combinedStandings ? ['standings'] : divisions.map(d => d.slug + '-standings');
    combinedBrackets = Data.getConfig('combined_brackets', 'false').toLowerCase() === 'true'
      && divisions.length > 1;
    // Per-division pages (Gold/Silver), each = that division's Knockout + Consolation.
    // Overrides combined brackets and the standalone consolation tab.
    divisionBracketPages = Data.getConfig('division_bracket_pages', 'false').toLowerCase() === 'true'
      && divisions.length > 0;
    if (divisionBracketPages) combinedBrackets = false;
    const bracketViews = combinedBrackets ? ['bracket'] : divisions.map(d => d.slug + '-bracket');

    // Consolation: single combined view across all divisions (config-gated).
    // Off by default → RPA/LPS and other division comps are unaffected.
    const showConsolation = !divisionBracketPages
      && Data.getConfig('show_consolation', 'false').toLowerCase() === 'true';

    // All possible views
    ALL_VIEWS = [];
    if (showHomePage) ALL_VIEWS.push('home');
    ALL_VIEWS.push(...standingsViews, ...bracketViews);
    if (showConsolation) ALL_VIEWS.push('consolation');
    ALL_VIEWS.push('matches');

    // Determine which views to include in rotation from config
    // Accepts specific view IDs (e.g. "home, male-amateur-standings, power-bracket, matches")
    const rotationConfig = Data.getConfigList('rotation_views');
    if (rotationConfig.length === 0) {
      // Default: home (if enabled) + all standings + all brackets (not matches)
      VIEWS = [];
      if (showHomePage) VIEWS.push('home');
      VIEWS.push(...standingsViews, ...bracketViews);
      if (showConsolation) VIEWS.push('consolation');
    } else {
      // Filter to only valid view IDs
      VIEWS = rotationConfig
        .map(v => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
        .filter(v => ALL_VIEWS.includes(v));
    }

    // Custom tab labels from config (optional)
    // Order: standings labels for each division, then bracket labels for each division
    const customLabels = Data.getConfigList('tab_labels');

    // Check nav style
    const navStyle = Data.getConfig('nav_style', 'single-row');

    // Generate nav tabs
    const viewBar = document.getElementById('view-bar');
    let tabsHTML = '';

    if (navStyle === 'two-row') {
      // ===== TWO-ROW NAV =====
      // Row 1: View types (Home, Standings, Brackets, All Matches) + dots
      tabsHTML += `<div class="view-bar__row view-bar__row--primary">`;
      if (showHomePage) {
        tabsHTML += `<button class="view-bar__tab view-bar__type-tab active" data-type="home">Home</button>`;
      }
      tabsHTML += `<button class="view-bar__tab view-bar__type-tab${!showHomePage ? ' active' : ''}" data-type="standings">Standings</button>`;
      if (divisionBracketPages) {
        divisions.forEach(d => {
          tabsHTML += `<button class="view-bar__tab view-bar__type-tab" data-type="${d.slug}">${d.name}</button>`;
        });
      } else {
        tabsHTML += `<button class="view-bar__tab view-bar__type-tab" data-type="bracket">Knockout</button>`;
        if (showConsolation) {
          tabsHTML += `<button class="view-bar__tab view-bar__type-tab" data-type="consolation">Consolation</button>`;
        }
      }
      tabsHTML += `<button class="view-bar__tab view-bar__type-tab" data-type="matches">All Matches</button>`;
      tabsHTML += `<div class="view-bar__dots">`;
      VIEWS.forEach((_, i) => {
        tabsHTML += `<span class="view-bar__dot${i === 0 ? ' active' : ''}"></span>`;
      });
      tabsHTML += `</div>`;
      tabsHTML += `</div>`;

      // Row 2: Division selector — only when some view is still per-division. With
      // standings AND brackets combined, nothing selects a division → drop the row.
      const hasDivisionTabs = !divisionBracketPages && (!combinedStandings || !combinedBrackets);
      if (hasDivisionTabs) {
        const initialType = showHomePage ? 'home' : 'standings';
        const showInitialDivision = (initialType === 'standings' || initialType === 'bracket');
        tabsHTML += `<div class="view-bar__row view-bar__row--secondary">`;
        divisions.forEach((d, i) => {
          const active = (showInitialDivision && i === 0) ? ' active' : '';
          tabsHTML += `<button class="view-bar__tab view-bar__div-tab${active}" data-division="${d.slug}">${d.name}</button>`;
        });
        tabsHTML += `</div>`;
      }

      viewBar.innerHTML = tabsHTML;
      if (hasDivisionTabs) viewBar.classList.add('view-bar--two-row');

      // Track current type and division for two-row nav
      let currentType = showHomePage ? 'home' : 'standings';
      let currentDivision = divisions[0].slug;

      function resolveViewId(type, division) {
        if (type === 'home') return 'home';
        if (type === 'matches') return 'matches';
        if (type === 'consolation') return 'consolation';
        if (type === 'standings' && combinedStandings) return 'standings';
        if (type === 'bracket' && combinedBrackets) return 'bracket';
        if (divisionBracketPages && divisions.some(d => d.slug === type)) return type + '-bracket';
        return division + '-' + type;
      }

      function updateTwoRowNav(type, division) {
        currentType = type;
        currentDivision = division;

        // Update type tabs
        viewBar.querySelectorAll('.view-bar__type-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.type === type);
        });

        // Update division tabs — deselect all for Home/Matches, highlight for Standings/Brackets
        const showDivisionHighlight = (type === 'bracket' && !combinedBrackets) || (type === 'standings' && !combinedStandings);
        viewBar.querySelectorAll('.view-bar__div-tab').forEach(t => {
          t.classList.toggle('active', showDivisionHighlight && t.dataset.division === division);
        });
      }

      // Wire up type tab clicks
      viewBar.querySelectorAll('.view-bar__type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const type = tab.dataset.type;
          // For Standings/Brackets, ensure a division is selected (default to first)
          const division = (type === 'standings' || type === 'bracket')
            ? (currentDivision || divisions[0].slug)
            : currentDivision;
          updateTwoRowNav(type, division);
          const viewId = resolveViewId(type, division);
          const idx = VIEWS.indexOf(viewId);
          if (idx !== -1) {
            switchToView(idx);
            resetRotation();
          } else if (ALL_VIEWS.includes(viewId)) {
            showManualView(viewId);
            stopRotation();
          }
        });
      });

      // Wire up division tab clicks — switch to current type + new division
      viewBar.querySelectorAll('.view-bar__div-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const division = tab.dataset.division;
          // If current type is a global view (Home/Matches/Consolation), default to Standings
          const type = (currentType === 'home' || currentType === 'matches' || currentType === 'consolation') ? 'standings' : currentType;
          updateTwoRowNav(type, division);
          const viewId = resolveViewId(type, division);
          const idx = VIEWS.indexOf(viewId);
          if (idx !== -1) {
            switchToView(idx);
            resetRotation();
          } else if (ALL_VIEWS.includes(viewId)) {
            showManualView(viewId);
            stopRotation();
          }
        });
      });

      // Override switchToView to also update two-row nav state
      const origSwitchToView = switchToView;
      switchToView = function(index, skipHash) {
        origSwitchToView(index, skipHash);
        const viewName = VIEWS[index];
        if (viewName === 'home') {
          updateTwoRowNav('home', currentDivision);
        } else if (viewName === 'matches') {
          updateTwoRowNav('matches', currentDivision);
        } else if (viewName === 'standings') {
          updateTwoRowNav('standings', currentDivision);
        } else if (viewName === 'bracket') {
          updateTwoRowNav('bracket', currentDivision);
        } else if (divisionBracketPages && viewName.endsWith('-bracket')) {
          const slug = viewName.slice(0, -('-bracket'.length));
          updateTwoRowNav(slug, slug);
        } else {
          // Parse "slug-type" from view name
          const parts = viewName.split('-');
          const type = parts[parts.length - 1]; // "standings" or "bracket"
          const divSlug = parts.slice(0, -1).join('-');
          updateTwoRowNav(type, divSlug);
        }
      };

      const origShowManualView = showManualView;
      showManualView = function(viewName, skipHash) {
        origShowManualView(viewName, skipHash);
        if (viewName === 'matches') {
          updateTwoRowNav('matches', currentDivision);
        }
      };

    } else {
      // ===== SINGLE-ROW NAV (original) =====
      let tabIndex = 0;

      // Home tab (if enabled)
      if (showHomePage) {
        tabsHTML += `<button class="view-bar__tab active" data-view="home">Home</button>`;
      }

      // Standings tabs — one combined tab, or one per division
      if (combinedStandings) {
        const active = !showHomePage ? ' active' : '';
        const label = customLabels[tabIndex] || 'Standings';
        tabsHTML += `<button class="view-bar__tab${active}" data-view="standings">${label}</button>`;
        tabIndex++;
      } else {
        divisions.forEach((d, i) => {
          const viewId = d.slug + '-standings';
          const active = (!showHomePage && i === 0) ? ' active' : '';
          const label = customLabels[tabIndex] || (d.name + ' Standings');
          tabsHTML += `<button class="view-bar__tab${active}" data-view="${viewId}">${label}</button>`;
          tabIndex++;
        });
      }

      // Bracket tabs — one combined "Knockout" tab, or one per division
      if (combinedBrackets) {
        const label = customLabels[tabIndex] || 'Knockout';
        tabsHTML += `<button class="view-bar__tab" data-view="bracket">${label}</button>`;
        tabIndex++;
      } else {
        divisions.forEach(d => {
          const viewId = d.slug + '-bracket';
          const label = customLabels[tabIndex] || (divisionBracketPages ? d.name : (d.name + ' Bracket'));
          tabsHTML += `<button class="view-bar__tab" data-view="${viewId}">${label}</button>`;
          tabIndex++;
        });
      }

      // Consolation tab (single combined, config-gated)
      if (showConsolation) {
        tabsHTML += `<button class="view-bar__tab" data-view="consolation">Consolation</button>`;
      }

      // All Matches tab (manual only, pushed right)
      tabsHTML += `<button class="view-bar__tab view-bar__tab--right" data-view="matches">All Matches</button>`;

      // Rotation dots
      tabsHTML += `<div class="view-bar__dots">`;
      VIEWS.forEach((_, i) => {
        tabsHTML += `<span class="view-bar__dot${i === 0 ? ' active' : ''}"></span>`;
      });
      tabsHTML += `</div>`;

      viewBar.innerHTML = tabsHTML;
    }

    // Generate view sections
    const mainContent = document.getElementById('main-content');
    let viewsHTML = '';

    // Home page view (if enabled)
    if (showHomePage) {
      const homeLogo = Data.getConfig('home_logo', '');
      const homeText = Data.getConfig('home_text', 'Powered by');
      const homePartnerLogo = Data.getConfig('home_partner_logo', '');
      const homeLogoDesktop = Data.getConfig('home_logo_size_desktop', '60');
      const homePartnerDesktop = Data.getConfig('home_partner_logo_size_desktop', '40');
      const homeTextDesktop = Data.getConfig('home_text_size_desktop', '1.5');
      const homeTextMobile = Data.getConfig('home_text_size_mobile', '4');
      const homeLogoMobile = Data.getConfig('home_logo_size_mobile', '60');
      const homePartnerMobile = Data.getConfig('home_partner_logo_size_mobile', '40');
      const homeBg = Data.getConfig('home_bg', '');
      const gapLogoText = Data.getConfig('home_gap_logo_text', '2');
      const gapTextPartner = Data.getConfig('home_gap_text_partner', '2');
      const homeLogoMaxH = Data.getConfig('home_logo_max_height', '50');
      const homePartnerMaxH = Data.getConfig('home_partner_logo_max_height', '30');
      const homePaddingTop = Data.getConfig('home_padding_top', '2');
      const tournamentName = Data.getConfig('tournament_name', '');

      // Inject responsive sizes as CSS
      // Use max-width in vmin for horizontal sizing, max-height capped to % of container
      const logoStyle = document.createElement('style');
      logoStyle.textContent = `
        .home-page { gap: 0 !important; overflow: hidden; }
        .home-page__event-logo { max-width: ${homeLogoDesktop}vmin !important; max-height: ${homeLogoMaxH}% !important; margin-top: ${homePaddingTop}vmin; margin-bottom: ${gapLogoText}vmin; }
        .home-page__powered { margin-bottom: ${gapTextPartner}vmin; font-size: ${homeTextDesktop}vmin !important; }
        .home-page__partner-logo { max-width: ${homePartnerDesktop}vmin !important; max-height: ${homePartnerMaxH}% !important; }
        @media (max-width: 768px) {
          .home-page__event-logo { max-width: ${homeLogoMobile}vmin !important; max-height: ${homeLogoMaxH}% !important; }
          .home-page__partner-logo { max-width: ${homePartnerMobile}vmin !important; max-height: ${homePartnerMaxH}% !important; }
          .home-page__powered { font-size: ${homeTextMobile}vmin !important; }
        }`;
      document.head.appendChild(logoStyle);

      const active = ' active';
      viewsHTML += `<section class="view${active}" id="view-home">
        <div class="home-page"${homeBg ? ` style="background:${homeBg}"` : ''}>
          ${homeLogo ? `<img class="home-page__event-logo" src="${homeLogo}" alt="${tournamentName}">` : ''}
          ${homeText ? `<div class="home-page__powered">${homeText}</div>` : ''}
          ${homePartnerLogo ? `<img class="home-page__partner-logo" src="${homePartnerLogo}" alt="Partner">` : ''}
        </div>
      </section>`;
    }

    // Standings views — one combined section, or one per division
    const firstNonHome = !showHomePage;
    if (combinedStandings) {
      const active = firstNonHome ? ' active' : '';
      viewsHTML += `<section class="view${active}" id="view-standings">
        <div class="loading">Loading standings...</div>
      </section>`;
    } else {
      divisions.forEach((d, i) => {
        const viewId = d.slug + '-standings';
        const active = (i === 0 && firstNonHome) ? ' active' : '';
        viewsHTML += `<section class="view${active}" id="view-${viewId}">
          <div class="loading">Loading ${d.name} standings...</div>
        </section>`;
      });
    }

    // Bracket views — one combined section, or one per division
    if (combinedBrackets) {
      viewsHTML += `<section class="view" id="view-bracket">
        <div class="loading">Loading knockout...</div>
      </section>`;
    } else {
      divisions.forEach(d => {
        const viewId = d.slug + '-bracket';
        viewsHTML += `<section class="view" id="view-${viewId}">
          <div class="loading">Loading ${d.name} bracket...</div>
        </section>`;
      });
    }

    // Consolation view (single combined, config-gated)
    if (showConsolation) {
      viewsHTML += `<section class="view" id="view-consolation">
        <div class="loading">Loading consolation bracket...</div>
      </section>`;
    }

    // All Matches view
    viewsHTML += `<section class="view" id="view-matches">
      <div class="loading">Loading match data...</div>
    </section>`;

    mainContent.innerHTML = viewsHTML;

    // Wire up tab clicks (single-row only — two-row wires its own above)
    if (navStyle !== 'two-row') {
      viewBar.querySelectorAll('.view-bar__tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const viewName = tab.dataset.view;
          const idx = VIEWS.indexOf(viewName);
          if (idx !== -1) {
            switchToView(idx);
            resetRotation();
          } else if (ALL_VIEWS.includes(viewName)) {
            showManualView(viewName);
            stopRotation();
          }
        });
      });
    }

    // Pick up rotation interval from config
    const cfgInterval = parseInt(Data.getConfig('rotation_interval', '25'), 10) * 1000;
    if (cfgInterval > 0) ROTATION_INTERVAL = cfgInterval;

    // Check URL hash — if present, navigate to that view and disable rotation
    const hash = window.location.hash.replace('#', '');
    const hasHash = hash.length > 0;
    if (hasHash && ALL_VIEWS.includes(hash)) {
      const idx = VIEWS.indexOf(hash);
      if (idx !== -1) {
        switchToView(idx, true);
      } else {
        showManualView(hash, true);
      }
    }

    // Start auto-rotation (desktop only, if enabled in config, no hash in URL)
    const autorotate = Data.getConfig('autorotate', 'true').toLowerCase() !== 'false';
    const isMobile = window.innerWidth < 768;
    if (!isMobile && autorotate && VIEWS.length > 1 && !hasHash) {
      startRotation();
    }

    viewsBuilt = true;
  }

  function onDataUpdate(matches, lastUpdated, error) {
    if (error || !matches) {
      document.querySelectorAll('.view .loading').forEach(el => {
        el.innerHTML = `<div class="error-message">
          <div class="error-message__title">Unable to load data</div>
          <div class="error-message__detail">Check that the Google Sheet is published to the web</div>
        </div>`;
      });
      return;
    }

    // Build views on first successful data load (config is now available)
    if (!viewsBuilt && Data.configLoaded) {
      buildViews();
    }

    // Update timestamp
    if (lastUpdated) {
      const ts = lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      document.getElementById('last-updated').textContent = `Last updated: ${ts}`;
    }

    // Render all views
    renderAllViews(matches);
  }

  function renderAllViews(matches) {
    if (!viewsBuilt) return;

    // Render standings — combined (all divisions on one view) or per division
    if (combinedStandings) {
      const container = document.getElementById('view-standings');
      if (container) Standings.renderCombined(container, divisions);
    } else {
      divisions.forEach(d => {
        const container = document.getElementById('view-' + d.slug + '-standings');
        if (container) {
          Standings.render(container, d.standingsTab, d.name + ' Standings', d.name);
        }
      });
    }

    // Render knockout — combined (all divisions) or per division
    if (combinedBrackets) {
      const container = document.getElementById('view-bracket');
      if (container && Bracket.renderKnockoutCombined) Bracket.renderKnockoutCombined(container, divisions);
    } else {
      divisions.forEach(d => {
        const container = document.getElementById('view-' + d.slug + '-bracket');
        if (container) {
          if (divisionBracketPages && Bracket.renderDivisionFull) {
            Bracket.renderDivisionFull(container, d.name);
          } else {
            Bracket.render(container, d.name, d.name + ' Knockout');
          }
        }
      });
    }

    // Render combined consolation bracket (only present when config-enabled)
    const consolationContainer = document.getElementById('view-consolation');
    if (consolationContainer && Bracket.renderConsolationCombined) {
      Bracket.renderConsolationCombined(consolationContainer, divisions);
    }

    // Render All Matches
    const matchesContainer = document.getElementById('view-matches');
    if (matchesContainer) {
      Matches.render(matchesContainer, matches);
    }

    // Sidebar: upcoming matches
    const sidebarContent = document.querySelector('.sidebar__content');
    if (sidebarContent) {
      Matches.renderUpcoming(sidebarContent, matches);
    }
  }

  function switchToView(index, skipHash) {
    currentViewIndex = index;
    const viewName = VIEWS[index];

    // Only update tab active states for single-row nav
    // Two-row nav handles its own tab states via updateTwoRowNav
    document.querySelectorAll('.view-bar__tab[data-view]').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    const dots = document.querySelectorAll('.view-bar__dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });

    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    // Update URL hash (unless called during auto-rotation or initial hash load)
    if (!skipHash) {
      history.replaceState(null, '', originalPath + '#' + viewName);
    }
  }

  function showManualView(viewName, skipHash) {
    document.querySelectorAll('.view-bar__tab[data-view]').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    document.querySelectorAll('.view-bar__dot').forEach(dot => {
      dot.classList.remove('active');
    });

    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    if (!skipHash) {
      history.replaceState(null, '', originalPath + '#' + viewName);
    }
  }

  function startRotation() {
    isRotating = true;
    rotationTimer = setInterval(() => {
      if (VIEWS.length > 0) {
        switchToView((currentViewIndex + 1) % VIEWS.length, true); // skip hash during auto-rotation
      }
    }, ROTATION_INTERVAL);
  }

  function stopRotation() {
    isRotating = false;
    if (rotationTimer) clearInterval(rotationTimer);
  }

  function resetRotation() {
    stopRotation();
    startRotation();
  }

  function toggleRotation() {
    if (isRotating) {
      stopRotation();
    } else {
      startRotation();
    }
  }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  return { switchToView };
})();
