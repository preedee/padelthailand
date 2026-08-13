/**
 * AppsScript-Inbox.gs — the sheet's write endpoint for the poster pipeline.
 *
 * Paste this into the PadelThailand tournaments spreadsheet:
 *   Extensions → Apps Script → paste → Deploy → New deployment → Web app
 *   Execute as: Me      Who has access: Anyone with the link
 * Copy the /exec URL into the iOS Shortcut and into scripts/.ingest-config.json
 * (see scripts/README.md).
 *
 * It runs as you, inside the spreadsheet, so nothing here needs a service account,
 * an enabled Sheets API, or the sheet shared with anyone. The URL has to be public
 * for the phone to reach it, so the shared secret is what actually guards it.
 *
 * Three actions, all POSTed as form fields with `secret`:
 *   share       {url}                         — queue a post (the iOS Shortcut)
 *   linkPoster  {url, row}                    — put a post URL on an existing row
 *   addTournament {payload:<json>}            — append a fully formed tournament row
 */

// Change this, and use the same value in the Shortcut and the ingest config.
const SHARED_SECRET = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';

const INBOX = 'Inbox';
const INBOX_HEADERS = ['Instagram URL', 'Shared At', 'Note', 'Status'];
const TOURNAMENTS_GID = 0;

// Column order of the Tournaments tab. Keep in step with the sheet.
const COLUMNS = [
  'Tournament Name', 'Organizer', 'Start Date', 'End Date', 'City', 'Country', 'Club',
  'Prize Pool', 'Tournament Registration URL #1', 'Registration URL Label #1',
  'Tournament Registration URL #2', 'Registration URL Label #2', 'Tournament Instagram URL',
  'Categories', 'Featured', 'Hide', 'Organizer Website', 'Organizer Instagram',
  'Organizer Logo', 'Organizer HEX Color',
];

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.secret !== SHARED_SECRET) return json({ ok: false, error: 'bad secret' });

    switch (p.action || 'share') {
      case 'share': return json(share(p));
      case 'linkPoster': return json(linkPoster(p));
      case 'addTournament': return json(addTournament(p));
      default: return json({ ok: false, error: 'unknown action ' + p.action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** Open the /exec URL in a browser to confirm the deployment works. */
function doGet() {
  return json({ ok: true, service: 'padelthailand inbox' });
}

// ---- actions ---------------------------------------------------------------

function share(p) {
  var url = String(p.url || '').trim();
  if (!isPostUrl(url)) return { ok: false, error: 'not an Instagram post URL' };

  var sheet = inboxSheet();
  if (findInboxRow(sheet, url)) return { ok: true, duplicate: true };

  sheet.appendRow([url, new Date(), String(p.note || '').trim(), 'new']);
  return { ok: true };
}

/** Attach a post URL to an existing tournament row (1-based sheet row number). */
function linkPoster(p) {
  var row = parseInt(p.row, 10);
  var url = String(p.url || '').trim();
  if (!row || row < 2) return { ok: false, error: 'bad row' };
  if (!isPostUrl(url)) return { ok: false, error: 'not an Instagram post URL' };

  var sheet = tournamentsSheet();
  var col = COLUMNS.indexOf('Tournament Instagram URL') + 1;
  sheet.getRange(row, col).setValue(url);
  markInbox(url, 'linked row ' + row);
  return { ok: true, row: row };
}

/** Append a new tournament. `payload` is a JSON object keyed by column name. */
function addTournament(p) {
  var data;
  try { data = JSON.parse(p.payload || '{}'); }
  catch (err) { return { ok: false, error: 'payload is not JSON' }; }

  if (!data['Tournament Name'] || !data['Start Date']) {
    return { ok: false, error: 'need at least Tournament Name and Start Date' };
  }

  var sheet = tournamentsSheet();
  var row = COLUMNS.map(function (name) {
    return data[name] === undefined || data[name] === null ? '' : data[name];
  });
  sheet.appendRow(row);

  var url = data['Tournament Instagram URL'];
  if (url) markInbox(url, 'added row ' + sheet.getLastRow());
  return { ok: true, row: sheet.getLastRow() };
}

// ---- helpers ---------------------------------------------------------------

function isPostUrl(url) {
  return /instagram\.com\/(?:[^\/]+\/)?(?:p|reel|reels|tv)\//.test(url);
}

function shortcode(url) {
  var m = String(url).match(/instagram\.com\/(?:[^\/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : String(url);
}

function tournamentsSheet() {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === TOURNAMENTS_GID) return sheets[i];
  }
  return sheets[0];
}

function inboxSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INBOX);
  if (!sheet) {
    sheet = ss.insertSheet(INBOX);
    sheet.appendRow(INBOX_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Row number of a queued URL, matched by shortcode; 0 when absent. */
function findInboxRow(sheet, url) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var code = shortcode(url);
  var values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (shortcode(String(values[i][0])) === code) return i + 2;
  }
  return 0;
}

/** Record what happened to a queued post so it is not processed twice. */
function markInbox(url, status) {
  var sheet = inboxSheet();
  var row = findInboxRow(sheet, url);
  if (row) sheet.getRange(row, INBOX_HEADERS.indexOf('Status') + 1).setValue(status);
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
