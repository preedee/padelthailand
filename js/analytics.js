// Analytics for padelthailand.com: GA4 events + a consent banner (Consent Mode v2).
//
// Pageviews come from the gtag snippet in the page head (scripts/lib/chrome.ts). This file adds:
//   1. window.ptTrack(name, params): the one function every script uses to send an event.
//   2. One delegated click listener: any element with data-track="event_name" sends that event; every attribute
//      named data-t-<key> becomes the parameter <key>. Plain tel: and external links are tracked automatically.
//   3. The cookie banner and "Cookie Settings" link, when data/site-config.json analyticsConsent is "required".
//
// Privacy: events carry only page-level facts (club slug, platform, form type, filter group). Never names, emails or
// free text, with one exception: the listing search term (lower-cased, 40 characters at most).
(function () {
  'use strict';
  var CFG = window.PT_ANALYTICS || { consent: 'off' };
  var KEY = 'pt-consent';

  function track(name, params) {
    if (typeof window.gtag !== 'function') return;
    try { window.gtag('event', name, params || {}); } catch (e) { /* analytics must never break the page */ }
  }
  window.ptTrack = track;

  // ---- delegated click tracking ----
  function paramsOf(el) {
    var out = {}, a = el.attributes;
    for (var i = 0; i < a.length; i++) if (a[i].name.indexOf('data-t-') === 0) out[a[i].name.slice(7)] = a[i].value;
    return out;
  }
  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-track],a[href]') : null;
    if (!el) return;
    var name = el.getAttribute('data-track');
    if (name) { track(name, paramsOf(el)); return; }
    var href = el.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) { track('contact_click', { method: 'phone' }); return; }
    try {
      var u = new URL(href, location.href);
      if (/^https?:$/.test(u.protocol) && u.host !== location.host) track('outbound_click', { host: u.host.replace(/^www\./, '') });
    } catch (err) { /* not a URL */ }
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', function (e) { if (e.button === 1) onClick(e); }, true);   // middle-click opens in a new tab and fires auxclick, not click

  // ---- debounced search tracking (listing pages and the home finder) ----
  // A search term is only sent when it returned results (so it matched a club, station or tournament on the site); anything
  // else, which could be a name or a phone number, is reported as "(no results)". Terms are lower-cased and cut at 40 characters.
  var timers = {};
  window.ptTrackSearch = function (where, term, hasResults) {
    clearTimeout(timers[where]);
    term = String(term || '').trim().toLowerCase().slice(0, 40);
    if (term.length < 2) return;
    timers[where] = setTimeout(function () { track('search', { where: where, search_term: hasResults ? term : '(no results)' }); }, 900);
  };

  // ---- consent banner ----
  if (CFG.consent !== 'required') return;
  var STYLE = '.cookie-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:760px;margin:0 auto;background:#fff;color:#2D2A4A;border:1.5px solid #2D2A4A;border-radius:6px;box-shadow:6px 6px 0 #2D2A4A;padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:space-between;font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif}' +
    '.cookie-bar p{margin:0;flex:1 1 320px}.cookie-bar a{color:#2D2A4A}.cookie-acts{display:flex;gap:8px}' +
    '.cookie-bar .btn{min-height:44px;padding:0 16px;border-radius:4px;border:1.5px solid #2D2A4A;background:#fff;color:#2D2A4A;font:600 15px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer}.cookie-bar .btn.solid{background:#2D2A4A;color:#fff}' +
    'body.cookie-open{padding-bottom:130px}@media(max-width:760px){body.cookie-open{padding-bottom:190px}body.has-bar.cookie-open{padding-bottom:260px}.has-bar .cookie-bar{bottom:84px}}';
  function dropGaCookies() {   // Decline after Accept: also remove the cookies Google already set
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n === '_ga' || n.indexOf('_ga_') === 0 || n === '_gid') {
        ['', '.' + location.hostname.replace(/^www\./, '')].forEach(function (d) { document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/' + (d ? ';domain=' + d : ''); });
      }
    });
  }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function choose(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the choice lasts for this page only */ }
    if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: v === 'granted' ? 'granted' : 'denied' });
    if (v !== 'granted') dropGaCookies();
    var bar = document.getElementById('cookie-bar'); if (bar) bar.remove();
    document.body.classList.remove('cookie-open');
  }
  function show() {
    if (document.getElementById('cookie-bar')) return;
    if (!document.getElementById('cookie-style')) { var st = document.createElement('style'); st.id = 'cookie-style'; st.textContent = STYLE; document.head.appendChild(st); }
    var bar = document.createElement('div');
    bar.id = 'cookie-bar'; bar.className = 'cookie-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Cookie Preferences');
    bar.innerHTML = '<p>We Use Anonymous Analytics Cookies to See Which Pages Help Players. No Names, No Emails. <a href="/about/#privacy">Details</a></p>' +
      '<div class="cookie-acts"><button type="button" class="btn" data-choice="denied">Decline</button><button type="button" class="btn solid" data-choice="granted">Accept</button></div>';
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-choice]'); if (b) choose(b.getAttribute('data-choice')); });
    document.body.appendChild(bar);
    document.body.classList.add('cookie-open');   // reserves space so the footer can scroll clear of the banner
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-cookie-settings]')) show(); });
  if (!stored()) show();
})();
