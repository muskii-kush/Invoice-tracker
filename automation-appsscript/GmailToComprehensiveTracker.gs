/**
 * Syncs invoices discovered via Gmail into the comprehensive
 * "Month-on-Month Invoice Tracker" sheet — not just Invoice Register.
 * "Current Status" is taken from the latest message in the email thread,
 * per your call: if the follow-up conversation happens over email, this
 * picks it up automatically.
 *
 * Real limit, stated plainly: this only ever reflects status updates that
 * happen over EMAIL. A status change that happens over Slack, verbally,
 * or directly in Aerchain with no email trail stays invisible to this and
 * still needs manual entry — same as before this existed.
 *
 * Fields this can populate from the email itself: Vendor Name, Invoice
 * Number, Invoice Date, Invoice Value, Billing Due Date, PR/PO Number,
 * Current Status (latest thread snippet). Everything else (Validation,
 * Payment Release Status, SPOC assignments, PR/PO Raised Date, PO
 * Released Date, Entity, Type Of Transaction, Payment TAT, Month
 * cosumption, Billing Period) is genuinely internal-process information
 * that doesn't exist in the vendor's email — left blank for your team to
 * fill in, same as the manual tracker always required.
 *
 * Requires MOM_HEADERS (declared in ImportComprehensiveTracker.gs) and
 * the "Month-on-Month Invoice Tracker" sheet to already exist — run
 * importComprehensiveTracker() first.
 */

function syncToMonthOnMonthTracker_(signals, opts) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Month-on-Month Invoice Tracker');
  if (!sheet) return; // comprehensive tracker not imported yet -- nothing to sync into

  var headers = MOM_HEADERS;
  var col = {};
  headers.forEach(function (h, i) { col[h] = i; });

  var invoiceNumber = (signals.invoiceNumbers || []).join(', ');
  var poNumber = (signals.poNumbers || []).concat(signals.prNumbers || []).join(', ');
  var amount = (signals.amounts && signals.amounts.length) ? signals.amounts[0] : null;

  var existingRow = findMomRow_(sheet, col, signals.vendor, invoiceNumber, amount);

  var newStatus = opts.latestThreadSnippet || '';
  var statusDate = opts.latestThreadDate
    ? Utilities.formatDate(opts.latestThreadDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : '';

  if (existingRow) {
    updateMomStatus_(sheet, col, existingRow, newStatus, statusDate);
    return;
  }

  if (!signals.vendor) return; // nothing useful to file without at least knowing who it's from

  var row = headers.map(function () { return ''; });
  row[col['Vendor Name']] = signals.vendor;
  row[col['Invoice Received Date']] = opts.receivedDate || '';
  row[col['Invoice Number']] = invoiceNumber;
  row[col['Invoice Value']] = amount || '';
  row[col['Invoice Date']] = signals.invoiceDate || '';
  row[col['Billing Due Date']] = signals.dueDate || '';
  row[col['PR/PO Number']] = poNumber;
  row[col['Current Status']] = newStatus;
  row[col['Remarks']] = 'Auto-created from Gmail on ' + statusDate + '. Blank fields (Validation, '
    + 'Payment Release Status, SPOC, PR/PO dates, Entity, Type Of Transaction, Payment TAT, Month '
    + 'cosumption, Billing Period) need manual entry — not available from the vendor email.';
  sheet.appendRow(row);
}

/** Only overwrites Current Status if the new thread snippet actually differs — and keeps the old one, dated, in Remarks rather than silently losing it. */
function updateMomStatus_(sheet, col, rowIndex, newStatus, statusDate) {
  if (!newStatus) return;
  var statusCell = sheet.getRange(rowIndex, col['Current Status'] + 1);
  var oldStatus = statusCell.getValue();
  if (newStatus === oldStatus) return;

  statusCell.setValue(newStatus);
  if (oldStatus) {
    var remarksCell = sheet.getRange(rowIndex, col['Remarks'] + 1);
    var prevRemarks = remarksCell.getValue();
    remarksCell.setValue((prevRemarks ? prevRemarks + '\n' : '') + '[' + statusDate + '] Previous status: ' + oldStatus);
  }
}

/** Finds a matching row by exact Invoice Number first, falling back to vendor+amount (weak match) — same priority spirit as matcher.gs, just scoped to this sheet's own columns. */
function findMomRow_(sheet, col, vendor, invoiceNumber, amount) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  if (invoiceNumber) {
    for (var i = 0; i < values.length; i++) {
      var existingNum = String(values[i][col['Invoice Number']] || '').trim();
      if (existingNum && existingNum === invoiceNumber.trim()) return i + 2;
    }
  }
  if (vendor && amount) {
    for (var j = 0; j < values.length; j++) {
      var row = values[j];
      var sameVendor = String(row[col['Vendor Name']] || '').trim().toLowerCase() === vendor.trim().toLowerCase();
      var sameAmount = Number(row[col['Invoice Value']]) === Number(amount);
      if (sameVendor && sameAmount) return j + 2;
    }
  }
  return null;
}
