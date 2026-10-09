"""
Shared vocabulary for invoice detection. Mirrors the 'Setup' sheet in
Invoice Automation Tracker.xlsx — if you edit lists there, update here too
(or, once the tool is live, load these from config/sources.yaml instead of
hardcoding, and treat this file as the fallback default).
"""

INVOICE_KEYWORDS = [
    "invoice", "bill", "receipt", "renewal", "subscription", "payment",
    "payment advice", "outstanding", "pending invoice", "proforma",
    "debit note", "credit note", "tax invoice", "gst invoice", "po",
    "purchase order", "pr", "requisition", "aerchain", "p2p", "approval",
    "payment processing",
]

APPROVAL_KEYWORDS = [
    "approve", "approval", "please approve", "sign off", "authorise",
    "authorize", "validation", "second approver",
]

ATTACHMENT_EXTENSIONS = {
    "pdf": ["pdf"],
    "image": ["png", "jpg", "jpeg", "heic"],
    "spreadsheet": ["xlsx", "xls", "csv"],
    "document": ["doc", "docx"],
}

P2P_LINK_PATTERNS = [
    r"aerchain\.io",
]

# Initial known vendors (from the existing manual tracker). New vendors are
# appended here (or to config/sources.yaml) as they're discovered — see
# VendorReference sheet, "Active/Inactive" column.
KNOWN_VENDORS = [
    "Truecaller", "Airtel", "Ameyo", "Veeno", "Ozonetel", "Exotel",
    "Nobroker", "Servetel", "Perfios", "Saleschat Pro",
]

# Regex fragments used by extractor.py to recognize PO/PR/invoice numbers.
# These are seeded from the actual reference numbers found in the manual
# tracker (PO-CSPL-26-*, PR-CSPL-26-*, VEENO/2526/*, HR/SEP/26-27/*, etc).
# Extend this list whenever a new vendor's numbering scheme is discovered.
PO_NUMBER_PATTERNS = [
    r"\bPO-CSPL-\d{2}-\d{4,6}\b",
]
PR_NUMBER_PATTERNS = [
    r"\bPR-CSPL-\d{2}-\d{4,6}\b",
]
INVOICE_NUMBER_PATTERNS = [
    r"\bVEENO/\d{4}/\d{3,5}\b",
    r"\bVN\d{4}IN\d{6,9}\b",
    r"\bIN\d{9,10}\b",
    r"\bBAA\d{6}[A-Z]\d{6,9}\b",
    r"\bHR/[A-Z]{3}/\d{2}-\d{2}/\d{3}\b",
]

INTAKE_STATUSES = [
    "New", "Needs review", "Confirmed invoice", "Missing information",
    "Duplicate", "Not an invoice", "Ready for P2P",
]

P2P_STATUSES = [
    "Not submitted", "Submitted to P2P", "Validation issue",
    "Approval pending", "Approved", "Processed", "Rejected", "Paid",
]

DETECTION_CATEGORIES = [
    "Likely invoice", "Possible invoice", "Invoice follow-up",
    "P2P or approval update", "Duplicate source item", "Not an invoice",
    "Needs manual review",
]

ACTIVITY_TYPES = [
    "Invoice received", "Invoice identified", "Invoice matched",
    "Duplicate detected", "PO created", "PR created",
    "Approval requested", "Approval received", "Validation issue",
    "Follow-up sent", "P2P submitted", "P2P rejected",
    "Payment processed", "Payment completed", "Other",
]
