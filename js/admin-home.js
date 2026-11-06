// /admin/: filter the data-health table to clubs that still have a gap.
(function () {
  'use strict';
  var rows = Array.prototype.slice.call(document.querySelectorAll('.ad-table tbody tr'));
  Array.prototype.forEach.call(document.querySelectorAll('[data-g]'), function (b) {
    b.addEventListener('click', function () {
      var only = b.dataset.g === 'gaps';
      Array.prototype.forEach.call(document.querySelectorAll('[data-g]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      rows.forEach(function (r) { r.hidden = only && r.dataset.gaps === '0'; });
    });
  });
})();

// the Submissions card shows how many reports are waiting (the key is inside this encrypted page)
(function () {
  'use strict';
  var meta = document.getElementById('sb-meta'), cfgEl = document.getElementById('sb-config');
  if (!meta || !cfgEl) return;
  var cfg; try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  fetch(cfg.url + '/rest/v1/rpc/admin_submissions', {
    method: 'POST',
    headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon, 'Content-Type': 'application/json', 'Content-Profile': 'clubs' },
    body: JSON.stringify({ k: cfg.key })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (!res || !res.ok) return;
    var n = (res.rows || []).filter(function (r) { return r.status === 'pending'; }).length;
    meta.textContent = n ? n + (n === 1 ? ' report is' : ' reports are') + ' waiting for review' : 'Nothing waiting for review';
    if (n) meta.style.color = '#B23A2E';
  }).catch(function () { /* keep the default text */ });
})();
