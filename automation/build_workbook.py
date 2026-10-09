#!/usr/bin/env python3
"""
One-time historical backfill FROM THE EXISTING MANUAL TRACKER (not from
Gmail/Slack — those require your own API credentials, see README.md).

Reads "Manual Tracker (Original, Preserved).xlsx" (an untouched copy of the
file you gave us), transcribes its two vendor-summary snapshots (Sheet1,
Sheet2) and its structured Ameyo/Veeno invoice ledger (Sheet3), and writes a
fresh "Invoice Automation Tracker.xlsx" with the six required sheets:
Invoice Register, Source Inbox, Activity Log, Vendor Reference,
Review Queue, Setup.

The original manual workbook is never modified — this only ever writes to
a new file. Ambiguous free-text is parsed best-effort using the same
extractor/classifier the live Gmail/Slack engine uses (src/extractor.py,
src/classifier.py) and anything uncertain is routed to Review Queue rather
than guessed into the Invoice Register, per the master prompt's
"do not discard uncertain records" rule.
"""
import datetime
import os
import sys

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src import schema, extractor, classifier, constants

TODAY = "2026-09-27"  # backfill run date (Date.now()-style calls aren't available here)

HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=10)
HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
BODY_FONT = Font(name="Arial", size=10)
TITLE_FONT = Font(name="Arial", bold=True, size=14)
SUBTITLE_FONT = Font(name="Arial", italic=True, size=10, color="666666")
SECTION_FONT = Font(name="Arial", bold=True, size=12, color="1F4E78")
WRAP = Alignment(wrap_text=True, vertical="top")

# ---------------------------------------------------------------------------
# Transcribed source data (read directly from the manual tracker's cells —
# see the conversation for the raw dump this was transcribed from).
# ---------------------------------------------------------------------------

