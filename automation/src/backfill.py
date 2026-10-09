"""
Historical backfill: scans the configured Gmail sources and approved Slack
channels, classifies every message, matches against existing Invoice
Register rows, and writes Source Inbox / Invoice Register / Activity Log /
Review Queue entries. Never sends, deletes, modifies, or forwards anything
(read-only clients enforce this at the API-scope level too).

Run via: python main.py backfill
"""
from . import extractor, classifier, matcher, tracker_store, gmail_client, slack_client, state


def run_backfill(config, workbook_path, state_path):
    wb = tracker_store.open_tracker(workbook_path)
    saved_state = state.load(state_path)
    known_vendors = tracker_store.known_vendors(wb) or config.get("known_vendors", [])

    report = {
        "total_gmail_scanned": 0,
        "total_slack_scanned": 0,
        "likely_invoice": 0,
        "possible_invoice": 0,
        "confirmed_unique_invoices": 0,
        "duplicates": 0,
        "needs_review": 0,
        "vendors_discovered": set(),
        "invoices_missing_number": 0,
        "invoices_missing_amount": 0,
        "invoices_missing_dates": 0,
        "invoices_with_p2p_links": 0,
    }

    # --- Gmail ---
    try:
        service = gmail_client.get_service(
            config["gmail"]["credentials_file"], config["gmail"]["token_file"]
        )
        queries = gmail_client.build_search_queries(config, _invoice_keywords())
        seen_ids = set()
        for query, source_tag in queries:
            for msg_id in gmail_client.list_message_ids(service, query):
                if msg_id in seen_ids:
                    continue
                seen_ids.add(msg_id)
                msg = gmail_client.get_message(service, msg_id)
                _process_source_item(
                    wb, report, known_vendors,
                    source="Gmail", source_type=source_tag,
                    received_date=msg["date"], sender=msg["sender"],
                    recipients_or_channel=msg["recipients"],
                    subject_or_preview=msg["subject"],
                    body_text=msg["subject"] + "\n" + msg["body_text"],
                    attachment_names=msg["attachment_names"],
                    original_link=msg["permalink"],
                    is_thread_reply=False,
                )
                report["total_gmail_scanned"] += 1
        profile = service.users().getProfile(userId="me").execute()
        saved_state["gmail_history_id"] = profile["historyId"]
    except FileNotFoundError:
        print("Gmail: no credentials.json found — skipping Gmail backfill. See README.md.")
    except Exception as e:
        print(f"Gmail backfill error (continuing): {e}")

    # --- Slack ---
    try:
        client = slack_client.get_client(config["slack"].get("token_env_var", "SLACK_BOT_TOKEN"))
        for channel in config["slack"].get("approved_channels", []):
            if not channel:
                continue
            channel_id = slack_client.resolve_channel_id(client, channel)
            if not channel_id:
                print(f"Slack: could not resolve channel '{channel}' — skipping")
                continue
            messages = slack_client.list_channel_messages(client, channel_id)
            for msg in messages:
                _process_source_item(
                    wb, report, known_vendors,
                    source="Slack", source_type=f"channel:{channel}",
                    received_date=msg["ts"], sender=msg["user"],
                    recipients_or_channel=channel,
                    subject_or_preview=msg["text"][:140],
                    body_text=msg["text"],
                    attachment_names=msg["files"],
                    original_link=msg["permalink"],
                    is_thread_reply=False,
                )
                report["total_slack_scanned"] += 1
                if msg.get("thread_ts") == msg["ts"]:
                    for reply in slack_client.list_thread_replies(client, channel_id, msg["ts"]):
                        _process_source_item(
                            wb, report, known_vendors,
                            source="Slack", source_type=f"channel:{channel}:thread",
                            received_date=reply["ts"], sender=reply["user"],
                            recipients_or_channel=channel,
                            subject_or_preview=reply["text"][:140],
                            body_text=reply["text"],
                            attachment_names=reply["files"],
                            original_link=reply["permalink"],
                            is_thread_reply=True,
                        )
                        report["total_slack_scanned"] += 1
    except RuntimeError as e:
        print(f"Slack: {e} — skipping Slack backfill.")
    except Exception as e:
        print(f"Slack backfill error (continuing): {e}")

    tracker_store.save_tracker(wb, workbook_path)
    state.save(state_path, saved_state)
    report["vendors_discovered"] = sorted(report["vendors_discovered"])
    return report


def _invoice_keywords():
    from . import constants
    return constants.INVOICE_KEYWORDS


