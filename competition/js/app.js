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

    // Generate nav tabs
    const viewBar = document.getElementById('view-bar');
    let tabsHTML = '';
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

    // Generate view sections
    const mainContent = document.getElementById('main-content');
    let viewsHTML = '';

    // Home page view (if enabled)
    if (showHomePage) {
      const eventLogo = Data.getConfig('event_logo', '');
      const partnerLogo = Data.getConfig('partner_logo', '');
      const tournamentName = Data.getConfig('tournament_name', '');
      const subtitle = Data.getConfig('subtitle', '');
      const active = ' active';
      const footerLogo = Data.getConfig('footer_logo', '');
      viewsHTML += `<section class="view${active}" id="view-home">
        <div class="home-page">
          ${eventLogo ? `<img class="home-page__event-logo" src="${eventLogo}" alt="${tournamentName}">` : ''}
          <div class="home-page__powered">Powered by</div>
          <div class="home-page__partner-row">
            ${footerLogo ? `<img class="home-page__partner-logo" src="${footerLogo}" alt="Partner">` : ''}
            ${partnerLogo ? `<img class="home-page__partner-logo" src="${partnerLogo}" alt="Partner">` : ''}
          </div>
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

    // Wire up tab clicks
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

    document.querySelectorAll('.view-bar__tab').forEach(tab => {
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
    document.querySelectorAll('.view-bar__tab').forEach(tab => {
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
