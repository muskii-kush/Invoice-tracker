# Tech Invoice Tracker — standalone dashboard (manual tracker)

A read-only dashboard built from `Tech Invoice -Tracker -Cars24 (1).xlsx`.
No Gmail/Slack automation here — just the three tracker tabs and a live
web dashboard reading them. Separate Google Sheet and Apps Script project
from the Gmail-automation tracker; the two don't interact.

## What got imported, and what got cleaned up

The source Excel has 7 sheets. Three map directly onto the dashboard:

- **Info - Master** → **Vendor Master** tab (54 real vendor rows — the
  Excel had a blank gap then a near-empty "Contract and Renewal Details"
  sub-table pasted below the real data; that junk was dropped).
- **Month-on-Month Invoice Tracker** → same-named tab (116 rows — merged
  the main sheet's 58 rows with **Sheet18**'s 60 rows, since Sheet18 looks
  like a second batch of the same tracker not yet copied into the main
  sheet. Two rows — Jira and Confluence, invoice numbers `AMR2025260977`
  and `AMR2025260978` — appeared in both with identical amounts/dates; the
  Sheet18 copy also had a data-entry glitch, so that duplicate was dropped
  and the clean original kept).
- **All Pendency** → same-named tab (109 rows — the Excel had two small
  scratch tables pasted into blank columns to the right of the real data,
  a per-vendor "Pending Amount" summary and an ad-hoc Airtel breakdown;
  those stray columns were dropped).

Three sheets from the Excel were intentionally **left out** of this
dashboard (per your call): **Sheet17** (pending-amount-by-vendor summary —
superseded by the All Pendency tab), **Vendor - Data** (an older
Ameyo/Veeno-specific ledger), and **Exotel** (a vendor-specific scratch
sheet). If you want any of these added as extra dashboard tabs later, say
so and they can be layered in the same way.

## One-time setup

1. **Create a new Google Sheet** (sheets.new). Name it whatever you like,
   e.g. "Tech Invoice Tracker — Manual".
2. **Extensions → Apps Script.** This opens a blank script project bound
   to that Sheet.
3. Delete the default `Code.gs` content, then create these files (File →
   New → Script file, matching names exactly) and paste in the matching
   content from this folder:
   - `ImportManualTracker.gs`
   - `Dashboard.gs`
   - `Menu.gs`
4. Create an **HTML file** (File → New → HTML file) named exactly
   `Dashboard` (no `.html` — Apps Script adds that), and paste in
   `Dashboard.html`'s content.
5. Save all files (Ctrl/Cmd+S).
6. Go back to the Sheet and reload the tab (refresh the browser). A new
   **"Tracker Dashboard"** menu should appear next to Extensions.
7. Click **Tracker Dashboard → 1. Import tracker data (first time only)**.
   First run will prompt an OAuth consent screen — approve it (it only
   needs Sheets access, since there's no Gmail/Slack involved here). You
   should get an alert confirming rows imported into all three tabs.
8. **Deploy the dashboard:** Deploy → New deployment → gear icon → Web
   app → Execute as: **Me** → Who has access: **Anyone within [your
   domain]** → Deploy. Copy the URL it gives you — that's the live
   dashboard link to share.

## Updating the dashboard after an edit

Saving code changes in the Apps Script editor does **not** update an
already-deployed Web App URL. To push an edit live: **Deploy → Manage
deployments → pencil icon → Version: New version → Deploy.**

## Keeping the data current

This dashboard reads the Sheet live on every page load — edit cells
directly in **Month-on-Month Invoice Tracker** / **All Pendency** /
**Vendor Master** and refresh the dashboard page to see the change. There
is no automated sync feeding this (that's the separate Gmail-automation
project) — someone needs to keep these three tabs updated by hand, same
as the Excel always required.
