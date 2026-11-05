// /admin/photos/: pick one top photo per club and hide photos from the site.
// Changes live in localStorage until you press Save to Site, which commits data/club-photo-picks.json and
// data/club-photo-hidden.json to the repository with a GitHub token kept only in this browser (the site then rebuilds itself).
(function () {
  'use strict';
  var KEY = 'pt-photo-admin-v2', TOKEN_KEY = 'pt-gh-token';
  var REPO = 'preedee/padelthailand', BRANCH = 'main', PICKS_FILE = 'data/club-photo-picks.json', HIDDEN_FILE = 'data/club-photo-hidden.json';
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var parse = function (id) { try { return JSON.parse($(id).textContent) || null; } catch (e) { return null; } };
  var saved = { picks: parse('#pk-saved') || {}, hidden: parse('#pk-hidden') || [] };   // what the site currently uses
  var state = null;
  try { var raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : null; } catch (e) {}
  if (!state || typeof state.picks !== 'object' || !Array.isArray(state.hidden)) state = clone(saved);
  var filter = 'all', q = '';
  var msg = $('#pk-msg');
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function say(t, keep) { msg.textContent = t; if (t && !keep) setTimeout(function () { if (msg.textContent === t) msg.textContent = ''; }, 6000); }
  var isHidden = function (p) { return state.hidden.indexOf(p) > -1; };
  function sortedPicks(p) { var o = {}; Object.keys(p).sort().forEach(function (k) { o[k] = p[k]; }); return o; }
  function picksJson() { return JSON.stringify(sortedPicks(state.picks), null, 2) + '\n'; }
  function hiddenJson() { return JSON.stringify(state.hidden.slice().sort(), null, 2) + '\n'; }
  function savedPicksJson() { return JSON.stringify(sortedPicks(saved.picks), null, 2) + '\n'; }
  function savedHiddenJson() { return JSON.stringify(saved.hidden.slice().sort(), null, 2) + '\n'; }

  function changes() {   // how many things differ from what the site uses now
    var n = 0, slugs = {};
    Object.keys(state.picks).concat(Object.keys(saved.picks)).forEach(function (k) { slugs[k] = 1; });
    Object.keys(slugs).forEach(function (k) { if (state.picks[k] !== saved.picks[k]) n++; });
    state.hidden.forEach(function (p) { if (saved.hidden.indexOf(p) < 0) n++; });
    saved.hidden.forEach(function (p) { if (state.hidden.indexOf(p) < 0) n++; });
    return n;
  }
  function dirty() { var n = changes(); $('#pk-dirty').textContent = n ? n + (n === 1 ? ' change' : ' changes') + ' not saved' : ''; $('#pk-save').disabled = !n; }

  function paint(sec) {
    var slug = sec.dataset.slug, pick = state.picks[slug] || '';
    $$('.pk-ph', sec).forEach(function (ph) {
      var path = ph.dataset.path, on = path === pick, gone = isHidden(path);
      $('.pk-pick', ph).setAttribute('aria-pressed', on ? 'true' : 'false');
      $('.pk-pick', ph).disabled = gone;
      $('.pk-badge.pick', ph).hidden = !on;
      $('.pk-badge.gone', ph).hidden = !gone;
      ph.classList.toggle('is-hidden', gone);
      var h = $('.pk-hide', ph); h.setAttribute('aria-pressed', gone ? 'true' : 'false'); h.textContent = gone ? 'Show Again' : 'Hide';
      h.setAttribute('aria-label', (gone ? 'Show' : 'Hide') + ' this photo ' + (gone ? 'on' : 'from') + ' the site');
    });
    $('.pk-clear', sec).hidden = !pick;
    $('.pk-state', sec).textContent = pick ? 'Picked' : '';
    sec.dataset.done = pick ? '1' : '0';
  }
  function apply() {
    var done = 0;
    $$('.pk-club').forEach(function (sec) {
      var d = sec.dataset.done === '1', has = sec.dataset.has === '1';
      if (d) done++;
      var ok = (filter === 'all' || (filter === 'done' && d) || (filter === 'todo' && !d && has)) && (!q || sec.dataset.name.indexOf(q) > -1);
      sec.hidden = !ok;
    });
    $('#pk-done').textContent = done; dirty();
  }
  $$('.pk-club').forEach(paint); apply();

  document.addEventListener('click', function (e) {
    var sec = e.target.closest('.pk-club');
    var b = e.target.closest('.pk-pick');
    if (b && sec && !b.disabled) { var p = b.parentNode.dataset.path; if (state.picks[sec.dataset.slug] === p) delete state.picks[sec.dataset.slug]; else state.picks[sec.dataset.slug] = p; store(); paint(sec); apply(); return; }
    var h = e.target.closest('.pk-hide');
    if (h && sec) {
      var path = h.parentNode.dataset.path, at = state.hidden.indexOf(path);
      if (at > -1) state.hidden.splice(at, 1);
      else { state.hidden.push(path); if (state.picks[sec.dataset.slug] === path) delete state.picks[sec.dataset.slug]; }   // a hidden photo cannot stay the top photo
      store(); paint(sec); apply(); return;
    }
    var c = e.target.closest('.pk-clear'); if (c && sec) { delete state.picks[sec.dataset.slug]; store(); paint(sec); apply(); return; }
    var f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; $$('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', x === f ? 'true' : 'false'); }); apply(); }
  });
  $('#pk-q').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); apply(); });
  $('#pk-reset').addEventListener('click', function () { state = clone(saved); store(); $$('.pk-club').forEach(paint); apply(); say('Back to what the site uses now.'); });

  // ---- backup: download both files ----
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  $('#pk-download').addEventListener('click', function () { download('club-photo-picks.json', picksJson()); setTimeout(function () { download('club-photo-hidden.json', hiddenJson()); }, 300); say('Downloaded club-photo-picks.json and club-photo-hidden.json (a backup; you do not need to send them).'); });

  // ---- GitHub token (kept only in this browser) ----
  var getToken = function () { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  function paintToken() {
    var has = !!getToken(); $('#pk-token-clear').hidden = !has; $('#pk-token-save').textContent = has ? 'Replace Token' : 'Connect';
    $('#pk-gh > summary').textContent = has ? 'GitHub connected' : 'Connect GitHub (one time)';
    if (!has) $('#pk-gh').open = true;
  }
  $('#pk-token-save').addEventListener('click', function () {
    var t = $('#pk-token').value.trim(); if (!t) { say('Paste the token first.'); return; }
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { say('This browser would not keep the token.'); return; }
    $('#pk-token').value = ''; paintToken(); $('#pk-gh').open = false; say('Connected. Press Save to Site when you are ready.');
  });
  $('#pk-token-clear').addEventListener('click', function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} paintToken(); say('Disconnected. The token was removed from this browser.'); });
  paintToken();

  // ---- Save to Site: commit the two files ----
  var b64 = function (s) { return btoa(unescape(encodeURIComponent(s))); };
  function gh(path, opt) {
    return fetch('https://api.github.com/repos/' + REPO + '/contents/' + path + (opt && opt.method === 'PUT' ? '' : '?ref=' + BRANCH), Object.assign({ headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + getToken(), 'X-GitHub-Api-Version': '2022-11-28' } }, opt || {}));
  }
  function putFile(path, text, message) {
    return gh(path).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw r; return r.json();
    }).then(function (cur) {
      var body = { message: message, content: b64(text), branch: BRANCH }; if (cur && cur.sha) body.sha = cur.sha;
      return gh(path, { method: 'PUT', body: JSON.stringify(body), headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + getToken(), 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' } });
    }).then(function (r) { if (!r.ok) throw r; return r.json(); });
  }
  function explain(err) {
    var s = err && err.status;
    if (s === 401) return 'GitHub did not accept the token. Use Replace Token with a new one.';
    if (s === 403 || s === 404) return 'The token cannot write to ' + REPO + '. Make a new token for that repository with Contents set to Read and write.';
    if (s === 409 || s === 422) return 'The files changed on GitHub while you were working. Reload this page and try again.';
    return 'Could not save (' + (s || 'no connection') + '). Your changes are still here. Try again, or use Download as a backup.';
  }
  $('#pk-save').addEventListener('click', function () {
    if (!getToken()) { $('#pk-gh').open = true; $('#pk-token').focus(); say('Connect GitHub first (one time).', true); return; }
    var n = changes(); if (!n) { say('Nothing to save.'); return; }
    var btn = $('#pk-save'); btn.disabled = true; btn.textContent = 'Saving…'; say('Saving…', true);
    var picksChanged = picksJson() !== savedPicksJson(), hiddenChanged = hiddenJson() !== savedHiddenJson();
    var msgText = 'Photo admin: ' + n + (n === 1 ? ' change' : ' changes');
    var chain = Promise.resolve();
    if (picksChanged) chain = chain.then(function () { return putFile(PICKS_FILE, picksJson(), msgText + ' (top photos)'); });
    if (hiddenChanged) chain = chain.then(function () { return putFile(HIDDEN_FILE, hiddenJson(), msgText + ' (hidden photos)'); });
    chain.then(function () {
      saved = clone(state); store(); apply();
      say('Saved ' + n + (n === 1 ? ' change' : ' changes') + '. The site updates by itself in about two minutes.', true);
    }).catch(function (err) { say(explain(err), true); apply(); }).then(function () { btn.textContent = 'Save to Site'; dirty(); });
  });
  window.addEventListener('beforeunload', function (e) { if (changes()) { e.preventDefault(); e.returnValue = ''; } });
})();
