"""
Matches a newly-extracted source record against existing Invoice Register
rows, using the priority order from the master prompt:

  1. Exact invoice number
  2. Exact invoice number + vendor
  3. Vendor + amount + invoice date
  4. Vendor + billing period
  5. P2P / Aerchain / PO / PR reference
  6. Attachment content or file hash
  7. Similar vendor, amount, and description

If nothing matches confidently, match() returns None and the caller should
create a new invoice record (or send to review, if the source item itself
was ambiguous).
"""


def _norm(s):
    return (s or "").strip().lower()


def match(new_signals, existing_invoices):
    """
    new_signals: dict from extractor.extract_all(), plus 'vendor'
    existing_invoices: list of dicts with keys: invoice_id, vendor,
        invoice_number, amount, invoice_date, billing_period,
        po_number, pr_number, p2p_link, attachment_hash, description
    Returns (invoice_id, rule_name) or (None, None).
    """
    new_inv_nos = {_norm(n) for n in new_signals.get("invoice_numbers", [])}
    new_vendor = _norm(new_signals.get("vendor"))
    new_amounts = set(new_signals.get("amounts", []))
    new_dates = set(new_signals.get("dates", []))
    new_pos = {_norm(n) for n in new_signals.get("po_numbers", [])}
    new_prs = {_norm(n) for n in new_signals.get("pr_numbers", [])}
    new_links = {_norm(n) for n in new_signals.get("p2p_links", [])}
    new_hash = new_signals.get("attachment_hash")

    # Rule 1: exact invoice number (unique enough on its own)
    if new_inv_nos:
        for inv in existing_invoices:
            if _norm(inv.get("invoice_number")) in new_inv_nos:
                return inv["invoice_id"], "exact invoice number"

    # Rule 2: exact invoice number + vendor (redundant with rule 1 given
    # invoice numbers are treated as globally unique here, kept for
    # cases where invoice numbering schemes collide across vendors)
    if new_inv_nos and new_vendor:
        for inv in existing_invoices:
            if _norm(inv.get("invoice_number")) in new_inv_nos and _norm(inv.get("vendor")) == new_vendor:
                return inv["invoice_id"], "invoice number + vendor"

    # Rule 3: vendor + amount + invoice date
    if new_vendor and new_amounts and new_dates:
        for inv in existing_invoices:
            if (_norm(inv.get("vendor")) == new_vendor
                    and inv.get("amount") in new_amounts
                    and inv.get("invoice_date") in new_dates):
                return inv["invoice_id"], "vendor + amount + date"

    # Rule 4: vendor + billing period
    new_period = _norm(new_signals.get("billing_period"))
    if new_vendor and new_period:
        for inv in existing_invoices:
            if _norm(inv.get("vendor")) == new_vendor and _norm(inv.get("billing_period")) == new_period:
                return inv["invoice_id"], "vendor + billing period"

    # Rule 5: P2P/Aerchain/PO/PR reference
    if new_links or new_pos or new_prs:
        for inv in existing_invoices:
            if (_norm(inv.get("p2p_link")) in new_links and new_links) \
                    or (_norm(inv.get("po_number")) in new_pos and new_pos) \
                    or (_norm(inv.get("pr_number")) in new_prs and new_prs):
                return inv["invoice_id"], "PO/PR/P2P reference"

    # Rule 6: attachment content / file hash
    if new_hash:
        for inv in existing_invoices:
            if inv.get("attachment_hash") == new_hash:
                return inv["invoice_id"], "attachment hash"

    # Rule 7: similar vendor + amount + description (fuzzy — flagged as a
    # weak match; caller should route this to the review queue rather than
    # auto-merging)
    if new_vendor and new_amounts:
        for inv in existing_invoices:
            if _norm(inv.get("vendor")) == new_vendor and inv.get("amount") in new_amounts:
                return inv["invoice_id"], "WEAK: vendor + amount only (verify manually)"

    return None, None
