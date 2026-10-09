/**
 * Read-only Gmail scanning via the built-in GmailApp service — no OAuth
 * client, no credentials.json, no Cloud Console project to create. The
 * only thing Apps Script asks for is a one-click authorization the first
 * time you run any function here, scoped to what GmailApp actually needs.
 */

function buildGmailQueries_(config, afterDate) {
  var afterClause = 'after:' + Utilities.formatDate(afterDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var queries = [];
  var kwQuery = INVOICE_KEYWORDS.map(function (k) { return '"' + k + '"'; }).join(' OR ');
  var keywordFilter = '(' + kwQuery + ')';

  // "to:Vikram" / "cc:Vikram" / group-alias on their own match almost
  // everything in the inbox (newsletters, calendar invites, product
  // notifications...) — the master prompt's "use a combination of
  // signals" means these recipient scopes must be paired with a content
  // signal, not searched unfiltered. Vendor-domain mail stays unfiltered
  // since that scope is already narrow by construction.
  if (config.vikramEmail) {
    queries.push({ q: 'to:' + config.vikramEmail + ' ' + keywordFilter + ' ' + afterClause, tag: 'to:Vikram+keyword' });
    queries.push({ q: 'cc:' + config.vikramEmail + ' ' + keywordFilter + ' ' + afterClause, tag: 'cc:Vikram+keyword' });
  }
  config.gmailGroupsAndAliases.forEach(function (alias) {
    if (alias) queries.push({ q: 'to:' + alias + ' ' + keywordFilter + ' ' + afterClause, tag: 'group:' + alias + '+keyword' });
  });
  config.vendorDomains.forEach(function (domain) {
    if (domain) queries.push({ q: 'from:@' + domain + ' ' + afterClause, tag: 'vendor-domain:' + domain });
  });

  queries.push({ q: keywordFilter + ' has:attachment ' + afterClause, tag: 'keyword+attachment' });
  queries.push({ q: keywordFilter + ' ' + afterClause, tag: 'keyword' });

  return queries;
}

/** Runs one Gmail search query, paging through results (capped per query to stay well inside daily quota). */
function scanGmailQuery_(query, maxThreads) {
  var threads = [];
  var start = 0;
  var pageSize = 100;
  var cap = maxThreads || 500;
  var page;
  do {
    page = GmailApp.search(query, start, pageSize);
    threads = threads.concat(page);
    start += pageSize;
  } while (page.length === pageSize && start < cap);

  var messages = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) { messages.push(msg); });
  });
  return messages;
}

/**
 * Normalizes a GmailMessage. Attachment CONTENT is never persisted
 * anywhere — only filenames are read off the already-fetched message, per
 * the master prompt's "don't download/duplicate attachments unless
 * required" rule.
 */
function normalizeGmailMessage_(msg) {
  var attachmentNames = [];
  var attachmentText = '';
  try {
    var attachments = msg.getAttachments();
    attachmentNames = attachments.map(function (a) { return a.getName(); });
    attachmentText = extractPdfTextFromAttachments_(attachments);
  } catch (e) {
    // Some malformed/legacy messages throw here; treat as no attachments rather than failing the whole run.
  }
  var thread = msg.getThread();
  var firstId = thread.getMessages()[0].getId();

  return {
    id: msg.getId(),
    subject: msg.getSubject() || '',
    sender: msg.getFrom() || '',
    recipients: (msg.getTo() || '') + (msg.getCc() ? ' ; cc: ' + msg.getCc() : ''),
    date: msg.getDate(),
    bodyText: msg.getPlainBody() || '',
    attachmentNames: attachmentNames,
    attachmentText: attachmentText,
    permalink: 'https://mail.google.com/mail/u/0/#all/' + msg.getId(),
    isThreadReply: thread.getMessageCount() > 1 && firstId !== msg.getId(),
  };
}

/** Scans every configured Gmail query since afterDate, deduped by message ID within this run and against alreadySeenIds. */
function scanGmail_(config, afterDate, alreadySeenIds, onMessage) {
  var seenThisRun = {};
  var queries = buildGmailQueries_(config, afterDate);
  var scanned = 0;
  queries.forEach(function (query) {
    scanGmailQuery_(query.q).forEach(function (msg) {
      var id = msg.getId();
      if (seenThisRun[id] || alreadySeenIds[id]) return;
      seenThisRun[id] = true;
      onMessage(normalizeGmailMessage_(msg), query.tag);
      scanned++;
    });
  });
  return scanned;
}

/** Reads Source Inbox's Original Message Link column and extracts Gmail message IDs already recorded, to avoid reprocessing. */
function getProcessedGmailIds_() {
  var sheet = getSheet_('Source Inbox');
  var lastRow = sheet.getLastRow();
  var ids = {};
  if (lastRow < 2) return ids;
  var links = sheet.getRange(2, SHEET_SCHEMAS['Source Inbox'].indexOf('Original Message Link') + 1, lastRow - 1, 1).getValues();
  links.forEach(function (row) {
    var m = String(row[0] || '').match(/#all\/([^/?]+)/);
    if (m) ids[m[1]] = true;
  });
  return ids;
}
