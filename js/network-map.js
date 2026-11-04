// Network Map for the home page: four hand-placed schematic views (Thailand, Bangkok rail, Samui/Phangan/Tao,
// Phuket & Krabi), a side panel (bottom sheet on phones), quick filters and search. Port of the Claude Design canvas
// component. Geometry comes from data/network.json; clubs from data/clubs.json. The static "All Clubs" index on the
// page is the keyboard/no-JS alternative to the SVG.
(function () {
  'use strict';
  var INK = '#2D2A4A';
  var box = document.getElementById('map-box'), panel = document.getElementById('panel'), tabsEl = document.getElementById('tabs');
  if (!box) return;

  Promise.all([
    fetch('/data/clubs.json').then(function (r) { return r.json(); }),
    fetch('/data/network.json').then(function (r) { return r.json(); })
  ]).then(function (res) { init(res[0].clubs, res[1]); }).catch(function () {
    box.innerHTML = '<p style="padding:24px">The Map Could Not Load. Use the List of All Clubs Below.</p>';
  });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fg(c) { return (c === '#6CBE45' || c === '#E08A2E') ? INK : '#FFFFFF'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  var ICON = {
    indoor: '<path d="M3 21v-13l9 -4l9 4v13"/><path d="M13 13h4v8h-10v-6h6"/><path d="M13 21v-9a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v3"/>',
    covered: '<path d="M3 3l18 18"/><path d="M16 12a4 4 0 0 0 -4 -4m-2.834 1.177a4 4 0 0 0 5.66 5.66"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
    outdoor: '<circle cx="12" cy="12" r="4"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
    unknown: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><path d="M12 16v.01"/><path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"/>',
    walk: '<circle cx="13" cy="4" r="2"/><path d="M10 21l2-6 3 3v3M8 11l3-3 3 2 3 2M11 8l-1 7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  function icon(n, s) { return '<svg aria-hidden="true" width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[n] + '</svg>'; }

  function init(list, net) {
    var C = {}; list.forEach(function (c) { C[c.slug] = c; });
    var COL = net.colors, SHORT = net.shortNames;
    var nm = function (s) { return SHORT[s] || (C[s] && C[s].name) || s; };
    var courtsOf = function (s) { return (C[s] && C[s].courts && C[s].courts.total) || 0; };
    var REG = net.regions;
    // single-region views with clubs placed from real coordinates: Chiang Mai and Hua Hin
    var EXTRA = { cm: { clubs: 'cm', pois: 'cmPois', name: 'Chiang Mai', col: COL.n }, hh: { clubs: 'hh', pois: 'hhPois', name: 'Hua Hin', col: COL.s } };
    var DEF = { th: 'h-bkk', cm: 'padel-cnx', hh: 'padel-sozial', bkk: 'phrom', gulf: 'prime-padel-samui', phk: 'padel-phuket-blue-tree' };
    var TAGS = {
      th: [['Northern Line', '45.6%', '24%', COL.n], ['Eastern Line', '62.5%', '45.5%', COL.e], ['Southern Line', '40.6%', '61%', COL.s], ['Gulf Ferry', '45%', '73.5%', COL.g]],
      bkk: [['MRT Purple → Nonthaburi', '1%', '1.2%', COL.pur], ['MRT Blue', '2%', '33%', COL.blue], ['Airport Rail Link → Suvarnabhumi', '62.5%', '5%', COL.arl], ['BTS Silom', '13%', '66%', COL.sil], ['BTS Sukhumvit', '85%', '58%', COL.suk]]
    };
    var state = { view: 'th', sel: DEF.th, f: {}, user: false };
    var railSlugs = {}; net.bkk.forEach(function (b) { b.clubs.forEach(function (c) { railSlugs[c.slug] = 1; }); });
    var matches = function (slug) {
      var c = C[slug]; if (!c) return false; var f = state.f;
      if (f.indoor && !(c.courts && c.courts.indoor > 0)) return false;
      if (f.covered && !(c.courts && c.courts.covered > 0)) return false;
      if (f.rail && !railSlugs[slug]) return false;
      if (f.book && !c.booking) return false;
      return true;
    };
    var anyFilter = function () { return Object.keys(state.f).some(function (k) { return state.f[k]; }); };

    // ---- placement lookup: where does a club live on the map? ----
    var placeOf = {};
    net.bkk.forEach(function (b) { b.clubs.forEach(function (c) { placeOf[c.slug] = { view: 'bkk', id: b.id }; }); });
    net.off.forEach(function (o) { o.slugs.forEach(function (s) { placeOf[s] = { view: 'bkk', id: o.id }; }); });
    net.ring.concat(net.pha).forEach(function (g) { placeOf[g.slug] = { view: 'gulf', id: g.slug }; });
    net.phk.concat(net.kbi).forEach(function (g) { placeOf[g.slug] = { view: 'phk', id: g.slug }; });
    Object.keys(EXTRA).forEach(function (v) { (net[EXTRA[v].clubs] || []).forEach(function (g) { placeOf[g.slug] = { view: v, id: g.slug }; }); });
    Object.keys(REG).forEach(function (k) { if (!REG[k].view) REG[k].slugs.forEach(function (s) { placeOf[s] = { view: 'th', id: 'h-' + k }; }); });

    // ---- stops for the current view ----
    function stopsFor(view) {
      var stops = [];
      if (view === 'th') {
        Object.keys(REG).forEach(function (k) {
          var h = REG[k], n = h.slugs.length, ct = h.slugs.reduce(function (a, s) { return a + courtsOf(s); }, 0);
          stops.push({ id: 'h-' + k, kind: 'hub', name: h.name, sub: plural(n, 'Club') + ' · ' + ct + ' Courts', x: h.x, y: h.y, lp: h.lp, color: h.color, d: 1.8 + 0.55 * Math.sqrt(n), count: n, courts: ct, hub: h, clubs: h.slugs.map(function (s) { return [s, null]; }) });
        });
      } else if (view === 'bkk') {
        net.bkk.forEach(function (b) { stops.push({ id: b.id, kind: 'station', name: b.name, th: b.th, sub: plural(b.clubs.length, 'Club'), x: b.x, y: b.y, lp: b.lp, bar: b.line, color: b.color, clubs: b.clubs.map(function (c) { return [c.slug, c.across ? null : c.km, c.across ? c.km : null]; }), seq: b.seq, d: 1.5 });
          // a club across the river from its station gets its own dot on the far bank; clicking it opens the station
          b.clubs.forEach(function (c) { if (c.across) stops.push({ id: b.id, slug: c.slug, kind: 'club', name: nm(c.slug), sub: 'Across the River', x: c.x, y: c.y, lp: c.lp, color: b.color, d: 1.3, clubs: [[c.slug, null]], satellite: true }); }); });
        net.ticks.forEach(function (t) { stops.push({ id: t.id, kind: 'tick', name: t.name, sub: '', x: t.x, y: t.y, lp: t.lp, d: 1.0 }); });
        net.off.forEach(function (o) { var st = clubStop(o.slugs[0], o.sub, o.x, o.y, o.lp, 'Off the Rail Network', '#4A5058', null); st.off = true; stops.push(st); });
      } else if (EXTRA[view]) {
        (net[EXTRA[view].clubs] || []).forEach(function (g) { stops.push(clubStop(g.slug, g.area, g.x, g.y, g.lp, EXTRA[view].name, EXTRA[view].col, view)); });
      } else if (view === 'gulf') {
        net.ring.forEach(function (g) { var a = g.angle * Math.PI / 180; stops.push(clubStop(g.slug, g.area, 620 + 250 * Math.sin(a), 660 - 250 * Math.cos(a), g.lp, 'Samui Loop', COL.g, 'sam')); });
        net.pha.forEach(function (g) { stops.push(clubStop(g.slug, g.area, g.x, g.y, g.lp, 'Phangan & Tao', COL.pha, 'pha')); });
      } else {
        net.phk.forEach(function (g) { stops.push(clubStop(g.slug, g.area, g.x, g.y, g.lp, 'Phuket Loop', COL.s, 'phk')); });
        net.kbi.forEach(function (g) { stops.push(clubStop(g.slug, g.area, g.x, g.y, g.lp, 'Krabi Line', COL.e, 'kbi')); });
      }
      return stops;
    }
    function clubStop(slug, area, x, y, lp, bar, color, seq) { return { id: slug, kind: 'club', name: nm(slug), sub: area, x: x, y: y, lp: lp, bar: bar, color: color, seq: seq, d: 1.3, clubs: [[slug, null]] }; }

    // ---- regional backdrops for the Thailand overview: topo up north, sand around the Gulf coast, dusk for Bangkok, sea for the rest ----
    var PAT = {
      topo: ['200', '130', '<g fill="none" stroke="#CAD7BE" stroke-width="2"><path d="M-10 30 C40 6 80 54 130 30 S190 6 210 34"/><path d="M-10 52 C40 28 80 76 130 52 S190 28 210 56"/><path d="M-10 100 C40 76 80 124 130 100 S190 76 210 104"/></g>', '#E9EFE3'],
      sand: ['36', '36', '<circle cx="18" cy="18" r="1.8" fill="#D8CDB6"/>', '#F3ECDD'],
      sea: ['190', '64', '<path d="M0 32 Q24 12 48 32 T96 32 T144 32 T192 32" fill="none" stroke="#C3D9DE" stroke-width="2.4"/>', '#DDEBEE'],
      dusk: ['36', '36', '<circle cx="18" cy="18" r="1.8" fill="#B9B6D2"/>', '#DDDBEB']
    };
    var ZONES = [['sea', 800, 860, 330], ['sea', 330, 820, 300], ['sea', 500, 820, 280], ['sea', 1260, 640, 300], ['topo', 520, 90, 340], ['sand', 620, 580, 230], ['sand', 880, 470, 220], ['sand', 970, 560, 230], ['dusk', 700, 420, 250]];
    function zoneBackdrop() {
      var defs = '<radialGradient id="zf"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>', body = '';
      Object.keys(PAT).forEach(function (k) { var p = PAT[k]; defs += '<pattern id="zp-' + k + '" width="' + p[0] + '" height="' + p[1] + '" patternUnits="userSpaceOnUse">' + p[2] + '</pattern>'; });
      ZONES.forEach(function (z, i) {
        defs += '<mask id="zm' + i + '"><circle cx="' + z[1] + '" cy="' + z[2] + '" r="' + z[3] + '" fill="url(#zf)"/></mask>';
        body += '<g mask="url(#zm' + i + ')"><rect width="1600" height="1000" fill="' + PAT[z[0]][3] + '"/><rect width="1600" height="1000" fill="url(#zp-' + z[0] + ')"/></g>';
      });
      return '<defs>' + defs + '</defs>' + body;
    }

    // sand land on the sea backgrounds of the Samui and Phuket views
    var SAND_DEFS = '<defs><pattern id="sd" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="#F3ECDD"/><circle cx="18" cy="18" r="1.8" fill="#D8CDB6"/></pattern></defs>';
    var GULF_LAND = SAND_DEFS +
      '<path fill="url(#sd)" stroke="#E0D2B0" stroke-width="6" stroke-linejoin="round" d="M620 380 C720 372 840 430 880 520 C920 610 905 720 850 800 C800 880 700 935 610 940 C500 945 390 890 350 800 C305 700 330 560 410 480 C470 420 540 385 620 380 Z"/>' +
      '<path fill="url(#sd)" stroke="#E0D2B0" stroke-width="6" stroke-linejoin="round" d="M340 235 C330 190 400 160 470 170 C520 120 640 115 700 140 C760 100 850 110 890 150 C910 210 880 270 800 300 C740 345 660 350 600 330 C520 320 450 300 400 290 C350 285 345 260 340 235 Z"/>' +
      '<path fill="url(#sd)" stroke="#E0D2B0" stroke-width="6" stroke-linejoin="round" d="M150 140 C150 100 210 85 245 110 C265 140 240 180 200 185 C165 185 150 165 150 140 Z"/>';
    var PHK_LAND = SAND_DEFS +
      '<path fill="url(#sd)" stroke="#E0D2B0" stroke-width="6" stroke-linejoin="round" d="M520 140 C640 100 800 110 880 170 C950 230 945 330 925 430 C905 560 955 680 940 780 C925 880 860 960 760 975 C650 990 520 975 450 930 C380 880 395 760 385 650 C375 520 395 420 390 320 C385 230 430 170 520 140 Z"/>' +
      '<path fill="url(#sd)" stroke="#E0D2B0" stroke-width="6" stroke-linejoin="round" d="M1010 -10 C1000 110 1030 210 1045 290 C1055 350 1020 430 1040 500 C1055 560 1030 610 1060 640 L1610 640 L1610 -10 Z"/>' +
      '<path fill="url(#sd)" stroke="#E0D2B0" stroke-width="6" stroke-linejoin="round" d="M1100 650 C1130 640 1175 670 1180 720 C1185 780 1150 830 1115 820 C1085 800 1085 700 1100 650 Z"/>';
    // ---- SVG backdrops (hand-placed, from the design canvas) ----
    var BG = {
      th: zoneBackdrop() + '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M700 420 V180 L610 90 H520" stroke="#B23A2E" stroke-width="18"/><path d="M700 420 V180 L610 90 H520" stroke="#fff" stroke-width="5"/>' +
        '<path d="M970 560 L1050 640 H1260" stroke="#E08A2E" stroke-width="12" stroke-dasharray="16 14" stroke-linecap="butt"/>' +
        '<path d="M700 420 L750 470 H880 L970 560" stroke="#E08A2E" stroke-width="18"/><path d="M700 420 L750 470 H880 L970 560" stroke="#fff" stroke-width="5"/>' +
        '<path d="M620 700 L780 860 H800" stroke="#0E7C86" stroke-width="12" stroke-dasharray="16 14" stroke-linecap="butt"/>' +
        '<path d="M700 420 L620 500 V700 L500 820 H330" stroke="#C2367A" stroke-width="18"/><path d="M700 420 L620 500 V700 L500 820 H330" stroke="#fff" stroke-width="5"/></g>',
      bkk: '<path d="M480 700 L292 733" fill="none" stroke="#00704A" stroke-width="4" stroke-dasharray="4 8" stroke-linecap="round"/><path d="M230 -10 C190 120 180 300 215 440 S300 560 330 640 S340 760 420 860 S520 960 560 1010" fill="none" stroke="#2A4C80" stroke-width="38" stroke-linecap="round"/><path d="M230 -10 C190 120 180 300 215 440 S300 560 330 640 S340 760 420 860 S520 960 560 1010" fill="none" stroke="#3C66A6" stroke-width="20" stroke-linecap="round"/>' +
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M840 460 V120 L800 80 H340 L260 160 V540 H760 Z" stroke="#1E4F9C" stroke-width="12"/>' +
        '<path d="M340 80 H100" stroke="#6F2C91" stroke-width="12"/><path d="M560 240 H840 L960 120 H1250" stroke="#A6192E" stroke-width="12"/>' +
        '<path d="M440 380 H560 L620 440 V640 L560 700 H360" stroke="#00704A" stroke-width="12"/><path d="M560 150 V380 H1180 L1330 530 V700" stroke="#6CBE45" stroke-width="12"/></g>',
      cm: '<path d="M1010 -10 C935 140 960 300 950 440 S960 700 1040 1010" fill="none" stroke="#9CC3D3" stroke-width="26" stroke-linecap="round" opacity=".75"/><path d="M1010 -10 C935 140 960 300 950 440 S960 700 1040 1010" fill="none" stroke="#C9E2EC" stroke-width="12" stroke-linecap="round"/>' +
        '<rect x="741" y="304" width="119" height="112" rx="8" fill="#F6F1E6" stroke="#B9AF98" stroke-width="5" stroke-dasharray="2 0"/>',
      hh: '<defs><pattern id="hhw" width="190" height="64" patternUnits="userSpaceOnUse"><path d="M0 32 Q24 12 48 32 T96 32 T144 32 T192 32" fill="none" stroke="#C3D9DE" stroke-width="2.4"/></pattern></defs>' +
        '<path d="M930 -10 C945 120 955 260 958 391 S985 560 1010 700 S1110 790 1150 812 S1175 905 1115 1010 L1610 1010 L1610 -10 Z" fill="#DDEBEE"/><path d="M930 -10 C945 120 955 260 958 391 S985 560 1010 700 S1110 790 1150 812 S1175 905 1115 1010 L1610 1010 L1610 -10 Z" fill="url(#hhw)"/>' +
        '<path d="M930 -10 C945 120 955 260 958 391 S985 560 1010 700 S1110 790 1150 812 S1175 905 1115 1010" fill="none" stroke="#E4D6B6" stroke-width="12" stroke-linecap="round"/>' +
        '<path d="M808 -10 C848 100 868 220 872 293 S882 440 886 560 S913 700 938 810 S968 920 983 1010" fill="none" stroke="#6B7178" stroke-width="6"/><path d="M808 -10 C848 100 868 220 872 293 S882 440 886 560 S913 700 938 810 S968 920 983 1010" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="10 12"/>',
      gulf: GULF_LAND + '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="620" cy="660" r="250" stroke="#0E7C86" stroke-width="14"/>' +
        '<path d="M620 410 V300" stroke="#0E7C86" stroke-width="10" stroke-dasharray="14 12" stroke-linecap="butt"/><path d="M340 240 L240 140 H200" stroke="#2F6DB5" stroke-width="10" stroke-dasharray="14 12" stroke-linecap="butt"/>' +
        '<path d="M620 300 L560 240 H340" stroke="#2F6DB5" stroke-width="12"/><path d="M620 300 H760 L840 220 V160" stroke="#2F6DB5" stroke-width="12"/></g>',
      phk: PHK_LAND + '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="420" y="180" width="480" height="740" rx="70" stroke="#C2367A" stroke-width="14"/>' +
        '<path d="M900 300 H1060 L1140 380 V440" stroke="#E08A2E" stroke-width="12"/><path d="M1140 440 V720" stroke="#E08A2E" stroke-width="10" stroke-dasharray="14 12" stroke-linecap="butt"/></g>'
    };
    function extras(view) {
      var h = '';
      (TAGS[view] || []).forEach(function (t) { h += '<span class="tagline" style="left:' + t[1] + ';top:' + t[2] + ';background:' + t[3] + ';color:' + fg(t[3]) + '">' + esc(t[0]) + '</span>'; });
      if (view === 'th') h += '<span class="cap">Schematic · Circle Size = Number of Clubs · Tap a Region</span>';
      if (view === 'cm') {
        h += '<span class="cm-tag" style="left:50%;top:27.5%;transform:translate(-50%,-50%)">Old City</span><span class="cm-tag river" style="left:60.4%;top:55%">Ping River</span><span class="cap">Schematic · Positions Are Approximate</span>';
      }
      if (view === 'bkk') h += '<span class="cm-tag river" style="left:11%;top:13%;transform:rotate(86deg)">Chao Phraya River</span>';
      if (view === 'gulf') h += '<span class="cm-tag sea" style="left:76%;top:84%">Gulf of Thailand</span>';
      if (view === 'phk') h += '<span class="cm-tag sea" style="left:9%;top:48%">Andaman Sea</span>';
      if (view === 'hh') h += '<span class="cm-tag sea" style="left:80%;top:30%">Gulf of Thailand</span><span class="cm-tag rail" style="left:51.5%;top:54%">Southern Railway</span><span class="cap">Schematic · Positions Are Approximate</span>';
      ((EXTRA[view] ? net[EXTRA[view].pois] : (net.pois || {})[view]) || []).forEach(function (o) { h += '<div class="poi" style="left:' + (o.x / 16) + '%;top:' + (o.y / 10) + '%"><i></i><span class="lbl" style="' + lab(o.lp, 0.5) + '">' + esc(o.name) + '</span></div>'; });
      ((net.airports || {})[view] || []).forEach(function (o) { h += '<div class="poi airport" style="left:' + (o.x / 16) + '%;top:' + (o.y / 10) + '%"><svg class="plane" aria-hidden="true" viewBox="0 0 24 24"><path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z"/></svg><span class="lbl" style="' + lab(o.lp, 0.9) + '">' + esc(o.name) + '</span></div>'; });
      if (view === 'gulf') {
        var n = net.ring.length;
        h += '<div style="position:absolute;left:38.75%;top:66%;transform:translate(-50%,-50%);text-align:center"><div style="font-family:Archivo,sans-serif;font-weight:850;font-stretch:110%;font-size:max(14px,2.4cqw);letter-spacing:.04em;color:#0E7C86">Koh Samui</div><div style="font-size:max(11px,1.05cqw);color:#3D434A">Samui Loop · ' + n + ' Clubs</div></div>' +
          '<div style="position:absolute;left:40.6%;top:22.8%;font-family:Archivo,sans-serif;font-weight:800;font-size:max(11px,1.15cqw);letter-spacing:.06em;color:#2F6DB5">Koh Phangan</div>' +
          '<div class="note" style="left:66%;top:40%;width:30%"><b>Getting Here</b>Fly Into Samui (USM) or Take the Car Ferry From Don Sak. Boats Run Samui → Phangan → Tao. Lamai Has the Densest Cluster: 4 Clubs Within a Few Kilometres.</div>';
      }
      if (view === 'phk') {
        h += '<div style="position:absolute;left:41.25%;top:52%;transform:translate(-50%,-50%);text-align:center"><div style="font-family:Archivo,sans-serif;font-weight:850;font-stretch:110%;font-size:max(14px,2.4cqw);letter-spacing:.04em;color:#C2367A">Phuket</div><div style="font-size:max(11px,1.05cqw);color:#3D434A">Phuket Loop · ' + net.phk.length + ' Clubs</div></div>' +
          '<span class="tagline" style="left:58.5%;top:25.5%;background:#E08A2E;color:#2D2A4A">Road to Krabi</span>' +
          '<span class="tagline" style="left:72.5%;top:56%;background:#fff;border:1px solid #E08A2E;color:#2D2A4A">Car Ferry to Lanta</span>' +
          '<div class="note" style="left:70%;top:80%;width:28%"><b>Getting Here</b>Fly Into Phuket (HKT) or Krabi (KBV). Clubs Cluster in the North-West Around Bang Tao and in the South Around Chalong.</div>';
      }
      return h;
    }

    // ---- motion: trains, draw-in, fly-through, hover tip (all off for reduced-motion) ----
    var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var AV = { right: [-6.5, -6.5], below: [-6.5, -6.5], down: [-6.5, -6.5], left: [1.1, -6.5], sw: [1.1, -6.5], up: [-6.5, 1.1], above: [1.1, 1.1], nw: [1.1, 1.1] };
    function photoOf(pairs) { for (var i = 0; i < (pairs || []).length; i++) { var c = C[pairs[i][0]]; if (c && c.photos && c.photos[0]) return c.photos[0].url; } return ''; }
    var TRAINS = {
      th: [['M700 420 V180 L610 90 H520', 11, 0]],
      bkk: [['M840 460 V120 L800 80 H340 L260 160 V540 H760 Z', 40, 1, 0], ['M840 460 V120 L800 80 H340 L260 160 V540 H760 Z', 40, 1, -20], ['M340 80 H100', 9, 0], ['M560 240 H840 L960 120 H1250', 16, 0], ['M440 380 H560 L620 440 V640 L560 700 H360', 16, 0], ['M560 150 V380 H1180 L1330 530 V700', 26, 0]],
      gulf: [['M620 410 A250 250 0 1 1 620 910 A250 250 0 1 1 620 410 Z', 36, 1, 0], ['M620 410 A250 250 0 1 1 620 910 A250 250 0 1 1 620 410 Z', 36, 1, -18], ['M620 300 L560 240 H340', 8, 0], ['M620 300 H760 L840 220 V160', 8, 0]],
      phk: [['M490 180 H830 a70 70 0 0 1 70 70 V850 a70 70 0 0 1 -70 70 H490 a70 70 0 0 1 -70 -70 V250 a70 70 0 0 1 70 -70 Z', 44, 1, 0], ['M900 300 H1060 L1140 380 V720', 14, 0]]
    };
    var stage = null, layer = null, trainsEl = null, tip = null, curStops = [], shownView = null;
    function ensureStage() {
      if (stage) return;
      box.innerHTML = '<div class="stage"><div class="layer"></div><svg class="trains" aria-hidden="true" viewBox="0 0 1600 1000" preserveAspectRatio="none"></svg></div><div class="tip" hidden></div>';
      stage = box.querySelector('.stage'); layer = box.querySelector('.layer'); trainsEl = box.querySelector('.trains'); tip = box.querySelector('.tip');
    }
    function setTrains(view) {
      var h = '';
      if (!RM) (TRAINS[view] || []).forEach(function (tr) {
        var back = !tr[2];
        h += '<circle r="7" fill="#fff" stroke="' + INK + '" stroke-width="3"><animateMotion dur="' + tr[1] + 's" begin="' + (tr[3] || 0) + 's" repeatCount="indefinite" path="' + tr[0] + '"' + (back ? ' keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear"' : '') + '/></circle>';
      });
      trainsEl.innerHTML = h;
    }
    function enter(from, to) {
      if (RM) return;
      var o = '50% 50%', a = [{ opacity: 0 }, { opacity: 1 }], dur = 320;
      if (from === 'th') { Object.keys(REG).forEach(function (k) { if (REG[k].view === to) o = (REG[k].x / 16) + '% ' + (REG[k].y / 10) + '%'; }); a = [{ transform: 'scale(.28)', opacity: 0 }, { transform: 'none', opacity: 1 }]; dur = 700; }
      else if (to === 'th' && from) { Object.keys(REG).forEach(function (k) { if (REG[k].view === from) o = (REG[k].x / 16) + '% ' + (REG[k].y / 10) + '%'; }); a = [{ transform: 'scale(3)', opacity: 0 }, { transform: 'none', opacity: 1 }]; dur = 700; }
      stage.style.transformOrigin = o;
      stage.animate(a, { duration: dur, easing: 'cubic-bezier(.2,.7,.2,1)' });
      Array.prototype.forEach.call(layer.querySelectorAll('svg.bg path'), function (pa) {
        if (pa.getAttribute('stroke-dasharray') || !pa.getTotalLength) return;
        var len = Math.ceil(pa.getTotalLength()); pa.style.strokeDasharray = len;
        var an = pa.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, delay: 150, easing: 'ease-out', fill: 'backwards' });
        an.onfinish = function () { pa.style.strokeDasharray = ''; };
      });
      Array.prototype.forEach.call(layer.querySelectorAll('.stop'), function (st, i) {
        st.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, delay: 300 + Math.min(i, 24) * 28, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' });
      });
    }
    function avatarFor(s) {
      var o = AV[s.lp] || [1.1, 1.1];
      if (s.seq === 'sam') { var vx = 620 - s.x, vy = 660 - s.y, vl = Math.sqrt(vx * vx + vy * vy) || 1; o = [vx / vl * 4.6 - 2.7, vy / vl * 4.6 - 2.7]; }
      return '<span class="avatar" aria-hidden="true" style="left:' + o[0] + 'cqw;top:' + o[1] + 'cqw;background-image:url(\'' + esc(photoOf(s.clubs)) + '\')"></span>';
    }
    function showTip(el) {
      var id = el.dataset.id, s = curStops.filter(function (x) { return x.id === id; })[0], stopEl = el.closest('.stop');
      if (!s || !stopEl) return;
      stopEl.classList.add('hov');
      var ph = photoOf(s.clubs), names = (s.clubs || []).map(function (p) { return nm(p[0]); });
      var body;
      if (s.kind === 'hub') body = '<b>' + esc(s.name) + '</b><span>' + esc(s.sub) + '</span>';
      else if (s.clubs.length === 1) { var k = (C[s.clubs[0][0]] || {}).courts || {}; body = '<b>' + esc(names[0]) + '</b><span>' + (k.total ? plural(k.total, 'Court') : 'Courts Not Listed') + (s.kind === 'club' || s.kind === 'off' ? ' · ' + esc(s.sub) : ' · ' + esc(s.name)) + '</span>'; }
      else body = '<b>' + esc(s.name) + '</b><span>' + esc(names.slice(0, 4).join(', ')) + (names.length > 4 ? ' +' + (names.length - 4) : '') + '</span>';
      var circ = (s.kind === 'club') && ph;
      if (circ && !stopEl.querySelector('.avatar')) stopEl.insertAdjacentHTML('beforeend', avatarFor(s));
      tip.innerHTML = (ph && s.kind !== 'hub' && !circ ? '<span class="tp" style="background-image:url(\'' + esc(ph) + '\')"></span>' : '') + body;
      var x = parseFloat(stopEl.style.left), y = parseFloat(stopEl.style.top);
      tip.style.left = Math.min(88, Math.max(12, x)) + '%'; tip.style.top = y + '%'; tip.classList.toggle('below', y < 34);
      tip.hidden = false;
    }
    function hideTip() { if (!tip) return; tip.hidden = true; Array.prototype.forEach.call(box.querySelectorAll('.stop .avatar'), function (e) { e.remove(); }); Array.prototype.forEach.call(box.querySelectorAll('.stop.hov'), function (e) { e.classList.remove('hov'); }); }

    // a label that would run off the map swaps to the opposite side of its dot
    var FLIP = { up: 'down', down: 'up', left: 'right', right: 'left', above: 'below', below: 'above', nw: 'sw', sw: 'nw' };
    function flipOffMap() {
      var bx = box.getBoundingClientRect();
      Array.prototype.forEach.call(layer.querySelectorAll('.stop'), function (el, i) {
        var s = curStops[i], l = el.querySelector('.lbl'); if (!s || !l || !FLIP[s.lp]) return;
        var r = l.getBoundingClientRect();
        if (r.left < bx.left || r.right > bx.right || r.top < bx.top || r.bottom > bx.bottom) { l.style.cssText = lab(FLIP[s.lp], s.d / 2); }
      });
    }

    // ---- rendering ----
    function shadow(base, on) { var p = base ? [base] : []; if (on) p.push('0 0 0 .28cqw #fff', '0 0 0 .56cqw ' + INK); return p.length ? p.join(',') : 'none'; }
    function lab(lp, r) {
      return ({
        up: 'left:' + (r * .85 + .1) + 'cqw;bottom:' + (r * .85 + .1) + 'cqw;transform-origin:0 100%;transform:rotate(-38deg);',
        down: 'left:' + (r * .85 + .1) + 'cqw;top:' + (r * .85 + .1) + 'cqw;transform-origin:0 0;transform:rotate(38deg);',
        left: 'right:' + (r + .6) + 'cqw;top:0;transform:translateY(-50%);text-align:right;',
        right: 'left:' + (r + .6) + 'cqw;top:0;transform:translateY(-50%);',
        below: 'left:0;top:' + (r + .4) + 'cqw;transform:translateX(-50%);text-align:center;',
        above: 'left:0;bottom:' + (r + .4) + 'cqw;transform:translateX(-50%);text-align:center;',
        sw: 'right:' + (r * .6) + 'cqw;top:' + (r + .2) + 'cqw;text-align:right;',
        nw: 'right:' + (r * .6) + 'cqw;bottom:' + (r + .2) + 'cqw;text-align:right;'
      })[lp] || '';
    }
    function typeOf(slug) { var c = C[slug]; if (!c) return 'unknown'; var k = c.courts || {}; return k.indoor ? 'indoor' : k.covered ? 'covered' : k.outdoor ? 'outdoor' : 'unknown'; }
    function typeDot(t, c, on) {
      if (t === 'indoor') return 'background:' + c + ';border:.22cqw solid #fff;box-shadow:' + shadow('0 0 0 .12cqw ' + c, on) + ';';
      if (t === 'covered') return 'background:linear-gradient(90deg,' + c + ' 50%,#fff 50%);border:.28cqw solid ' + c + ';box-shadow:' + shadow(null, on) + ';';
      if (t === 'outdoor') return 'background:#fff;border:.3cqw solid ' + c + ';box-shadow:' + shadow(null, on) + ';';
      return 'background:#fff;border:.24cqw dashed #6B7178;box-shadow:' + shadow(null, on) + ';';
    }
    function stopHtml(s, sel) {
      var r = s.d / 2, on = sel && s.id === sel.id, hit = Math.max(1.6, r);
      var dot = 'box-sizing:border-box;border-radius:50%;width:' + s.d + 'cqw;height:' + s.d + 'cqw;display:flex;align-items:center;justify-content:center;font-size:0;flex:none;';
      if (s.kind === 'hub') dot += 'background:' + s.color + ';color:' + fg(s.color) + ';border:.3cqw solid #fff;box-shadow:' + shadow('0 0 0 .15cqw ' + INK, on) + ';font-family:Archivo,sans-serif;font-weight:900;font-size:' + (s.d * .38).toFixed(2) + 'cqw;';
      else if (s.kind === 'station') dot += 'background:#fff;border:.34cqw solid ' + INK + ';box-shadow:' + shadow(null, on) + ';';
      else if (s.kind === 'tick') dot += 'background:#fff;border:.24cqw solid ' + INK + ';';
      else if (s.kind === 'off') dot += 'border-radius:.25cqw;background:#fff;border:.3cqw solid ' + INK + ';box-shadow:' + shadow(null, on) + ';';
      else dot += typeDot(typeOf(s.slug || s.id), s.color, on);
      var nameCls = 'nm ' + s.kind + (on ? ' sel' : '');
      var dim = anyFilter() && s.clubs && s.kind !== 'tick' && !s.clubs.some(function (c) { return matches(c[0]); });
      var inner = s.kind === 'tick'
        ? '<span aria-hidden="true" class="stn" style="left:-' + hit + 'cqw;top:-' + hit + 'cqw;width:' + (2 * hit) + 'cqw;height:' + (2 * hit) + 'cqw;cursor:default"><span style="' + dot + '"></span></span>'
        : '<button type="button" class="stn' + (dim ? ' dim' : '') + '" data-id="' + esc(s.id) + '" aria-label="' + esc(s.name + (s.sub ? ', ' + s.sub : '')) + '" aria-pressed="' + (on ? 'true' : 'false') + '" style="left:-' + hit + 'cqw;top:-' + hit + 'cqw;width:' + (2 * hit) + 'cqw;height:' + (2 * hit) + 'cqw"><span style="' + dot + '">' + (s.kind === 'hub' ? s.count : '') + '</span></button>';
      return '<div class="stop' + (on ? ' on' : '') + '" style="left:' + (s.x / 16) + '%;top:' + (s.y / 10) + '%">' + inner +
        '<span class="lbl" style="' + lab(s.lp, r) + '"><span class="' + nameCls + '"' + (s.kind === 'tick' ? '' : ' data-id="' + esc(s.id) + '"') + '>' + esc(s.name) + '</span>' + (s.sub ? '<span class="th">' + esc(s.sub) + '</span>' : '') + '</span></div>';
    }

    function clubCard(slug, km, showPhoto, across) {
      var c = C[slug]; if (!c) return '';
      var k = c.courts || {}, types = [];
      if (k.indoor) types.push(['indoor', k.indoor]); if (k.covered) types.push(['covered', k.covered]); if (k.outdoor) types.push(['outdoor', k.outdoor]);
      var tHtml = types.length ? types.map(function (t) { return '<span class="ct">' + icon(t[0]) + '<span>' + t[1] + '</span><span class="sr"> ' + t[0] + '</span></span>'; }).join('') : '<span class="ct" title="Court Type Not Listed">' + icon('unknown') + (k.total ? '<span>' + k.total + '</span>' : '') + '</span>';
      var photo = showPhoto ? '<div class="ph"' + (c.photos && c.photos[0] ? ' style="background-image:url(\'' + esc(c.photos[0].url) + '\')" role="img" aria-label="' + esc(c.name) + ' photo"' : '') + '>' + (c.photos && c.photos[0] ? '' : 'No Photo Yet') + '</div>' : '';
      var dir = c.directionsUrl || ('https://www.google.com/maps/dir/?api=1&destination=' + c.lat + ',' + c.lng);
      return '<div class="pclub">' + photo + '<div class="nm"><span>' + esc(nm(slug)) + '</span>' + (c.openingSoon ? '<span class="tag soon">Opening Soon</span>' : '') + '</div>' +
        '<div class="meta"><strong style="color:' + INK + '">' + (k.total ? plural(k.total, 'Court') : 'Courts Not Listed') + '</strong>' + tHtml + '</div>' +
        (across != null ? '<div class="meta">' + icon('walk', 16) + across.toFixed(1) + ' km Across the River (Est.)</div>' : '') + (km != null ? '<div class="meta">' + icon('walk', 16) + '~' + Math.max(1, Math.round(km * 13)) + ' Min Walk · ' + km.toFixed(1) + ' km (Est.)</div>' : '') +
        '<a class="more" href="/clubs/' + esc(slug) + '/" data-track="club_open" data-t-club_slug="' + esc(slug) + '" data-t-place="map_panel">View Club Page ' + icon('arrow', 16) + '</a>' +
        '<div class="acts">' + (c.booking ? '<a class="btn solid" href="' + esc(c.booking.url) + '" target="_blank" rel="noopener" data-track="book_click" data-t-club_slug="' + esc(slug) + '" data-t-platform="' + esc(c.booking.platform) + '" data-t-place="map_panel">' + esc(c.booking.label) + '</a>' : '') +
        '<a class="btn" href="' + esc(dir) + '" target="_blank" rel="noopener" data-track="directions_click" data-t-club_slug="' + esc(slug) + '" data-t-place="map_panel">Directions</a></div></div>';
    }

    function render(fresh, from) {
      ensureStage();
      var stops = stopsFor(state.view); curStops = stops; hideTip();
      var clickable = stops.filter(function (s) { return s.kind !== 'tick'; });
      var sel = clickable.filter(function (s) { return s.id === state.sel; })[0] || clickable.filter(function (s) { return s.id === DEF[state.view]; })[0] || clickable[0];
      state.sel = sel.id;
      box.dataset.bg = state.view;
      layer.innerHTML = '<svg class="bg" aria-hidden="true" viewBox="0 0 1600 1000" preserveAspectRatio="none">' + BG[state.view] + '</svg>' + extras(state.view) + stops.map(function (s) { return stopHtml(s, sel); }).join('');
      flipOffMap();
      if (shownView !== state.view) { shownView = state.view; setTrains(state.view); fresh = true; }
      if (fresh) enter(from, state.view);

      // tabs
      var tabs = [['th', 'Thailand', list.length], ['bkk', 'Bangkok', REG.bkk.slugs.length], ['cm', 'Chiang Mai', REG.cm.slugs.length], ['hh', 'Hua Hin', REG.hh.slugs.length], ['gulf', 'Samui, Phangan, & Tao', REG.gulf.slugs.length], ['phk', 'Phuket & Krabi', REG.phk.slugs.length + REG.kbi.slugs.length]];
      tabsEl.innerHTML = tabs.map(function (t) { return '<button type="button" class="chip sq" data-view="' + t[0] + '" aria-pressed="' + (state.view === t[0]) + '">' + esc(t[1]) + ' <span class="count">' + t[2] + '</span></button>'; }).join('');

      // panel
      var cards, eyebrow, title, sub = '', stat = '', note = '', open = '', color = sel.color, barText = sel.bar, nav = null, idx = 0;
      var visible = function (pairs) { return pairs.filter(function (p) { return matches(p[0]); }); };
      var filtered = anyFilter();
      if (sel.kind === 'hub') {
        var h = sel.hub; eyebrow = 'Region'; title = h.name; sub = h.th; barText = 'Region';
        stat = plural(sel.count, 'Club') + ' · ' + sel.courts + ' Courts';
        if (h.view) open = '<button type="button" class="btn solid block" data-open-view="' + h.view + '">Open the ' + esc(h.name) + ' Map</button>';
        var v = visible(sel.clubs); cards = v.map(function (p) { return clubCard(p[0], null, false); }).join('');
        if (filtered) stat += ' · ' + v.length + ' Match';
      } else if (sel.kind === 'club') {
        var peers = stops.filter(function (s) { return s.seq === sel.seq; }); idx = peers.indexOf(sel); nav = peers;
        eyebrow = sel.off ? 'Off the Rail Network' : EXTRA[sel.seq] ? EXTRA[sel.seq].name : 'Stop ' + String(idx + 1).padStart(2, '0') + ' of ' + String(peers.length).padStart(2, '0'); title = sel.name; sub = sel.sub;
        if (sel.off) { peers = []; nav = null; note = '<div class="note-box">Not Within Walking Distance of BTS/MRT. Drive, Taxi or Grab.</div>'; }
        cards = clubCard(sel.id, null, true);
        if (C[sel.id] && C[sel.id].openingSoon) stat = 'Opening Soon';
      } else {
        var off = sel.kind === 'off'; eyebrow = off ? 'Off the Rail Network' : 'Station'; title = sel.name; sub = off ? sel.th : '';
        stat = off ? '' : sel.clubs.every(function (c) { return c[2] != null; }) ? plural(sel.clubs.length, 'Club') + ' Across the River' : plural(sel.clubs.length, 'Club') + ' Within Walking Distance';
        if (off) note = '<div class="note-box">Not Within Walking Distance of BTS/MRT. Drive, Taxi or Grab.</div>';
        var vv = visible(sel.clubs); cards = vv.map(function (p) { return clubCard(p[0], p[1], true, p[2]); }).join('');
        if (sel.seq) { nav = stops.filter(function (s) { return s.seq === sel.seq; }); idx = nav.indexOf(sel); }
      }
      if (filtered && !cards) cards = '<p class="fine">No Clubs Here Match the Filters.</p>';
      var navHtml = '';
      if (nav && nav.length > 1) {
        var p = nav[(idx - 1 + nav.length) % nav.length], q = nav[(idx + 1) % nav.length];
        navHtml = '<div class="nav2"><button type="button" data-id="' + esc(p.id) + '">← ' + esc(p.name) + '</button><button type="button" data-id="' + esc(q.id) + '">' + esc(q.name) + ' →</button></div>';
      }
      panel.innerHTML = '<div class="bar" style="background:' + color + ';color:' + fg(color) + '"><span>' + esc(barText) + '</span><button type="button" class="panel-close" aria-label="Close" style="color:inherit" data-close>×</button></div>' +
        '<div class="body"><div><div class="eyebrow">' + esc(eyebrow) + '</div><h3>' + esc(title) + '</h3>' + (sub ? '<div class="th" lang="th">' + esc(sub) + '</div>' : '') + (stat ? '<div class="stat" style="margin-top:8px">' + esc(stat) + '</div>' : '') + '</div>' +
        open + note + cards + navHtml + '</div>';
      panel.classList.toggle('open', state.user && window.matchMedia('(max-width:760px)').matches);
    }

    function go(view, id, user) {
      var viewChanged = view !== state.view, prev = state.view;
      state.view = view; state.sel = id || DEF[view]; state.user = !!user; render(viewChanged, viewChanged ? prev : null);
      if (window.ptTrack) { if (viewChanged) window.ptTrack('map_view', { view: view }); if (user) window.ptTrack('map_select', { view: view, stop: state.sel }); }
    }

    // ---- events ----
    box.addEventListener('click', function (e) { var b = e.target.closest('[data-id]'); if (b) go(state.view, b.dataset.id, true); });
    box.addEventListener('mouseover', function (e) { var b = e.target.closest('[data-id]'); if (b) showTip(b); else hideTip(); });
    box.addEventListener('mouseleave', hideTip);
    box.addEventListener('focusin', function (e) { var b = e.target.closest('[data-id]'); if (b) showTip(b); });
    box.addEventListener('focusout', hideTip);
    panel.addEventListener('click', function (e) {
      var o = e.target.closest('[data-open-view]'); if (o) { go(o.dataset.openView, null, false); return; }
      var b = e.target.closest('[data-id]'); if (b) { go(state.view, b.dataset.id, true); return; }
      if (e.target.closest('[data-close]')) { state.user = false; panel.classList.remove('open'); }
    });
    tabsEl.addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b) go(b.dataset.view, null, false); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) {
      b.addEventListener('click', function () { var k = b.dataset.f; state.f[k] = !state.f[k]; if (window.ptTrack) window.ptTrack('filter_use', { page: 'home', group: k, state: state.f[k] ? 'on' : 'off' }); b.setAttribute('aria-pressed', state.f[k] ? 'true' : 'false'); render(); });
    });

    // ---- search ----
    var q = document.getElementById('q'), sug = document.getElementById('suggest'), near = document.getElementById('near');
    function focusClub(slug) { var p = placeOf[slug]; if (p) { go(p.view, p.id, true); document.getElementById('map').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } }
    if (q) {
      q.addEventListener('input', function () {
        var t = q.value.trim().toLowerCase();  if (t.length < 2) { sug.hidden = true; return; }
        var out = [];
        list.forEach(function (c) { var hay = (nm(c.slug) + ' ' + c.name + ' ' + c.city + ' ' + (c.aliases || []).join(' ')).toLowerCase(); if (hay.indexOf(t) > -1) out.push('<a href="/clubs/' + esc(c.slug) + '/" role="option"><span>' + esc(nm(c.slug)) + '</span><small>' + esc(c.city) + '</small></a>'); });
        net.bkk.forEach(function (b) { if ((b.name + ' ' + b.th).toLowerCase().indexOf(t) > -1) out.push('<a href="#map" role="option" data-st="' + esc(b.id) + '"><span>' + esc(b.name) + '</span><small>' + esc(b.line) + '</small></a>'); });
        sug.innerHTML = out.slice(0, 8).join('') || '<a href="#" role="option" tabindex="-1"><span>No Match. Try the List Below.</span></a>'; sug.hidden = false;
        if (window.ptTrackSearch) window.ptTrackSearch('home', t, out.length > 0);
      });
      sug.addEventListener('click', function (e) { var a = e.target.closest('[data-st]'); if (a) { e.preventDefault(); go('bkk', a.dataset.st, true); sug.hidden = true; document.getElementById('map').scrollIntoView(); } });
      document.addEventListener('click', function (e) { if (!e.target.closest('.finder')) sug.hidden = true; });
      q.addEventListener('keydown', function (e) { if (e.key === 'Escape') sug.hidden = true; });
    }
    if (near) near.addEventListener('click', function () {
      if (!navigator.geolocation) return;
      near.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var best = null, bd = 1e9;
        list.forEach(function (c) { var dx = (c.lng - pos.coords.longitude) * Math.cos(pos.coords.latitude * Math.PI / 180), dy = c.lat - pos.coords.latitude, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } });
        near.textContent = 'Near Me'; if (best) focusClub(best.slug);
      }, function () { near.textContent = 'Near Me'; q.placeholder = 'Location Blocked. Type a Club or Station.'; }, { timeout: 8000 });
    });

    render();
  }
})();
