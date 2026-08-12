/**
 * AppsScript-Inbox.gs — capture endpoint for the "share a post to the site" Shortcut.
 *
 * Paste this into the PadelThailand tournaments spreadsheet:
 *   Extensions → Apps Script → paste → Deploy → New deployment → Web app
 *   Execute as: Me      Who has access: Anyone with the link
 * Copy the /exec URL it gives you into the iOS Shortcut (see scripts/README.md).
 *
 * It appends one row per shared Instagram post to an `Inbox` tab, creating the tab on
 * first use. scripts/fetch-posters.ts reads that tab on its next run and downloads the
 * poster. The shared secret keeps random traffic from writing to the sheet — the URL is
 * public by necessity, so the token is what actually gates it.
 */

// Change this, and put the same value in the Shortcut.
const SHARED_SECRET = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';

const TAB = 'Inbox';
const HEADERS = ['Instagram URL', 'Shared At', 'Note', 'Status'];

function doPost(e) {
  try {
    const params = e.parameter || {};
    if (params.secret !== SHARED_SECRET) return json({ ok: false, error: 'bad secret' });

    const url = (params.url || '').trim();
    if (!/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\//.test(url)) {
      return json({ ok: false, error: 'not an Instagram post URL' });
    }

    const sheet = inboxSheet();
    if (alreadyPresent(sheet, url)) return json({ ok: true, duplicate: true });

    sheet.appendRow([url, new Date(), (params.note || '').trim(), 'new']);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** Lets you confirm the deployment works by opening the /exec URL in a browser. */
function doGet() {
  return json({ ok: true, service: 'padelthailand inbox' });
}

function inboxSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB);
  if (!sheet) {
    sheet = ss.insertSheet(TAB);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Sharing the same post twice should be a no-op, not a duplicate poster. */
function alreadyPresent(sheet, url) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const code = shortcode(url);
  return sheet.getRange(2, 1, last - 1, 1).getValues()
    .some(row => shortcode(String(row[0])) === code);
}

function shortcode(url) {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : url;
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
