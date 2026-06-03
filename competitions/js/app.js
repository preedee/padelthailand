/* ============================================
   App Controller — dynamic views from config
   ============================================ */

const App = (() => {
  let VIEWS = [];           // rotating views (standings + brackets)
  let ALL_VIEWS = [];       // all views including manual-only (matches)
  let ROTATION_INTERVAL = 25000;   // global fallback (ms) — config key `rotation_interval`
  let perViewMs = {};       // viewId → ms, per-page override — config key `rotation_seconds`
  let skipViews = new Set(); // viewIds with `rotation_seconds` 0 → excluded from rotation
  let currentViewIndex = 0;
  let rotationTimer = null;
  let isRotating = true;
  let viewsBuilt = false;

  // Rotation countdown (footer ring + seconds). rotationEndsAt is the wall-clock
  // time the current view advances; countdownTimer ticks the display each second.
  let countdownTimer = null;
  let rotationEndsAt = 0;
  let currentRotationMs = 0;

  // Capture the original page path before <base> tag affects relative URLs
  const originalPath = window.location.pathname;

  // Division config: each has a standings tab, a bracket, and a slug
  let divisions = [];       // [{ name, slug, standingsTab }]
  let combinedStandings = false;  // config-gated: all divisions' standings on one view

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

    // Community Cup mode uses a different nav/view structure (no divisions).
    if (Data.isCommunityCupFormat && Data.isCommunityCupFormat()) {
      buildCommunityCupViews();
      viewsBuilt = true;
      return;
    }

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
    const bracketViews = divisions.map(d => d.slug + '-bracket');

    // Consolation: single combined view across all divisions (config-gated).
    // Off by default → RPA/LPS and other division comps are unaffected.
    const showConsolation = Data.getConfig('show_consolation', 'false').toLowerCase() === 'true';

    // All possible views
    ALL_VIEWS = [];
    if (showHomePage) ALL_VIEWS.push('home');
    ALL_VIEWS.push(...standingsViews, ...bracketViews);
    if (showConsolation) ALL_VIEWS.push('consolation');
    ALL_VIEWS.push('matches');

    // Determine which views to include in rotation from config
    // Accepts specific view IDs (e.g. "home, male-amateur-standings, power-bracket, matches")
    buildPerViewMs(null);   // perViewMs + skipViews (rotation_seconds 0 → skip)
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
    // Pages set to 0s in rotation_seconds are dropped from the rotation cycle.
    VIEWS = VIEWS.filter(v => !skipViews.has(v));

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
      if (showConsolation) {
        tabsHTML += `<button class="view-bar__tab view-bar__type-tab" data-type="consolation">Consolation</button>`;
      }
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
        if (type === 'consolation') return 'consolation';
        if (type === 'standings' && combinedStandings) return 'standings';
        return division + '-' + type;
      }

      function updateTwoRowNav(type, division) {
        currentType = type;
        currentDivision = division;

        // Update type tabs
        viewBar.querySelectorAll('.view-bar__type-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.type === type);
        });

        // Update division tabs — deselect all for Home/Matches, highlight for Standings/Brackets.
        // Combined standings shows all divisions at once → no single division is "current".
        const showDivisionHighlight = (type === 'bracket') || (type === 'standings' && !combinedStandings);
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
          // Combined standings view — keep the remembered division for Brackets.
          updateTwoRowNav('standings', currentDivision);
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

      // Bracket tabs
      divisions.forEach(d => {
        const viewId = d.slug + '-bracket';
        const label = customLabels[tabIndex] || (d.name + ' Bracket');
        tabsHTML += `<button class="view-bar__tab" data-view="${viewId}">${label}</button>`;
        tabIndex++;
      });

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

    // Bracket views
    divisions.forEach(d => {
      const viewId = d.slug + '-bracket';
      viewsHTML += `<section class="view" id="view-${viewId}">
        <div class="loading">Loading ${d.name} bracket...</div>
      </section>`;
    });

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

    // Pick up rotation interval from config (global fallback; per-view overrides
    // + skips were parsed by buildPerViewMs above, before VIEWS was filtered)
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

  // ============================================================
  // Community Cup view builder
  // Replaces division-based nav with: Group A / Group B / Bracket / All Matches
  // Renderers for standings + bracket land in M3c / M3d; this is the shell.
  // ============================================================
  function buildCommunityCupViews() {
    const viewBar = document.getElementById('view-bar');
    const mainContent = document.getElementById('main-content');

    // View IDs (Groups is first now that the Live tab is removed)
    ALL_VIEWS = ['groups', 'standings', 'bracket', 'consolation', 'matches'];

    // Rotation set is configurable via the Config tab key `rotation_views`.
    // Accepts internal IDs or the friendly tab labels, e.g.
    //   "Groups, Standings, Main Draw"  or  "groups, standings, bracket"
    // Blank/unset (or all entries invalid) → rotate through all five tabs.
    const ccViewAliases = {
      'groups': 'groups',
      'standings': 'standings',
      'main-draw': 'bracket', 'bracket': 'bracket', 'draw': 'bracket',
      'consolation': 'consolation',
      'all-matches': 'matches', 'matches': 'matches'
    };
    buildPerViewMs(ccViewAliases);   // perViewMs + skipViews (rotation_seconds 0 → skip)
    const rotationConfig = Data.getConfigList('rotation_views');
    if (rotationConfig.length === 0) {
      VIEWS = ALL_VIEWS.slice();
    } else {
      VIEWS = rotationConfig
        .map(v => ccViewAliases[v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')])
        .filter(v => v && ALL_VIEWS.includes(v));
      if (VIEWS.length === 0) VIEWS = ALL_VIEWS.slice();
    }
    // Pages set to 0s in rotation_seconds are dropped from the rotation cycle.
    VIEWS = VIEWS.filter(v => !skipViews.has(v));

    // Build nav (single-row layout)
    let tabsHTML = '';
    tabsHTML += `<button class="view-bar__tab active" data-view="groups">Groups</button>`;
    tabsHTML += `<button class="view-bar__tab" data-view="standings">Standings</button>`;
    tabsHTML += `<button class="view-bar__tab" data-view="bracket">Main Draw</button>`;
    tabsHTML += `<button class="view-bar__tab" data-view="consolation">Consolation</button>`;
    tabsHTML += `<button class="view-bar__tab view-bar__tab--right" data-view="matches">All Matches</button>`;
    tabsHTML += `<div class="view-bar__dots">`;
    VIEWS.forEach((_, i) => {
      tabsHTML += `<span class="view-bar__dot${i === 0 ? ' active' : ''}"></span>`;
    });
    tabsHTML += `</div>`;
    viewBar.innerHTML = tabsHTML;

    // Build view sections
    let viewsHTML = '';
    viewsHTML += `<section class="view active" id="view-groups">
      <div class="loading">Loading groups...</div>
    </section>`;
    viewsHTML += `<section class="view" id="view-standings">
      <div class="loading">Loading standings...</div>
    </section>`;
    viewsHTML += `<section class="view" id="view-bracket">
      <div class="loading">Bracket</div>
    </section>`;
    viewsHTML += `<section class="view" id="view-consolation">
      <div class="loading">Consolation bracket</div>
    </section>`;
    viewsHTML += `<section class="view" id="view-matches">
      <div class="loading">Loading matches...</div>
    </section>`;
    mainContent.innerHTML = viewsHTML;

    // Upcoming Matches sidebar removed for the Community Cup dashboard — the
    // .content-area flex layout reflows .main-content to full width on its own.
    document.getElementById('sidebar-upcoming')?.remove();

    // Wire tab clicks. Tabs in the rotation set switch + reset rotation; tabs
    // excluded from rotation are still manually clickable (and stop rotation).
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

    // Rotation interval from config (global fallback; per-view overrides + skips
    // were parsed by buildPerViewMs above, before VIEWS was filtered).
    // rotation_seconds accepts friendly labels, e.g.
    //   "standings:30, main-draw:0, all-matches:20" (0 = skip that page)
    const cfgInterval = parseInt(Data.getConfig('rotation_interval', '25'), 10) * 1000;
    if (cfgInterval > 0) ROTATION_INTERVAL = cfgInterval;

    // URL hash → initial view (and disable rotation)
    const hash = window.location.hash.replace('#', '');
    const hasHash = hash.length > 0;
    if (hasHash && ALL_VIEWS.includes(hash)) {
      const idx = VIEWS.indexOf(hash);
      if (idx !== -1) switchToView(idx, true);
      else showManualView(hash, true);
    }

    // Auto-rotation (desktop only)
    const autorotate = Data.getConfig('autorotate', 'true').toLowerCase() !== 'false';
    const isMobile = window.innerWidth < 768;
    if (!isMobile && autorotate && VIEWS.length > 1 && !hasHash) {
      startRotation();
    }
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

    // Community Cup renderers
    if (Data.isCommunityCupFormat && Data.isCommunityCupFormat()) {
      const groupsEl = document.getElementById('view-groups');
      if (groupsEl && typeof CCGroups !== 'undefined') {
        CCGroups.render(groupsEl);
      }
      const standingsEl = document.getElementById('view-standings');
      if (standingsEl && typeof CCStandings !== 'undefined') {
        CCStandings.renderAll(standingsEl);
      }
      const bracketEl = document.getElementById('view-bracket');
      if (bracketEl && typeof Series !== 'undefined') {
        Series.renderBracket(bracketEl);
      }
      const consolationEl = document.getElementById('view-consolation');
      if (consolationEl && typeof Series !== 'undefined') {
        Series.renderConsolation(consolationEl);
      }
      const matchesContainer = document.getElementById('view-matches');
      if (matchesContainer) Matches.render(matchesContainer, matches);
      return;
    }

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

    // Render brackets for each division
    divisions.forEach(d => {
      const container = document.getElementById('view-' + d.slug + '-bracket');
      if (container) {
        Bracket.render(container, d.name, d.name + ' Knockout');
        // Show this division's consolation as a small bracket beneath the knockout.
        if (Bracket.appendConsolation && Bracket.appendConsolation(container, d.name)) {
          container.classList.add('view--with-consolation');
        }
      }
    });

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

    syncMatchesAutoScroll(viewName);
  }

  // Start the All-Matches auto-scroll when its view is active, stop it otherwise.
  // No-op unless the `matches_autoscroll` config key is on (Matches owns that check).
  function syncMatchesAutoScroll(viewName) {
    if (typeof Matches === 'undefined' || !Matches.startAutoScroll) return;
    if (viewName === 'matches') {
      const el = document.getElementById('view-matches');
      if (el) Matches.startAutoScroll(el);
    } else {
      Matches.stopAutoScroll();
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

    syncMatchesAutoScroll(viewName);
  }

  // Parse the `rotation_seconds` config (e.g. "standings:30, main-draw:15") into
  // a viewId→ms map. `aliasMap` (Community Cup) maps a normalized token to a real
  // view id; without it the token IS the view id (division format). Views absent
  // from the map fall back to the global `rotation_interval`.
  function buildPerViewMs(aliasMap) {
    perViewMs = {};
    skipViews = new Set();
    Data.getConfigList('rotation_seconds').forEach(entry => {
      const i = entry.lastIndexOf(':');
      if (i < 0) return;
      const token = entry.slice(0, i).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const view = aliasMap ? aliasMap[token] : token;
      const secs = parseFloat(entry.slice(i + 1));
      if (!view || isNaN(secs)) return;
      if (secs > 0) perViewMs[view] = secs * 1000;
      else skipViews.add(view);   // 0 → drop this page from the rotation cycle
    });
  }

  // ms the current page should stay before advancing — per-view override
  // (`rotation_seconds`) if set, else the global `rotation_interval`.
  function durationForView(viewName) {
    const ms = perViewMs[viewName];
    return (ms && ms > 0) ? ms : ROTATION_INTERVAL;
  }

  // Per-page timing means a single fixed setInterval won't do — each page can
  // have its own dwell time, so re-arm a setTimeout after every switch.
  function scheduleNextRotation() {
    if (rotationTimer) clearTimeout(rotationTimer);
    const delay = durationForView(VIEWS[currentViewIndex]);
    currentRotationMs = delay;
    rotationEndsAt = Date.now() + delay;
    updateCountdown();
    rotationTimer = setTimeout(() => {
      if (isRotating && VIEWS.length > 0) {
        switchToView((currentViewIndex + 1) % VIEWS.length, true); // skip hash during auto-rotation
        scheduleNextRotation();
      }
    }, delay);
  }

  // Footer countdown ring + seconds → time until the next view rotation.
  // No-ops gracefully when the shell has no #rotation-countdown element.
  const COUNTDOWN_CIRCUMFERENCE = 100;   // circle r=15.915 → 2πr ≈ 100
  function updateCountdown() {
    const el = document.getElementById('rotation-countdown');
    if (!el) return;
    if (!isRotating || !rotationEndsAt) { el.hidden = true; return; }
    const remainingMs = Math.max(0, rotationEndsAt - Date.now());
    const secs = Math.ceil(remainingMs / 1000);
    const fill = el.querySelector('.footer__countdown-fill');
    const num = el.querySelector('.footer__countdown-num');
    const frac = currentRotationMs > 0 ? remainingMs / currentRotationMs : 0;
    if (fill) fill.style.strokeDashoffset = String(COUNTDOWN_CIRCUMFERENCE * (1 - frac));
    if (num) num.textContent = secs + 's';
    el.hidden = false;
  }

  function startRotation() {
    isRotating = true;
    scheduleNextRotation();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 250);
  }

  function stopRotation() {
    isRotating = false;
    if (rotationTimer) { clearTimeout(rotationTimer); rotationTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    const el = document.getElementById('rotation-countdown');
    if (el) el.hidden = true;
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
