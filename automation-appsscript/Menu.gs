/**
 * Adds a menu so day-to-day use doesn't require opening the Apps Script
 * editor at all — everything after the one-time setup runs from the sheet.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Invoice Automation')
    .addItem('1. Setup tracker (first time only)', 'setupTracker')
    .addItem('2. Import manual tracker backfill (first time only)', 'importManualTrackerBackfill')
    .addSeparator()
    .addItem('Run historical backfill (Gmail + Slack)', 'runBackfill')
    .addItem('Run incremental sync', 'runSync')
    .addToUi();
}
