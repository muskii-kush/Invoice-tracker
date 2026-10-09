/**
 * Shared per-message pipeline used by both runBackfill() and runSync():
 * extract signals → classify → match against existing invoices → write
 * Source Inbox / Invoice Register / Activity Log / Review Queue rows.
 * Never sends, deletes, modifies, or forwards the original message.
 */

function processSourceItem_(opts) {
  var signals = extractAll_(opts.bodyText, opts.attachmentNames, opts.knownVendors);
  var cls = classify_(opts.bodyText, signals, opts.isThreadReply);

  var sourceRecord = {
    'Source': opts.source, 'Source Type': opts.sourceType, 'Received Date': opts.receivedDate,
    'Sender': opts.sender, 'Recipients or Channel': opts.recipientsOrChannel,
    'Subject or Message Preview': opts.subjectOrPreview,
    'Attachment Names': (opts.attachmentNames || []).join(', '),
    'Shared Links': signals.p2pLinks.join(', '), 'Detected Vendor': signals.vendor || '',
    'Detected Invoice Number': signals.invoiceNumbers.join(', '),
    'Detected Amount': signals.amounts.length ? signals.amounts[0] : '',
    'Detected PO / PR Number': signals.poNumbers.concat(signals.prNumbers).join(', '),
    'Detection Status': cls.category, 'Review Notes': cls.reasons.join('; '),
    'Original Message Link': opts.originalLink || '',
  };
  var sourceId = appendRow_('Source Inbox', sourceRecord);

  var result = { category: cls.category, vendor: signals.vendor, sourceId: sourceId };

  var m = matchInvoice_(signals, allInvoices_());
  if (m.invoiceId) {
    appendRow_('Activity Log', {
      'Invoice ID': m.invoiceId, 'Activity Date': opts.receivedDate, 'Source': opts.source,
      'Actor': 'automation', 'Activity Type': 'Duplicate detected',
      'Details': sourceId + ' matched existing ' + m.invoiceId + ' via ' + m.rule,
      'Outcome': 'Linked, no new invoice row created', 'Source Link': opts.originalLink || '',
    });
    updateCell_('Source Inbox', sourceId, 'Matched Invoice ID', m.invoiceId);
    result.matchedInvoiceId = m.invoiceId;
    return result;
  }

  if (cls.category === 'Likely invoice' || cls.category === 'Possible invoice') {
    var invoiceId = appendRow_('Invoice Register', {
      'Vendor': signals.vendor || '', 'Invoice Number': signals.invoiceNumbers.join(', '),
      'Invoice Amount': signals.amounts.length ? signals.amounts[0] : '', 'Currency': signals.currency || '',
      'Due Date': signals.dates.length ? signals.dates[0] : '', 'Description': opts.subjectOrPreview,
      'PO Number': signals.poNumbers.join(', '), 'PR Number': signals.prNumbers.join(', '),
      'P2P / Aerchain Link': signals.p2pLinks.join(', '), 'Source Type': opts.source,
      'Source Message ID': sourceId, 'Source Message Link': opts.originalLink || '',
      'Source Received Date': opts.receivedDate, 'Attachment Name': (opts.attachmentNames || []).join(', '),
      'Detection Confidence': cls.confidence,
      'Intake Status': cls.category === 'Likely invoice' ? 'New' : 'Needs review',
      'P2P Status': 'Not submitted', 'Remarks': cls.reasons.join('; '),
    });
    updateCell_('Source Inbox', sourceId, 'Matched Invoice ID', invoiceId);
    appendRow_('Activity Log', {
      'Invoice ID': invoiceId, 'Activity Date': opts.receivedDate, 'Source': opts.source,
      'Actor': 'automation', 'Activity Type': 'Invoice identified',
      'Details': 'Created from ' + sourceId + ' (' + cls.category + ', confidence ' + cls.confidence + ')',
      'Outcome': 'New invoice record created', 'Source Link': opts.originalLink || '',
    });
    result.newInvoiceId = invoiceId;
    return result;
  }

  if (cls.category === 'Needs manual review') {
    appendRow_('Review Queue', {
      'Linked Source Record ID': sourceId, 'Reason For Review': cls.reasons.join('; ') || 'Ambiguous signals',
      'Detected Signals': JSON.stringify(signals), 'Suggested Vendor': signals.vendor || '',
      'Suggested Invoice Number': signals.invoiceNumbers.join(', '),
      'Suggested Amount': signals.amounts.length ? signals.amounts[0] : '',
      'Status': 'Open', 'Original Message Link': opts.originalLink || '',
    });
  }

  return result;
}
