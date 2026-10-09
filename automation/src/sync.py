"""
Incremental sync: only processes Gmail messages since the last stored
historyId and Slack messages since each channel's last-seen timestamp.
Same classify/match/write pipeline as backfill.py, just scoped to new
messages. Run via: python main.py sync
"""
from . import extractor, classifier, matcher, tracker_store, gmail_client, slack_client, state
from .backfill import _process_source_item, _invoice_keywords


def run_sync(config, workbook_path, state_path):
    wb = tracker_store.open_tracker(workbook_path)
    saved_state = state.load(state_path)
    known_vendors = tracker_store.known_vendors(wb) or config.get("known_vendors", [])
    report = {"gmail_new": 0, "slack_new": 0}

    if saved_state.get("gmail_history_id"):
        try:
            service = gmail_client.get_service(
                config["gmail"]["credentials_file"], config["gmail"]["token_file"]
            )
            new_ids, latest_history_id = gmail_client.get_history(service, saved_state["gmail_history_id"])
            for msg_id in new_ids:
                msg = gmail_client.get_message(service, msg_id)
                _process_source_item(
                    wb, _empty_backfill_report(), known_vendors,
                    source="Gmail", source_type="incremental",
                    received_date=msg["date"], sender=msg["sender"],
                    recipients_or_channel=msg["recipients"],
                    subject_or_preview=msg["subject"],
                    body_text=msg["subject"] + "\n" + msg["body_text"],
                    attachment_names=msg["attachment_names"],
                    original_link=msg["permalink"], is_thread_reply=False,
                )
                report["gmail_new"] += 1
            saved_state["gmail_history_id"] = latest_history_id
        except Exception as e:
            print(f"Gmail sync error (continuing): {e}")
    else:
        print("No stored Gmail historyId yet — run backfill first.")

    try:
        client = slack_client.get_client(config["slack"].get("token_env_var", "SLACK_BOT_TOKEN"))
        cursors = saved_state.setdefault("slack_channel_cursors", {})
        for channel in config["slack"].get("approved_channels", []):
            if not channel:
                continue
            channel_id = slack_client.resolve_channel_id(client, channel)
            if not channel_id:
                continue
            oldest = cursors.get(channel_id)
            messages = slack_client.list_channel_messages(client, channel_id, oldest_ts=oldest)
            for msg in messages:
                _process_source_item(
                    wb, _empty_backfill_report(), known_vendors,
                    source="Slack", source_type=f"channel:{channel}:incremental",
                    received_date=msg["ts"], sender=msg["user"],
                    recipients_or_channel=channel, subject_or_preview=msg["text"][:140],
                    body_text=msg["text"], attachment_names=msg["files"],
                    original_link=msg["permalink"], is_thread_reply=False,
                )
                report["slack_new"] += 1
                cursors[channel_id] = max(cursors.get(channel_id, "0"), msg["ts"])
    except RuntimeError as e:
        print(f"Slack: {e} — skipping.")
    except Exception as e:
        print(f"Slack sync error (continuing): {e}")

    tracker_store.save_tracker(wb, workbook_path)
    state.save(state_path, saved_state)
    return report


def _empty_backfill_report():
    return {
        "vendors_discovered": set(), "likely_invoice": 0, "possible_invoice": 0,
        "needs_review": 0, "duplicates": 0, "confirmed_unique_invoices": 0,
        "invoices_missing_number": 0, "invoices_missing_amount": 0,
        "invoices_missing_dates": 0, "invoices_with_p2p_links": 0,
    }
