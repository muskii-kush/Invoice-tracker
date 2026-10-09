/**
 * Serves the dashboard as a Web App. One-time deploy step (see README):
 * Deploy > New deployment > Web app > Execute as: Me > Who has access:
 * Anyone within [your domain] > Deploy > copy the URL it gives you.
 *
 * Re-running "Deploy > New deployment" after editing this file creates a
 * NEW url. To update the SAME url after an edit, use "Manage deployments"
 * > pencil icon > Version: New version > Deploy instead.
 */
function doGet(e) {
  // Simplified dashboard only needs these two — Source Inbox (1000+ rows),
  // Vendor Reference, and Review Queue aren't rendered as their own tabs
  // anymore, so there's no point paying to fetch/serialize them here.
  var data = {
    generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy, HH:mm'),
    invoiceRegister: readSheetAsObjects_('Invoice Register'),
    activityLog: readSheetAsObjects_('Activity Log'),
  };

  var template = HtmlService.createTemplateFromFile('Dashboard');
  template.dataJson = JSON.stringify(data);
  return template.evaluate()
    .setTitle('Invoice Automation Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Reads every data row of a tracker sheet into an array of plain objects
 * keyed by column header. Dates are formatted as yyyy-MM-dd strings (so
 * they serialize cleanly to JSON and sort correctly as text); everything
 * else passes through as-is.
 */
function readSheetAsObjects_(sheetName) {
  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!ws) return [];
  var lastRow = ws.getLastRow();
  var lastCol = ws.getLastColumn();
  if (lastRow < 2) return [];

  var headers = ws.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = ws.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var tz = Session.getScriptTimeZone();

  return values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        var v = row[i];
        obj[h] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
      });
      return obj;
    });
}
