/**
 * Read/write layer for the tracker spreadsheet. Every write is an append
 * (or a single targeted cell update) — never an overwrite of a
 * Remarks/Activity cell, per the master prompt's append-only rule.
 */

var SHEET_SCHEMAS = {
  'Invoice Register': [
    'Invoice ID', 'Vendor', 'Service', 'Business Unit', 'Invoice Number',
    'Invoice Date', 'Invoice Amount', 'Currency', 'Tax Amount', 'Due Date',
    'Billing Period', 'Description', 'PO Number', 'PR Number',
    'P2P / Aerchain Link', 'Vendor SPOC', 'Internal POC', 'Current Owner',
    'Source Type', 'Source Message ID', 'Source Message Link',
    'Source Received Date', 'Attachment Name', 'Attachment Link',
    'Detection Confidence', 'Intake Status', 'P2P Status', 'Current Issue',
    'Next Action', 'Next Action Owner', 'Next Action Date', 'Created Date',
    'Last Updated Date', 'Duplicate Group ID', 'Remarks',
  ],
  'Source Inbox': [
    'Source Record ID', 'Source', 'Source Type', 'Received Date', 'Sender',
    'Recipients or Channel', 'Subject or Message Preview',
    'Attachment Names', 'Shared Links', 'Detected Vendor',
    'Detected Invoice Number', 'Detected Amount', 'Detected PO / PR Number',
    'Matched Invoice ID', 'Detection Status', 'Review Notes',
    'Original Message Link',
  ],
  'Activity Log': [
    'Activity ID', 'Invoice ID', 'Activity Date', 'Source', 'Actor',
    'Activity Type', 'Details', 'Outcome', 'Next Action',
    'Next Action Owner', 'Next Action Date', 'Source Link',
  ],
  'Vendor Reference': [
    'Vendor', 'Service', 'Vendor SPOC', 'Known Vendor Email Domain',
    'Known Vendor Email Addresses', 'Known Slack Contacts',
    'Known Slack Channels', 'Business Units',
    'PR / Direct PO Approval Matrix', 'Invoice Approval Matrix',
    'Default Internal Owner', 'Matching Notes', 'Active / Inactive',
  ],
  'Review Queue': [
    'Review Item ID', 'Linked Source Record ID', 'Linked Invoice ID',
    'Reason For Review', 'Detected Signals', 'Suggested Vendor',
    'Suggested Invoice Number', 'Suggested Amount', 'Status',
    'Assigned To', 'Notes', 'Original Message Link',
  ],
};

var ID_PREFIXES = { 'Invoice Register': 'INV', 'Source Inbox': 'SRC', 'Activity Log': 'ACT', 'Review Queue': 'REV' };

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found — run setupTracker() first.');
  return sheet;
}

function headerIndex_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  headers.forEach(function (h, i) { idx[h] = i + 1; });
  return idx;
}

function nextId_(sheet, prefix) {
  var n = Math.max(sheet.getLastRow(), 1); // header is row 1
  return prefix + '-' + String(n).padStart(4, '0');
}

/**
 * data: object keyed by exact column header. Missing keys → blank.
 * Returns the generated/used ID for sheets with an ID column, else null.
 */
function appendRow_(sheetName, data) {
  var sheet = getSheet_(sheetName);
  var headers = SHEET_SCHEMAS[sheetName];
  var idCol = headers[0];
  var prefix = ID_PREFIXES[sheetName];

  var rowId = data[idCol];
  if (prefix && !rowId) {
    rowId = nextId_(sheet, prefix);
    data = Object.assign({}, data, {});
    data[idCol] = rowId;
  }

  var row = headers.map(function (h) { return data[h] !== undefined ? data[h] : ''; });
  sheet.appendRow(row);
  return rowId || null;
}

/** Finds the row number (1-based, sheet-relative) whose ID column matches targetId, or -1. */
function findRowById_(sheet, targetId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === targetId) return i + 2;
  }
  return -1;
}

/** Targeted single-field update — never used for Remarks/free-text history. */
function updateCell_(sheetName, rowId, columnName, value) {
  var sheet = getSheet_(sheetName);
  var headers = SHEET_SCHEMAS[sheetName];
  var colIdx = headers.indexOf(columnName) + 1;
  var rowIdx = findRowById_(sheet, rowId);
  if (rowIdx === -1) throw new Error(rowId + ' not found in ' + sheetName);
  sheet.getRange(rowIdx, colIdx).setValue(value);
}

/** Returns every Invoice Register row as an object array, for matchInvoice_(). */
function allInvoices_() {
  var sheet = getSheet_('Invoice Register');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = SHEET_SCHEMAS['Invoice Register'];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  values.forEach(function (row) {
    if (!row[0]) return;
    var record = {};
    headers.forEach(function (h, i) { record[h] = row[i]; });
    out.push({
      invoiceId: record['Invoice ID'], vendor: record['Vendor'],
      invoiceNumber: record['Invoice Number'], amount: record['Invoice Amount'],
      invoiceDate: record['Invoice Date'], billingPeriod: record['Billing Period'],
      poNumber: record['PO Number'], prNumber: record['PR Number'],
      p2pLink: record['P2P / Aerchain Link'], attachmentHash: null,
      description: record['Description'],
    });
  });
  return out;
}

function knownVendorsFromSheet_() {
  var sheet = getSheet_('Vendor Reference');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, SHEET_SCHEMAS['Vendor Reference'].length).getValues();
  var activeIdx = SHEET_SCHEMAS['Vendor Reference'].indexOf('Active / Inactive');
  var out = [];
  values.forEach(function (row) {
    if (row[0] && String(row[activeIdx] || 'Active').toLowerCase() !== 'inactive') out.push(row[0]);
  });
  return out;
}
