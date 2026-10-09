"""
Persists 'where we left off' so sync.py only processes new/changed messages:
Gmail's historyId, and per-Slack-channel last-seen timestamp. Stored as
plain JSON next to the workbook — no database needed for this volume.
"""
import json
import os

DEFAULT_STATE = {
    "gmail_history_id": None,
    "slack_channel_cursors": {},   # {channel_id: last_ts}
}


def load(path):
    if not os.path.exists(path):
        return dict(DEFAULT_STATE)
    with open(path) as f:
        data = json.load(f)
    return {**DEFAULT_STATE, **data}


def save(path, state):
    with open(path, "w") as f:
        json.dump(state, f, indent=2)
