// /admin/submissions/: the club and correction reports visitors have sent, with Mark Live and Reject buttons.
// The page is published encrypted; the admin key is inside it (#sb-config) and only lets two database functions answer
// (clubs.admin_submissions and clubs.admin_review, see supabase/0002_admin_submissions.sql). Everything from visitors is
// shown with textContent, never as HTML.
(function () {
  'use strict';
  var cfg = {};
  try { cfg = JSON.parse(document.getElementById('sb-config').textContent); } catch (e) { /* shows the error below */ }
  var list = document.getElementById('sb-list'), msg = document.getElementById('sb-msg'), filter = 'pending', rows = [];

  function rpc(fn, args) {
    return fetch(cfg.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon, 'Content-Type': 'application/json', 'Content-Profile': 'clubs' },
      body: JSON.stringify(args)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function say(t, bad) { msg.textContent = t || ''; msg.style.color = bad ? '#B23A2E' : ''; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function isHttps(u) { return /^https:\/\/[^\s]+$/.test(u || ''); }
  function when(iso) {
    var d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
    var abs = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return days <= 0 ? 'Today · ' + abs : days === 1 ? 'Yesterday · ' + abs : days + ' days ago · ' + abs;
  }

  // one labelled line: plain text, or a link when the value is a safe https address
  function line(label, value, link) {
    if (!value) return null;
    var p = el('p', 'sb-line'), b = el('b', null, label + ' ');
    p.appendChild(b);
    if (link && isHttps(value)) { var a = el('a', null, value); a.href = value; a.rel = 'noopener'; a.target = '_blank'; p.appendChild(a); }
    else p.appendChild(document.createTextNode(value));
    return p;
  }
  function contactLine(d) {
    if (!d.contactName && !d.contactEmail) return el('p', 'sb-line sb-dim', 'No contact details left.');
    var p = el('p', 'sb-line'); p.appendChild(el('b', null, 'From '));
    p.appendChild(document.createTextNode(d.contactName || ''));
    if (d.contactEmail) {
      if (d.contactName) p.appendChild(document.createTextNode(' · '));
      var a = el('a', null, d.contactEmail); a.href = 'mailto:' + d.contactEmail; p.appendChild(a);
    }
    return p;
  }

  function body(r) {
    var d = r.data || {}, box = el('div', 'sb-body'), add = function (n) { if (n) box.appendChild(n); };
    if (r.kind === 'club') {
      add(el('h3', null, d.clubName || '(no name)'));
      add(line('City', d.city)); add(line('Address', d.address)); add(line('Courts', d.courts));
      add(line('Booking', d.bookingUrl, true)); add(line('Website', d.website, true));
      add(line('Phone', d.phone)); add(line('Instagram', d.instagram)); add(line('Notes', d.notes));
    } else {
      add(el('h3', null, 'Correction'));
      add(line('Page', d.pageUrl, true)); add(line('What is wrong', d.whatIsWrong)); add(line('Correct information', d.correctValue));
      if (d.isOwner === 'Yes') add(el('p', 'sb-line sb-flag', 'Says they run or work at this club.'));
    }
    add(contactLine(d));
    if (r.note) add(line('Your note', r.note));
    return box;
  }

  function act(r, status, note) {
    say('Saving…');
    return rpc('admin_review', { k: cfg.key, sid: r.id, new_status: status, new_note: note || null }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'not saved');
      r.status = status; r.note = note || null; say(status === 'live' ? 'Marked live. Tell Claude to add it to the site.' : status === 'rejected' ? 'Rejected.' : 'Back to pending.');
      render();
    }).catch(function (e) { say('Could not save (' + e.message + ').', true); });
  }

  function card(r) {
    var c = el('article', 'sb-card sb-' + r.status);
    var head = el('div', 'sb-head');
    head.appendChild(el('span', 'sb-kind', r.kind === 'club' ? 'New club' : 'Correction'));
    head.appendChild(el('span', 'sb-when', when(r.created_at)));
    head.appendChild(el('span', 'sb-pill', r.status === 'pending' ? 'Pending' : r.status === 'live' ? 'Live' : 'Rejected'));
    c.appendChild(head); c.appendChild(body(r));
    var bar = el('div', 'sb-actions');
    var note = el('input', 'sb-note'); note.type = 'text'; note.maxLength = 300; note.setAttribute('aria-label', 'Note for yourself (optional)'); note.placeholder = 'Note for yourself (optional)'; note.value = r.note || '';
    var mk = function (label, status, cls) { var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', function () { act(r, status, note.value.trim()); }); return b; };
    if (r.status === 'pending') { bar.appendChild(mk('Mark Live', 'live', 'solid')); bar.appendChild(mk('Reject', 'rejected', '')); }
    else bar.appendChild(mk('Back to Pending', 'pending', ''));
    bar.appendChild(note); c.appendChild(bar);
    return c;
  }

  function render() {
    var counts = { pending: 0, live: 0, rejected: 0 };
    rows.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) {
      var f = b.dataset.f, n = f === 'all' ? rows.length : counts[f] || 0;
      b.querySelector('span').textContent = ' (' + n + ')';
      b.setAttribute('aria-pressed', String(f === filter));
    });
    list.textContent = '';
    var shown = rows.filter(function (r) { return filter === 'all' || r.status === filter; });
    if (!shown.length) list.appendChild(el('p', 'sb-empty', filter === 'pending' ? 'Nothing waiting for review.' : 'Nothing here yet.'));
    shown.forEach(function (r) { list.appendChild(card(r)); });
  }

  function load() {
    say('Loading…');
    if (!cfg.key) { say('This page was built without the admin key.', true); return; }
    rpc('admin_submissions', { k: cfg.key }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'refused');
      rows = res.rows || []; say(''); render();
    }).catch(function (e) { say('Could not load submissions (' + e.message + ').', true); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) { b.addEventListener('click', function () { filter = b.dataset.f; render(); }); });
  document.getElementById('sb-refresh').addEventListener('click', load);
  load();
})();
