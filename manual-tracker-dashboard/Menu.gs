function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tracker Dashboard')
    .addItem('1. Import tracker data (first time only)', 'importManualTracker')
    .addToUi();
}
