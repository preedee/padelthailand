// Live court availability for clubs that take bookings on Setpoint (The Padel Society). Read straight from the
// public Setpoint API in the browser (no key, CORS open); nothing is written and no visitor data leaves the page.
// Two mounts: the 7-day grid on a club page (`[data-avail]`) and the "Book a Court Now" rows in the home-page
// panel (`ptAvail.mountHome`). Every slot links to the club's Setpoint checkout. If the API fails, the page keeps
// its plain Book button and says the live view is unavailable.
window.ptAvail = (function () {
  'use strict';
  var API = 'https://admin.getsetpoint.io/api/v1/facilities/';
  var TZ = 'Asia/Bangkok', cache = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // the clubs are all on Thai time, so "today" and "now" are Bangkok's whatever the visitor's clock says
  function parts(d) {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }
  function ymd(p) { return p.year + '-' + p.month + '-' + p.day; }
  function days(n) {
    var out = [], now = Date.now();
    for (var i = 0; i < n; i++) { var p = parts(new Date(now + i * 864e5)); out.push({ date: ymd(p), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : p.weekday + ' ' + String(+p.day), short: i === 0 ? 'Today' : p.weekday + ' ' + String(+p.day) }); }
    return out;
  }
  function nowMin() { var p = parts(new Date()); return (+p.hour % 24) * 60 + (+p.minute); }
  function min(t) { var a = t.split(':'); return (+a[0]) * 60 + (+a[1]); }
  function hhmm(t) { return t.slice(0, 5); }
  function h12(t) { var m = min(t), h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (h < 12 || h === 24 ? ' AM' : ' PM'); }

  function fetchDay(slug, date) {
    var k = slug + '|' + date;
    if (!cache[k]) cache[k] = fetch(API + encodeURIComponent(slug) + '/availability?date=' + date + '&sport=padel').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (e) { delete cache[k]; throw e; });
    return cache[k];
  }
  // free start times per court; on today's date only the ones still ahead of us
  function freeByCourt(data, isToday) {
    var cut = isToday ? nowMin() : -1;
    return (data.courts || []).map(function (c) {
      var free = (c.slots || []).filter(function (s) { return s.status === 'available' && min(s.start_time) > cut; }).map(function (s) { return hhmm(s.start_time); });
      return { name: c.court_name || 'Court', indoor: !!c.is_indoor, free: free, total: (c.slots || []).length };
    });
  }
  function summary(data, isToday) {
    var courts = freeByCourt(data, isToday), starts = {}, n = 0;
    courts.forEach(function (c) { c.free.forEach(function (t) { starts[t] = 1; n++; }); });
    var keys = Object.keys(starts).sort();
    return { free: n, next: keys[0] || null, courts: courts.length, closed: courts.every(function (c) { return !c.total; }) };
  }
  function track(name, p) { if (window.ptTrack) window.ptTrack(name, p); }

  // ---- club page: 7-day grid ----
  function mountClub(el) {
    var slug = el.getAttribute('data-avail'), url = el.getAttribute('data-url'), club = el.getAttribute('data-club') || '', body = el.querySelector('[data-avail-body]');
    var list = days(7), cur = 0;
    var tabs = '<div class="days" role="tablist" aria-label="Day">' + list.map(function (d, i) { return '<button type="button" class="chip sq" role="tab" data-day="' + i + '" aria-selected="' + (i === 0) + '">' + esc(d.short) + '</button>'; }).join('') + '</div>';
    body.innerHTML = tabs + '<div class="grid" data-grid><p class="fine">Checking live availability…</p></div>';
    var grid = body.querySelector('[data-grid]');
    function show(i) {
      cur = i; Array.prototype.forEach.call(body.querySelectorAll('[data-day]'), function (b) { b.setAttribute('aria-selected', String(+b.getAttribute('data-day') === i)); });
      grid.innerHTML = '<p class="fine">Checking live availability…</p>';
      var d = list[i];
      fetchDay(slug, d.date).then(function (data) {
        if (cur !== i) return;
        var courts = freeByCourt(data, i === 0), any = courts.some(function (c) { return c.free.length; });
        if (!courts.length || courts.every(function (c) { return !c.total; })) { grid.innerHTML = '<p class="fine">Closed ' + esc(d.label.toLowerCase()) + '.</p>'; return; }
        if (!any) { grid.innerHTML = '<p class="fine">' + (i === 0 ? 'No courts left today. ' : 'Fully booked ' + esc(d.label.toLowerCase()) + '. ') + 'Try another day.</p>'; return; }
        grid.innerHTML = courts.map(function (c) {
          return '<div class="court"><div class="cn">' + esc(c.name) + (c.indoor ? ' <small>Indoor</small>' : '') + '</div><div class="slots">' +
            (c.free.length ? c.free.map(function (t) { return '<a class="slot" href="' + esc(url) + '" target="_blank" rel="noopener" data-track="slot_click" data-t-club_slug="' + esc(club) + '" data-t-day="' + i + '" data-t-start="' + esc(t) + '" data-t-place="club_page">' + esc(h12(t)) + '</a>'; }).join('') : '<span class="fine">Booked</span>') +
            '</div></div>';
        }).join('') + '<p class="fine">Live from The Padel Society. Times are Thai time, 60-minute slots. Tap a time to book on Setpoint.</p>';
        if (i === 0) track('availability_view', { club_slug: club, place: 'club_page', free: courts.reduce(function (a, c) { return a + c.free.length; }, 0) });
      }).catch(function () { if (cur === i) grid.innerHTML = '<p class="fine">Live availability is not available right now. Use the Book button to see times on Setpoint.</p>'; });
    }
    body.addEventListener('click', function (e) { var b = e.target.closest('[data-day]'); if (b) show(+b.getAttribute('data-day')); });
    show(0);
  }

  // ---- home panel: one line per club, today ----
  function mountHome(root) {
    var rows = root.querySelectorAll('[data-bn-slug]'); if (!rows.length) return;
    var today = days(1)[0].date;
    Array.prototype.forEach.call(rows, function (row) {
      var slug = row.getAttribute('data-bn-slug'), out = row.querySelector('[data-bn-status]');
      fetchDay(slug, today).then(function (data) {
        var s = summary(data, true);
        if (s.closed) { out.textContent = 'Closed today'; out.className = 'bn-st dim'; }
        else if (!s.free) { out.textContent = 'No courts left today'; out.className = 'bn-st dim'; }
        else { out.textContent = 'Free from ' + h12(s.next) + ' · ' + s.free + (s.free === 1 ? ' slot' : ' slots') + ' today'; out.className = 'bn-st ok'; }
      }).catch(function () { out.textContent = 'See times on Setpoint'; out.className = 'bn-st dim'; });
    });
    track('availability_view', { place: 'home_panel', clubs: rows.length });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-avail]'), mountClub);
  var api = { mountHome: mountHome, days: days, summary: summary, freeByCourt: freeByCourt };
  setTimeout(function () { document.dispatchEvent(new CustomEvent('ptavail-ready')); }, 0);
  return api;
})();