def _process_source_item(wb, report, known_vendors, *, source, source_type, received_date,
                          sender, recipients_or_channel, subject_or_preview, body_text,
                          attachment_names, original_link, is_thread_reply):
    signals = extractor.extract_all(body_text, attachment_names, known_vendors)
    category, confidence, reasons = classifier.classify(body_text, signals, is_thread_reply)

    if signals.get("vendor"):
        report["vendors_discovered"].add(signals["vendor"])
    if category == "Likely invoice":
        report["likely_invoice"] += 1
    elif category == "Possible invoice":
        report["possible_invoice"] += 1
    elif category == "Needs manual review":
        report["needs_review"] += 1

    existing_invoices = tracker_store.all_invoices(wb)
    matched_id, rule = matcher.match(signals, existing_invoices)

    source_record = {
        "Source": source,
        "Source Type": source_type,
        "Received Date": received_date,
        "Sender": sender,
        "Recipients or Channel": recipients_or_channel,
        "Subject or Message Preview": subject_or_preview,
        "Attachment Names": ", ".join(attachment_names or []),
        "Shared Links": ", ".join(signals.get("p2p_links", [])),
        "Detected Vendor": signals.get("vendor") or "",
        "Detected Invoice Number": ", ".join(signals.get("invoice_numbers", [])),
        "Detected Amount": signals["amounts"][0] if signals.get("amounts") else "",
        "Detected PO / PR Number": ", ".join(signals.get("po_numbers", []) + signals.get("pr_numbers", [])),
        "Matched Invoice ID": matched_id or "",
        "Detection Status": category,
        "Review Notes": "; ".join(reasons),
        "Original Message Link": original_link or "",
    }
    source_id = tracker_store.append_row(wb, "Source Inbox", source_record)

    if matched_id:
        report["duplicates"] += 1
        tracker_store.append_row(wb, "Activity Log", {
            "Invoice ID": matched_id, "Activity Date": received_date, "Source": source,
            "Actor": "automation", "Activity Type": "Duplicate detected",
            "Details": f"{source_id} matched existing {matched_id} via {rule}",
            "Outcome": "Linked, no new invoice row created", "Source Link": original_link or "",
        })
        return

    if category in ("Likely invoice", "Possible invoice"):
        invoice_id = tracker_store.append_row(wb, "Invoice Register", {
            "Vendor": signals.get("vendor") or "",
            "Invoice Number": ", ".join(signals.get("invoice_numbers", [])),
            "Invoice Amount": signals["amounts"][0] if signals.get("amounts") else "",
            "Currency": signals.get("currency") or "",
            "Due Date": signals["dates"][0].isoformat() if signals.get("dates") else "",
            "Description": subject_or_preview,
            "PO Number": ", ".join(signals.get("po_numbers", [])),
            "PR Number": ", ".join(signals.get("pr_numbers", [])),
            "P2P / Aerchain Link": ", ".join(signals.get("p2p_links", [])),
            "Source Type": source, "Source Message ID": source_id,
            "Source Message Link": original_link or "", "Source Received Date": received_date,
            "Attachment Name": ", ".join(attachment_names or []),
            "Detection Confidence": confidence,
            "Intake Status": "New" if category == "Likely invoice" else "Needs review",
            "P2P Status": "Not submitted",
            "Remarks": "; ".join(reasons),
        })
        tracker_store.update_cell(wb, "Source Inbox", source_id, "Matched Invoice ID", invoice_id)
        tracker_store.append_row(wb, "Activity Log", {
            "Invoice ID": invoice_id, "Activity Date": received_date, "Source": source,
            "Actor": "automation", "Activity Type": "Invoice identified",
            "Details": f"Created from {source_id} ({category}, confidence {confidence})",
            "Outcome": "New invoice record created", "Source Link": original_link or "",
        })
        if category == "Likely invoice":
            report["confirmed_unique_invoices"] += 1
        if not signals.get("invoice_numbers"):
            report["invoices_missing_number"] += 1
        if not signals.get("amounts"):
            report["invoices_missing_amount"] += 1
        if not signals.get("dates"):
            report["invoices_missing_dates"] += 1
        if signals.get("p2p_links"):
            report["invoices_with_p2p_links"] += 1
        return

    if category == "Needs manual review":
        tracker_store.append_row(wb, "Review Queue", {
            "Linked Source Record ID": source_id,
            "Reason For Review": "; ".join(reasons) or "Ambiguous signals",
            "Detected Signals": str(signals),
            "Suggested Vendor": signals.get("vendor") or "",
            "Suggested Invoice Number": ", ".join(signals.get("invoice_numbers", [])),
            "Suggested Amount": signals["amounts"][0] if signals.get("amounts") else "",
            "Status": "Open",
            "Original Message Link": original_link or "",
        })
