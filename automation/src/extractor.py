"""
Pulls structured signals (vendor, invoice number, PO/PR, amount, currency,
dates, P2P links) out of free-text email bodies / Slack messages.

Pure text-in, dict-out functions — no network calls — so this is fully
unit-testable offline (see tests/test_extractor.py) even though we can't
hit live Gmail/Slack from this environment.
"""
import re
from datetime import datetime

from . import constants


def find_vendor(text, known_vendors=None):
    """Return the first known vendor name found in text, or None."""
    vendors = known_vendors or constants.KNOWN_VENDORS
    lowered = text.lower()
    for vendor in vendors:
        if vendor.lower() in lowered:
            return vendor
    return None


def find_matches(text, patterns):
    found = []
    for pattern in patterns:
        found.extend(re.findall(pattern, text, flags=re.IGNORECASE))
    # de-dupe, keep order
    seen = set()
    ordered = []
    for m in found:
        if m not in seen:
            seen.add(m)
            ordered.append(m)
    return ordered


def find_po_numbers(text):
    return find_matches(text, constants.PO_NUMBER_PATTERNS)


def find_pr_numbers(text):
    return find_matches(text, constants.PR_NUMBER_PATTERNS)


def find_invoice_numbers(text):
    return find_matches(text, constants.INVOICE_NUMBER_PATTERNS)


def find_p2p_links(text):
    urls = re.findall(r"https?://\S+", text)
    return [u for u in urls if any(re.search(p, u, re.IGNORECASE) for p in constants.P2P_LINK_PATTERNS)]


AMOUNT_PATTERN = re.compile(
    r"(?:(?:Rs\.?|INR|₹|\$|USD)\s?)?"
    r"(\d{1,3}(?:,\d{2,3})*(?:,\d{3})*(?:\.\d{1,2})?)"
    r"\s?(?:/-|only)?",
)

CURRENCY_HINTS = {
    "inr": "INR", "rs": "INR", "rs.": "INR", "₹": "INR",
    "usd": "USD", "$": "USD",
}


def find_amounts(text):
    """
    Return a list of plausible monetary amounts found in text, as floats,
    filtering out obvious non-amounts (phone numbers, PO/invoice numbers
    already matched by their own patterns, bare small integers like day
    counts). This is a heuristic, not a parser — anything ambiguous should
    still land in the review queue rather than be trusted blindly.
    """
    candidates = []
    for m in re.finditer(r"[₹$]|Rs\.?|INR|USD", text, flags=re.IGNORECASE):
        window = text[m.end():m.end() + 20]
        num_match = re.search(r"[\d,]+(?:\.\d{1,2})?", window)
        if num_match:
            raw = num_match.group().replace(",", "")
            try:
                candidates.append(float(raw))
            except ValueError:
                pass
    # also catch bracketed amounts like "(2,22,084.5)" common in the manual tracker
    for m in re.finditer(r"\((\d[\d,]{3,}(?:\.\d{1,2})?)\)", text):
        raw = m.group(1).replace(",", "")
        try:
            candidates.append(float(raw))
        except ValueError:
            pass
    return candidates


def find_currency(text):
    lowered = text.lower()
    for hint, code in CURRENCY_HINTS.items():
        if hint in lowered:
            return code
    return None


DATE_PATTERNS = [
    "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y", "%d %B %Y",
]


def find_dates(text):
    """Return any parseable dates found in text as datetime.date objects."""
    found = []
    for token in re.findall(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}", text):
        for fmt in DATE_PATTERNS:
            try:
                found.append(datetime.strptime(token, fmt).date())
                break
            except ValueError:
                continue
    return found


def has_attachment_signal(attachment_names):
    """Given a list of filenames, return the matched signal category or None."""
    for name in attachment_names or []:
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        for category, exts in constants.ATTACHMENT_EXTENSIONS.items():
            if ext in exts:
                return category
    return None


def extract_all(text, attachment_names=None, known_vendors=None):
    """
    Run every extractor over one message body and return a flat dict of
    signals. This dict is what classifier.classify() consumes.
    """
    text = text or ""
    return {
        "vendor": find_vendor(text, known_vendors),
        "po_numbers": find_po_numbers(text),
        "pr_numbers": find_pr_numbers(text),
        "invoice_numbers": find_invoice_numbers(text),
        "p2p_links": find_p2p_links(text),
        "amounts": find_amounts(text),
        "currency": find_currency(text),
        "dates": find_dates(text),
        "attachment_signal": has_attachment_signal(attachment_names),
        "attachment_names": attachment_names or [],
    }
