// /tools/photo-picker/: pick one top photo per club. Picks live in localStorage; Download / Copy export { slug: storage_path }.
(function () {
  'use strict';
  var KEY = 'pt-photo-picks-v1';
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var saved = {}; try { saved = JSON.parse($('#pk-saved').textContent) || {}; } catch (e) {}
  var picks = null;
  try { var raw = localStorage.getItem(KEY); picks = raw ? JSON.parse(raw) : null; } catch (e) {}
  if (!picks || typeof picks !== 'object') picks = JSON.parse(JSON.stringify(saved));
  var filter = 'all', q = '';
  var msg = $('#pk-msg');
  function store() { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) {} }
  function say(t) { msg.textContent = t; if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ''; }, 4000); }

  function paint(sec) {
    var slug = sec.dataset.slug, pick = picks[slug] || '';
    $$('.pk-ph', sec).forEach(function (ph) {
      var on = ph.dataset.path === pick;
      $('.pk-pick', ph).setAttribute('aria-pressed', on ? 'true' : 'false');
      $('.pk-badge.pick', ph).hidden = !on;
    });
    $('.pk-clear', sec).hidden = !pick;
    $('.pk-state', sec).textContent = pick ? 'Picked' : '';
    sec.dataset.done = pick ? '1' : '0';
  }
  function apply() {
    var done = 0, shown = 0;
    $$('.pk-club').forEach(function (sec) {
      var d = sec.dataset.done === '1', has = sec.dataset.has === '1';
      if (d) done++;
      var ok = (filter === 'all' || (filter === 'done' && d) || (filter === 'todo' && !d && has)) && (!q || sec.dataset.name.indexOf(q) > -1);
      sec.hidden = !ok; if (ok) shown++;
    });
    $('#pk-done').textContent = done;
  }
  $$('.pk-club').forEach(paint); apply();

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.pk-pick'); var sec = e.target.closest('.pk-club');
    if (b && sec) { var p = b.parentNode.dataset.path; if (picks[sec.dataset.slug] === p) delete picks[sec.dataset.slug]; else picks[sec.dataset.slug] = p; store(); paint(sec); apply(); return; }
    var c = e.target.closest('.pk-clear'); if (c && sec) { delete picks[sec.dataset.slug]; store(); paint(sec); apply(); return; }
    var f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; $$('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', x === f ? 'true' : 'false'); }); apply(); }
  });
  $('#pk-q').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); apply(); });

  function json() { var o = {}; Object.keys(picks).sort().forEach(function (k) { o[k] = picks[k]; }); return JSON.stringify(o, null, 2) + '\n'; }
  $('#pk-download').addEventListener('click', function () {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' })); a.download = 'club-photo-picks.json';
    document.body.appendChild(a); a.click(); a.remove(); say('Downloaded club-photo-picks.json (' + Object.keys(picks).length + ' picks). It is in your Downloads folder.');
  });
  $('#pk-copy').addEventListener('click', function () {
    var t = json();
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { say('Copied ' + Object.keys(picks).length + ' picks. Paste them to Claude.'); }, function () { window.prompt('Copy these picks (Cmd+C), then paste them to Claude:', t); });
  });
  $('#pk-reset').addEventListener('click', function () {
    picks = JSON.parse(JSON.stringify(saved)); store(); $$('.pk-club').forEach(paint); apply(); say('Back to the saved picks.');
  });
})();
