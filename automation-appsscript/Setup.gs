/**
 * One-time setup: builds the six tabs with headers/formatting, and the
 * Setup tab's config fields (which getConfig() reads from). Safe to
 * re-run — it only creates sheets/headers that don't already exist and
 * never touches existing data rows.
 *
 * Run this first (Apps Script editor: select setupTracker, click Run).
 * You'll be asked to authorize Gmail (read-only) and external requests
 * (for Slack) — that's the only "setup" this needs, no Cloud Console.
 */
function setupTracker() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SHEET_SCHEMAS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      var headers = SHEET_SCHEMAS[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4E78')
        .setWrap(true).setVerticalAlignment('middle');
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 40);
      sheet.autoResizeColumns(1, headers.length);
    }
  });

  buildSetupSheet_();

  // Tidy tab order to match the master prompt: Invoice Register, Source
  // Inbox, Activity Log, Vendor Reference, Review Queue, Setup.
  var order = ['Invoice Register', 'Source Inbox', 'Activity Log', 'Vendor Reference', 'Review Queue', 'Setup'];
  order.forEach(function (name, i) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(i + 1);
    }
  });

  var setupMsg = 'Setup complete. Next steps:\n\n'
    + '1. Open the "Setup" tab and fill in Vikram\'s email, group/alias addresses, '
    + 'vendor domains, and approved Slack channels.\n'
    + '2. Run importManualTrackerBackfill() once to load the historical data from '
    + 'your old manual tracker.\n'
    + '3. Add your Slack bot token via Project Settings > Script Properties '
    + '(key: SLACK_BOT_TOKEN).\n'
    + '4. Run runBackfill() for the live 12-month Gmail/Slack scan.\n'
    + '5. Set up a time-driven trigger for runSync() (Triggers menu, left sidebar) '
    + 'for ongoing collection.';
  Logger.log(setupMsg);
  try { SpreadsheetApp.getUi().alert(setupMsg); } catch (e) { /* no UI when run from the script editor directly, or from a trigger */ }
}

function buildSetupSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 'Setup' has no entry in SHEET_SCHEMAS (it's a label/value sheet, not a
  // row-per-record table), so nothing else creates it — do that here.
  var sheet = ss.getSheetByName('Setup') || ss.insertSheet('Setup');
  sheet.clear();
  sheet.setColumnWidth(1, 320);
  sheet.setColumnWidth(2, 640);

  var rows = [];
  function section(title) { rows.push([title, '']); }
  function kv(label, value) { rows.push([label, value === undefined ? '' : value]); }
  function blank() { rows.push(['', '']); }

  rows.push(['Invoice Automation Tracker — Setup & Reference', '']);
  blank();

  section('1. Gmail / Slack scope — EDIT THESE VALUES');
  kv('Vikram email', 'muskan.kushwaha@cars24.com');
  kv('Gmail groups/aliases', '');
  kv('Vendor email domains', 'truecaller.com, airtel.com');
  kv('Gmail lookback months', 12);
  kv('Slack approved channels', 'C0C4X031MPX');
  kv('Slack include DMs with Vikram', 'false');
  blank();

  section('2. What still needs doing');
  kv('Step 1', 'Fill in the config values above.');
  kv('Step 2', 'Project Settings (gear icon, left sidebar) > Script Properties > add SLACK_BOT_TOKEN.');
  kv('Step 3', 'Invite your Slack bot to each approved channel (/invite @your-bot-name).');
  kv('Step 4', 'Run importManualTrackerBackfill() once (loads the historical manual-tracker data).');
  kv('Step 5', 'Run runBackfill() for the live Gmail/Slack historical scan.');
  kv('Step 6', 'Triggers (clock icon, left sidebar) > Add Trigger > runSync > Time-driven > Day timer.');
  blank();

  section('3. Invoice keyword signals');
  kv('Keywords', INVOICE_KEYWORDS.join(', '));
  blank();

  section('4. Known vendors (seed list — add new ones to the Vendor Reference tab)');
  kv('Vendors', KNOWN_VENDORS.join(', '));
  blank();

  section('5. Status definitions');
  kv('Intake Status values', INTAKE_STATUSES.join(', '));
  kv('P2P Status values', P2P_STATUSES.join(', '));
  kv('Detection categories', DETECTION_CATEGORIES.join(', '));
  blank();

  section('6. Guardrails (Phase 1)');
  kv('•', 'Read-only access to Gmail and Slack only.');
  kv('•', 'Personal/direct messages included only where explicitly approved above.');
  kv('•', 'No unrelated private conversations are scanned — only the approved channel/DM list.');
  kv('•', 'Attachments are referenced by name/link, not downloaded.');
  kv('•', 'This script never sends, modifies, or deletes any email or Slack message.');

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1, rows.length, 2).setFontFamily('Arial').setFontSize(10).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  rows.forEach(function (row, i) {
    if (row[0].charAt(0) >= '1' && row[0].charAt(0) <= '9' && row[0].indexOf('.') === 2) {
      sheet.getRange(i + 1, 1).setFontWeight('bold').setFontColor('#1F4E78').setFontSize(11);
    }
  });
}
