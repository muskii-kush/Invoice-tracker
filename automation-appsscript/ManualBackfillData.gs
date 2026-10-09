/**
 * One-time historical backfill FROM THE EXISTING MANUAL TRACKER — the same
 * transcribed data and parsing logic as the Python prototype's
 * build_workbook.py (already run and verified once; ported here so the
 * Google Sheets version starts from the same known-good state instead of
 * an empty sheet).
 *
 * Run importManualTrackerBackfill() once, after setupTracker().
 */

var BACKFILL_RUN_DATE = '2026-09-27';

var VENDOR_ROWS = [
  { vendor: 'Truecaller', service: 'Number / DID Whitelisting', spoc: 'Rahul',
    businessUnits: 'Central / All BUs', poPrMatrix: 'Bhavya Mittal, Sonal Negi',
    invoiceMatrix: 'Bhavya Mittal Second approver Neha/Harsh',
    pendingOld: 'PO-CSPL-26-15483(June to August)  PO-CSPL-26-15478(Sept to Nov)',
    pendingNew: 'PO-CSPL-26-15483  PO-CSPL-26-15478',
    remarksOld: 'Both the PO is raised approval from Bhavya is done. Already send to Sonali for approval. sonali and team denied to provide approval because the provision is not booked so they will not give the approval they are asking that if Manoj Yadav will provide the approval for the same it will be done.',
    remarksNew: 'Both the PO is raised approval from Bhavya is done. Already send to Sonali for approval. sonali and team denied to provide approval because the provision is not booked so they will not give the approval they are asking that if Manoj Yadav will provide the approval for the same it will be done.',
    subject: 'Re: Payment Reminder-343 CARS24 SERVICES PRIVATE LIMITED' },
  { vendor: 'Airtel', service: 'Number / DID Whitelisting', spoc: 'Abhishek',
    businessUnits: 'Central / All BUs', poPrMatrix: 'Bhavya Mittal, karan Bhavsar',
    invoiceMatrix: 'Bhavya Mittal Second approver Neha/Harsh',
    pendingOld: 'BAA062705B002544 (2,22,084.5) May\nBAA062603B019561 (1,79,221.67) March\nIN total 4,01,306.17',
    pendingNew: 'BAA062705B002544 (2,22,084.5)\nBAA062603B019561 (1,79,221.67)\nIN total 4,01,306.17',
    remarksOld: 'Manvi approval is needed. March and may pending invoices which was raised on july 1st and the amount is not released because we do not have the validation data. Total six invoices was there now these two are pending. Manvi told me to talk to ankur and write a mail from his side to take approval from VC.',
    remarksNew: 'Manvi approval is needed. March and may pending invoices which was raised on july 1st and the amount is not released because we do not have the validation data. Total six invoices was there now these two are pending.',
    subject: 'Re: Details Required for Invoice Validation ; Fwd: Outstanding invoices_ Cars24 Services/ BNAM product (waiting for Ankur revert)' },
  { vendor: 'Ameyo / Veeno', service: 'CC Communication Tool', spoc: 'Manish',
    businessUnits: 'Buyer CC, Seller CC, NBFC Exp, C2C Exp, C2C Listing, PDI - Cartruth, T2D, Buyer PostDelivery, NBFC Sourcing, Dealer Experience',
    poPrMatrix: 'Bhavya Mittal, karan Bhavsar', invoiceMatrix: 'Bhavya Mittal Second approver Neha/Harsh',
    pendingOld: 'PR-CSPL-26-13565\nPO-CSPL-26-15637\nPO-CSPL-26-15021',
    pendingNew: 'PR-CSPL-26-13565',
    remarksOld: 'Approval request send to Bhavya', remarksNew: 'Approval request send to Bhavya',
    subject: '' },
  { vendor: 'Ozonetel', service: 'CC Communication Tool', spoc: 'Indranil',
    businessUnits: 'Buyer CC', poPrMatrix: 'Bhavya Mittal, karan Bhavsar',
    invoiceMatrix: 'Bhavya Mittal Second approver Neha/Harsh',
    pendingOld: 'https://cars24.aerchain.io/invoices/2202785\nhttps://cars24.aerchain.io/invoices/2202790\n'
      + 'https://cars24.aerchain.io/invoices/2202794\nhttps://cars24.aerchain.io/invoices/2202802\n'
      + 'https://cars24.aerchain.io/invoices/2202807\nhttps://cars24.aerchain.io/invoices/2202811\n'
      + 'https://cars24.aerchain.io/invoices/2202819\nhttps://cars24.aerchain.io/invoices/2202827\n'
      + 'https://cars24.aerchain.io/invoices/2202831\nhttps://cars24.aerchain.io/requisitions/264727\n'
      + 'PO-CSPL-26-15910 (SEPT)\nhttps://cars24.aerchain.io/purchase-orders/1485537',
    pendingNew: 'https://cars24.aerchain.io/invoices/2202785\nhttps://cars24.aerchain.io/invoices/2202790\n'
      + 'https://cars24.aerchain.io/invoices/2202794\nhttps://cars24.aerchain.io/invoices/2202802\n'
      + 'https://cars24.aerchain.io/invoices/2202807\nhttps://cars24.aerchain.io/invoices/2202811\n'
      + 'https://cars24.aerchain.io/invoices/2202819\nhttps://cars24.aerchain.io/invoices/2202827\n'
      + 'https://cars24.aerchain.io/invoices/2202831\nhttps://cars24.aerchain.io/requisitions/264727',
    remarksOld: 'All the invoices are raised. Talked to Neha she will process the payment accordingly by tomorrow.',
    remarksNew: 'All the invoices are raised. Talked to Neha she is saying it will be done within the TAT time T+3 DAYS. Issue with GST number and the approval needed from arjun for which the mail is sent.',
    subject: 'Re: 51321 CARS24 SERVICES PRIVATE LIMITED. Payment details (Need to check this) ; Re: Details required for invoices validation' },
  { vendor: 'Exotel', service: 'BOT Voice Streaming Service', spoc: 'Manish',
    businessUnits: 'GenAI Team', poPrMatrix: 'Yugesh Kumar (Direct GS) , Sonal Negi', invoiceMatrix: '',
    pendingOld: 'PO-CSPL-26-16010 (14,12,112.62) Aug 26', pendingNew: '',
    remarksOld: 'PO raised and approved', remarksNew: 'Mail has been sent to manish to provide the pendency',
    subject: '' },
  { vendor: 'Nobroker', service: 'AI-Based Call Auditing', spoc: 'Ruchir',
    businessUnits: 'NBFC, Buyer CC, Seller CC', poPrMatrix: 'Bhavya Mittal, karan Bhavsar',
    invoiceMatrix: 'Bhavya Mittal Second approver Neha/Harsh',
    pendingOld: 'IN2926080385\nIN2926080383\nIN2926080386 These invoices to be raised again.',
    pendingNew: 'IN2926080385\nIN2926080383\nIN2926080385 These invoices to be raised again.',
    remarksOld: 'Rahul sir told to amend the PO because there is no solution for the amount mismatch situation.',
    remarksNew: 'Rahul sir told to amend the PO because there is no solution for the amount mismatch situation.',
    subject: 'Re: Supporting Documents and Amount Correction Required' },
  { vendor: 'Servetel', service: 'Virtual Number Procurement', spoc: 'Sumit',
    businessUnits: 'Buyer CC, Seller CC, Aadhaar', poPrMatrix: 'Bhavya Mittal, karan Bhavsar',
    invoiceMatrix: 'Bhavya Mittal Second approver Neha/Harsh',
    pendingOld: 'HR/SEP/26-27/017 HR/SEP/26-27/006 HR/SEP/26-27/007 HR/SEP/26-27/008 HR/SEP/26-27/009 HR/SEP/26-27/010 HR/SEP/26-27/011 HR/SEP/26-27/012 HR/SEP/26-27/013 HR/SEP/26-27/014 HR/SEP/26-27/015 HR/SEP/26-27/016',
    pendingNew: 'HR/SEP/26-27/017 HR/SEP/26-27/006 HR/SEP/26-27/007 HR/SEP/26-27/008 HR/SEP/26-27/009 HR/SEP/26-27/010 HR/SEP/26-27/011 HR/SEP/26-27/012 HR/SEP/26-27/013 HR/SEP/26-27/014 HR/SEP/26-27/015 HR/SEP/26-27/016',
    remarksOld: 'All Done', remarksNew: 'All the invoices has been raised. Approval pending from Bhavya.',
    subject: 'Re: Servetel Communication Invoices Sep 2026' },
  { vendor: 'Perfios', service: 'API', spoc: 'Nikhil kochhar', businessUnits: 'Dealer',
    poPrMatrix: 'Abhishek Bhardwaj', invoiceMatrix: 'Bhavya Mittal Second approver Neha/Harsh',
    pendingOld: 'PO-CSPL-26-15635 Invoice raised', pendingNew: 'PO-CSPL-26-15635 Invoice raised',
    remarksOld: 'Talked to Nikhil he will provide the revised invoices than we will proceed further.',
    remarksNew: 'Talked to Nikhil he will provide the revised invoices than we will proceed further.',
    subject: "Re: Cars24 (all 3 Entities) Pending Invoices till Aug'26" },
  { vendor: 'Saleschat Pro', service: '', spoc: 'Hardik', businessUnits: '',
    poPrMatrix: 'Bhavya Mittal,Om kapoor', invoiceMatrix: '',
    pendingOld: 'PO-CSPL-26-15671', pendingNew: 'PO-CSPL-26-15671',
    remarksOld: 'sent the email to kapil for payment advice', remarksNew: 'PO request raised.',
    subject: 'Ledger from Saleschat.pro' },
];

