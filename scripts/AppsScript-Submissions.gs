/**
 * AppsScript-Submissions.gs — public submission forms for padelthailand.com/submit/.
 *
 * Paste this into the SAME Apps Script project as AppsScript-Inbox.gs (Extensions → Apps Script,
 * add a file, paste). Inbox.gs's doPost hands `action=submit` here before its shared-secret check;
 * every other action still needs the secret. See scripts/MODERATION.md for deployment and review.
 *
 * What it guarantees:
 *   - Writes only to the five "… Submissions" tabs below, never to the live Tournaments tab (gid 0).
 *   - Every row lands with Status `pending`. Nothing goes live until a moderator sets it to `live`.
 *   - Server-side validation mirrors js/submit.js: required fields, lengths, yyyy-mm-dd dates, HH:MM times,
 *     https-only URLs, email format.
 *   - Honeypot field `website_url`: if filled, reply ok and write nothing.
 *   - At most 40 submissions per rolling hour across the whole site (CacheService + LockService).
 *   - Uploads: JPG / PNG / WebP checked by magic bytes, at most 5 MB, saved to the Drive folder
 *     "padelthailand submissions". The file link is never sent back to the submitter.
 *   - Cells starting with = + - @ (or a tab / carriage return) get a leading apostrophe so Sheets
 *     never runs them as formulas. Readers should strip one leading apostrophe.
 *
 * All names here start with SUB_ / sub so they cannot collide with Inbox.gs (one global scope per project).
 */

const SUB_LIVE_GID = 0;
const SUB_DRIVE_FOLDER = 'padelthailand submissions';
const SUB_RATE_LIMIT = 40;            // submissions per rolling hour, all forms together
const SUB_RATE_WINDOW_MS = 3600 * 1000;
const SUB_RATE_KEY = 'submissions-rate';
const SUB_MAX_UPLOAD = 5 * 1024 * 1024;

// Tab contract. The nightly build reads these names and headers; do not reorder.
const SUB_TABS = {
  tournament: { name: 'Tournament Submissions', headers: ['Submitted At', 'Status', 'Title', 'Organizer', 'Start Date', 'End Date', 'City', 'Club', 'Gender', 'Levels', 'Format', 'Entry Fee', 'Prize', 'Registration URL', 'Instagram URL', 'Poster URL', 'Contact Name', 'Contact Email', 'Notes'] },
  event: { name: 'Event Submissions', headers: ['Submitted At', 'Status', 'Title', 'Type', 'Club', 'City', 'Date', 'Weekday', 'Start Time', 'End Time', 'Until', 'Levels', 'Gender', 'Capacity', 'Price Per Person', 'Signup URL', 'Poster URL', 'Contact Name', 'Contact Email', 'Last Confirmed At', 'Notes'] },
  club: { name: 'Club Submissions', headers: ['Submitted At', 'Status', 'Club Name', 'City', 'Address', 'Courts', 'Booking URL', 'Phone', 'Instagram', 'Website', 'Contact Name', 'Contact Email', 'Notes'] },
  photo: { name: 'Photo Submissions', headers: ['Submitted At', 'Status', 'Club', 'Photo URL', 'Credit', 'Licence Confirmed', 'Contact Name', 'Contact Email'] },
  correction: { name: 'Correction Submissions', headers: ['Submitted At', 'Status', 'Page URL', 'What Is Wrong', 'Correct Value', 'Contact Name', 'Contact Email', 'Is Owner'] },
};