VENDOR_ROWS = [
    dict(vendor="Truecaller", service="Number / DID Whitelisting", spoc="Rahul",
         business_units="Central / All BUs", po_pr_matrix="Bhavya Mittal, Sonal Negi",
         invoice_matrix="Bhavya Mittal Second approver Neha/Harsh",
         pending_old="PO-CSPL-26-15483(June to August)  PO-CSPL-26-15478(Sept to Nov)",
         pending_new="PO-CSPL-26-15483  PO-CSPL-26-15478",
         remarks_old="Both the PO is raised approval from Bhavya is done. Already send to Sonali for approval. sonali and team denied to provide approval because the provision is not booked so they will not give the approval they are asking that if Manoj Yadav will provide the approval for the same it will be done.",
         remarks_new="Both the PO is raised approval from Bhavya is done. Already send to Sonali for approval. sonali and team denied to provide approval because the provision is not booked so they will not give the approval they are asking that if Manoj Yadav will provide the approval for the same it will be done.",
         subject="Re: Payment Reminder-343 CARS24 SERVICES PRIVATE LIMITED"),
    dict(vendor="Airtel", service="Number / DID Whitelisting", spoc="Abhishek",
         business_units="Central / All BUs", po_pr_matrix="Bhavya Mittal, karan Bhavsar",
         invoice_matrix="Bhavya Mittal Second approver Neha/Harsh",
         pending_old="BAA062705B002544 (2,22,084.5) May\nBAA062603B019561 (1,79,221.67) March\nIN total 4,01,306.17",
         pending_new="BAA062705B002544 (2,22,084.5)\nBAA062603B019561 (1,79,221.67)\nIN total 4,01,306.17",
         remarks_old="Manvi approval is needed. March and may pending invoices which was raised on july 1st and the amount is not released because we do not have the validation data. Total six invoices was there now these two are pending. Manvi told me to talk to ankur and write a mail from his side to take approval from VC.",
         remarks_new="Manvi approval is needed. March and may pending invoices which was raised on july 1st and the amount is not released because we do not have the validation data. Total six invoices was there now these two are pending.",
         subject="Re: Details Required for Invoice Validation ; Fwd: Outstanding invoices_ Cars24 Services/ BNAM product (waiting for Ankur revert)"),
    dict(vendor="Ameyo / Veeno", service="CC Communication Tool", spoc="Manish",
         business_units="Buyer CC, Seller CC, NBFC Exp, C2C Exp, C2C Listing, PDI - Cartruth, T2D, Buyer PostDelivery, NBFC Sourcing, Dealer Experience",
         po_pr_matrix="Bhavya Mittal, karan Bhavsar", invoice_matrix="Bhavya Mittal Second approver Neha/Harsh",
         pending_old="PR-CSPL-26-13565\nPO-CSPL-26-15637\nPO-CSPL-26-15021",
         pending_new="PR-CSPL-26-13565",
         remarks_old="Approval request send to Bhavya", remarks_new="Approval request send to Bhavya",
         subject=""),
    dict(vendor="Ozonetel", service="CC Communication Tool", spoc="Indranil",
         business_units="Buyer CC", po_pr_matrix="Bhavya Mittal, karan Bhavsar",
         invoice_matrix="Bhavya Mittal Second approver Neha/Harsh",
         pending_old=("https://cars24.aerchain.io/invoices/2202785\nhttps://cars24.aerchain.io/invoices/2202790\n"
                       "https://cars24.aerchain.io/invoices/2202794\nhttps://cars24.aerchain.io/invoices/2202802\n"
                       "https://cars24.aerchain.io/invoices/2202807\nhttps://cars24.aerchain.io/invoices/2202811\n"
                       "https://cars24.aerchain.io/invoices/2202819\nhttps://cars24.aerchain.io/invoices/2202827\n"
                       "https://cars24.aerchain.io/invoices/2202831\nhttps://cars24.aerchain.io/requisitions/264727\n"
                       "PO-CSPL-26-15910 (SEPT)\nhttps://cars24.aerchain.io/purchase-orders/1485537"),
         pending_new=("https://cars24.aerchain.io/invoices/2202785\nhttps://cars24.aerchain.io/invoices/2202790\n"
                      "https://cars24.aerchain.io/invoices/2202794\nhttps://cars24.aerchain.io/invoices/2202802\n"
                      "https://cars24.aerchain.io/invoices/2202807\nhttps://cars24.aerchain.io/invoices/2202811\n"
                      "https://cars24.aerchain.io/invoices/2202819\nhttps://cars24.aerchain.io/invoices/2202827\n"
                      "https://cars24.aerchain.io/invoices/2202831\nhttps://cars24.aerchain.io/requisitions/264727"),
         remarks_old="All the invoices are raised. Talked to Neha she will process the payment accordingly by tomorrow.",
         remarks_new="All the invoices are raised. Talked to Neha she is saying it will be done within the TAT time T+3 DAYS. Issue with GST number and the approval needed from arjun for which the mail is sent.",
         subject="Re: 51321 CARS24 SERVICES PRIVATE LIMITED. Payment details (Need to check this) ; Re: Details required for invoices validation"),
    dict(vendor="Exotel", service="BOT Voice Streaming Service", spoc="Manish",
         business_units="GenAI Team", po_pr_matrix="Yugesh Kumar (Direct GS) , Sonal Negi",
         invoice_matrix="",
         pending_old="PO-CSPL-26-16010 (14,12,112.62) Aug 26", pending_new="",
         remarks_old="PO raised and approved", remarks_new="Mail has been sent to manish to provide the pendency",
         subject=""),
    dict(vendor="Nobroker", service="AI-Based Call Auditing", spoc="Ruchir",
         business_units="NBFC, Buyer CC, Seller CC", po_pr_matrix="Bhavya Mittal, karan Bhavsar",
         invoice_matrix="Bhavya Mittal Second approver Neha/Harsh",
         pending_old="IN2926080385\nIN2926080383\nIN2926080386 These invoices to be raised again.",
         pending_new="IN2926080385\nIN2926080383\nIN2926080385 These invoices to be raised again.",
         remarks_old="Rahul sir told to amend the PO because there is no solution for the amount mismatch situation.",
         remarks_new="Rahul sir told to amend the PO because there is no solution for the amount mismatch situation.",
         subject="Re: Supporting Documents and Amount Correction Required"),
    dict(vendor="Servetel", service="Virtual Number Procurement", spoc="Sumit",
         business_units="Buyer CC, Seller CC, Aadhaar", po_pr_matrix="Bhavya Mittal, karan Bhavsar",
         invoice_matrix="Bhavya Mittal Second approver Neha/Harsh",
         pending_old="HR/SEP/26-27/017 HR/SEP/26-27/006 HR/SEP/26-27/007 HR/SEP/26-27/008 HR/SEP/26-27/009 HR/SEP/26-27/010 HR/SEP/26-27/011 HR/SEP/26-27/012 HR/SEP/26-27/013 HR/SEP/26-27/014 HR/SEP/26-27/015 HR/SEP/26-27/016",
         pending_new="HR/SEP/26-27/017 HR/SEP/26-27/006 HR/SEP/26-27/007 HR/SEP/26-27/008 HR/SEP/26-27/009 HR/SEP/26-27/010 HR/SEP/26-27/011 HR/SEP/26-27/012 HR/SEP/26-27/013 HR/SEP/26-27/014 HR/SEP/26-27/015 HR/SEP/26-27/016",
         remarks_old="All Done", remarks_new="All the invoices has been raised. Approval pending from Bhavya.",
         subject="Re: Servetel Communication Invoices Sep 2026"),
    dict(vendor="Perfios", service="API", spoc="Nikhil kochhar", business_units="Dealer",
         po_pr_matrix="Abhishek Bhardwaj", invoice_matrix="Bhavya Mittal Second approver Neha/Harsh",
         pending_old="PO-CSPL-26-15635 Invoice raised", pending_new="PO-CSPL-26-15635 Invoice raised",
         remarks_old="Talked to Nikhil he will provide the revised invoices than we will proceed further.",
         remarks_new="Talked to Nikhil he will provide the revised invoices than we will proceed further.",
         subject="Re: Cars24 (all 3 Entities) Pending Invoices till Aug'26"),
    dict(vendor="Saleschat Pro", service="", spoc="Hardik", business_units="",
         po_pr_matrix="Bhavya Mittal,Om kapoor", invoice_matrix="",
         pending_old="PO-CSPL-26-15671", pending_new="PO-CSPL-26-15671",
         remarks_old="sent the email to kapil for payment advice", remarks_new="PO request raised.",
         subject="Ledger from Saleschat.pro"),
]

