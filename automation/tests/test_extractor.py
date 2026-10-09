"""
Offline proof that the detection engine behaves as specified in the master
prompt. These use synthetic emails/Slack messages (not live data, since we
have no Gmail/Slack access in this environment) — run with:

    cd automation && python -m pytest tests/ -v
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import extractor, classifier, matcher


def test_likely_invoice_with_attachment_and_amount():
    text = (
        "Hi team, please find attached the tax invoice for Truecaller "
        "DID whitelisting, invoice amount INR 45,000 against PO-CSPL-26-15483."
    )
    signals = extractor.extract_all(text, attachment_names=["invoice_sep.pdf"])
    category, confidence, reasons = classifier.classify(text, signals)
    assert signals["vendor"] == "Truecaller"
    assert "PO-CSPL-26-15483" in signals["po_numbers"]
    assert category == "Likely invoice"
    assert confidence == "High"


def test_possible_invoice_missing_hard_identifier():
    text = "Airtel outstanding payment of Rs 401306.17 is still pending, please process."
    signals = extractor.extract_all(text)
    category, confidence, reasons = classifier.classify(text, signals)
    assert category in ("Possible invoice", "Needs manual review")


def test_approval_update_not_new_invoice():
    text = "Please approve the PO for Ozonetel so we can proceed with payment processing."
    signals = extractor.extract_all(text)
    category, confidence, reasons = classifier.classify(text, signals)
    assert category == "P2P or approval update"


def test_not_an_invoice():
    text = "Hey, are we still on for the 3pm sync tomorrow?"
    signals = extractor.extract_all(text)
    category, confidence, reasons = classifier.classify(text, signals)
    assert category == "Not an invoice"
    assert confidence == "High"


def test_aerchain_link_detected():
    text = "Invoice raised: https://cars24.aerchain.io/invoices/2202785 for Ozonetel, please validate."
    signals = extractor.extract_all(text)
    assert signals["p2p_links"] == ["https://cars24.aerchain.io/invoices/2202785"]


def test_matcher_exact_invoice_number():
    existing = [
        {"invoice_id": "INV-0001", "vendor": "Servetel", "invoice_number": "HR/SEP/26-27/006",
         "amount": None, "invoice_date": None, "billing_period": None,
         "po_number": None, "pr_number": None, "p2p_link": None, "attachment_hash": None},
    ]
    signals = {"invoice_numbers": ["HR/SEP/26-27/006"], "vendor": "Servetel",
               "amounts": [], "dates": [], "po_numbers": [], "pr_numbers": [], "p2p_links": []}
    invoice_id, rule = matcher.match(signals, existing)
    assert invoice_id == "INV-0001"
    assert rule == "exact invoice number"


def test_matcher_no_match_returns_none():
    signals = {"invoice_numbers": [], "vendor": "Perfios", "amounts": [], "dates": [],
               "po_numbers": [], "pr_numbers": [], "p2p_links": []}
    invoice_id, rule = matcher.match(signals, [])
    assert invoice_id is None
