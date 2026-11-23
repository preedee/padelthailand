// /admin/courts/: edit a club's indoor, covered and outdoor court counts without SQL.
// The page is published encrypted; the admin key is inside it (#sb-config) and only lets three database functions answer
// (clubs.admin_court_overrides, admin_set_courts and admin_clear_courts, see supabase/0003_admin_courts.sql). Live numbers come
// from the public view; club names are shown with textContent, never as HTML.
(function () {
  'use strict';
  var REPO = 'preedee/padelthailand', WORKFLOW = 'clubs-build.yml', TOKEN_KEY = 'pt-gh-token';
  var SETUP = 'Saving is not set up yet: run supabase/0003_admin_courts.sql once in the Supabase SQL editor.';
  var FIELDS = ['indoor', 'covered', 'outdoor'];
  var cfg = {}, clubs = [], live = {}, overridden = {}, filter = 'all', query = '';
  try { cfg = JSON.parse(document.getElementById('sb-config').textContent); } catch (e) { /* shows the error below */ }
  try { clubs = JSON.parse(document.getElementById('ct-clubs').textContent); } catch (e) { /* empty page */ }
  var body = document.getElementById('ct-body'), msg = document.getElementById('ct-msg');
  var rows = [];   // { club, tr, inputs, total, state, save, reset, flag }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(text, bad, href, linkText) {
    msg.textContent = text || ''; msg.className = 'pk-msg' + (bad ? ' ct-err' : '');
    if (href) { msg.appendChild(document.createTextNode(' ')); var a = el('a', null, linkText); a.href = href; a.target = '_blank'; a.rel = 'noopener'; msg.appendChild(a); }
  }
  function rpc(fn, args) {
    return fetch(cfg.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon, 'Content-Type': 'application/json', 'Content-Profile': 'clubs' },
      body: JSON.stringify(args)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function fail(prefix, e) { say(/HTTP 404/.test(e.message) ? SETUP : prefix + ' (' + e.message.replace(/\.$/, '') + ').', true); }

  // ---- the numbers ----
  function current(c) { return live[c.id] || { total: c.total, indoor: c.indoor, covered: c.covered, outdoor: c.outdoor }; }
  function parse(v) { v = String(v).trim(); if (v === '') return { n: null, ok: true }; var n = Number(v); return { n: n, ok: /^\d{1,2}$/.test(v) && n >= 0 && n <= 99 }; }
  function read(r) {
    var vals = {}, ok = true, sum = 0, any = false;
    FIELDS.forEach(function (f) { var p = parse(r.inputs[f].value); vals[f] = p.n; ok = ok && p.ok; if (p.n != null) { sum += p.n; any = true; } });
    return { vals: vals, ok: ok, sum: sum, any: any };
  }
  function fill(r) {
    var cur = current(r.club);
    FIELDS.forEach(function (f) { r.inputs[f].value = cur[f] == null ? '' : cur[f]; });
    setState(r, '');
    paint(r);
  }
  function setState(r, text, cls) { r.state.textContent = text; r.state.className = 'ct-state' + (cls ? ' ' + cls : ''); }
  function needsCounts(c) {
    var cur = current(c), sum = (cur.indoor || 0) + (cur.covered || 0) + (cur.outdoor || 0);
    return cur.total == null || sum !== cur.total;
  }
  function paint(r) {
    var x = read(r), cur = current(r.club), dirty = false;
    FIELDS.forEach(function (f) { if ((x.vals[f] == null ? '' : String(x.vals[f])) !== (cur[f] == null ? '' : String(cur[f]))) dirty = true; });
    r.total.textContent = x.any ? x.sum : '—';
    r.tr.classList.toggle('ct-dirty', dirty);
    r.tr.classList.toggle('ct-bad', !x.ok);
    r.save.disabled = r.busy || !dirty || !x.ok;
    r.reset.disabled = r.busy;
    var g = googleOf(r.club.id);
    r.flag.hidden = !overridden[r.club.id];
    r.reset.hidden = !overridden[r.club.id] || (!!g && noCount(g));   // resetting to nothing would only lose the correction
    googleNote(r, g);
  }
  // what the booking platform says for a club with a saved correction (null while unknown, e.g. the first version of the database function)
  function googleOf(id) { var g = overridden[id]; return g && 'total' in g ? g : null; }
  function noCount(g) { return g.total == null && g.indoor == null && g.covered == null && g.outdoor == null; }
  // what Reset To Booking Data would give, shown under the club name once a correction is saved
  function googleNote(r, g) {
    r.google.hidden = !g;
    if (!g) return;
    r.google.textContent = noCount(g) ? 'No booking-platform count' :
      'Booking data says: ' + (g.indoor || 0) + ' indoor · ' + (g.covered || 0) + ' covered · ' + (g.outdoor || 0) + ' outdoor (' + (g.total == null ? '?' : g.total) + ' total)';
  }

  // ---- saving: one call to the database, then the row and the counts show what was saved ----
  function run(r, busy, call, done, label) {
    r.busy = true; setState(r, busy); paint(r);
    call().then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'refused');
      return done(res);
    }).then(function (note) { fill(r); setState(r, label.ok, 'ok'); say(note); counts(); })
      .catch(function (e) { setState(r, label.err, 'err'); fail('Could not ' + label.verb + ' ' + r.club.name, e); })
      .then(function () { r.busy = false; paint(r); });
  }
  function save(r) {
    var x = read(r); if (!x.ok) return;
    var i = x.vals.indoor || 0, c = x.vals.covered || 0, o = x.vals.outdoor || 0;
    run(r, 'Saving…', function () { return rpc('admin_set_courts', { k: cfg.key, pid: r.club.id, n_indoor: i, n_covered: c, n_outdoor: o }); }, function (res) {
      live[r.club.id] = { total: i + c + o, indoor: i, covered: c, outdoor: o }; overridden[r.club.id] = res.google || {};
      return 'Saved ' + r.club.name + '. The club page and region page change after the next build: press Publish Now to do it straight away.';
    }, { ok: 'Saved', err: 'Not saved', verb: 'save' });
  }
  function reset(r) {
    run(r, 'Resetting…', function () { return rpc('admin_clear_courts', { k: cfg.key, pid: r.club.id }); }, function () {
      delete overridden[r.club.id];
      return fetchLive(r.club.id).then(function () { return r.club.name + ' is back to the booking-platform numbers. Press Publish Now to update the site.'; });
    }, { ok: 'Reset', err: 'Not reset', verb: 'reset' });
  }

  // ---- publish: start the site build (needs the GitHub token from the Top Photos page, with Actions set to Read and write) ----
  function publish() {
    var token = ''; try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* none */ }
    var page = 'https://github.com/' + REPO + '/actions/workflows/' + WORKFLOW;
    if (!token) { say('No GitHub token in this browser. Open the build page and press Run workflow:', false, page, 'Clubs Build'); return; }
    say('Starting the build…');
    fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
      method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ ref: 'main' })
    }).then(function (r) {
      if (r.status === 204) say('Build started. The site updates in about two minutes.');
      else say('GitHub would not start the build from here (the token needs Actions set to Read and write). Open the build page and press Run workflow:', true, page, 'Clubs Build');
    }).catch(function () { say('Could not reach GitHub. Open the build page and press Run workflow:', true, page, 'Clubs Build'); });
  }

  // ---- table ----
  function numberInput(c, f) {
    var i = el('input', 'ct-in'); i.type = 'number'; i.min = '0'; i.max = '99'; i.step = '1'; i.inputMode = 'numeric';
    i.setAttribute('aria-label', c.name + ': ' + f + ' courts'); return i;
  }
  function makeRow(c) {
    var r = { club: c, tr: el('tr', 'ct-row'), inputs: {}, busy: false };
    var th = el('th'); th.scope = 'row'; th.appendChild(document.createTextNode(c.name));
    r.flag = el('span', 'ct-flag', 'Set by you'); r.flag.hidden = true; th.appendChild(r.flag);
    r.google = el('small', 'ct-google'); r.google.hidden = true; th.appendChild(r.google); r.tr.appendChild(th);
    FIELDS.forEach(function (f) {
      var td = el('td'), i = numberInput(c, f); r.inputs[f] = i; i.addEventListener('input', function () { setState(r, ''); paint(r); });
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !r.save.disabled) save(r); });
      td.appendChild(i); r.tr.appendChild(td);
    });
    r.total = el('td', 'ct-total'); r.tr.appendChild(r.total);
    var act = el('td'), box = el('div', 'ct-act');
    r.state = el('span', 'ct-state'); r.state.setAttribute('role', 'status');
    r.save = el('button', 'btn solid', 'Save'); r.save.type = 'button'; r.save.addEventListener('click', function () { save(r); });
    r.reset = el('button', 'btn', 'Reset To Booking Data'); r.reset.type = 'button'; r.reset.addEventListener('click', function () { reset(r); });
    box.appendChild(r.state); box.appendChild(r.save); box.appendChild(r.reset); act.appendChild(box); r.tr.appendChild(act);
    return r;
  }
  function build() {
    var region = null;
    clubs.forEach(function (c) {
      if (c.region !== region) {
        region = c.region; var hr = el('tr', 'ct-region'), th = el('th', null, region); th.colSpan = 6; th.scope = 'colgroup'; hr.dataset.region = region; hr.appendChild(th); body.appendChild(hr);
      }
      var r = makeRow(c); rows.push(r); body.appendChild(r.tr);
    });
  }
  // the rows are built once; a refresh only puts the new numbers into them
  function render() { if (rows.length) rows.forEach(fill); else { build(); rows.forEach(fill); } counts(); show(); }
  function counts() {
    var needs = 0, set = 0;
    rows.forEach(function (r) { if (needsCounts(r.club)) needs++; if (overridden[r.club.id]) set++; });
    document.getElementById('ct-needs').textContent = '(' + needs + ')'; document.getElementById('ct-set').textContent = '(' + set + ')';
  }
  function show() {
    var seen = {};
    rows.forEach(function (r) {
      var ok = r.club.name.toLowerCase().indexOf(query) !== -1 && (filter === 'all' || (filter === 'needs' && needsCounts(r.club)) || (filter === 'set' && overridden[r.club.id]));
      r.tr.hidden = !ok; if (ok) seen[r.club.region] = true;
    });
    Array.prototype.forEach.call(body.querySelectorAll('.ct-region'), function (h) { h.hidden = !seen[h.dataset.region]; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.f === filter)); });
  }

  // ---- loading ----
  function fetchLive(placeId) {
    var url = cfg.url + '/rest/v1/clubs_public?select=place_id,courts_total,courts_indoor,courts_covered,courts_outdoor&limit=2000' + (placeId ? '&place_id=eq.' + encodeURIComponent(placeId) : '');
    return fetch(url, { headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon, 'Accept-Profile': 'clubs' } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (list) {
      list.forEach(function (x) { live[x.place_id] = { total: x.courts_total, indoor: x.courts_indoor, covered: x.courts_covered, outdoor: x.courts_outdoor }; });
    });
  }
  function load() {
    if (!cfg.key) { say('This page was built without the admin key.', true); return; }
    if (rows.some(function (r) { return r.tr.classList.contains('ct-dirty'); })) { say('Save the rows you changed first. Refreshing would drop them.', true); return; }
    say('Loading…');
    Promise.all([fetchLive(), rpc('admin_court_overrides', { k: cfg.key }).catch(function (e) { if (/HTTP 404/.test(e.message)) { say(SETUP, true); return null; } throw e; })]).then(function (out) {
      var res = out[1]; overridden = {};
      if (res) {
        if (!res.ok) throw new Error(res.error || 'refused');
        if (res.overrides) overridden = res.overrides;
        else (res.place_ids || []).forEach(function (id) { overridden[id] = {}; });   // the first version of the database function: no booking-platform numbers yet
      }
      render(); if (res) say('');
    }).catch(function (e) { render(); say('Could not load the live numbers (' + e.message + '). Showing the numbers from the last build.', true); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) { b.addEventListener('click', function () { filter = b.dataset.f; show(); }); });
  document.getElementById('ct-q').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); show(); });
  document.getElementById('ct-refresh').addEventListener('click', load);
  document.getElementById('ct-publish').addEventListener('click', publish);
  window.addEventListener('beforeunload', function (e) { if (rows.some(function (r) { return r.tr.classList.contains('ct-dirty'); })) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
