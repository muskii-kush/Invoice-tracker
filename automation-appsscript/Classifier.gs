/**
 * Turns the signal object from extractAll_() into one of the detection
 * categories from the master prompt. Never returns "discard" — worst case
 * is "Needs manual review" (ported from classifier.py).
 */

function hasKeyword_(text, keywords) {
  var lowered = (text || '').toLowerCase();
  return keywords.some(function (kw) { return lowered.indexOf(kw) !== -1; });
}

/** Returns {category, confidence, reasons: string[]}. */
function classify_(text, signals, isThreadReply) {
  var reasons = [];
  var hasVendor = !!signals.vendor;
  var hasInvoiceNo = signals.invoiceNumbers.length > 0;
  var hasPoOrPr = signals.poNumbers.length > 0 || signals.prNumbers.length > 0;
  var hasP2pLink = signals.p2pLinks.length > 0;
  var hasAmount = signals.amounts.length > 0;
  var hasAttachment = !!signals.attachmentSignal;
  var hasInvoiceKw = hasKeyword_(text, INVOICE_KEYWORDS);
  var hasApprovalKw = hasKeyword_(text, APPROVAL_KEYWORDS);

  if (hasVendor) reasons.push('vendor match: ' + signals.vendor);
  if (hasInvoiceNo) reasons.push('invoice number(s): ' + signals.invoiceNumbers.join(', '));
  if (hasPoOrPr) reasons.push('PO/PR reference found');
  if (hasP2pLink) reasons.push('Aerchain/P2P link found');
  if (hasAmount) reasons.push('monetary amount found');
  if (hasAttachment) reasons.push('attachment signal: ' + signals.attachmentSignal);

  var strongIdentity = hasInvoiceNo || hasAttachment;
  var supportingCount = [hasAmount, hasPoOrPr, hasP2pLink, hasInvoiceKw].filter(Boolean).length;

  if (hasVendor && strongIdentity && supportingCount >= 1) {
    return { category: 'Likely invoice', confidence: 'High', reasons: reasons };
  }

  if (hasVendor && hasInvoiceKw && (hasAmount || hasPoOrPr || hasP2pLink)) {
    reasons.push('missing a hard identifier (invoice number/attachment) — confirm manually');
    return { category: 'Possible invoice', confidence: 'Medium', reasons: reasons };
  }

  if ((hasApprovalKw || hasPoOrPr || hasP2pLink) && !strongIdentity) {
    reasons.push('reads as an approval/PO/PR status update, not a new invoice');
    return { category: 'P2P or approval update', confidence: 'Medium', reasons: reasons };
  }

  if (isThreadReply && (hasVendor || hasInvoiceKw)) {
    reasons.push('thread reply referencing an existing invoice/vendor');
    return { category: 'Invoice follow-up', confidence: 'Medium', reasons: reasons };
  }

  if (![hasVendor, hasInvoiceKw, hasApprovalKw, hasAmount, hasAttachment, hasPoOrPr, hasP2pLink].some(Boolean)) {
    return {
      category: 'Not an invoice', confidence: 'High',
      reasons: ['no invoice/vendor/PO/PR/amount/attachment signal found'],
    };
  }

  reasons.push('signals present but insufficient to classify confidently');
  return { category: 'Needs manual review', confidence: 'Low', reasons: reasons };
}
