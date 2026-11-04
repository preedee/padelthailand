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
