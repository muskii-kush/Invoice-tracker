/**
 * Shared vocabulary + config for the invoice-tracking automation.
 * Ported from the Python prototype's constants.py — keep the two in sync
 * if you maintain both, or just treat this one as canonical going forward
 * since Apps Script is the version that actually runs unattended.
 *
 * Secrets (Slack token) live in Script Properties, not here — see Setup.gs.
 * Everything else (keywords, vendor list, Gmail/Slack scope) is editable
 * either here or, once setupTracker() has run, on the "Setup" sheet tab.
 */

var INVOICE_KEYWORDS = [
  'invoice', 'bill', 'receipt', 'renewal', 'subscription', 'payment',
  'payment advice', 'outstanding', 'pending invoice', 'proforma',
  'debit note', 'credit note', 'tax invoice', 'gst invoice', 'po',
  'purchase order', 'pr', 'requisition', 'aerchain', 'p2p', 'approval',
  'payment processing',
];

var APPROVAL_KEYWORDS = [
  'approve', 'approval', 'please approve', 'sign off', 'authorise',
  'authorize', 'validation', 'second approver',
];

var ATTACHMENT_EXTENSIONS = {
  pdf: ['pdf'],
  image: ['png', 'jpg', 'jpeg', 'heic'],
  spreadsheet: ['xlsx', 'xls', 'csv'],
  document: ['doc', 'docx'],
};

var P2P_LINK_PATTERNS = [/aerchain\.io/i];

// Seed vendor list — new vendors get added to the "Vendor Reference" sheet
// as they're discovered; ACTIVE_VENDOR_CACHE (SheetStore.gs) reads from
// there at runtime, this is only the bootstrap default.
var KNOWN_VENDORS = [
  'Truecaller', 'Airtel', 'Ameyo', 'Veeno', 'Ozonetel', 'Exotel',
  'Nobroker', 'Servetel', 'Perfios', 'Saleschat Pro',
];

// Reference-number patterns seeded from the manual tracker's actual
// numbering schemes. Extend when a new vendor's scheme is discovered.
var PO_NUMBER_PATTERNS = [/\bPO-CSPL-\d{2}-\d{4,6}\b/gi];
var PR_NUMBER_PATTERNS = [/\bPR-CSPL-\d{2}-\d{4,6}\b/gi];
var INVOICE_NUMBER_PATTERNS = [
  /\bVEENO\/\d{4}\/\d{3,5}\b/gi,
  /\bVN\d{4}IN\d{6,9}\b/gi,
  /\bIN\d{9,10}\b/gi,
  /\bBAA\d{6}[A-Z]\d{6,9}\b/gi,
  /\bHR\/[A-Z]{3}\/\d{2}-\d{2}\/\d{3}\b/gi,
];

var INTAKE_STATUSES = [
  'New', 'Needs review', 'Confirmed invoice', 'Missing information',
  'Duplicate', 'Not an invoice', 'Ready for P2P',
];

var P2P_STATUSES = [
  'Not submitted', 'Submitted to P2P', 'Validation issue',
  'Approval pending', 'Approved', 'Processed', 'Rejected', 'Paid',
];

var DETECTION_CATEGORIES = [
  'Likely invoice', 'Possible invoice', 'Invoice follow-up',
  'P2P or approval update', 'Duplicate source item', 'Not an invoice',
  'Needs manual review',
];

var ACTIVITY_TYPES = [
  'Invoice received', 'Invoice identified', 'Invoice matched',
  'Duplicate detected', 'PO created', 'PR created',
  'Approval requested', 'Approval received', 'Validation issue',
  'Follow-up sent', 'P2P submitted', 'P2P rejected',
  'Payment processed', 'Payment completed', 'Other',
];

/**
 * Reads Gmail/Slack scope config from the "Setup" sheet (built by
 * setupTracker()) plus the Slack token from Script Properties. Called at
 * the start of every backfill/sync run — edit the Setup sheet, not this
 * function, to change scope.
 */
function getConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var setup = ss.getSheetByName('Setup');
  var props = PropertiesService.getScriptProperties();

  function readList(label) {
    var cell = findLabelCell_(setup, label);
    if (!cell) return [];
    var raw = setup.getRange(cell.row, cell.col + 1).getValue();
    return String(raw || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function readValue(label) {
    var cell = findLabelCell_(setup, label);
    if (!cell) return '';
    return String(setup.getRange(cell.row, cell.col + 1).getValue() || '').trim();
  }

  return {
    vikramEmail: readValue('Vikram email'),
    gmailGroupsAndAliases: readList('Gmail groups/aliases'),
    vendorDomains: readList('Vendor email domains'),
    lookbackMonths: Number(readValue('Gmail lookback months')) || 12,
    slackApprovedChannels: readList('Slack approved channels'),
    slackIncludeDmsWithVikram: readValue('Slack include DMs with Vikram').toLowerCase() === 'true',
    slackToken: props.getProperty('SLACK_BOT_TOKEN'),
  };
}

/** Scans column A of the Setup sheet for an exact label, returns {row, col} of the label cell (col = A = 1). */
function findLabelCell_(sheet, label) {
  var values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === label) return { row: i + 1, col: 1 };
  }
  return null;
}
