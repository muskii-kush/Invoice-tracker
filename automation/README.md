# Technology-Invoice Tracking Automation — Phase 1

Reads permitted Gmail sources and approved Slack channels, classifies
messages, extracts invoice/PO/PR/vendor signals, deduplicates against
existing records, and writes everything into
`../Invoice Automation Tracker.xlsx`. Never sends, deletes, modifies, or
forwards anything — read-only scopes are enforced at the API-credential
level, not just in application logic.

## What's already done

`Invoice Automation Tracker.xlsx` (in the parent folder) has already been
built and populated by backfilling your existing **manual tracker**
(`Manual Tracker (Original, Preserved).xlsx` — an untouched copy of what you
gave us). That covers everything the manual tracker already knew about.
It does **not** yet include your live Gmail/Slack history — that requires
the credential setup below, then running `python main.py backfill`.

Open the **Setup** tab in the workbook first — it documents what was
backfilled, what still needs configuring, and every keyword/vendor/status
list the engine uses.

## Project layout

```
automation/
  main.py               CLI: backfill | sync
  build_workbook.py      one-time: (re)build the workbook FROM the manual tracker
  config/sources.yaml     Gmail/Slack scope — fill this in before running backfill/sync
  src/
    extractor.py          regex-based signal extraction (vendor, invoice #, PO/PR, amount, dates, P2P links)
    classifier.py          turns signals into Likely/Possible/Follow-up/... categories
    matcher.py             dedup matching, priority-ordered per the spec
    tracker_store.py        openpyxl read/write layer for the workbook (append-only)
    gmail_client.py          Gmail API v1, read-only OAuth
    slack_client.py          Slack Web API, read-only bot token
    backfill.py / sync.py    orchestration
    state.py                 tracks last-processed Gmail historyId / Slack cursors
  tests/test_extractor.py  offline unit tests (synthetic data — run any time with pytest)
```

## Setup

```bash
cd automation
pip install -r requirements.txt
cp .env.example .env   # then edit .env with your Slack token
```

### 1. Gmail (read-only OAuth)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   (or pick) a project.
2. **APIs & Services → Library** → enable "Gmail API".
3. **APIs & Services → OAuth consent screen** → set up as Internal (if on a
   Workspace domain) or External + add yourself as a test user.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Desktop app**.
5. Download the JSON, save it as `automation/credentials.json`.
6. First run of `python main.py backfill` opens a browser window for you to
   sign in and approve the **read-only** Gmail scope
   (`gmail.readonly` — never write/send). This creates `token.json`, which
   is reused (and auto-refreshed) on every later run.

### 2. Slack (read-only bot token)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
   → From scratch.
2. **OAuth & Permissions** → **Bot Token Scopes** → add:
   `channels:history`, `channels:read`, `groups:history`, `groups:read`,
   `im:history`, `mpim:history`, `users:read`. Do **not** add any `write`,
   `chat:write`, or `channels:manage` scopes — this tool never posts.
3. **Install App to Workspace**, copy the **Bot User OAuth Token**
   (`xoxb-...`) into `.env` as `SLACK_BOT_TOKEN`.
4. Invite the bot to each channel you want it to read
   (`/invite @your-bot-name` in Slack), or it will fail to fetch history
   for that channel.
5. Slack's Bot Token search API only reaches channels the bot has joined —
   there is intentionally no "search everything" mode; only what's listed
   in `config/sources.yaml → slack.approved_channels` is ever touched.

### 3. Fill in `config/sources.yaml`

Add Vikram's email, the finance/procurement/IT/AP group addresses, known
vendor domains, and the approved Slack channel list. Nothing is contacted
until you run a command below.

## Running it

```bash
python main.py backfill   # historical scan (default 12 months, see sources.yaml)
python main.py sync       # incremental — only new/changed messages since last run
```

Both print a JSON summary and write into the workbook. Schedule `sync` via
cron/launchd (macOS) or Task Scheduler (Windows) for ongoing collection —
this repo doesn't include a scheduler itself since that's environment-
specific.

## Tests

```bash
python -m pytest tests/ -v
```

These run entirely offline against synthetic sample messages — they prove
the classification/extraction/matching logic behaves per spec, but they
are **not** a substitute for a small live dry run. Before trusting a full
backfill, run it against one Gmail query / one Slack channel first and
check the Source Inbox rows it produces.

## What this does NOT do (by design, Phase 1)

- Never sends, deletes, modifies, or forwards any email or Slack message.
- Never scans Slack channels/DMs outside `config/sources.yaml`'s approved
  list.
- Never downloads attachment *content* — only filenames/links are stored.
- Never auto-marks anything as "Submitted to P2P" without a concrete
  Aerchain link or explicit signal; default is always "Not submitted".
- Phase 2 (P2P/Aerchain reconciliation, submission tracking) is not built
  yet — the Invoice Register schema already has the P2P Status/columns
  reserved for it.
