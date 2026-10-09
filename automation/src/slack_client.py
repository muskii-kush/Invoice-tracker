"""
Read-only Slack client, scoped strictly to config/sources.yaml's
approved_channels / approved_dm_partners lists — it never enumerates or
reads channels/DMs outside that list, per the master prompt's "search only
the Slack channels and conversations explicitly approved by the user" and
"do not scan unrelated private conversations" requirements.

Untested against a live workspace (no Slack access in this environment) —
follows the documented Slack Web API shapes; run against one approved
channel first before a full backfill.
"""
import os

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def get_client(token_env_var="SLACK_BOT_TOKEN"):
    token = os.environ.get(token_env_var)
    if not token:
        raise RuntimeError(
            f"Set the {token_env_var} environment variable to a Slack bot token "
            f"with read-only scopes (channels:history, groups:history, im:history, "
            f"mpim:history, users:read). See README.md."
        )
    return WebClient(token=token)


def resolve_channel_id(client, name_or_id):
    if name_or_id.startswith("C") and name_or_id.isupper():
        return name_or_id
    cursor = None
    while True:
        resp = client.conversations_list(types="public_channel,private_channel", cursor=cursor, limit=200)
        for ch in resp["channels"]:
            if ch["name"] == name_or_id.lstrip("#"):
                return ch["id"]
        cursor = resp.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            return None


def list_channel_messages(client, channel_id, oldest_ts=None, approved_dm_partners=None):
    """
    Returns normalized message dicts for one approved channel/conversation:
    ts, user, text, files (filenames), permalink, thread_ts (if a reply).
    Thread replies are fetched separately via list_thread_replies.
    """
    out = []
    cursor = None
    while True:
        try:
            resp = client.conversations_history(
                channel=channel_id, oldest=oldest_ts, cursor=cursor, limit=200
            )
        except SlackApiError as e:
            raise RuntimeError(f"Slack history fetch failed for {channel_id}: {e.response['error']}")
        for msg in resp["messages"]:
            out.append(_normalize_message(client, channel_id, msg))
        cursor = resp.get("response_metadata", {}).get("next_cursor")
        if not resp.get("has_more") or not cursor:
            break
    return out


def list_thread_replies(client, channel_id, thread_ts):
    out = []
    cursor = None
    while True:
        resp = client.conversations_replies(channel=channel_id, ts=thread_ts, cursor=cursor, limit=200)
        for msg in resp["messages"]:
            if msg["ts"] == thread_ts:
                continue  # parent already captured by list_channel_messages
            out.append(_normalize_message(client, channel_id, msg))
        cursor = resp.get("response_metadata", {}).get("next_cursor")
        if not resp.get("has_more") or not cursor:
            break
    return out


def _normalize_message(client, channel_id, msg):
    files = [f.get("name", f.get("id", "")) for f in msg.get("files", [])]
    permalink = None
    try:
        permalink = client.chat_getPermalink(channel=channel_id, message_ts=msg["ts"])["permalink"]
    except SlackApiError:
        pass
    return {
        "ts": msg["ts"],
        "user": msg.get("user", msg.get("bot_id", "unknown")),
        "text": msg.get("text", ""),
        "files": files,
        "permalink": permalink,
        "thread_ts": msg.get("thread_ts"),
        "is_thread_reply": msg.get("thread_ts") is not None and msg.get("thread_ts") != msg["ts"],
    }
