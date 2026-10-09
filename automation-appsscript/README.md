# Invoice Tracking Automation — Google Apps Script version

Same engine as the Python prototype (`../automation/`), rebuilt as Google
Apps Script so it needs **no Google Cloud Console project, no OAuth
client, no credentials.json** — Gmail access is the standard one-click
Apps Script authorization on your own account, and it runs on Google's
servers on a schedule, so your laptop doesn't need to stay on.

You'll still create your own Slack app/bot token yourself (per your last
message) — the Setup steps below cover exactly what scopes it needs.

## What you get

- A Google Sheet with the same six tabs as the spec: Invoice Register,
  Source Inbox, Activity Log, Vendor Reference, Review Queue, Setup.
- The historical backfill from your existing manual tracker (same data
  already verified in the Excel version) — loaded with one menu click.
- Live Gmail scanning via the built-in `GmailApp` service (read-only).
- Live Slack scanning via the Slack Web API (read-only bot token you
  supply).
- A custom **Invoice Automation** menu in the Sheet for day-to-day use —
  you never need to open the Apps Script editor after initial setup.

## Deploy (10 minutes, no Cloud Console)

1. Go to [sheets.new](https://sheets.new) — creates a blank Google Sheet.
   Rename it (e.g. "Invoice Automation Tracker") — File > Rename.
2. **Extensions > Apps Script**. This opens an editor already bound to
   your new Sheet.
3. Delete the default `Code.gs` content. For each file in this folder
   (`Config.gs`, `Extractor.gs`, `Classifier.gs`, `Matcher.gs`,
   `SheetStore.gs`, `Setup.gs`, `ManualBackfillData.gs`, `GmailSource.gs`,
   `SlackSource.gs`, `IngestionCore.gs`, `Backfill.gs`, `Sync.gs`,
   `Menu.gs`, `PdfParser.gs`, `Dashboard.gs`): click the **+** next to
   "Files" in the editor, add a new script file with the matching name,
   and paste the contents in. `Dashboard.html` is an HTML file, not a
   script — pick **HTML** instead of **Script** in the **+** menu for that
   one.
4. Save (Ctrl/Cmd+S). Reload the Google Sheet tab — you should now see an
   **Invoice Automation** menu.
5. **Invoice Automation > 1. Setup tracker (first time only)**. You'll be
   asked to authorize the script — click through (it's your own script,
   the "unverified app" warning is normal and expected for a
   personally-authored Apps Script). This creates the six tabs.
6. **Invoice Automation > 2. Import manual tracker backfill (first time
   only)**. Loads the same historical data as the Excel version.
7. Open the **Setup** tab in the Sheet and fill in:
   - Vikram's email address
   - Gmail groups/aliases (finance@, procurement@, IT@, AP@ — comma-separated)
   - Known vendor email domains
   - Approved Slack channels (comma-separated, no `#`)
8. **Extensions > Apps Script > Project Settings** (gear icon, left
   sidebar) **> Script Properties > Add script property**:
   `SLACK_BOT_TOKEN` = your bot token (see Slack setup below).
9. **Invoice Automation > Run historical backfill (Gmail + Slack)**. First
   run also triggers a Slack authorization prompt if you haven't granted
   external-request permission yet.
10. Review the **Review Queue** tab, correct any misclassifications.
11. Set up ongoing sync: in the Apps Script editor, click the **Triggers**
    icon (clock, left sidebar) **> Add Trigger** > function `runSync` >
    Time-driven > Day timer (or hourly, your call). This is what makes it
    run automatically without you opening anything.

## PDF invoice parsing setup (one checkbox, no Cloud Console)

Gmail/Slack message *text* is scanned either way. To also read what's
*inside* PDF attachments (invoice number/amount that only appear in the
file, not the email body), enable one more built-in service:

1. In the Apps Script editor, click **Services** (the **+** next to
   "Services" in the left sidebar, below "Libraries").
2. Find **Drive API** in the list, select version **v2**, click **Add**.
3. Save. That's it — `PdfParser.gs` uses it automatically from then on.

Without this step, PDF attachments still get *noticed* (counted as an
"attachment signal" for classification) — they just won't have their
contents read, so invoice number/amount that only exist inside the PDF
stay blank until someone fills them in manually.

## Dashboard (optional, deploy as a Web App)

`Dashboard.gs` + `Dashboard.html` serve a live, styled dashboard — stats,
status breakdowns by vendor, and searchable tables for all six tabs — at
its own URL, without opening the spreadsheet.

1. In the Apps Script editor: **Deploy > New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. **Execute as**: Me. **Who has access**: *Anyone within [your domain]*
   (keeps it off the public internet but shareable with your team) —
   or *Only myself* if you just want it for you.
4. **Deploy** → authorize if prompted → copy the web app URL it gives you.
   Bookmark/share that URL; it's the dashboard.
5. **If you edit any code later** and want the *same* URL to reflect the
   change: **Deploy > Manage deployments** → pencil icon → **Version: New
   version** → **Deploy**. ("New deployment" instead would mint a second,
   different URL.)

## Slack setup (you create the bot — scopes needed)

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** →
   From scratch.
2. **OAuth & Permissions** → **Bot Token Scopes** → add exactly:
   `channels:history`, `channels:read`, `groups:history`, `groups:read`,
   `im:history`, `mpim:history`, `users:read`. No `write`/`chat:write`
   scopes — this tool never posts.
3. **Install App to Workspace** → copy the **Bot User OAuth Token**
   (`xoxb-...`) into the `SLACK_BOT_TOKEN` script property (step 8 above).
4. Invite the bot to every channel you listed in the Setup tab:
   `/invite @your-bot-name` in each channel. Un-invited channels fail
   silently with a log message, not a crash.

## Why this needed no Cloud Console

- **Gmail**: `GmailApp` is a built-in Apps Script service tied to the
  script's own auto-managed project — there's nothing for you to create,
  enable, or configure. The only prompt you see is the standard
  "this script wants to [read your Gmail]" authorization, which you grant
  once as yourself.
- **Slack**: plain HTTPS calls via `UrlFetchApp` to the Slack Web API,
  authenticated with the bot token you create in Slack's own UI — no
  Google involvement at all on that side.

## Quotas (consumer/Workspace Apps Script limits)

- Gmail read via `GmailApp`: effectively generous for this volume (well
  under the ~20,000/day Workspace ceiling, less on consumer Gmail but
  still far more than a few hundred invoice-related threads).
- `UrlFetchApp` (Slack calls): 20,000/day.
- Script execution: 6 minutes per run (consumer) / 30 minutes (Workspace).
  If a backfill run ever hits this on a very large mailbox, narrow the
  lookback window in the Setup tab and run it in smaller date slices.

## What this does NOT do (same Phase 1 guardrails as the Python version)

- Never sends, deletes, modifies, or forwards any email or Slack message.
- Never scans Slack channels/DMs outside the Setup tab's approved list.
- Gmail attachments: only PDF *content* is ever downloaded, and only to
  read invoice text out of it (via a temporary Drive OCR conversion that's
  deleted immediately after). Every other attachment type is still
  referenced by filename only. Slack attachments are filename-only, full
  stop — PDF parsing isn't wired up on the Slack side.
- Never marks anything "Submitted to P2P" without a concrete Aerchain
  link; default is always "Not submitted".
- Phase 2 (P2P/Aerchain reconciliation) isn't built — the schema already
  reserves the P2P Status columns for it.

## Files

| File | Purpose |
|---|---|
| `Config.gs` | Keyword/vendor lists, `getConfig()` reads the Setup tab |
| `Extractor.gs` | Regex signal extraction (vendor, invoice #, PO/PR, amount, dates, links) |
| `Classifier.gs` | Signals → detection category |
| `Matcher.gs` | 7-rule dedup matching against existing invoices |
| `SheetStore.gs` | Sheet schema + append/update helpers (append-only) |
| `Setup.gs` | `setupTracker()` — builds the six tabs |
| `ManualBackfillData.gs` | The historical manual-tracker data + `importManualTrackerBackfill()` |
| `GmailSource.gs` | `GmailApp`-based Gmail scanning |
| `SlackSource.gs` | `UrlFetchApp`-based Slack Web API scanning |
| `IngestionCore.gs` | Shared per-message classify → match → write pipeline |
| `Backfill.gs` | `runBackfill()` — historical scan |
| `Sync.gs` | `runSync()` — incremental scan, put this on a trigger |
| `Menu.gs` | Adds the "Invoice Automation" Sheet menu |
| `PdfParser.gs` | OCRs PDF attachments via Drive, feeds the text into the same extractor |
| `Dashboard.gs` / `Dashboard.html` | Live dashboard, deployed as a Web App |

This logic was tested offline (23 unit tests against synthetic and the
real manual-tracker data, run under Node before being pasted into Apps
Script) — see the conversation this was built in. The Gmail/Slack scanning
itself has now run live and found real invoices; the PDF-OCR path and the
dashboard are new and haven't been exercised against your live data yet —
check a few OCR'd results in the Invoice Register and open the dashboard
once deployed before trusting either fully.
