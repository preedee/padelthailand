/* Club pages: theme toggle (same storage key as the calendar) and today's row in the hours list. */
(function () {
  'use strict';
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pt-theme', next); } catch (e) { /* private mode: the toggle still works for this visit */ }
  });
  var today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Bangkok' }).format(new Date());
  document.querySelectorAll('[data-day]').forEach(function (row) {
    if (row.getAttribute('data-day') === today) { row.classList.add('is-today'); row.setAttribute('aria-current', 'date'); }
  });
})();