const SUB_GENDERS = ['Men', 'Women', 'Mixed', 'Open'];
const SUB_LEVELS = ['Beginner', 'Improver', 'Intermediate', 'Advanced', 'Open']; // data/levels.json band labels
const SUB_EVENT_TYPES = ['Americano', 'Mexicano', 'Social', 'Clinic', 'League Night'];
const SUB_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SUB_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Entry point, called from doPost in AppsScript-Inbox.gs. Returns a JSON-able object. */
function handleSubmission(p) {
  p = p || {};
  if (String(p.website_url || '').trim() !== '') return { ok: true, status: 'pending' }; // honeypot: pretend success

  const type = String(p.type || '');
  const spec = SUB_TABS[type];
  if (!spec) return subFail('Unknown form type.');

  const v = subValidator(p);
  const cells = subBuild(type, v);           // header -> value, upload still pending
  if (v.error) return subFail(v.error, v.field);

  const upload = subCheckUpload(p, type === 'photo');
  if (upload.error) return subFail(upload.error, 'poster');

  try {
    subTab(spec); // create the tab, and refuse early if the name points at the live tab
  } catch (err) {
    return subFail('Submissions are paused while we fix something. Please message us on Instagram.');
  }

  if (!subTakeRateSlot()) {
    return subFail('We are getting a lot of submissions right now. Please try again in an hour, or message us on Instagram.');
  }

  if (upload.bytes) {
    const url = subSaveUpload(upload, type);
    cells[type === 'photo' ? 'Photo URL' : 'Poster URL'] = url;
  }
  cells['Submitted At'] = subNowIso();
  cells['Status'] = 'pending';

  const row = spec.headers.map(function (h) { return subSafeCell(cells[h] === undefined ? '' : cells[h]); });
  subAppend(spec, row);
  return { ok: true, status: 'pending' };
}

// ---- per-form field rules ----------------------------------------------------

function subBuild(type, v) {
  const contact = function (o) {
    o['Contact Name'] = v.text('contactName', 'Your name', 100, true);
    o['Contact Email'] = v.email('contactEmail');
    return o;
  };
  if (type === 'tournament') {
    const start = v.date('startDate', 'Start date', true);
    let end = v.date('endDate', 'End date', false);
    if (!end) end = start;
    if (start && end && end < start) v.fail('The end date is before the start date.', 'endDate');
    return contact({
      'Title': v.text('title', 'Tournament name', 200, true),
      'Organizer': v.text('organizer', 'Organizer', 200, false),
      'Start Date': start, 'End Date': end,
      'City': v.text('city', 'City', 100, true),
      'Club': v.text('club', 'Club or venue', 200, true),
      'Gender': v.oneOf('gender', 'Gender', SUB_GENDERS, true),
      'Levels': v.levels('levels'),
      'Format': v.text('format', 'Format', 200, false),
      'Entry Fee': v.text('entryFee', 'Entry fee', 100, false),
      'Prize': v.text('prize', 'Prize', 200, false),
      'Registration URL': v.url('registrationUrl', 'Registration link', false),
      'Instagram URL': v.url('instagramUrl', 'Instagram link', false, /(^|\.)instagram\.com$/),
      'Notes': v.text('notes', 'Notes', 2000, false),
    });
  }
  if (type === 'event') {
    const date = v.date('date', 'Date', false);
    const weekday = v.oneOf('weekday', 'Weekday', SUB_WEEKDAYS, false);
    let until = v.date('until', 'Runs until', false);
    if (!date && !weekday) v.fail('Choose a date for a one-off event, or a weekday for a weekly one.', 'date');
    if (date && weekday) v.fail('Choose either a date or a weekday, not both.', 'date');
    if (date) until = '';
    const startTime = v.time('startTime', 'Start time', true);
    const endTime = v.time('endTime', 'End time', false);
    if (startTime && endTime && endTime <= startTime) v.fail('The end time is before the start time.', 'endTime');
    return contact({
      'Title': v.text('title', 'Event name', 200, true),
      'Type': v.oneOf('eventType', 'Event type', SUB_EVENT_TYPES, true),
      'Club': v.text('club', 'Club or venue', 200, true),
      'City': v.text('city', 'City', 100, true),
      'Date': date, 'Weekday': weekday, 'Start Time': startTime, 'End Time': endTime, 'Until': until,
      'Levels': v.levels('levels'),
      'Gender': v.oneOf('gender', 'Gender', SUB_GENDERS, false) || 'Open',
      'Capacity': v.int('capacity', 'Capacity', 1, 500),
      'Price Per Person': v.text('pricePerPerson', 'Price per person', 100, false),
      'Signup URL': v.url('signupUrl', 'Sign-up link', false),
      'Last Confirmed At': subNowIso().slice(0, 10),
      'Notes': v.text('notes', 'Notes', 2000, false),
    });
  }
  if (type === 'club') {
    return contact({
      'Club Name': v.text('clubName', 'Club name', 200, true),
      'City': v.text('city', 'City', 100, true),
      'Address': v.text('address', 'Address', 500, false),
      'Courts': v.int('courts', 'Number of courts', 1, 60),
      'Booking URL': v.url('bookingUrl', 'Booking link', false),
      'Phone': v.phone('phone'),
      'Instagram': v.instagram('instagram'),
      'Website': v.url('website', 'Website', false),
      'Notes': v.text('notes', 'Notes', 2000, false),
    });
  }
  if (type === 'photo') {
    if (String(v.raw('licenceConfirmed')).toLowerCase() !== 'yes') v.fail('Please confirm you have the right to share this photo.', 'licenceConfirmed');
    return contact({
      'Club': v.text('club', 'Club', 200, true),
      'Credit': v.text('credit', 'Photo credit', 200, true),
      'Licence Confirmed': 'Yes',
    });
  }
  // correction
  return contact({
    'Page URL': v.url('pageUrl', 'Page link', true),
    'What Is Wrong': v.text('whatIsWrong', 'What is wrong', 2000, true),
    'Correct Value': v.text('correctValue', 'Correct information', 2000, false),
    'Is Owner': String(v.raw('isOwner')).toLowerCase() === 'yes' ? 'Yes' : 'No',
  });
}

