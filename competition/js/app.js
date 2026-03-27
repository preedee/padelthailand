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

    // Build all view IDs
    const standingsViews = divisions.map(d => d.slug + '-standings');
    const bracketViews = divisions.map(d => d.slug + '-bracket');

    // All possible views
    ALL_VIEWS = [];
    if (showHomePage) ALL_VIEWS.push('home');
    ALL_VIEWS.push(...standingsViews, ...bracketViews, 'matches');

    // Determine which views to include in rotation from config
    // Accepts specific view IDs (e.g. "home, male-amateur-standings, power-bracket, matches")
    const rotationConfig = Data.getConfigList('rotation_views');
    if (rotationConfig.length === 0) {
      // Default: home (if enabled) + all standings + all brackets (not matches)
      VIEWS = [];
      if (showHomePage) VIEWS.push('home');
      VIEWS.push(...standingsViews, ...bracketViews);
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
      tabsHTML += `<button class="view-bar__tab view-bar__type-tab" data-type="bracket">Brackets</button>`;
      tabsHTML += `<button class="view-bar__tab view-bar__type-tab" data-type="matches">All Matches</button>`;
      tabsHTML += `<div class="view-bar__dots">`;
      VIEWS.forEach((_, i) => {
        tabsHTML += `<span class="view-bar__dot${i === 0 ? ' active' : ''}"></span>`;
      });
      tabsHTML += `</div>`;
      tabsHTML += `</div>`;

      // Row 2: Division selector (no initial selection if starting on Home or Matches)
      const initialType = showHomePage ? 'home' : 'standings';
      const showInitialDivision = (initialType === 'standings' || initialType === 'bracket');
      tabsHTML += `<div class="view-bar__row view-bar__row--secondary">`;
      divisions.forEach((d, i) => {
        const active = (showInitialDivision && i === 0) ? ' active' : '';
        tabsHTML += `<button class="view-bar__tab view-bar__div-tab${active}" data-division="${d.slug}">${d.name}</button>`;
      });
      tabsHTML += `</div>`;

      viewBar.innerHTML = tabsHTML;
      viewBar.classList.add('view-bar--two-row');

      // Track current type and division for two-row nav
      let currentType = showHomePage ? 'home' : 'standings';
      let currentDivision = divisions[0].slug;

      function resolveViewId(type, division) {
        if (type === 'home') return 'home';
        if (type === 'matches') return 'matches';
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
        const showDivisionHighlight = (type === 'standings' || type === 'bracket');
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
          // If current type is Home or Matches, default to Standings
          const type = (currentType === 'home' || currentType === 'matches') ? 'standings' : currentType;
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

      // Standings tabs
      divisions.forEach((d, i) => {
        const viewId = d.slug + '-standings';
        const active = (!showHomePage && i === 0) ? ' active' : '';
        const label = customLabels[tabIndex] || (d.name + ' Standings');
        tabsHTML += `<button class="view-bar__tab${active}" data-view="${viewId}">${label}</button>`;
        tabIndex++;
      });

      // Bracket tabs
      divisions.forEach(d => {
        const viewId = d.slug + '-bracket';
        const label = customLabels[tabIndex] || (d.name + ' Bracket');
        tabsHTML += `<button class="view-bar__tab" data-view="${viewId}">${label}</button>`;
        tabIndex++;
      });

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
      const tournamentName = Data.getConfig('tournament_name', '');

      // Inject responsive sizes as CSS (all vw-based)
      const logoStyle = document.createElement('style');
      logoStyle.textContent = `
        .home-page { gap: 0 !important; }
        .home-page__event-logo { max-width: ${homeLogoDesktop}vw !important; max-height: ${Math.round(homeLogoDesktop * 0.75)}vw !important; margin-bottom: ${gapLogoText}vw; }
        .home-page__powered { margin-bottom: ${gapTextPartner}vw; font-size: ${homeTextDesktop}vw !important; }
        .home-page__partner-logo { max-width: ${homePartnerDesktop}vw !important; max-height: ${Math.round(homePartnerDesktop * 0.5)}vw !important; }
        @media (max-width: 768px) {
          .home-page__event-logo { max-width: ${homeLogoMobile}vw !important; max-height: ${Math.round(homeLogoMobile * 0.75)}vw !important; }
          .home-page__partner-logo { max-width: ${homePartnerMobile}vw !important; max-height: ${Math.round(homePartnerMobile * 0.5)}vw !important; }
          .home-page__powered { font-size: ${homeTextMobile}vw !important; }
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

    // Standings views
    const firstNonHome = !showHomePage;
    divisions.forEach((d, i) => {
      const viewId = d.slug + '-standings';
      const active = (i === 0 && firstNonHome) ? ' active' : '';
      viewsHTML += `<section class="view${active}" id="view-${viewId}">
        <div class="loading">Loading ${d.name} standings...</div>
      </section>`;
    });

    // Bracket views
    divisions.forEach(d => {
      const viewId = d.slug + '-bracket';
      viewsHTML += `<section class="view" id="view-${viewId}">
        <div class="loading">Loading ${d.name} bracket...</div>
      </section>`;
    });

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
    let hashHandled = false;
    if (hash && ALL_VIEWS.includes(hash)) {
      const idx = VIEWS.indexOf(hash);
      if (idx !== -1) {
        switchToView(idx, true);
      } else {
        showManualView(hash, true);
      }
      hashHandled = true;
    }

    // Start auto-rotation (desktop only, if enabled in config, and no hash override)
    const autorotate = Data.getConfig('autorotate', 'true').toLowerCase() !== 'false';
    const isMobile = window.innerWidth < 768;
    if (!isMobile && autorotate && VIEWS.length > 1 && !hashHandled) {
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

    // Render standings for each division
    divisions.forEach(d => {
      const container = document.getElementById('view-' + d.slug + '-standings');
      if (container) {
        Standings.render(container, d.standingsTab, d.name + ' Standings', d.name);
      }
    });

    // Render brackets for each division
    divisions.forEach(d => {
      const container = document.getElementById('view-' + d.slug + '-bracket');
      if (container) {
        Bracket.render(container, d.name, d.name + ' Knockout');
      }
    });

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
