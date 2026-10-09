"""
Column definitions for the six tracker sheets — copied verbatim from the
master prompt's data models. tracker_store.py builds/reads/writes against
these; build_workbook.py (the manual-tracker backfill) and backfill.py /
sync.py (the live Gmail+Slack engine) both go through tracker_store, so the
schema only needs to be correct in one place.
"""

INVOICE_REGISTER = [
    "Invoice ID", "Vendor", "Service", "Business Unit", "Invoice Number",
    "Invoice Date", "Invoice Amount", "Currency", "Tax Amount", "Due Date",
    "Billing Period", "Description", "PO Number", "PR Number",
    "P2P / Aerchain Link", "Vendor SPOC", "Internal POC", "Current Owner",
    "Source Type", "Source Message ID", "Source Message Link",
    "Source Received Date", "Attachment Name", "Attachment Link",
    "Detection Confidence", "Intake Status", "P2P Status", "Current Issue",
    "Next Action", "Next Action Owner", "Next Action Date", "Created Date",
    "Last Updated Date", "Duplicate Group ID", "Remarks",
]

SOURCE_INBOX = [
    "Source Record ID", "Source", "Source Type", "Received Date", "Sender",
    "Recipients or Channel", "Subject or Message Preview",
    "Attachment Names", "Shared Links", "Detected Vendor",
    "Detected Invoice Number", "Detected Amount", "Detected PO / PR Number",
    "Matched Invoice ID", "Detection Status", "Review Notes",
    "Original Message Link",
]

ACTIVITY_LOG = [
    "Activity ID", "Invoice ID", "Activity Date", "Source", "Actor",
    "Activity Type", "Details", "Outcome", "Next Action",
    "Next Action Owner", "Next Action Date", "Source Link",
]

VENDOR_REFERENCE = [
    "Vendor", "Service", "Vendor SPOC", "Known Vendor Email Domain",
    "Known Vendor Email Addresses", "Known Slack Contacts",
    "Known Slack Channels", "Business Units",
    "PR / Direct PO Approval Matrix", "Invoice Approval Matrix",
    "Default Internal Owner", "Matching Notes", "Active / Inactive",
]

REVIEW_QUEUE = [
    "Review Item ID", "Linked Source Record ID", "Linked Invoice ID",
    "Reason For Review", "Detected Signals", "Suggested Vendor",
    "Suggested Invoice Number", "Suggested Amount", "Status",
    "Assigned To", "Notes", "Original Message Link",
]

SHEETS = {
    "Invoice Register": INVOICE_REGISTER,
    "Source Inbox": SOURCE_INBOX,
    "Activity Log": ACTIVITY_LOG,
    "Vendor Reference": VENDOR_REFERENCE,
    "Review Queue": REVIEW_QUEUE,
    # "Setup" is hand-built in build_workbook.py — it's documentation/config,
    # not a row-per-record table, so it doesn't follow the header+append pattern.
}

ID_PREFIXES = {
    "Invoice Register": "INV",
    "Source Inbox": "SRC",
    "Activity Log": "ACT",
    "Review Queue": "REV",
}
