"""
Read-only Gmail client. Uses the installed-app OAuth flow against a Google
Cloud project you create yourself (see README.md) — this code never embeds
or requests write/send scopes.

This module is untested against a live inbox (no Gmail access exists in the
environment this was built in) — the API calls follow the documented Gmail
API v1 shapes, but run a small `--dry-run` search first before trusting it
against your real mailbox.
"""
import base64
import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Read-only, full stop. Do not widen this without re-reading the master
# prompt's "read-only access to Gmail and Slack initially" requirement.
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


def get_service(credentials_file, token_file):
    creds = None
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(credentials_file, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_file, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def build_search_queries(config, invoice_keywords):
    """
    Build a list of Gmail search strings covering every permitted source in
    config['gmail'] / config['vikram'] — emails to/cc Vikram, group/alias
    mail, vendor-domain mail, and keyword/attachment signals. Returned as a
    list (not one giant OR) so each query stays under Gmail's query length
    limits and results can be tagged with which source rule matched.
    """
    queries = []
    lookback = f"newer_than:{config['gmail'].get('lookback_months', 12) * 30}d"

    vikram_email = config.get("vikram", {}).get("email")
    if vikram_email:
        queries.append((f"to:{vikram_email} {lookback}", "to:Vikram"))
        queries.append((f"cc:{vikram_email} {lookback}", "cc:Vikram"))

    for alias in config["gmail"].get("groups_and_aliases", []):
        if alias:
            queries.append((f"to:{alias} {lookback}", f"group:{alias}"))

    for domain in config["gmail"].get("vendor_domains", []):
        if domain:
            queries.append((f"from:@{domain} {lookback}", f"vendor-domain:{domain}"))

    kw_query = " OR ".join(f'"{kw}"' for kw in invoice_keywords)
    queries.append((f"({kw_query}) has:attachment {lookback}", "keyword+attachment"))
    queries.append((f"({kw_query}) {lookback}", "keyword"))

    return queries


def list_message_ids(service, query, max_results=500):
    ids = []
    request = service.users().messages().list(userId="me", q=query, maxResults=min(max_results, 500))
    while request is not None and len(ids) < max_results:
        response = request.execute()
        ids.extend(m["id"] for m in response.get("messages", []))
        request = service.users().messages().list_next(request, response)
    return ids[:max_results]


def _decode_part(part):
    data = part.get("body", {}).get("data")
    if not data:
        return ""
    return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")


def _walk_parts(payload, texts, attachments):
    mime = payload.get("mimeType", "")
    filename = payload.get("filename")
    if filename:
        attachments.append(filename)
    if mime in ("text/plain", "text/html") and payload.get("body", {}).get("data"):
        texts.append(_decode_part(payload))
    for sub in payload.get("parts", []) or []:
        _walk_parts(sub, texts, attachments)


def get_message(service, msg_id):
    """
    Returns a normalized dict: id, thread_id, subject, sender, recipients,
    date, body_text, attachment_names, permalink. Attachments are listed by
    filename only — content is not downloaded unless explicitly needed
    (master prompt: "do not download or duplicate sensitive attachments
    unless required").
    """
    msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
    headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
    texts, attachments = [], []
    _walk_parts(msg["payload"], texts, attachments)

    return {
        "id": msg_id,
        "thread_id": msg.get("threadId"),
        "subject": headers.get("subject", ""),
        "sender": headers.get("from", ""),
        "recipients": headers.get("to", "") + ((" ; cc: " + headers["cc"]) if "cc" in headers else ""),
        "date": headers.get("date", ""),
        "body_text": "\n".join(texts),
        "attachment_names": attachments,
        "permalink": f"https://mail.google.com/mail/u/0/#all/{msg_id}",
    }


def get_history(service, start_history_id):
    """For incremental sync: messages added since the last processed historyId."""
    ids = set()
    request = service.users().history().list(
        userId="me", startHistoryId=start_history_id, historyTypes=["messageAdded"]
    )
    while request is not None:
        response = request.execute()
        for record in response.get("history", []):
            for m in record.get("messagesAdded", []):
                ids.add(m["message"]["id"])
        request = service.users().history().list_next(request, response)
    latest_history_id = service.users().getProfile(userId="me").execute()["historyId"]
    return list(ids), latest_history_id