/** Collects the first error; every getter returns '' once something has failed. */
function subValidator(p) {
  const v = { error: '', field: '' };
  const raw = function (k) { return String(p[k] === undefined || p[k] === null ? '' : p[k]).trim(); };
  v.raw = raw;
  v.fail = function (msg, field) { if (!v.error) { v.error = msg; v.field = field || ''; } return ''; };
  v.text = function (k, label, max, required) {
    const s = raw(k).replace(/\r\n?/g, '\n');
    if (!s) return required ? v.fail(label + ' is required.', k) : '';
    if (s.length > max) return v.fail(label + ' is too long. Keep it under ' + max + ' characters.', k);
    return s;
  };
  v.email = function (k) {
    const s = raw(k);
    if (!s) return v.fail('Your email is required so we can check this submission.', k);
    if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return v.fail('That email address does not look right.', k);
    return s;
  };
  v.date = function (k, label, required) {
    const s = raw(k);
    if (!s) return required ? v.fail(label + ' is required.', k) : '';
    if (!subIsDate(s)) return v.fail(label + ' must be a real date written as yyyy-mm-dd.', k);
    return s;
  };
  v.time = function (k, label, required) {
    const s = raw(k);
    if (!s) return required ? v.fail(label + ' is required.', k) : '';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return v.fail(label + ' must be a 24-hour time like 19:30.', k);
    return s;
  };
  v.url = function (k, label, required, hostRe) {
    const s = raw(k);
    if (!s) return required ? v.fail(label + ' is required.', k) : '';
    const host = subHttpsHost(s);
    if (!host || s.length > 500) return v.fail(label + ' must be a full web address starting with https://', k);
    if (hostRe && !hostRe.test(host)) return v.fail(label + ' must be an instagram.com link (starting with https://).', k);
    return s;
  };
  v.oneOf = function (k, label, list, required) {
    const s = raw(k);
    if (!s) return required ? v.fail(label + ' is required.', k) : '';
    if (list.indexOf(s) < 0) return v.fail(label + ' must be one of: ' + list.join(', ') + '.', k);
    return s;
  };
  v.levels = function (k) {
    const parts = raw(k).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      if (SUB_LEVELS.indexOf(parts[i]) < 0) return v.fail('Levels must be from: ' + SUB_LEVELS.join(', ') + '.', k);
    }
    return SUB_LEVELS.filter(function (l) { return parts.indexOf(l) >= 0; }).join(', ');
  };
  v.int = function (k, label, min, max) {
    const s = raw(k);
    if (!s) return '';
    if (!/^\d+$/.test(s) || +s < min || +s > max) return v.fail(label + ' must be a whole number from ' + min + ' to ' + max + '.', k);
    return String(+s);
  };
  v.phone = function (k) {
    const s = raw(k);
    if (!s) return '';
    if (s.length > 30 || !/^[+0-9 ()\-]{6,}$/.test(s)) return v.fail('The phone number should only use digits, spaces, + and -.', k);
    return s;
  };
  v.instagram = function (k) {
    const s = raw(k);
    if (!s) return '';
    const handle = s.replace(/^@/, '');
    if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) return 'https://www.instagram.com/' + handle + '/';
    const host = subHttpsHost(s);
    if (host && /(^|\.)instagram\.com$/.test(host) && s.length <= 500) return s;
    return v.fail('Instagram should be an @handle or an https://instagram.com link.', k);
  };
  return v;
}

function subIsDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2020 && +m[1] <= 2100;
}

/** Lower-case host of an https URL, or '' if it is not a plain https URL. */
function subHttpsHost(s) {
  const m = /^https:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})(:\d{1,5})?([\/?#][^\s]*)?$/.exec(s);
  return m ? m[1].toLowerCase() : '';
}

// ---- uploads -----------------------------------------------------------------

function subCheckUpload(p, required) {
  const data = String(p.posterData || '').replace(/\s/g, '');
  if (!data) return required ? { error: 'Please choose a photo to upload.' } : {};
  const mime = String(p.posterMime || '').toLowerCase();
  if (!SUB_MIME_EXT[mime]) return { error: 'The image must be a JPG, PNG or WebP file.' };
  if (data.length > Math.ceil(SUB_MAX_UPLOAD / 3) * 4 + 4) return { error: 'The image is larger than 5 MB.' };
  if (!/^[A-Za-z0-9+\/]+={0,2}$/.test(data)) return { error: 'The image could not be read. Please try again.' };
  let bytes;
  try { bytes = Utilities.base64Decode(data); } catch (err) { return { error: 'The image could not be read. Please try again.' }; }
  if (bytes.length > SUB_MAX_UPLOAD) return { error: 'The image is larger than 5 MB.' };
  const kind = subSniff(bytes);
  if (!kind) return { error: 'The image must be a JPG, PNG or WebP file.' };
  if (kind !== mime) return { error: 'The file type does not match its contents. Please upload a JPG, PNG or WebP image.' };
  return { bytes: bytes, mime: mime };
}

/** Detect the real image type from magic bytes (Apps Script bytes are signed). */
function subSniff(bytes) {
  const b = function (i) { return i < bytes.length ? bytes[i] & 0xff : -1; };
  if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
      b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return '';
}

function subSaveUpload(upload, type) {
  const it = DriveApp.getFoldersByName(SUB_DRIVE_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(SUB_DRIVE_FOLDER);
  // Our own file name; the submitter's file name is never trusted.
  const name = type + '-' + subNowIso().replace(/[:+]/g, '').slice(0, 15) + '-' + Math.random().toString(36).slice(2, 8) + '.' + SUB_MIME_EXT[upload.mime];
  const file = folder.createFile(Utilities.newBlob(upload.bytes, upload.mime, name));
  // Link-only view access so the nightly build can fetch it. The link is never returned to the submitter.
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { /* domain policy may forbid; the owner can still open it */ }
  return file.getUrl();
}

// ---- rate limit (rolling hour, whole site) -------------------------------------

function subTakeRateSlot() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const now = Date.now();
    let stamps = [];
    try { stamps = JSON.parse(cache.get(SUB_RATE_KEY) || '[]'); } catch (err) { stamps = []; }
    stamps = stamps.filter(function (t) { return now - t < SUB_RATE_WINDOW_MS; });
    if (stamps.length >= SUB_RATE_LIMIT) return false;
    stamps.push(now);
    cache.put(SUB_RATE_KEY, JSON.stringify(stamps), 3600);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// ---- sheet writes ----------------------------------------------------------------

function subAppend(spec, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = subTab(spec);
    const r = sheet.getLastRow() + 1;
    // Plain-text format first so Sheets keeps yyyy-mm-dd, HH:MM and +66 exactly as written.
    sheet.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  } finally {
    lock.releaseLock();
  }
}

/** The named submissions tab, created with headers if missing. Refuses the live tab. */
function subTab(spec) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(spec.name);
  if (!sheet) {
    sheet = ss.insertSheet(spec.name);
    sheet.getRange(1, 1, 1, spec.headers.length).setNumberFormat('@').setValues([spec.headers]);
    sheet.setFrozenRows(1);
  }
  if (sheet.getSheetId() === SUB_LIVE_GID) throw new Error('Refusing to write submissions to the live Tournaments tab.');
  return sheet;
}

/** Formula-injection guard. */
function subSafeCell(v) {
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** Bangkok time (UTC+7, no DST) as yyyy-mm-ddTHH:MM:SS+07:00. */
function subNowIso() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 19) + '+07:00';
}

function subFail(error, field) {
  return field ? { ok: false, error: error, field: field } : { ok: false, error: error };
}
