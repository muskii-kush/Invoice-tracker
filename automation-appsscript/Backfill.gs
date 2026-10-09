/**
 * Historical backfill: scans Gmail (via GmailApp) and every approved Slack
 * channel (via the Slack Web API) back to the configured lookback window,
 * classifies everything, and writes into the tracker sheets. Safe to
 * re-run — already-processed Gmail messages are skipped by ID, and Slack
 * channels resume from their stored cursor rather than rescanning.
 *
 * Run this after setupTracker(), importManualTrackerBackfill(), and
 * filling in the Setup tab + SLACK_BOT_TOKEN.
 */
function runBackfill() {
  var config = getConfig();
  if (!config.vikramEmail && !config.gmailGroupsAndAliases.length) {
    var msg = 'Fill in the Setup tab (Vikram email or at least one Gmail group/alias) before running backfill.';
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* no UI when run from the script editor directly, or from a trigger */ }
    return;
  }

  var knownVendors = knownVendorsFromSheet_();
  if (!knownVendors.length) knownVendors = KNOWN_VENDORS;
  var domainVendorMap = knownVendorDomainsFromSheet_();

  var afterDate = new Date();
  afterDate.setMonth(afterDate.getMonth() - config.lookbackMonths);

  var report = { gmailScanned: 0, slackScanned: 0, likelyInvoice: 0, possibleInvoice: 0, needsReview: 0, duplicates: 0, newInvoices: 0 };
  var processedGmailIds = getProcessedGmailIds_();

  report.gmailScanned = scanGmail_(config, afterDate, processedGmailIds, function (msg, sourceTag) {
    var result = processSourceItem_({
      source: 'Gmail', sourceType: sourceTag, receivedDate: msg.date, sender: msg.sender,
      recipientsOrChannel: msg.recipients, subjectOrPreview: msg.subject,
      bodyText: msg.subject + '\n' + msg.bodyText + '\n' + msg.attachmentText, attachmentNames: msg.attachmentNames,
      originalLink: msg.permalink, isThreadReply: msg.isThreadReply, knownVendors: knownVendors,
      domainVendorMap: domainVendorMap,
    });
    tallyResult_(report, result);
  });

  // Resume from any previously-saved Slack cursors so a second backfill run
  // (e.g. after adding a new approved channel) behaves like an incremental
  // scan instead of re-importing everything and duplicating Source Inbox rows.
  var savedCursors = PropertiesService.getScriptProperties().getProperty('SLACK_CURSORS');
  var cursors = savedCursors ? JSON.parse(savedCursors) : {};
  var slackLookbackTs = String(Math.floor(afterDate.getTime() / 1000));
  report.slackScanned = scanSlack_(config, cursors, function (msg, sourceTag) {
    var result = processSourceItem_({
      source: 'Slack', sourceType: sourceTag, receivedDate: slackTsToDate_(msg.ts), sender: msg.user,
      recipientsOrChannel: sourceTag, subjectOrPreview: msg.text.slice(0, 140), bodyText: msg.text,
      attachmentNames: msg.files, originalLink: msg.permalink, isThreadReply: msg.isThreadReply,
      knownVendors: knownVendors, domainVendorMap: domainVendorMap,
    });
    tallyResult_(report, result);
  }, slackLookbackTs);

  PropertiesService.getScriptProperties().setProperty('LAST_GMAIL_SYNC', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  PropertiesService.getScriptProperties().setProperty('SLACK_CURSORS', JSON.stringify(cursors));

  Logger.log(JSON.stringify(report, null, 2));

  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; } // no UI when run from the script editor directly, or from a trigger
  if (ui) {
    ui.alert(
      'Backfill complete.\n\n'
      + 'Gmail messages scanned: ' + report.gmailScanned + '\n'
      + 'Slack messages scanned: ' + report.slackScanned + '\n'
      + 'New invoices created: ' + report.newInvoices + '\n'
      + 'Duplicates linked: ' + report.duplicates + '\n'
      + 'Sent to Review Queue: ' + report.needsReview + '\n\n'
      + 'Check the Review Queue tab, then set up a time-driven trigger for runSync() '
      + '(Triggers icon, left sidebar) for ongoing collection.'
    );
  }
}

function tallyResult_(report, result) {
  if (result.category === 'Likely invoice') report.likelyInvoice++;
  if (result.category === 'Possible invoice') report.possibleInvoice++;
  if (result.category === 'Needs manual review') report.needsReview++;
  if (result.matchedInvoiceId) report.duplicates++;
  if (result.newInvoiceId) report.newInvoices++;
}

function slackTsToDate_(ts) {
  return new Date(Number(ts) * 1000);
}