# Anonymous row (Sheet1 I12/J12) — no vendor name, flagged for review rather
# than guessed into the register.
UNVENDORED_REVIEW_ITEM = dict(
    remarks="The email has been dropped to shubham about TRC AND form completion",
    subject="Re: Required document for Onboarding || Supermrtal ||",
)

# Sheet3: fully structured Ameyo/Veeno invoice ledger, by business-unit block.
AMEYO_LEDGER = [
    # (business_unit, invoice_date, invoice_number, amount, due_date, description, poc)
    ("ECC/AMEYO", "2026-01-29", "VEENO/2526/1290", 181720, "Overdue", "Customization charges for 11 mandays against ticket no. DCA20251010692109", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-01-29", "VEENO/2526/1291", 66080, "Overdue", "Customization Charges for 4 man-days against ticket no DCA20251029698543", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-01-29", "VEENO/2526/1289", 8260, "Overdue", "Customization charges for 0.5 mandays against ticket no. DCA20251209716855", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-01-29", "VEENO/2526/1288", 33040, "Overdue", "Customisation charges for 2 mandays against ticket no.- DCA20251218721231", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-02-19", "VEENO/2526/1477", 8260, "Overdue", "Customisation charges for 0.5 mandays against ticket no.-DCA20260131739673", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-02-25", "VEENO/2526/1516", 49560, "Overdue", "Customization Charges for 3 man-days against ticket no DCA20260121735239", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-02-25", "VEENO/2526/1517", 8260, "Overdue", "Customisation charges for 0.5 manday against ticket no.-DCA20260206742285", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-07-25", "VEENO/2627/0945", 1340579, "Overdue", "Ameyo Rental for the month of June 2026", "Ankur Sanduria"),
    ("ECC/AMEYO", "2026-08-25", "VN2627IN00000387", 810071, "2026-09-24", "Ameyo Rental for the month of July 2026", "Ankur Sanduria"),
    ("Cars241m", "2026-04-21", "VEENO/2627/0156", 132748, "Overdue", "Charges for PF Voice for period from 1st March to 31st March 2026-Cars241m", "Arundhati"),
    ("Cars241m", "2026-05-26", "VEENO/2627/0447", 131769, "Overdue", "Charges for PF Voice for period from 1st Apr to 30th Apr 2026-Cars241m", "Arundhati"),
    ("Cars241m", "2026-06-24", "VEENO/2627/0771", 125103, "Overdue", "Charges for PF Voice for period from 1st May to 31th May 2026-Cars241m", "Arundhati"),
    ("Cars241m", "2026-07-25", "VEENO/2627/0943", 121545, "Overdue", "Charges for PF Voice for period from 1st June to 30th June 2026-Cars241m", "Arundhati"),
    ("Cars241m", "2026-08-24", "VN2627IN00000372", 114106, "2026-09-23", "Charges for PF Voice for period from 1st July to 31st July 2026-Cars241m", "Arundhati"),
    ("Cars243m", "2026-07-25", "VEENO/2627/0942", 9268, "Overdue", "Charges for PF Voice for period from 1st Jun to 31st Jun 2026-Cars243m", "Priya Rawat"),
    ("Cars243m", "2026-08-19", "VN2627IN00000162", 2956, "Overdue", "Charges for PF Voice for period from 1st July to 31st July 2026-Cars243m", "Priya Rawat"),
    ("Cars24service1m", "2026-07-25", "VEENO/2627/0944", 606029, "Overdue", "Charges for PF Voice for period from 1st June to 30th June 2026-Cars24service1m", "Ankur Sanduria"),
    ("Cars24service1m", "2026-08-24", "VN2627IN00000373", 667467, "2026-09-23", "Charges for PF Voice for period from 1st July to 31st July 2026-Cars24service1m", "Ankur Sanduria"),
    ("Cars246m", "2026-07-24", "VEENO/2627/0941", 488116, "Overdue", "Charges for PF Voice for period from 1st June to 30th June 2026-Cars246m", "Arvind Mehra"),
]


# ---------------------------------------------------------------------------
# Workbook scaffolding
# ---------------------------------------------------------------------------

def style_header(ws, headers):
    ws.append(headers)
    for col_idx, _ in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 30


def autosize(ws, headers, widths=None):
    for idx, header in enumerate(headers, start=1):
        letter = get_column_letter(idx)
        ws.column_dimensions[letter].width = (widths or {}).get(header, max(14, min(40, len(header) + 4)))


def set_body_font(ws, min_row=2):
    for row in ws.iter_rows(min_row=min_row):
        for cell in row:
            cell.font = BODY_FONT
            cell.alignment = WRAP


def build_workbook():
    wb = Workbook()
    wb.remove(wb.active)

    for name, headers in schema.SHEETS.items():
        ws = wb.create_sheet(name)
        style_header(ws, headers)
        autosize(ws, headers)

    return wb


# ---------------------------------------------------------------------------
# Population
# ---------------------------------------------------------------------------

def populate_vendor_reference(wb):
    ws = wb["Vendor Reference"]
    for v in VENDOR_ROWS:
        notes = []
        if v["vendor"] in ("Truecaller", "Ameyo / Veeno", "Perfios"):
            notes.append("PO/PR numbering: PO-CSPL-26-##### / PR-CSPL-26-#####")
        if v["vendor"] == "Ameyo / Veeno":
            notes.append("Invoice numbering: VEENO/YYYY/#### or VN####IN#########")
        if v["vendor"] == "Servetel":
            notes.append("Invoice numbering: HR/SEP/26-27/###")
        if v["vendor"] == "Ozonetel":
            notes.append("Tracked via Aerchain links (cars24.aerchain.io)")
        ws.append([
            v["vendor"], v["service"], v["spoc"], "", "", "", "",
            v["business_units"], v["po_pr_matrix"], v["invoice_matrix"], "",
            "; ".join(notes), "Active",
        ])
    set_body_font(ws)


def _make_activity(wb, invoice_id, activity_date, details, activity_type="Other",
                    source="Manual tracker backfill", source_link=""):
    from src import tracker_store
    tracker_store.append_row(wb, "Activity Log", {
        "Invoice ID": invoice_id, "Activity Date": activity_date, "Source": source,
        "Actor": "backfill script", "Activity Type": activity_type, "Details": details,
        "Outcome": "", "Next Action": "", "Next Action Owner": "", "Next Action Date": "",
        "Source Link": source_link,
    })


def populate_ameyo_ledger(wb):
    from src import tracker_store
    for bu, inv_date, inv_no, amount, due_date, desc, poc in AMEYO_LEDGER:
        invoice_id = tracker_store.append_row(wb, "Invoice Register", {
            "Vendor": "Ameyo / Veeno", "Service": "CC Communication Tool / PF Voice",
            "Business Unit": bu, "Invoice Number": inv_no, "Invoice Date": inv_date,
            "Invoice Amount": amount, "Currency": "INR", "Due Date": due_date,
            "Description": desc, "Vendor SPOC": "Manish", "Internal POC": poc,
            "Current Owner": poc, "Source Type": "Manual tracker (historical)",
            "Source Message ID": "", "Source Message Link": "",
            "Source Received Date": "", "Detection Confidence": "High",
            "Intake Status": "Confirmed invoice", "P2P Status": "Not submitted",
            "Current Issue": "Marked Overdue in manual ledger — payment status unconfirmed" if due_date == "Overdue" else "",
            "Created Date": TODAY, "Last Updated Date": TODAY,
            "Remarks": "Backfilled from manual tracker Sheet3 (structured Ameyo/Veeno ledger).",
        })
        _make_activity(wb, invoice_id, TODAY,
                       f"Invoice {inv_no} ({bu}) imported from manual tracker Sheet3 ledger. "
                       f"Amount {amount}, due {due_date}.",
                       activity_type="Invoice identified")


def _parse_line_tokens(vendor, text):
    """Best-effort split of one vendor's free-text 'pending' cell into
    discrete PO/PR/invoice/link tokens, using the same regex extractors the
    live engine uses. Returns a list of token dicts."""
    tokens = []
    for raw_line in (text or "").split("\n"):
        line = raw_line.strip()
        if not line or line.lower().startswith("in total"):
            continue
        sig = extractor.extract_all(line, known_vendors=[vendor])
        period_match = line[line.find("(") + 1:line.find(")")] if "(" in line and ")" in line else None

        if sig["invoice_numbers"]:
            # One token per invoice number found on this line. Only pair an
            # amount/period 1:1 when the counts match exactly a single
            # invoice number — otherwise leave amount blank rather than
            # guess which number it belongs to (ambiguous pairing is a
            # review-queue problem, not a silent-guess problem).
            amounts = sig["amounts"]
            for i, num in enumerate(sig["invoice_numbers"]):
                amt = amounts[i] if len(amounts) == len(sig["invoice_numbers"]) else (amounts[0] if len(sig["invoice_numbers"]) == 1 and amounts else None)
                tokens.append(dict(type="invoice", number=num, amount=amt,
                                    period=period_match if not amt else None, raw=line))
        elif sig["p2p_links"]:
            for url in sig["p2p_links"]:
                if "/invoices/" in url:
                    kind = "invoice"
                elif "/requisitions/" in url:
                    kind = "requisition"
                elif "/purchase-orders/" in url:
                    kind = "purchase-order"
                else:
                    kind = "other"
                tokens.append(dict(type="link", url=url, link_kind=kind, raw=line))
        elif sig["po_numbers"]:
            for num in sig["po_numbers"]:
                tokens.append(dict(type="po", number=num, period=period_match, raw=line))
        elif sig["pr_numbers"]:
            for num in sig["pr_numbers"]:
                tokens.append(dict(type="pr", number=num, raw=line))
        elif line:
            tokens.append(dict(type="freetext", raw=line))
    return tokens


def _token_key(tok):
    return tok.get("number") or tok.get("url") or tok.get("raw")


def _find_dropped_references(vendor, old_text, new_text):
    """References present in the older manual-tracker snapshot but not
    repeated in the newer one — could mean resolved, or could mean simply
    dropped when someone edited the remark. Flag rather than assume."""
    if not old_text.strip() or old_text.strip() == new_text.strip():
        return []
    old_tokens = _parse_line_tokens(vendor, old_text)
    new_keys = {_token_key(t) for t in _parse_line_tokens(vendor, new_text)}
    return [t for t in old_tokens if t["type"] != "freetext" and _token_key(t) not in new_keys]


def populate_from_vendor_summaries(wb):
    from src import tracker_store, matcher

    for v in VENDOR_ROWS:
        # Prefer the latest snapshot; fall back to the older one if the
        # latest snapshot simply didn't repeat a reference (e.g. Exotel's
        # PO-CSPL-26-16010 appears only in the older snapshot even though
        # nothing indicates it was resolved/cancelled).
        used_fallback = False
        pending_text = v["pending_new"]
        if not pending_text.strip() and v["pending_old"].strip():
            pending_text = v["pending_old"]
            used_fallback = True

        tokens = _parse_line_tokens(v["vendor"], pending_text)
        combined_text = f"{pending_text}\n{v['remarks_new']}\n{v['subject']}"
        category, confidence, reasons = classifier.classify(combined_text, extractor.extract_all(combined_text, known_vendors=[v["vendor"]]))

        source_id = tracker_store.append_row(wb, "Source Inbox", {
            "Source": "Gmail", "Source Type": "Manual tracker backfill (email subject only)",
            "Received Date": "", "Sender": "", "Recipients or Channel": "",
            "Subject or Message Preview": v["subject"] or "(no subject captured in manual tracker)",
            "Attachment Names": "", "Shared Links": "", "Detected Vendor": v["vendor"],
            "Detected Invoice Number": ", ".join(t["number"] for t in tokens if t["type"] == "invoice"),
            "Detected Amount": next((t["amount"] for t in tokens if t["type"] == "invoice" and t.get("amount")), ""),
            "Detected PO / PR Number": ", ".join(t["number"] for t in tokens if t["type"] in ("po", "pr")),
            "Matched Invoice ID": "", "Detection Status": category,
            "Review Notes": "Backfilled from manual tracker — original Gmail message link unavailable; "
                            "will be captured automatically once Gmail sync is connected (see README.md).",
            "Original Message Link": "",
        })

        if not used_fallback:
            for dropped in _find_dropped_references(v["vendor"], v["pending_old"], v["pending_new"]):
                tracker_store.append_row(wb, "Review Queue", {
                    "Linked Source Record ID": source_id,
                    "Reason For Review": f"\"{dropped['raw']}\" appears in the manual tracker's earlier "
                                          f"snapshot for {v['vendor']} but not in the latest one — confirm "
                                          f"whether it was resolved/cancelled or just dropped from the remark.",
                    "Detected Signals": dropped["raw"], "Suggested Vendor": v["vendor"],
                    "Suggested Invoice Number": dropped.get("number", "") if dropped["type"] == "invoice" else "",
                    "Status": "Open", "Original Message Link": "",
                })

        if not tokens:
            tracker_store.append_row(wb, "Review Queue", {
                "Linked Source Record ID": source_id, "Reason For Review":
                    f"No PO/PR/invoice number pattern recognized for {v['vendor']} — verify manually.",
                "Detected Signals": pending_text or "(empty)", "Suggested Vendor": v["vendor"],
                "Status": "Open", "Original Message Link": "",
            })
            continue

        fallback_note = (
            f" (carried forward from the manual tracker's earlier snapshot — the latest snapshot "
            f"did not repeat this reference, but nothing indicates it was resolved or cancelled)"
            if used_fallback else ""
        )

        created_ids = []
        for tok in tokens:
            if tok["type"] == "freetext":
                tracker_store.append_row(wb, "Review Queue", {
                    "Linked Source Record ID": source_id,
                    "Reason For Review": f"Unrecognized reference format for {v['vendor']}: \"{tok['raw']}\"",
                    "Detected Signals": tok["raw"], "Suggested Vendor": v["vendor"],
                    "Status": "Open", "Original Message Link": "",
                })
                continue

            # Check for an exact-match duplicate against everything created
            # so far in this run (this is what actually enforces "one row
            # per unique invoice" — flagging in Review Queue alone doesn't
            # dedupe the register).
            token_signals = {
                "invoice_numbers": [tok["number"]] if tok["type"] == "invoice" else [],
                "vendor": v["vendor"], "amounts": [tok["amount"]] if tok.get("amount") else [],
                "dates": [], "po_numbers": [tok["number"]] if tok["type"] == "po" else [],
                "pr_numbers": [tok["number"]] if tok["type"] == "pr" else [],
                "p2p_links": [tok["url"]] if tok["type"] == "link" else [],
            }
            existing = tracker_store.all_invoices(wb)
            dup_id, rule = matcher.match(token_signals, existing)
            if dup_id:
                tracker_store.append_row(wb, "Activity Log", {
                    "Invoice ID": dup_id, "Activity Date": TODAY, "Source": "Manual tracker backfill",
                    "Actor": "backfill script", "Activity Type": "Duplicate detected",
                    "Details": f"\"{tok['raw']}\" ({v['vendor']}) matched existing {dup_id} via {rule} — "
                               f"not re-created as a new row.",
                    "Outcome": "Linked, no new invoice row created",
                })
                created_ids.append(dup_id)
                continue

            is_invoice = tok["type"] == "invoice" or (tok["type"] == "link" and tok.get("link_kind") == "invoice")
            intake_status = "Confirmed invoice" if (is_invoice and tok.get("amount")) else "Missing information"
            if tok["type"] == "link":
                p2p_status = {"invoice": "Submitted to P2P", "requisition": "Approval pending",
                              "purchase-order": "Approval pending"}.get(tok.get("link_kind"), "Not submitted")
                link_note = {"invoice": "Aerchain invoice link.",
                             "requisition": "Aerchain requisition link — precedes invoice, kept for traceability.",
                             "purchase-order": "Aerchain purchase-order link — precedes invoice, kept for traceability."
                             }.get(tok.get("link_kind"), "")
            else:
                p2p_status = "Not submitted"
                link_note = ""

            invoice_id = tracker_store.append_row(wb, "Invoice Register", {
                "Vendor": v["vendor"], "Service": v["service"], "Business Unit": v["business_units"],
                "Invoice Number": tok.get("number", "") if tok["type"] in ("invoice",) else "",
                "Invoice Amount": tok.get("amount") or "", "Currency": "INR" if tok.get("amount") else "",
                "Billing Period": tok.get("period") or "",
                "Description": v["service"],
                "PO Number": tok.get("number", "") if tok["type"] == "po" else "",
                "PR Number": tok.get("number", "") if tok["type"] == "pr" else "",
                "P2P / Aerchain Link": tok.get("url", "") if tok["type"] == "link" else "",
                "Vendor SPOC": v["spoc"], "Source Type": "Manual tracker (historical)",
                "Source Message ID": source_id, "Detection Confidence": "Low",
                "Intake Status": intake_status, "P2P Status": p2p_status,
                "Current Issue": "Parsed from free text during backfill — verify number/amount/status manually.",
                "Created Date": TODAY, "Last Updated Date": TODAY,
                "Remarks": f"Backfilled from manual tracker vendor-summary sheet. Raw text: \"{tok['raw']}\"."
                           f"{fallback_note} {link_note}".strip(),
            })
            created_ids.append(invoice_id)
            tracker_store.update_cell(wb, "Source Inbox", source_id, "Matched Invoice ID",
                                       ", ".join(created_ids))
            _make_activity(wb, invoice_id, TODAY,
                           f"Reference \"{tok['raw']}\" identified from manual tracker for {v['vendor']}."
                           f"{fallback_note}",
                           activity_type="Invoice identified")

        # Append BOTH historical remark snapshots as separate, append-only
        # activity entries (never overwrite) — timestamps are not available
        # in the source tracker, which is itself one of the problems this
        # tool fixes going forward. Dedupe first: a token that matched an
        # existing invoice (rather than creating a new one) would otherwise
        # log the same remark against that invoice a second time.
        for inv_id in dict.fromkeys(created_ids):
            if v["remarks_old"]:
                _make_activity(wb, inv_id, "Unknown (pre-automation)",
                               f"[Manual tracker remark, snapshot A] {v['remarks_old']}")
            if v["remarks_new"] and v["remarks_new"] != v["remarks_old"]:
                _make_activity(wb, inv_id, "Unknown (pre-automation)",
                               f"[Manual tracker remark, snapshot B] {v['remarks_new']}")

        # Flag the Nobroker duplicate invoice-number typo explicitly.
        if v["vendor"] == "Nobroker":
            tracker_store.append_row(wb, "Review Queue", {
                "Linked Source Record ID": source_id,
                "Reason For Review": "IN2926080385 appears twice in the manual tracker's latest snapshot "
                                      "(likely a typo — the older snapshot lists a third distinct number, "
                                      "IN2926080386). Confirm the correct third invoice number with Nobroker.",
                "Detected Signals": "IN2926080385, IN2926080383, IN2926080385 (new) vs "
                                     "IN2926080385, IN2926080383, IN2926080386 (old)",
                "Suggested Vendor": "Nobroker", "Status": "Open", "Original Message Link": "",
            })


def populate_unvendored_review_item(wb):
    from src import tracker_store
    source_id = tracker_store.append_row(wb, "Source Inbox", {
        "Source": "Gmail", "Source Type": "Manual tracker backfill (email subject only)",
        "Subject or Message Preview": UNVENDORED_REVIEW_ITEM["subject"],
        "Detected Vendor": "", "Matched Invoice ID": "", "Detection Status": "Needs manual review",
        "Review Notes": "No vendor name captured in manual tracker for this row — appears to be a "
                         "vendor-onboarding/documentation thread, not an invoice.",
        "Original Message Link": "",
    })
    tracker_store.append_row(wb, "Review Queue", {
        "Linked Source Record ID": source_id,
        "Reason For Review": "Row has no vendor name in the manual tracker — likely an onboarding/TRC "
                              "document request, not an invoice. Confirm and either assign a vendor or "
                              "mark 'Not an invoice'.",
        "Detected Signals": UNVENDORED_REVIEW_ITEM["remarks"],
        "Status": "Open", "Original Message Link": "",
    })


def build_setup_sheet(wb, report):
    ws = wb.create_sheet("Setup")  # appended last, matching the master prompt's tab order
    ws.column_dimensions["A"].width = 42
    ws.column_dimensions["B"].width = 90
    row = 1

    def title(text, font=SECTION_FONT, height=None):
        nonlocal row
        ws.cell(row=row, column=1, value=text).font = font
        if height:
            ws.row_dimensions[row].height = height
        row += 1

    def kv(label, value=""):
        nonlocal row
        ws.cell(row=row, column=1, value=label).font = Font(name="Arial", bold=True, size=10)
        c = ws.cell(row=row, column=2, value=value)
        c.font = BODY_FONT
        c.alignment = WRAP
        row += 1

    def blank():
        nonlocal row
        row += 1

    title("Invoice Automation Tracker — Setup & Reference", TITLE_FONT, 24)
    ws.cell(row=row, column=1, value=f"Backfilled from the manual tracker on {TODAY}. "
                                      f"Original file preserved as 'Manual Tracker (Original, Preserved).xlsx'.").font = SUBTITLE_FONT
    row += 2

    title("1. Historical Backfill Report (from manual tracker)")
    kv("Confirmed unique invoices (Ameyo/Veeno ledger, Sheet3)", report["ameyo_count"])
    kv("Vendor-summary reference rows parsed (Sheet1/Sheet2)", report["vendor_rows"])
    kv("Invoice Register rows created", "=COUNTA('Invoice Register'!A2:A5000)")
    kv("Source Inbox rows created", "=COUNTA('Source Inbox'!A2:A5000)")
    kv("Activity Log entries created", "=COUNTA('Activity Log'!A2:A5000)")
    kv("Review Queue items (open)", '=COUNTIFS(\'Review Queue\'!I2:I5000,"Open")')
    kv("Vendors in Vendor Reference (active)", '=COUNTIF(\'Vendor Reference\'!M2:M5000,"Active")')
    kv("Invoice Register rows missing an invoice number",
       '=COUNTIFS(\'Invoice Register\'!A2:A5000,"<>",\'Invoice Register\'!E2:E5000,"")')
    kv("Invoice Register rows missing an amount",
       '=COUNTIFS(\'Invoice Register\'!A2:A5000,"<>",\'Invoice Register\'!G2:G5000,"")')
    kv("Invoice Register rows with a P2P/Aerchain link",
       '=COUNTIFS(\'Invoice Register\'!A2:A5000,"<>",\'Invoice Register\'!O2:O5000,"<>")')
    blank()
    ws.cell(row=row, column=1, value="Note: this backfill covers what the manual tracker already recorded. "
                                      "It does NOT yet include live Gmail/Slack history — run "
                                      "'python automation/main.py backfill' after completing section 4 below "
                                      "to pull the real 6–12 month history the master prompt calls for.").font = Font(
        name="Arial", italic=True, size=9, color="B00000")
    ws.row_dimensions[row].height = 30
    row += 2

    title("2. Gmail Source-Discovery Scope")
    kv("Vikram's email address", "SET IN automation/config/sources.yaml → vikram.email")
    kv("Groups / aliases (finance, procurement, IT, AP)", "SET IN sources.yaml → gmail.groups_and_aliases")
    kv("Known vendor email domains", "SET IN sources.yaml → gmail.vendor_domains")
    kv("Historical lookback window", "12 months (default — edit sources.yaml → gmail.lookback_months)")
    blank()

    title("3. Slack Source-Discovery Scope (only channels/DMs explicitly approved)")
    kv("Approved channels", "SET IN sources.yaml → slack.approved_channels")
    kv("Include DMs to Vikram?", "OFF by default — set slack.include_dms_with_vikram: true to enable")
    kv("Include group DMs?", "OFF by default — set slack.include_group_dms: true to enable")
    blank()

    title("4. What you need to do before running live backfill")
    for i, step in enumerate([
        "Create a Google Cloud project + OAuth client (Desktop app), enable the Gmail API, "
        "download credentials.json into automation/ (see README.md, section 'Gmail setup').",
        "Create a Slack app with read-only scopes (channels:history, groups:history, im:history, "
        "mpim:history, users:read), install it to the workspace, export the bot token as "
        "SLACK_BOT_TOKEN (see README.md, section 'Slack setup').",
        "Fill in automation/config/sources.yaml with Vikram's email, group/alias addresses, vendor "
        "domains, and the approved Slack channel list.",
        "Run: python automation/main.py backfill",
        "Review new rows in Review Queue and correct any misclassifications — corrections here "
        "improve matching over time (Vendor Reference sheet).",
        "Schedule: python automation/main.py sync (e.g. daily, via cron/Task Scheduler) for "
        "incremental updates.",
    ], start=1):
        kv(f"Step {i}", step)
    blank()

    title("5. Invoice keyword signals")
    kv("Keywords", ", ".join(constants.INVOICE_KEYWORDS))
    blank()

    title("6. Known vendors (seed list — add new ones to Vendor Reference sheet)")
    kv("Vendors", ", ".join(constants.KNOWN_VENDORS))
    blank()

    title("7. Status definitions")
    kv("Intake Status values", ", ".join(constants.INTAKE_STATUSES))
    kv("P2P Status values", ", ".join(constants.P2P_STATUSES))
    kv("Detection categories", ", ".join(constants.DETECTION_CATEGORIES))
    blank()

    title("8. Guardrails (Phase 1)")
    for g in [
        "Read-only access to Gmail and Slack only.",
        "Personal/direct messages included only where explicitly approved in sources.yaml.",
        "No unrelated private conversations are scanned — only the approved channel/DM list.",
        "Attachments are referenced by name/link, not downloaded, unless explicitly required.",
        "No emails, Slack messages, approvals, or payments are ever sent/modified/deleted by this tool.",
    ]:
        ws.cell(row=row, column=1, value="•").font = BODY_FONT
        ws.cell(row=row, column=2, value=g).font = BODY_FONT
        row += 1


def main():
    wb = build_workbook()
    populate_vendor_reference(wb)
    populate_ameyo_ledger(wb)
    populate_from_vendor_summaries(wb)
    populate_unvendored_review_item(wb)

    for name in schema.SHEETS:
        set_body_font(wb[name])

    # Currency formatting on amount columns (values are stored in INR/USD as
    # given — the Currency column next to each says which).
    inv_ws = wb["Invoice Register"]
    inv_headers = schema.INVOICE_REGISTER
    for col_name in ("Invoice Amount", "Tax Amount"):
        col_idx = inv_headers.index(col_name) + 1
        for row in inv_ws.iter_rows(min_row=2, min_col=col_idx, max_col=col_idx):
            for cell in row:
                if isinstance(cell.value, (int, float)):
                    cell.number_format = "#,##0.00;(#,##0.00);-"

    build_setup_sheet(wb, {"ameyo_count": len(AMEYO_LEDGER), "vendor_rows": len(VENDOR_ROWS)})

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Invoice Automation Tracker.xlsx")
    wb.save(out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
