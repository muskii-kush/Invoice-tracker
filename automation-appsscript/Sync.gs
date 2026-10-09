/**
 * Incremental sync: only Gmail messages since LAST_GMAIL_SYNC and Slack
 * messages since each channel's stored cursor. Same pipeline as
 * runBackfill(), just scoped to new messages. This is the function to put
 * on a time-driven trigger (Triggers icon, left sidebar > Add Trigger >
 * runSync > Time-driven).
 */
function runSync() {
  var config = getConfig();
  var props = PropertiesService.getScriptProperties();
  var lastSync = props.getProperty('LAST_GMAIL_SYNC');

  if (!lastSync) {
    Logger.log('No LAST_GMAIL_SYNC recorded — run runBackfill() first.');
    var ui;
    try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; } // triggers run without a UI context
    if (ui) ui.alert('Run runBackfill() first — sync needs a starting point.');
    return;
  }

  var knownVendors = knownVendorsFromSheet_();
  if (!knownVendors.length) knownVendors = KNOWN_VENDORS;

  // One day of overlap on the Gmail cutoff — cheap insurance against
  // late-arriving mail near a sync boundary; getProcessedGmailIds_()
  // already skips anything actually reprocessed.
  var afterDate = new Date(lastSync + 'T00:00:00Z');
  afterDate.setDate(afterDate.getDate() - 1);

  var report = { gmailNew: 0, slackNew: 0 };
  var processedGmailIds = getProcessedGmailIds_();

  report.gmailNew = scanGmail_(config, afterDate, processedGmailIds, function (msg, sourceTag) {
    processSourceItem_({
      source: 'Gmail', sourceType: sourceTag, receivedDate: msg.date, sender: msg.sender,
      recipientsOrChannel: msg.recipients, subjectOrPreview: msg.subject,
      bodyText: msg.subject + '\n' + msg.bodyText + '\n' + msg.attachmentText, attachmentNames: msg.attachmentNames,
      originalLink: msg.permalink, isThreadReply: msg.isThreadReply, knownVendors: knownVendors,
    });
  });

  var savedCursors = props.getProperty('SLACK_CURSORS');
  var cursors = savedCursors ? JSON.parse(savedCursors) : {};
  report.slackNew = scanSlack_(config, cursors, function (msg, sourceTag) {
    processSourceItem_({
      source: 'Slack', sourceType: sourceTag, receivedDate: slackTsToDate_(msg.ts), sender: msg.user,
      recipientsOrChannel: sourceTag, subjectOrPreview: msg.text.slice(0, 140), bodyText: msg.text,
      attachmentNames: msg.files, originalLink: msg.permalink, isThreadReply: msg.isThreadReply,
      knownVendors: knownVendors,
    });
  });

  props.setProperty('LAST_GMAIL_SYNC', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  props.setProperty('SLACK_CURSORS', JSON.stringify(cursors));

  Logger.log('Sync: ' + report.gmailNew + ' new Gmail, ' + report.slackNew + ' new Slack messages.');
}
