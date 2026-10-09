"""
Turns the signal dict from extractor.extract_all() into one of the
detection categories from the master prompt:

  Likely invoice | Possible invoice | Invoice follow-up |
  P2P or approval update | Duplicate source item | Not an invoice |
  Needs manual review

Nothing here ever returns "discard" — the worst outcome is
"Needs manual review", per the master prompt's "do not discard
uncertain records" rule.
"""
from . import constants


def _has_keyword(text, keywords):
    lowered = (text or "").lower()
    return any(kw in lowered for kw in keywords)


def classify(text, signals, is_thread_reply=False):
    """
    signals: the dict returned by extractor.extract_all(text, ...)
    Returns (category, confidence, reasons) where confidence is
    "High" / "Medium" / "Low" and reasons is a list of short strings
    explaining the call (surfaced in Source Inbox > Review Notes).
    """
    reasons = []
    has_vendor = bool(signals.get("vendor"))
    has_invoice_no = bool(signals.get("invoice_numbers"))
    has_po_or_pr = bool(signals.get("po_numbers") or signals.get("pr_numbers"))
    has_p2p_link = bool(signals.get("p2p_links"))
    has_amount = bool(signals.get("amounts"))
    has_attachment = bool(signals.get("attachment_signal"))
    has_invoice_kw = _has_keyword(text, constants.INVOICE_KEYWORDS)
    has_approval_kw = _has_keyword(text, constants.APPROVAL_KEYWORDS)

    if has_vendor:
        reasons.append(f"vendor match: {signals['vendor']}")
    if has_invoice_no:
        reasons.append(f"invoice number(s): {signals['invoice_numbers']}")
    if has_po_or_pr:
        reasons.append("PO/PR reference found")
    if has_p2p_link:
        reasons.append("Aerchain/P2P link found")
    if has_amount:
        reasons.append("monetary amount found")
    if has_attachment:
        reasons.append(f"attachment signal: {signals['attachment_signal']}")

    strong_identity = has_invoice_no or has_attachment
    supporting_evidence_count = sum([has_amount, has_po_or_pr, has_p2p_link, has_invoice_kw])

    # Likely invoice: recognizable vendor + (invoice number OR attachment)
    # + at least one of (amount, PO/PR/P2P reference, payment-request wording)
    if has_vendor and strong_identity and supporting_evidence_count >= 1:
        return "Likely invoice", "High", reasons

    # Possible invoice: vendor + keyword + at least one weaker signal,
    # but missing a hard identifier (no invoice number, no attachment)
    if has_vendor and has_invoice_kw and (has_amount or has_po_or_pr or has_p2p_link):
        reasons.append("missing a hard identifier (invoice number/attachment) — confirm manually")
        return "Possible invoice", "Medium", reasons

    # P2P / approval update: approval or PO/PR language without new invoice evidence
    if (has_approval_kw or has_po_or_pr or has_p2p_link) and not strong_identity:
        reasons.append("reads as an approval/PO/PR status update, not a new invoice")
        return "P2P or approval update", "Medium", reasons

    # Follow-up: a thread reply that references a vendor/invoice already seen,
    # without introducing new hard identifiers
    if is_thread_reply and (has_vendor or has_invoice_kw):
        reasons.append("thread reply referencing an existing invoice/vendor")
        return "Invoice follow-up", "Medium", reasons

    # Not an invoice: none of the signals fired at all
    if not any([has_vendor, has_invoice_kw, has_approval_kw, has_amount, has_attachment, has_po_or_pr, has_p2p_link]):
        return "Not an invoice", "High", ["no invoice/vendor/PO/PR/amount/attachment signal found"]

    # Anything left over is genuinely ambiguous — send to review, don't guess.
    reasons.append("signals present but insufficient to classify confidently")
    return "Needs manual review", "Low", reasons
