// Shared behaviour for the redesigned directory pages: mobile nav, Clubs filters + view switch, photo gallery,
// Show to Driver, copy buttons, and "Open Now" (computed in Bangkok time from the club's listed hours).
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---- mobile nav ----
  var tg = $('.nav-toggle'), nav = $('#site-nav');
  if (tg && nav) tg.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    tg.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  // Escape closes the open menu and hands focus back to the button
  if (tg && nav) document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); tg.setAttribute('aria-expanded', 'false'); tg.focus(); }
  });

  // ---- Clubs page: region filters + Photos / List ----
  var grid = $('#club-grid');
  if (grid && $('#showing') && $('#no-match')) {   // the Clubs page only
    var cards = $$('.pcard', grid), active = 'all';
    var showing = $('#showing'), none = $('#no-match');
    var apply = function () {
      var n = 0;
      cards.forEach(function (c) {
        var ok = active === 'all' || (active === '__book' ? (c.dataset.flags || '').indexOf('book') > -1 : c.dataset.region === active);
        c.hidden = !ok; if (ok) n++;
      });
      showing.textContent = 'Showing ' + n + ' of ' + cards.length + ' Clubs';
      none.hidden = n > 0;
      $$('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.filter === active ? 'true' : 'false'); });
    };
    $$('[data-filter]').forEach(function (b) { b.addEventListener('click', function () { active = b.dataset.filter; apply(); try { history.replaceState(null, '', active === 'all' ? location.pathname : '#' + (active === '__book' ? 'book' : encodeURIComponent(active))); } catch (e) {} }); });
    $$('[data-view]').forEach(function (b) { b.addEventListener('click', function () {
      grid.classList.toggle('list', b.dataset.view === 'list');
      $$('[data-view]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    }); });
    var fromHash = function () {
      var h = decodeURIComponent((location.hash || '').slice(1));
      if (h === 'book') active = '__book';
      else if ($$('[data-filter]').some(function (b) { return b.dataset.filter === h; })) active = h;
      else active = 'all';
      apply();
    };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  // ---- gallery ----
  var gal = $('[data-gal]');
  if (gal) {
    var photos = []; try { photos = JSON.parse(gal.dataset.photos); } catch (e) {}
    var i = 0, img = $('[data-main]', gal), cr = $('[data-credit]', gal), nm = gal.dataset.name;
    var show = function (n) {
      if (!photos.length) return;
      i = (n + photos.length) % photos.length;
      img.src = photos[i].u; img.alt = nm + ' photo ' + (i + 1) + ' of ' + photos.length;
      cr.textContent = photos[i].a ? 'Photo: ' + photos[i].a + ' · Google Maps' : '';
      $$('.th', gal).forEach(function (t) { t.setAttribute('aria-current', Number(t.dataset.i) === i ? 'true' : 'false'); });
    };
    var p = $('[data-prev]', gal), n = $('[data-next]', gal);
    if (p) p.addEventListener('click', function () { show(i - 1); });
    if (n) n.addEventListener('click', function () { show(i + 1); });
    $$('.th', gal).forEach(function (t) { t.addEventListener('click', function () { show(Number(t.dataset.i)); }); });
  }

  // ---- Show to Driver + copy ----
  var drv = $('#driver');
  var openD = $('[data-driver]'), closeD = $('[data-driver-close]');
  if (drv && openD) {
    // While the dialog is open the rest of the page is inert, so Tab cannot leave it
    var setBg = function (off) {
      // inert every sibling along the path from the dialog up to <body>, never the dialog or its ancestors
      for (var n = drv; n && n !== document.body; n = n.parentNode) {
        Array.prototype.forEach.call(n.parentNode.children, function (sib) {
          if (sib === n || /^(SCRIPT|STYLE|LINK)$/.test(sib.tagName)) return;
          if (off) sib.setAttribute('inert', ''); else sib.removeAttribute('inert');
        });
      }
    };
    var shut = function () { drv.hidden = true; setBg(false); openD.focus(); };
    openD.addEventListener('click', function () { drv.hidden = false; setBg(true); if (closeD) closeD.focus(); });
    if (closeD) closeD.addEventListener('click', shut);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drv.hidden) shut(); });
  }
  $$('[data-copy]').forEach(function (b) { b.addEventListener('click', function () {
    var t = b.dataset.copy, old = b.textContent;
    var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {}); }); });

  // ---- hours: highlight today, compute Open Now ----
  var list = $('[data-hours]'), badge = $('[data-open]');
  if (list) {
    var fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: false });
    var parts = {}; fmt.formatToParts(new Date()).forEach(function (x) { parts[x.type] = x.value; });
    var day = parts.weekday, nowM = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
    var row = $$('li', list).filter(function (li) { return li.dataset.day === day; })[0];
    if (row) row.classList.add('today');
    var toM = function (s) {
      var m = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(s); if (!m) return null;
      var h = Number(m[1]) % 12, mm = Number(m[2] || 0);
      if (/PM/i.test(m[3] || '')) h += 12; return h * 60 + mm;
    };
    var label = function (m) { if (m % 1440 === 0) return 'Midnight'; var h = Math.floor(m / 60) % 24, mm = m % 60, ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap; };
    if (row && badge) {
      var txt = row.lastElementChild.textContent.trim();
      var status = null;
      if (/open 24/i.test(txt)) status = { open: true, text: 'Open Now · 24 Hours' };
      else if (/closed/i.test(txt)) status = { open: false, text: 'Closed Today' };
      else {
        var ok = true, hit = null;
        // [start, end] minute pairs for one day's text; an end past 1440 means it closes after midnight
        var rangesOf = function (t) {
          var out = [];
          t.split(/,\s*(?=\d)/).forEach(function (r) {
            var se = r.split(/\s*[–-]\s*/); if (se.length !== 2) { ok = false; return; }
            // "8:00 – 10:00 PM": borrow the period from the closing time when the opening time has none
            var per = /(AM|PM)/i.exec(se[1]); var a = se[0]; if (per && !/(AM|PM)/i.test(a)) a += ' ' + per[1];
            var s0 = toM(a), e0 = toM(se[1]); if (s0 == null || e0 == null) { ok = false; return; }
            if (e0 <= s0) e0 += 1440;
            out.push([s0, e0]);
          });
          return out;
        };
        rangesOf(txt).forEach(function (r) { if (nowM >= r[0] && nowM < r[1]) hit = r[1]; });
        // Yesterday's late close (e.g. 7 AM - 2 AM) still covers the early hours of today
        var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var prev = $$('li', list).filter(function (li) { return li.dataset.day === DAYS[(DAYS.indexOf(day) + 6) % 7]; })[0];
        var ptxt = prev ? prev.lastElementChild.textContent.trim() : '';
        if (hit == null && ptxt && !/open 24|closed/i.test(ptxt)) rangesOf(ptxt).forEach(function (r) { if (nowM + 1440 < r[1]) hit = r[1] - 1440; });
        if (ok) status = hit != null ? { open: true, text: 'Open Now · Until ' + label(hit) } : { open: false, text: 'Closed Now' };
      }
      if (status) { badge.textContent = status.text; badge.classList.toggle('closed', !status.open); badge.hidden = false; }
    }
  }
})();
