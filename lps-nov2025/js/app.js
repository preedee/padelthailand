/* ============================================
   App Controller — auto-rotation, view switching
   ============================================ */

const App = (() => {
  const VIEWS = ['power-standings', 'club-standings', 'power-bracket', 'club-bracket'];
  const ALL_VIEWS = ['power-standings', 'club-standings', 'matches', 'power-bracket', 'club-bracket'];
  const ROTATION_INTERVAL = 25000; // 25 seconds
  let currentViewIndex = 0;
  let rotationTimer = null;
  let isRotating = true;

  function init() {
    // Wire up tab clicks
    document.querySelectorAll('.view-bar__tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const viewName = tab.dataset.view;
        const idx = VIEWS.indexOf(viewName);
        if (idx !== -1) {
          switchToView(idx);
          resetRotation();
        } else if (ALL_VIEWS.includes(viewName)) {
          // Manual-only view (e.g. All Matches) — show it but stop rotation
          showManualView(viewName);
          stopRotation();
        }
      });
    });

    // Keyboard nav: arrow keys to switch views, space to pause/resume
    document.addEventListener('keydown', (e) => {
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

    // Start data polling
    Data.startPolling(onDataUpdate);

    // Start auto-rotation (desktop only)
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
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

    // Update timestamp
    if (lastUpdated) {
      const ts = lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      document.getElementById('last-updated').textContent = `Last updated: ${ts}`;
    }

    // Render all views
    renderAllViews(matches);
  }

  function renderAllViews(matches) {
    Standings.renderPower(document.getElementById('view-power-standings'));
    Standings.renderClub(document.getElementById('view-club-standings'));
    Matches.render(document.getElementById('view-matches'), matches);
    Bracket.renderPower(document.getElementById('view-power-bracket'));
    Bracket.renderClub(document.getElementById('view-club-bracket'));

    // Sidebar: upcoming matches (always visible)
    const sidebarContent = document.querySelector('.sidebar__content');
    if (sidebarContent) {
      Matches.renderUpcoming(sidebarContent, matches);
    }
  }

  function switchToView(index) {
    currentViewIndex = index;
    const viewName = VIEWS[index];

    // Update tabs
    document.querySelectorAll('.view-bar__tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    // Update dots
    const dots = document.querySelectorAll('.view-bar__dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');
  }

  function showManualView(viewName) {
    // Update tabs
    document.querySelectorAll('.view-bar__tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    // Clear dots (no rotation indicator for manual views)
    document.querySelectorAll('.view-bar__dot').forEach(dot => {
      dot.classList.remove('active');
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');
  }

  function startRotation() {
    isRotating = true;
    rotationTimer = setInterval(() => {
      switchToView((currentViewIndex + 1) % VIEWS.length);
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