var UNVENDORED_REVIEW_ITEM = {
  remarks: 'The email has been dropped to shubham about TRC AND form completion',
  subject: 'Re: Required document for Onboarding || Supermrtal ||',
};

// [businessUnit, invoiceDate, invoiceNumber, amount, dueDate, description, poc]
var AMEYO_LEDGER = [
  ['ECC/AMEYO', '2026-01-29', 'VEENO/2526/1290', 181720, 'Overdue', 'Customization charges for 11 mandays against ticket no. DCA20251010692109', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-01-29', 'VEENO/2526/1291', 66080, 'Overdue', 'Customization Charges for 4 man-days against ticket no DCA20251029698543', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-01-29', 'VEENO/2526/1289', 8260, 'Overdue', 'Customization charges for 0.5 mandays against ticket no. DCA20251209716855', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-01-29', 'VEENO/2526/1288', 33040, 'Overdue', 'Customisation charges for 2 mandays against ticket no.- DCA20251218721231', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-02-19', 'VEENO/2526/1477', 8260, 'Overdue', 'Customisation charges for 0.5 mandays against ticket no.-DCA20260131739673', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-02-25', 'VEENO/2526/1516', 49560, 'Overdue', 'Customization Charges for 3 man-days against ticket no DCA20260121735239', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-02-25', 'VEENO/2526/1517', 8260, 'Overdue', 'Customisation charges for 0.5 manday against ticket no.-DCA20260206742285', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-07-25', 'VEENO/2627/0945', 1340579, 'Overdue', 'Ameyo Rental for the month of June 2026', 'Ankur Sanduria'],
  ['ECC/AMEYO', '2026-08-25', 'VN2627IN00000387', 810071, '2026-09-24', 'Ameyo Rental for the month of July 2026', 'Ankur Sanduria'],
  ['Cars241m', '2026-04-21', 'VEENO/2627/0156', 132748, 'Overdue', 'Charges for PF Voice for period from 1st March to 31st March 2026-Cars241m', 'Arundhati'],
  ['Cars241m', '2026-05-26', 'VEENO/2627/0447', 131769, 'Overdue', 'Charges for PF Voice for period from 1st Apr to 30th Apr 2026-Cars241m', 'Arundhati'],
  ['Cars241m', '2026-06-24', 'VEENO/2627/0771', 125103, 'Overdue', 'Charges for PF Voice for period from 1st May to 31th May 2026-Cars241m', 'Arundhati'],
  ['Cars241m', '2026-07-25', 'VEENO/2627/0943', 121545, 'Overdue', 'Charges for PF Voice for period from 1st June to 30th June 2026-Cars241m', 'Arundhati'],
  ['Cars241m', '2026-08-24', 'VN2627IN00000372', 114106, '2026-09-23', 'Charges for PF Voice for period from 1st July to 31st July 2026-Cars241m', 'Arundhati'],
  ['Cars243m', '2026-07-25', 'VEENO/2627/0942', 9268, 'Overdue', 'Charges for PF Voice for period from 1st Jun to 31st Jun 2026-Cars243m', 'Priya Rawat'],
  ['Cars243m', '2026-08-19', 'VN2627IN00000162', 2956, 'Overdue', 'Charges for PF Voice for period from 1st July to 31st July 2026-Cars243m', 'Priya Rawat'],
  ['Cars24service1m', '2026-07-25', 'VEENO/2627/0944', 606029, 'Overdue', 'Charges for PF Voice for period from 1st June to 30th June 2026-Cars24service1m', 'Ankur Sanduria'],
  ['Cars24service1m', '2026-08-24', 'VN2627IN00000373', 667467, '2026-09-23', 'Charges for PF Voice for period from 1st July to 31st July 2026-Cars24service1m', 'Ankur Sanduria'],
  ['Cars246m', '2026-07-24', 'VEENO/2627/0941', 488116, 'Overdue', 'Charges for PF Voice for period from 1st June to 30th June 2026-Cars246m', 'Arvind Mehra'],
];

function importManualTrackerBackfill() {
  populateVendorReference_();
  populateAmeyoLedger_();
  populateFromVendorSummaries_();
  populateUnvendoredReviewItem_();
  var msg = 'Manual-tracker backfill imported. Check the Review Queue tab for items needing verification.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* no UI when run from the script editor directly, or from a trigger */ }
}

function populateVendorReference_() {
  VENDOR_ROWS.forEach(function (v) {
    var notes = [];
    if (['Truecaller', 'Ameyo / Veeno', 'Perfios'].indexOf(v.vendor) !== -1) {
      notes.push('PO/PR numbering: PO-CSPL-26-##### / PR-CSPL-26-#####');
    }
    if (v.vendor === 'Ameyo / Veeno') notes.push('Invoice numbering: VEENO/YYYY/#### or VN####IN#########');
    if (v.vendor === 'Servetel') notes.push('Invoice numbering: HR/SEP/26-27/###');
    if (v.vendor === 'Ozonetel') notes.push('Tracked via Aerchain links (cars24.aerchain.io)');

    appendRow_('Vendor Reference', {
      'Vendor': v.vendor, 'Service': v.service, 'Vendor SPOC': v.spoc,
      'Business Units': v.businessUnits, 'PR / Direct PO Approval Matrix': v.poPrMatrix,
      'Invoice Approval Matrix': v.invoiceMatrix, 'Matching Notes': notes.join('; '),
      'Active / Inactive': 'Active',
    });
  });
}

function makeActivity_(invoiceId, activityDate, details, activityType, sourceLink) {
  appendRow_('Activity Log', {
    'Invoice ID': invoiceId, 'Activity Date': activityDate, 'Source': 'Manual tracker backfill',
    'Actor': 'backfill script', 'Activity Type': activityType || 'Other', 'Details': details,
    'Source Link': sourceLink || '',
  });
}

function populateAmeyoLedger_() {
  AMEYO_LEDGER.forEach(function (row) {
    var bu = row[0], invDate = row[1], invNo = row[2], amount = row[3], dueDate = row[4], desc = row[5], poc = row[6];
    var invoiceId = appendRow_('Invoice Register', {
      'Vendor': 'Ameyo / Veeno', 'Service': 'CC Communication Tool / PF Voice',
      'Business Unit': bu, 'Invoice Number': invNo, 'Invoice Date': invDate,
      'Invoice Amount': amount, 'Currency': 'INR', 'Due Date': dueDate, 'Description': desc,
      'Vendor SPOC': 'Manish', 'Internal POC': poc, 'Current Owner': poc,
      'Source Type': 'Manual tracker (historical)', 'Detection Confidence': 'High',
      'Intake Status': 'Confirmed invoice', 'P2P Status': 'Not submitted',
      'Current Issue': dueDate === 'Overdue' ? 'Marked Overdue in manual ledger — payment status unconfirmed' : '',
      'Created Date': BACKFILL_RUN_DATE, 'Last Updated Date': BACKFILL_RUN_DATE,
      'Remarks': 'Backfilled from manual tracker Sheet3 (structured Ameyo/Veeno ledger).',
    });
    makeActivity_(invoiceId, BACKFILL_RUN_DATE,
      'Invoice ' + invNo + ' (' + bu + ') imported from manual tracker Sheet3 ledger. Amount ' + amount + ', due ' + dueDate + '.',
      'Invoice identified');
  });
}

/** Best-effort split of one vendor's free-text 'pending' cell into PO/PR/invoice/link tokens. */
function parseLineTokens_(vendor, text) {
  var tokens = [];
  (text || '').split('\n').forEach(function (rawLine) {
    var line = rawLine.trim();
    if (!line || line.toLowerCase().indexOf('in total') === 0) return;
    var sig = extractAll_(line, null, [vendor]);
    var periodMatch = (line.indexOf('(') !== -1 && line.indexOf(')') !== -1)
      ? line.slice(line.indexOf('(') + 1, line.indexOf(')')) : null;

    if (sig.invoiceNumbers.length) {
      var amounts = sig.amounts;
      sig.invoiceNumbers.forEach(function (num, i) {
        var amt = amounts.length === sig.invoiceNumbers.length ? amounts[i]
          : (sig.invoiceNumbers.length === 1 && amounts.length ? amounts[0] : null);
        tokens.push({ type: 'invoice', number: num, amount: amt, period: amt ? null : periodMatch, raw: line });
      });
    } else if (sig.p2pLinks.length) {
      sig.p2pLinks.forEach(function (url) {
        var kind = url.indexOf('/invoices/') !== -1 ? 'invoice'
          : url.indexOf('/requisitions/') !== -1 ? 'requisition'
          : url.indexOf('/purchase-orders/') !== -1 ? 'purchase-order' : 'other';
        tokens.push({ type: 'link', url: url, linkKind: kind, raw: line });
      });
    } else if (sig.poNumbers.length) {
      sig.poNumbers.forEach(function (num) { tokens.push({ type: 'po', number: num, period: periodMatch, raw: line }); });
    } else if (sig.prNumbers.length) {
      sig.prNumbers.forEach(function (num) { tokens.push({ type: 'pr', number: num, raw: line }); });
    } else if (line) {
      tokens.push({ type: 'freetext', raw: line });
    }
  });
  return tokens;
}

function tokenKey_(tok) { return tok.number || tok.url || tok.raw; }

function findDroppedReferences_(vendor, oldText, newText) {
  if (!oldText.trim() || oldText.trim() === newText.trim()) return [];
  var oldTokens = parseLineTokens_(vendor, oldText);
  var newKeys = {};
  parseLineTokens_(vendor, newText).forEach(function (t) { newKeys[tokenKey_(t)] = true; });
  return oldTokens.filter(function (t) { return t.type !== 'freetext' && !newKeys[tokenKey_(t)]; });
}

function populateFromVendorSummaries_() {
  VENDOR_ROWS.forEach(function (v) {
    var usedFallback = false;
    var pendingText = v.pendingNew;
    if (!pendingText.trim() && v.pendingOld.trim()) { pendingText = v.pendingOld; usedFallback = true; }

    var tokens = parseLineTokens_(v.vendor, pendingText);
    var combinedText = pendingText + '\n' + v.remarksNew + '\n' + v.subject;
    var cls = classify_(combinedText, extractAll_(combinedText, null, [v.vendor]));

    var sourceId = appendRow_('Source Inbox', {
      'Source': 'Gmail', 'Source Type': 'Manual tracker backfill (email subject only)',
      'Subject or Message Preview': v.subject || '(no subject captured in manual tracker)',
      'Detected Vendor': v.vendor,
      'Detected Invoice Number': tokens.filter(function (t) { return t.type === 'invoice'; }).map(function (t) { return t.number; }).join(', '),
      'Detected PO / PR Number': tokens.filter(function (t) { return t.type === 'po' || t.type === 'pr'; }).map(function (t) { return t.number; }).join(', '),
      'Detection Status': cls.category,
      'Review Notes': 'Backfilled from manual tracker — original Gmail message link unavailable; '
        + 'will be captured automatically once live Gmail sync is connected (see README).',
    });

    if (!usedFallback) {
      findDroppedReferences_(v.vendor, v.pendingOld, v.pendingNew).forEach(function (dropped) {
        appendRow_('Review Queue', {
          'Linked Source Record ID': sourceId,
          'Reason For Review': '"' + dropped.raw + '" appears in the manual tracker\'s earlier snapshot for '
            + v.vendor + ' but not in the latest one — confirm whether it was resolved/cancelled or just dropped.',
          'Detected Signals': dropped.raw, 'Suggested Vendor': v.vendor,
          'Suggested Invoice Number': dropped.type === 'invoice' ? dropped.number : '',
          'Status': 'Open',
        });
      });
    }

    if (!tokens.length) {
      appendRow_('Review Queue', {
        'Linked Source Record ID': sourceId,
        'Reason For Review': 'No PO/PR/invoice number pattern recognized for ' + v.vendor + ' — verify manually.',
        'Detected Signals': pendingText || '(empty)', 'Suggested Vendor': v.vendor, 'Status': 'Open',
      });
      return;
    }

    var fallbackNote = usedFallback
      ? ' (carried forward from the manual tracker\'s earlier snapshot — the latest snapshot did not repeat this reference, but nothing indicates it was resolved or cancelled)'
      : '';

    var createdIds = [];
    tokens.forEach(function (tok) {
      if (tok.type === 'freetext') {
        appendRow_('Review Queue', {
          'Linked Source Record ID': sourceId,
          'Reason For Review': 'Unrecognized reference format for ' + v.vendor + ': "' + tok.raw + '"',
          'Detected Signals': tok.raw, 'Suggested Vendor': v.vendor, 'Status': 'Open',
        });
        return;
      }

      var tokenSignals = {
        invoiceNumbers: tok.type === 'invoice' ? [tok.number] : [],
        vendor: v.vendor, amounts: tok.amount ? [tok.amount] : [],
        dates: [], poNumbers: tok.type === 'po' ? [tok.number] : [],
        prNumbers: tok.type === 'pr' ? [tok.number] : [],
        p2pLinks: tok.type === 'link' ? [tok.url] : [],
      };
      var m = matchInvoice_(tokenSignals, allInvoices_());
      if (m.invoiceId) {
        appendRow_('Activity Log', {
          'Invoice ID': m.invoiceId, 'Activity Date': BACKFILL_RUN_DATE, 'Source': 'Manual tracker backfill',
          'Actor': 'backfill script', 'Activity Type': 'Duplicate detected',
          'Details': '"' + tok.raw + '" (' + v.vendor + ') matched existing ' + m.invoiceId + ' via ' + m.rule + ' — not re-created as a new row.',
          'Outcome': 'Linked, no new invoice row created',
        });
        createdIds.push(m.invoiceId);
        return;
      }

      var isInvoice = tok.type === 'invoice' || (tok.type === 'link' && tok.linkKind === 'invoice');
      var intakeStatus = (isInvoice && tok.amount) ? 'Confirmed invoice' : 'Missing information';
      var p2pStatus = 'Not submitted', linkNote = '';
      if (tok.type === 'link') {
        p2pStatus = { invoice: 'Submitted to P2P', requisition: 'Approval pending', 'purchase-order': 'Approval pending' }[tok.linkKind] || 'Not submitted';
        linkNote = { invoice: 'Aerchain invoice link.',
          requisition: 'Aerchain requisition link — precedes invoice, kept for traceability.',
          'purchase-order': 'Aerchain purchase-order link — precedes invoice, kept for traceability.' }[tok.linkKind] || '';
      }

      var invoiceId = appendRow_('Invoice Register', {
        'Vendor': v.vendor, 'Service': v.service, 'Business Unit': v.businessUnits,
        'Invoice Number': tok.type === 'invoice' ? tok.number : '',
        'Invoice Amount': tok.amount || '', 'Currency': tok.amount ? 'INR' : '',
        'Billing Period': tok.period || '', 'Description': v.service,
        'PO Number': tok.type === 'po' ? tok.number : '', 'PR Number': tok.type === 'pr' ? tok.number : '',
        'P2P / Aerchain Link': tok.type === 'link' ? tok.url : '',
        'Vendor SPOC': v.spoc, 'Source Type': 'Manual tracker (historical)', 'Source Message ID': sourceId,
        'Detection Confidence': 'Low', 'Intake Status': intakeStatus, 'P2P Status': p2pStatus,
        'Current Issue': 'Parsed from free text during backfill — verify number/amount/status manually.',
        'Created Date': BACKFILL_RUN_DATE, 'Last Updated Date': BACKFILL_RUN_DATE,
        'Remarks': 'Backfilled from manual tracker vendor-summary sheet. Raw text: "' + tok.raw + '".' + fallbackNote + ' ' + linkNote,
      });
      createdIds.push(invoiceId);
      updateCell_('Source Inbox', sourceId, 'Matched Invoice ID', createdIds.join(', '));
      makeActivity_(invoiceId, BACKFILL_RUN_DATE,
        'Reference "' + tok.raw + '" identified from manual tracker for ' + v.vendor + '.' + fallbackNote,
        'Invoice identified');
    });

    // Dedupe before logging remark snapshots — a token that matched an
    // existing invoice shouldn't have that invoice's remark logged twice.
    var uniqueIds = createdIds.filter(function (id, i) { return createdIds.indexOf(id) === i; });
    uniqueIds.forEach(function (invId) {
      if (v.remarksOld) makeActivity_(invId, 'Unknown (pre-automation)', '[Manual tracker remark, snapshot A] ' + v.remarksOld);
      if (v.remarksNew && v.remarksNew !== v.remarksOld) {
        makeActivity_(invId, 'Unknown (pre-automation)', '[Manual tracker remark, snapshot B] ' + v.remarksNew);
      }
    });

    if (v.vendor === 'Nobroker') {
      appendRow_('Review Queue', {
        'Linked Source Record ID': sourceId,
        'Reason For Review': 'IN2926080385 appears twice in the manual tracker\'s latest snapshot (likely a typo '
          + '— the older snapshot lists a third distinct number, IN2926080386). Confirm the correct third invoice '
          + 'number with Nobroker.',
        'Detected Signals': 'IN2926080385, IN2926080383, IN2926080385 (new) vs IN2926080385, IN2926080383, IN2926080386 (old)',
        'Suggested Vendor': 'Nobroker', 'Status': 'Open',
      });
    }
  });
}

function populateUnvendoredReviewItem_() {
  var sourceId = appendRow_('Source Inbox', {
    'Source': 'Gmail', 'Source Type': 'Manual tracker backfill (email subject only)',
    'Subject or Message Preview': UNVENDORED_REVIEW_ITEM.subject,
    'Detection Status': 'Needs manual review',
    'Review Notes': 'No vendor name captured in manual tracker for this row — appears to be a vendor-onboarding/documentation thread, not an invoice.',
  });
  appendRow_('Review Queue', {
    'Linked Source Record ID': sourceId,
    'Reason For Review': 'Row has no vendor name in the manual tracker — likely an onboarding/TRC document request, '
      + 'not an invoice. Confirm and either assign a vendor or mark \'Not an invoice\'.',
    'Detected Signals': UNVENDORED_REVIEW_ITEM.remarks, 'Status': 'Open',
  });
}
