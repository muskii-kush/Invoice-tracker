/**
 * Matches a newly-extracted source item against existing Invoice Register
 * rows, priority-ordered per the master prompt (ported from matcher.py).
 * Returns {invoiceId, rule} or {invoiceId: null, rule: null}.
 */

function norm_(s) { return String(s || '').trim().toLowerCase(); }

/**
 * signals: object from extractAll_() plus 'vendor'
 * existingInvoices: array of {invoiceId, vendor, invoiceNumber, amount,
 *   invoiceDate, billingPeriod, poNumber, prNumber, p2pLink, description}
 */
function matchInvoice_(signals, existingInvoices) {
  var newInvNos = (signals.invoiceNumbers || []).map(norm_);
  var newVendor = norm_(signals.vendor);
  var newAmounts = signals.amounts || [];
  var newDates = signals.dates || [];
  var newPos = (signals.poNumbers || []).map(norm_);
  var newPrs = (signals.prNumbers || []).map(norm_);
  var newLinks = (signals.p2pLinks || []).map(norm_);

  function find(pred) {
    for (var i = 0; i < existingInvoices.length; i++) {
      if (pred(existingInvoices[i])) return existingInvoices[i];
    }
    return null;
  }

  // 1. Exact invoice number
  if (newInvNos.length) {
    var hit = find(function (inv) { return newInvNos.indexOf(norm_(inv.invoiceNumber)) !== -1; });
    if (hit) return { invoiceId: hit.invoiceId, rule: 'exact invoice number' };
  }

  // 2. Exact invoice number + vendor
  if (newInvNos.length && newVendor) {
    var hit2 = find(function (inv) {
      return newInvNos.indexOf(norm_(inv.invoiceNumber)) !== -1 && norm_(inv.vendor) === newVendor;
    });
    if (hit2) return { invoiceId: hit2.invoiceId, rule: 'invoice number + vendor' };
  }

  // 3. Vendor + amount + invoice date
  if (newVendor && newAmounts.length && newDates.length) {
    var hit3 = find(function (inv) {
      return norm_(inv.vendor) === newVendor
        && newAmounts.indexOf(inv.amount) !== -1
        && newDates.indexOf(inv.invoiceDate) !== -1;
    });
    if (hit3) return { invoiceId: hit3.invoiceId, rule: 'vendor + amount + date' };
  }

  // 4. Vendor + billing period
  var newPeriod = norm_(signals.billingPeriod);
  if (newVendor && newPeriod) {
    var hit4 = find(function (inv) {
      return norm_(inv.vendor) === newVendor && norm_(inv.billingPeriod) === newPeriod;
    });
    if (hit4) return { invoiceId: hit4.invoiceId, rule: 'vendor + billing period' };
  }

  // 5. P2P/Aerchain/PO/PR reference
  if (newLinks.length || newPos.length || newPrs.length) {
    var hit5 = find(function (inv) {
      return (newLinks.length && newLinks.indexOf(norm_(inv.p2pLink)) !== -1)
        || (newPos.length && newPos.indexOf(norm_(inv.poNumber)) !== -1)
        || (newPrs.length && newPrs.indexOf(norm_(inv.prNumber)) !== -1);
    });
    if (hit5) return { invoiceId: hit5.invoiceId, rule: 'PO/PR/P2P reference' };
  }

  // 6. Attachment content / file hash (only populated where callers hash attachments)
  if (signals.attachmentHash) {
    var hit6 = find(function (inv) { return inv.attachmentHash === signals.attachmentHash; });
    if (hit6) return { invoiceId: hit6.invoiceId, rule: 'attachment hash' };
  }

  // 7. Weak: vendor + amount only — flagged, not auto-merged with confidence
  if (newVendor && newAmounts.length) {
    var hit7 = find(function (inv) {
      return norm_(inv.vendor) === newVendor && newAmounts.indexOf(inv.amount) !== -1;
    });
    if (hit7) return { invoiceId: hit7.invoiceId, rule: 'WEAK: vendor + amount only (verify manually)' };
  }

  return { invoiceId: null, rule: null };
}
