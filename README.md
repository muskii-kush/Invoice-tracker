# Invoice Tracker

Automated intake and tracking for technology vendor invoices arriving via
Gmail (and optionally Slack) — replacing a manual, error-prone Excel
tracker. Scans mail for invoice-related signals, extracts vendor/invoice
number/amount/PO-PR references, deduplicates against existing records, and
writes everything into a structured tracker. Anything ambiguous is flagged
for manual review rather than guessed at. Never sends, deletes, modifies,
or forwards anything.

## Two implementations here

### [`automation-appsscript/`](automation-appsscript/) — **the active one**

Google Apps Script, bound to a Google Sheet. No Google Cloud Console
project, no OAuth client, no credentials file — Gmail access is the
built-in `GmailApp` service with a one-click authorization; Slack is a
plain `UrlFetchApp` call to the Slack Web API with a bot token you create
yourself. Includes optional PDF-attachment OCR (via Drive's built-in OCR
conversion) and a live dashboard deployable as its own Web App page.

Start here: [`automation-appsscript/README.md`](automation-appsscript/README.md).

### [`automation/`](automation/) — earlier Python prototype

The original design, built against the Gmail API + Slack SDK directly.
Superseded by the Apps Script version once it became clear a Cloud
Console project wasn't wanted — kept here for reference since the
detection logic (extractor/classifier/matcher) was designed and tested
here first.

## How detection works (same logic in both versions)

1. **Extract** — regex-based signals from message text (and PDF OCR text,
   Apps Script version only): vendor name, invoice/PO/PR number, amount,
   currency, dates, Aerchain/P2P links.
2. **Classify** — signals sort each message into one of: Likely invoice,
   Possible invoice, Invoice follow-up, P2P/approval update, Duplicate
   source item, Not an invoice, Needs manual review.
3. **Match** — a 7-rule priority dedup against existing invoice records
   (exact invoice number → invoice number + vendor → vendor + amount +
   date → vendor + billing period → PO/PR/P2P reference → attachment hash
   → weak vendor+amount match), so the same invoice arriving through
   multiple emails collapses into one record instead of duplicating.

## Data model

Six tracker tabs/sheets: **Invoice Register** (one row per unique
invoice), **Source Inbox** (one row per scanned message, kept even if
later marked duplicate), **Activity Log** (append-only, nothing ever
overwritten), **Vendor Reference**, **Review Queue**, **Setup**.
