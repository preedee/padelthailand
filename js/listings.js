// Tournaments and Events listing pages (Phase 1b). Reads data/tournaments.json or data/events.json (built from the
// Google Sheet by scripts/build-listings.ts), plus clubs.json for venue names. "Today" is always Bangkok time.
(function () {
  'use strict';
  var page = document.body.getAttribute('data-listing');
  var root = document.getElementById('listing-root');
  if (!page || !root) return;

  var INK = '#2D2A4A';
  var REGION_COLOR = { 'Bangkok': INK, 'Samui, Phangan, & Tao': '#0E7C86', 'Phuket': '#C2367A', 'Pattaya': '#E08A2E', 'Hua Hin': '#C2367A', 'Chiang Mai': '#B23A2E', 'Krabi': '#C2367A', 'Koh Chang': '#E08A2E' };
  var REGIONS = Object.keys(REGION_COLOR);
  var GENDER_LABEL = { Men: "Men's", Women: "Women's", Mixed: 'Mixed', Open: 'Open' };
  var LEVEL_ORDER = ['Beginner', 'Improver', 'Intermediate', 'Advanced', 'Open'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var IG = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3"/><path d="M16.5 7.5v.01"/></svg>';
  var POSTER = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 5"/></svg>';
  var CLOCK = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  function utc(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function dow(s) { return utc(s).getUTCDay(); }
  function lastOfMonth(ym) { var p = ym.split('-'); return iso(new Date(Date.UTC(+p[0], +p[1], 0, 12))); }
  function monthKey(s) { return s.slice(0, 7); }
  function monthLabel(ym) { var p = ym.split('-'); return MONTH[+p[1] - 1] + ' ' + p[0]; }
  function nextMonth(ym) { var p = ym.split('-'); var n = +p[1] === 12 ? [+p[0] + 1, 1] : [+p[0], +p[1] + 1]; return n[0] + '-' + String(n[1]).padStart(2, '0'); }
  function dayText(s) { var p = s.split('-'); return +p[2] + ' ' + MON[+p[1] - 1]; }
  function dayLong(s) { return DAY[dow(s)].slice(0, 3) + ' ' + dayText(s); }
  function time12(t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return ''; var h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function readableOn(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? INK : '#FFFFFF'; }
  function baht(s) { s = String(s || '').trim(); if (!s) return ''; return /^\d[\d,]*(\.\d+)?$/.test(s) ? '฿' + s : s; }
  function priceNum(s) { var m = /[\d,]+(\.\d+)?/.exec(String(s || '')); return m ? parseFloat(m[0].replace(/,/g, '')) : null; }

  var params = new URLSearchParams(location.search);
  function syncUrl(st) {
    var q = new URLSearchParams();
    if (st.tab && st.tab !== 'up') q.set('tab', st.tab);
    if (st.club) q.set('club', st.club);
    if (st.q) q.set('q', st.q);
    if (st.region && st.region.length) q.set('region', st.region.join('|'));
    var s = q.toString(); try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) {}
  }

  fetch('/data/' + page + '.json').then(function (r) { return r.json(); }).then(start).catch(function () {
    root.innerHTML = '<div class="empty-state"><h2>Listings Could Not Load</h2><p>Please Refresh the Page. If It Keeps Happening, Tell Us on Instagram.</p></div>';
  });

  function start(data) {
    var items = data.tournaments || data.events || [], names = {};
    items.forEach(function (x) { if (x.clubSlug) names[x.clubSlug] = x.clubName; });
    var clubName = function (slug) { return names[slug] || ''; };
    if (page === 'tournaments') tournaments(data.tournaments || [], clubName); else events(data.events || [], clubName);
  }

  // ---------- shared pieces ----------
  /** all options are shown; ones with nothing in the data are disabled so the filter set stays the same as the design's */
  function chipGroup(key, label, opts, sel, avail) {
    if (!opts.length) return '';
    return '<fieldset class="fgroup"><legend>' + esc(label) + '</legend><div class="fchips">' + opts.map(function (o) {
      var off = avail && avail.indexOf(o) < 0;
      return '<button type="button" class="chip" data-g="' + key + '" data-v="' + esc(o) + '" aria-pressed="' + (sel.indexOf(o) > -1 ? 'true' : 'false') + '"' + (off ? ' disabled title="Nothing Listed Right Now"' : '') + '>' + esc(GENDER_LABEL[o] && key === 'gender' ? GENDER_LABEL[o] : o) + '</button>';
    }).join('') + '</div></fieldset>';
  }
  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i > -1) arr.splice(i, 1); else arr.push(v); }
  function uniq(list, fn) { var s = {}; list.forEach(function (x) { (fn(x) || []).forEach(function (v) { if (v) s[v] = 1; }); }); return Object.keys(s); }
  function ordered(vals, order) { return order.filter(function (o) { return vals.indexOf(o) > -1; }).concat(vals.filter(function (v) { return order.indexOf(v) < 0; }).sort()); }
  function where(item, clubName) {
    var c = item.clubSlug ? '<a href="/clubs/' + esc(item.clubSlug) + '/">' + esc(clubName(item.clubSlug)) + '</a>' : esc(item.venueText || '');
    var parts = [c, esc(item.region || item.city || '')].filter(Boolean);
    if (!parts.length) return '';
    return '<p class="lwhere" style="--rc:' + (item.lineColor || REGION_COLOR[item.region] || INK) + '"><span class="dot-line" aria-hidden="true"></span><span>' + parts.join(' · ') + '</span></p>';
  }
  function shell(sortHtml, bar) {
    return '<div class="listing-layout"><details class="filters-panel" id="fpanel"><summary>Filters <span aria-hidden="true">+</span></summary><div id="fside"></div></details><section>' +
      '<div class="listing-bar">' + bar + '<span class="mono shown" id="shown" aria-live="polite"></span>' + sortHtml + '</div><div class="active-chips" id="fchips"></div><div id="fres"></div></section></div>';
  }
  function openPanel() { var p = document.getElementById('fpanel'); if (window.matchMedia('(min-width:1001px)').matches) p.open = true; }
  function chipsHtml(list) { return list.map(function (x) { return '<button type="button" data-rm="' + x[0] + '" data-v="' + esc(x[1]) + '" aria-label="Remove filter ' + esc(x[2]) + '">' + esc(x[2]) + ' ×</button>'; }).join(''); }

  // ---------- tournaments ----------
  function tournaments(all, clubName) {
    var T = all.map(function (t) {
      var start = t.startDate || (t.monthOnly ? t.monthOnly + '-01' : null);
      var end = t.endDate || t.startDate || (t.monthOnly ? lastOfMonth(t.monthOnly) : null);
      t._start = start || '9999-12-31'; t._end = end || '9999-12-31'; t._up = !!end && end >= TODAY;
      t._hay = (t.title + ' ' + t.organizer + ' ' + (t.clubSlug ? clubName(t.clubSlug) : t.venueText) + ' ' + t.city).toLowerCase();
      return t;
    });
    var hasLevels = T.some(function (t) { return t.levels && t.levels.length; }), hasFormat = T.some(function (t) { return t.format; });
    var st = { tab: params.get('tab') === 'past' ? 'past' : 'up', when: 'any', region: params.get('region') ? params.get('region').split('|') : [], gender: [], level: [], format: [], club: params.get('club') || '', q: params.get('q') || '', regOpen: false, sort: 'first', limit: 24 };
    var upCount = T.filter(function (t) { return t._up; }).length;
    var upClubs = {}; T.forEach(function (t) { if (t._up && t.clubSlug) upClubs[t.clubSlug] = 1; });
    var el = document.getElementById('t-count'); if (el) el.textContent = upCount + ' Upcoming Across ' + Object.keys(upClubs).length + ' Clubs';

    var weekEnd = addDays(TODAY, (7 - dow(TODAY)) % 7), thisM = monthKey(TODAY), nextM = nextMonth(thisM);
    var tabItems = function () { return T.filter(function (t) { return (st.tab === 'up') === t._up; }); };
    var inWhen = function (t) {
      if (st.tab === 'past' || st.when === 'any') return true;
      if (st.when === 'week') return !t.monthOnly && t._start <= weekEnd;
      if (st.when === 'month') return monthKey(t._start) === thisM || (t._start < TODAY && monthKey(t._end) >= thisM);
      if (st.when === 'next') return monthKey(t._start) === nextM;
      return true;
    };
    var visible = function () {
      var q = st.q.trim().toLowerCase();
      return tabItems().filter(function (t) {
        if (!inWhen(t)) return false;
        if (st.region.length && st.region.indexOf(t.region) < 0) return false;
        if (st.gender.length && !st.gender.some(function (g) { return (t.genders || []).indexOf(g) > -1; })) return false;
        if (st.level.length && !st.level.some(function (g) { return (t.levels || []).indexOf(g) > -1; })) return false;
        if (st.format.length && st.format.indexOf(t.format) < 0) return false;
        if (st.club && t.clubSlug !== st.club) return false;
        if (st.regOpen && !t.regUrl) return false;
        if (q && t._hay.indexOf(q) < 0) return false;
        return true;
      }).sort(function (a, b) {
        var c = a._start.localeCompare(b._start) || a.title.localeCompare(b.title);
        // upcoming: soonest first; past: newest first. "late" flips whichever the tab starts with.
        var newestFirst = st.tab === 'past';
        return (newestFirst ? -c : c) * (st.sort === 'last' ? -1 : 1);
      });
    };

    function dateBox(t) {
      if (t.startDate) { var p = t.startDate.split('-'); return '<span class="ldate"><small>' + MON[+p[1] - 1] + '</small><b>' + +p[2] + '</b></span>'; }
      return '<span class="ldate"><small>' + (t.monthOnly ? MON[+t.monthOnly.slice(5) - 1] : 'TBC') + '</small><b>TBC</b></span>';
    }
    function dateText(t) {
      if (t.startDate) { var e = t.endDate && t.endDate !== t.startDate ? t.endDate : null;
        return e ? dayLong(t.startDate) + ' – ' + dayLong(e) + ' ' + e.slice(0, 4) : dayLong(t.startDate) + ' ' + t.startDate.slice(0, 4); }
      return t.monthOnly ? monthLabel(t.monthOnly) + ' (Date to Be Confirmed)' : 'Date to Be Confirmed';
    }
    /** every card gets an action: registration, then the Instagram post, then the club page, then the organiser */
    function actions(t) {
      var a = '', primary = false;
      if (t._up && t.regUrl) { a += '<a class="btn solid" href="' + esc(t.regUrl) + '" target="_blank" rel="noopener">' + esc(t.regLabel) + '</a>'; primary = true; }
      if (t._up && t.regUrl2) a += '<a class="btn" href="' + esc(t.regUrl2) + '" target="_blank" rel="noopener">' + esc(t.regLabel2) + '</a>';
      if (t.instagramUrl) {
        var label = t._up ? 'View Details' : 'View Results & Photos';
        a += primary ? '<a class="btn icon" href="' + esc(t.instagramUrl) + '" target="_blank" rel="noopener" aria-label="Open the Instagram post for ' + esc(t.title) + '">' + IG + '</a>'
          : '<a class="btn solid" href="' + esc(t.instagramUrl) + '" target="_blank" rel="noopener">' + esc(label) + '</a>';
        primary = true;
      }
      if (!primary) {
        if (t.clubSlug) a += '<a class="btn" href="/clubs/' + esc(t.clubSlug) + '/">See the Club</a>';
        else if (t.organizerWebsite) a += '<a class="btn" href="' + esc(t.organizerWebsite) + '" target="_blank" rel="noopener">Organiser Website</a>';
        else if (t.organizerInstagram) a += '<a class="btn" href="' + esc(t.organizerInstagram) + '" target="_blank" rel="noopener">' + IG + '<span>Organiser Instagram</span></a>';
      }
      return a ? '<div class="lacts">' + a + '</div>' : '';
    }
    function card(t) {
      var bg = t.organizerColor || '#E3E5E7';
      var img = t.poster
        ? '<img loading="lazy" decoding="async" src="' + esc(t.poster.src) + '" width="' + t.poster.w + '" height="' + t.poster.h + '" alt="' + esc(t.title + ', ' + dateText(t)) + '">'
        : '<div class="tile" style="background:' + bg + ';color:' + readableOn(bg) + '"><span>' + esc(t.title) + '</span><small>' + esc(t.organizer) + '</small></div>';
      var badge = t._up ? (t.regUrl ? '<span class="lbadge">Register Online</span>' : '') : '<span class="lbadge done">Completed</span>';
      var tags = [].concat(t.genders || [], t.levels || [], t.format ? [t.format] : [], t.tags || []).map(function (x) { return '<span>' + esc(GENDER_LABEL[x] || x) + '</span>'; }).join('');
      var fee = [t.entryFee ? 'Entry ' + esc(baht(t.entryFee)) : '', t.prize ? 'Prize ' + esc(t.prize) : ''].filter(Boolean);
      return '<article class="lcard"><div class="lposter">' + img + badge + dateBox(t) + '</div><div class="lbody"><h3>' + esc(t.title) + '</h3>' +
        '<p class="lmeta"><strong>' + esc(dateText(t)) + '</strong></p>' + where(t, clubName) + (tags ? '<div class="ltags">' + tags + '</div>' : '') +
        (t.organizer ? '<p class="lsrc">Listed by ' + esc(t.organizer) + '</p>' : '') + (fee.length ? '<p class="lmeta"><span>' + fee.join(' · ') + '</span></p>' : '') +
        actions(t) + '</div></article>';
    }
    function group(title, sub, items) {
      return '<div class="gh"><h2>' + esc(title) + '</h2>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '<span class="n">' + items.length + (items.length === 1 ? ' Tournament' : ' Tournaments') + '</span></div><div class="masonry">' + items.map(card).join('') + '</div>';
    }
    function results(list) {
      var html = '';
      if (!list.length) {
        return '<div class="empty-state"><h2>No Tournaments Match</h2><p>' + (st.tab === 'up' ? 'Nothing Upcoming Fits Those Filters. Try Clearing One, or Look at Past Results.' : 'Nothing in the Archive Fits Those Filters.') + '</p><button class="btn" type="button" data-clear>Clear Filters</button></div>';
      }
      if (st.tab === 'up') {
        var buckets = [['This Week', 'Through ' + dayText(weekEnd), []], ['This Month', monthLabel(thisM), []], ['Next Month', monthLabel(nextM), []], ['Later', '', []]];
        list.forEach(function (t) { var i = !t.monthOnly && t._start <= weekEnd ? 0 : monthKey(t._start) === thisM || (t.monthOnly && t.monthOnly < thisM) ? 1 : monthKey(t._start) === nextM ? 2 : 3; buckets[i][2].push(t); });
        buckets.forEach(function (b) { if (b[2].length) html += group(b[0], b[1], b[2]); });
      } else {
        var shown = list.slice(0, st.limit), by = {}, order = [];
        shown.forEach(function (t) { var k = monthKey(t._start); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(t); });
        order.forEach(function (k) { html += group(monthLabel(k), '', by[k]); });
      }
      if (list.length > st.limit) html += '<div class="more-row"><button class="btn" type="button" data-more>Load More Tournaments</button></div>';
      return html;
    }
    function sidebar() {
      var here = tabItems();
      var avail = uniq(here, function (t) { return [t.region]; });
      var gens = ordered(uniq(T, function (t) { return t.genders; }), ['Men', 'Women', 'Mixed', 'Open']);
      var clubsHere = uniq(here, function (t) { return [t.clubSlug]; }).sort(function (a, b) { return clubName(a).localeCompare(clubName(b)); });
      var when = [['week', 'This Week'], ['month', 'This Month'], ['next', 'Next Month'], ['any', 'Any Date']];
      return '<div class="fbody"><button type="button" class="clear-all" data-clear>Clear All</button>' +
        '<div class="fgroup"><label class="flabel" for="fq">Search</label><input id="fq" type="search" value="' + esc(st.q) + '" placeholder="Name, Organiser or Club"></div>' +
        (st.tab === 'up' ? '<fieldset class="fgroup"><legend>When</legend><div class="fchips">' + when.map(function (w) { return '<button type="button" class="chip" data-when="' + w[0] + '" aria-pressed="' + (st.when === w[0]) + '">' + w[1] + '</button>'; }).join('') + '</div></fieldset>' : '') +
        chipGroup('region', 'Region', REGIONS, st.region, avail) +
        (gens.length ? chipGroup('gender', 'Gender', gens, st.gender) : '') +
        (hasLevels ? chipGroup('level', 'Level', ordered(uniq(T, function (t) { return t.levels; }), LEVEL_ORDER), st.level) : '') +
        (hasFormat ? chipGroup('format', 'Format', uniq(T, function (t) { return [t.format]; }).sort(), st.format) : '') +
        '<div class="fgroup"><label class="flabel" for="fclub">Club</label><select id="fclub"><option value="">All Clubs</option>' + clubsHere.map(function (s) { return '<option value="' + esc(s) + '"' + (st.club === s ? ' selected' : '') + '>' + esc(clubName(s)) + '</option>'; }).join('') + '</select></div>' +
        (st.tab === 'up' ? '<label class="switch"><span>Registration Link Only</span><input type="checkbox" id="freg"' + (st.regOpen ? ' checked' : '') + '></label>' : '') + '</div>';
    }
    function activeList() {
      var a = [];
      st.region.forEach(function (v) { a.push(['region', v, v]); }); st.gender.forEach(function (v) { a.push(['gender', v, GENDER_LABEL[v] || v]); });
      st.level.forEach(function (v) { a.push(['level', v, v]); }); st.format.forEach(function (v) { a.push(['format', v, v]); });
      if (st.club) a.push(['club', st.club, clubName(st.club)]); if (st.q) a.push(['q', st.q, '"' + st.q + '"']);
      if (st.when !== 'any' && st.tab === 'up') a.push(['when', st.when, { week: 'This Week', month: 'This Month', next: 'Next Month' }[st.when]]);
      if (st.regOpen && st.tab === 'up') a.push(['regOpen', '1', 'Registration Link Only']);
      return a;
    }

    root.innerHTML = shell('<label class="sort">Sort <select id="fsort"><option value="first"></option><option value="last"></option></select></label>',
      '<div class="seg" role="group" aria-label="Show"><button type="button" data-tab="up" aria-pressed="false">Upcoming</button><button type="button" data-tab="past" aria-pressed="false">Past Results</button></div>');
    openPanel();
    function paint(keepSidebar) {
      var list = visible();
      if (!keepSidebar) document.getElementById('fside').innerHTML = sidebar();
      document.getElementById('fchips').innerHTML = chipsHtml(activeList()); document.getElementById('fres').innerHTML = results(list);
      document.getElementById('shown').textContent = list.length + (list.length === 1 ? ' Tournament' : ' Tournaments');
      Array.prototype.forEach.call(root.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-pressed', b.dataset.tab === st.tab ? 'true' : 'false'); });
      var so = document.getElementById('fsort'); so.options[0].text = st.tab === 'past' ? 'Newest First' : 'Soonest First'; so.options[1].text = st.tab === 'past' ? 'Oldest First' : 'Latest First'; so.value = st.sort;
      syncUrl(st);
    }
    var clearAll = function () { st.when = 'any'; st.region = []; st.gender = []; st.level = []; st.format = []; st.club = ''; st.q = ''; st.regOpen = false; st.limit = 24; paint(); };
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.tab) { st.tab = b.dataset.tab; st.limit = 24; st.sort = 'first'; paint(); }
      else if (b.dataset.g) { toggleIn(st[b.dataset.g], b.dataset.v); st.limit = 24; paint(); }
      else if (b.dataset.when) { st.when = b.dataset.when; paint(); }
      else if (b.hasAttribute('data-clear')) clearAll();
      else if (b.hasAttribute('data-more')) { st.limit += 24; paint(); }
      else if (b.dataset.rm) { var k = b.dataset.rm, v = b.dataset.v; if (Array.isArray(st[k])) toggleIn(st[k], v); else st[k] = k === 'when' ? 'any' : k === 'regOpen' ? false : ''; paint(); }
    });
    root.addEventListener('input', function (e) { if (e.target.id === 'fq') { st.q = e.target.value; st.limit = 24; paint(true); } });
    root.addEventListener('change', function (e) { if (e.target.id === 'fclub') { st.club = e.target.value; paint(); } else if (e.target.id === 'freg') { st.regOpen = e.target.checked; paint(); } else if (e.target.id === 'fsort') { st.sort = e.target.value; paint(); } });
    paint();
  }

  // ---------- events ----------
  function events(all, clubName) {
    var STALE_DAYS = 30, hiddenStale = 0;
    var days = function (a, b) { return Math.round((utc(b) - utc(a)) / 86400000); };
    var fresh = all.filter(function (e) {
      if (e.recurrence && e.lastConfirmedAt && days(e.lastConfirmedAt, TODAY) > STALE_DAYS) { hiddenStale++; return false; }
      return true;
    });
    var occ = [];   // concrete occurrences over the next 14 days
    fresh.forEach(function (e) {
      for (var i = 0; i < 14; i++) {
        var d = addDays(TODAY, i), ok = false;
        if (e.date) ok = e.date === d; else if (e.recurrence) ok = DAY[dow(d)] === e.recurrence.weekday && (!e.recurrence.until || d <= e.recurrence.until);
        if (ok) occ.push({ e: e, d: d, i: i });
      }
    });
    var el = document.getElementById('e-count');
    var clubSet = {}; occ.filter(function (o) { return o.i < 7; }).forEach(function (o) { if (o.e.clubSlug) clubSet[o.e.clubSlug] = 1; });
    if (el && all.length) el.textContent = occ.filter(function (o) { return o.i < 7; }).length + ' This Week Across ' + Object.keys(clubSet).length + ' Clubs';

    if (!all.length) {
      root.innerHTML = '<div class="empty-state"><h2>No Events Listed Yet</h2><p>Weekly Americanos, Clinics, Socials and League Nights Will Show Up Here as Clubs and Organisers Add Them. Run One? List It Free, and It Repeats Every Week Until You Stop It.</p><div class="empty-acts"><a class="btn solid" href="/submit/#event">Submit an Event</a><a class="btn" href="/clubs/">Browse Clubs</a></div></div>';
      return;
    }
    var st = { when: '', type: [], region: [], level: [], gender: [], showNext: false, sort: 'soon' };
    var TYPES = ['Americano', 'Mexicano', 'Clinic', 'Social', 'League Night'];
    var hasLevels = fresh.some(function (e) { return e.levels && e.levels.length; }), hasGender = fresh.some(function (e) { return e.genders && e.genders.length; });
    var weekendDay = function (d) { var w = dow(d); return w === 0 || w === 6; };
    var pass = function (o) {
      var e = o.e;
      if (st.when === 'today' && o.i !== 0) return false; if (st.when === 'tomorrow' && o.i !== 1) return false;
      if (st.when === 'week' && o.i > 6) return false; if (st.when === 'weekend' && !(weekendDay(o.d) && o.i < 7)) return false;
      if (st.type.length && st.type.indexOf(e.type) < 0) return false; if (st.region.length && st.region.indexOf(e.region) < 0) return false;
      if (st.level.length && !st.level.some(function (l) { return (e.levels || []).indexOf(l) > -1; })) return false;
      if (st.gender.length && !st.gender.some(function (g) { return (e.genders || []).indexOf(g) > -1; })) return false;
      return true;
    };
    function cmp(a, b) {
      if (st.sort === 'price') { var x = priceNum(a.e.pricePp), y = priceNum(b.e.pricePp); if (x !== y) return x == null ? 1 : y == null ? -1 : x - y; }
      if (st.sort === 'spots') { var s = (b.e.capacity || 0) - (a.e.capacity || 0); if (s) return s; }
      return (a.e.startTime || '').localeCompare(b.e.startTime || '') || a.e.title.localeCompare(b.e.title);
    }
    function card(o) {
      var e = o.e;
      var whenWord = e.recurrence ? 'Weekly · Every ' + e.recurrence.weekday : 'One-Off';
      var clock = e.recurrence ? 'Every ' + e.recurrence.weekday : dayLong(o.d);
      var span = [time12(e.startTime), time12(e.endTime)].filter(Boolean).join(' – ');
      var tags = [].concat(e.type ? [e.type] : [], e.levels || [], (e.genders || []).map(function (g) { return GENDER_LABEL[g] || g; })).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
      var price = baht(e.pricePp);
      var act = e.signupUrl ? '<a class="btn" href="' + esc(e.signupUrl) + '" target="_blank" rel="noopener">Details &amp; Sign-Up</a>' : (e.clubSlug ? '<a class="btn" href="/clubs/' + esc(e.clubSlug) + '/">See the Club</a>' : '');
      var poster = e.posterUrl ? '<a class="btn icon" href="' + esc(e.posterUrl) + '" target="_blank" rel="noopener" aria-label="View the poster for ' + esc(e.title) + '">' + POSTER + '</a>' : '';
      return '<article class="lcard"><div class="lposter"><div class="tile" style="background:#E3E5E7;color:' + INK + '"><span>' + esc(e.type || 'Event') + '</span><small>Poster Not Provided</small></div><span class="lbadge wk">' + esc(whenWord) + '</span></div>' +
        '<div class="lbody"><h3>' + esc(e.title) + '</h3>' + where(e, clubName) +
        '<p class="lmeta clockrow">' + CLOCK + '<span>' + esc(clock) + (span ? ' · ' + esc(span) : '') + '</span></p>' +
        (tags ? '<div class="ltags">' + tags + '</div>' : '') +
        (price ? '<p class="lprice"><b>' + esc(price) + '</b> per Player' + (e.signupUrl ? ' · <span>Sign Up With Organiser</span>' : '') + (e.capacity ? '<span class="cap">' + e.capacity + ' Spots</span>' : '') + '</p>' : '') +
        ((act || poster) ? '<div class="lacts">' + act + poster + '</div>' : '') + '<p class="lsrc">Listed by Organiser</p></div></article>';
    }
    function grp(title, sub, list) {
      list.sort(cmp);
      return '<div class="gh"><h2>' + esc(title) + '</h2><span class="sub">' + esc(sub) + '</span><span class="n">' + list.length + (list.length === 1 ? ' Event' : ' Events') + '</span></div><div class="masonry">' + list.map(card).join('') + '</div>';
    }
    function side() {
      var when = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This Week'], ['weekend', 'Weekend']];
      var avail = uniq(fresh, function (e) { return [e.region]; });
      var types = ordered(uniq(fresh, function (e) { return [e.type]; }), TYPES);
      return '<div class="fbody"><button type="button" class="clear-all" data-clear>Clear All</button><fieldset class="fgroup"><legend>When</legend><div class="fchips">' + when.map(function (w) { return '<button type="button" class="chip" data-when="' + w[0] + '" aria-pressed="' + (st.when === w[0]) + '">' + w[1] + '</button>'; }).join('') + '</div></fieldset>' +
        chipGroup('type', 'Type', types, st.type) + chipGroup('region', 'Region', REGIONS, st.region, avail) +
        (hasLevels ? chipGroup('level', 'Level', ordered(uniq(fresh, function (e) { return e.levels; }), LEVEL_ORDER), st.level) : '') +
        (hasGender ? chipGroup('gender', 'Gender', ordered(uniq(fresh, function (e) { return e.genders; }), ['Mixed', 'Women', 'Men', 'Open']), st.gender) : '') + '</div>';
    }
    function activeList() {
      var a = []; if (st.when) a.push(['when', st.when, { today: 'Today', tomorrow: 'Tomorrow', week: 'This Week', weekend: 'Weekend' }[st.when]]);
      ['type', 'region', 'level', 'gender'].forEach(function (k) { st[k].forEach(function (v) { a.push([k, v, k === 'gender' ? (GENDER_LABEL[v] || v) : v]); }); });
      return a;
    }
    function results(list) {
      var s = function (n) { return dayLong(addDays(TODAY, n)); };
      var buckets = [['Today', s(0), []], ['Tomorrow', s(1), []], ['Later This Week', 'Through ' + dayText(addDays(TODAY, 6)), []], ['Next Week', dayText(addDays(TODAY, 7)) + ' – ' + dayText(addDays(TODAY, 13)), []]];
      list.forEach(function (o) { buckets[o.i === 0 ? 0 : o.i === 1 ? 1 : o.i < 7 ? 2 : 3][2].push(o); });
      var html = '', nextHas = buckets[3][2].length;
      buckets.forEach(function (b, i) { if (b[2].length && (i < 3 || st.showNext)) html += grp(b[0], b[1], b[2]); });
      if (!html) html = '<div class="empty-state"><h2>No Events Match</h2><p>Nothing in the Next Two Weeks Fits Those Filters.</p><button class="btn" type="button" data-clear>Clear Filters</button></div>';
      if (nextHas && !st.showNext) html += '<div class="more-row"><button class="btn" type="button" data-next>Show Next Week</button></div>';
      if (hiddenStale) html += '<p class="pick-note">' + hiddenStale + (hiddenStale === 1 ? ' Weekly Event Is' : ' Weekly Events Are') + ' Hidden Because Its Organiser Has Not Confirmed It in Over ' + STALE_DAYS + ' Days.</p>';
      return html;
    }
    root.innerHTML = shell('<label class="sort">Sort <select id="fsort"><option value="soon">Soonest First</option><option value="price">Lowest Price</option><option value="spots">Most Spots</option></select></label>', '');
    openPanel();
    function paint() {
      var list = occ.filter(pass), week = list.filter(function (o) { return o.i < 7; }).length;
      document.getElementById('fside').innerHTML = side(); document.getElementById('fchips').innerHTML = chipsHtml(activeList()); document.getElementById('fres').innerHTML = results(list);
      document.getElementById('shown').textContent = week + (week === 1 ? ' Event' : ' Events') + ' This Week'; document.getElementById('fsort').value = st.sort;
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.g) toggleIn(st[b.dataset.g], b.dataset.v);
      else if (b.dataset.when) st.when = st.when === b.dataset.when ? '' : b.dataset.when;
      else if (b.dataset.rm) { var k = b.dataset.rm; if (Array.isArray(st[k])) toggleIn(st[k], b.dataset.v); else st[k] = ''; }
      else if (b.hasAttribute('data-clear')) st = { when: '', type: [], region: [], level: [], gender: [], showNext: st.showNext, sort: st.sort };
      else if (b.hasAttribute('data-next')) st.showNext = true; else return;
      paint();
    });
    root.addEventListener('change', function (e) { if (e.target.id === 'fsort') { st.sort = e.target.value; paint(); } });
    paint();
  }
})();
