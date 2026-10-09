#!/usr/bin/env python3
"""
CLI entrypoint for the invoice-tracking automation.

    python main.py backfill      # historical scan, 6-12 months (see config)
    python main.py sync          # incremental scan, only new messages

Both commands read config/sources.yaml and write into the workbook at
../Invoice Automation Tracker.xlsx (override with --workbook).
"""
import argparse
import json
import os

import yaml

from src import backfill, sync

DEFAULT_WORKBOOK = os.path.join(os.path.dirname(__file__), "..", "Invoice Automation Tracker.xlsx")
DEFAULT_STATE = os.path.join(os.path.dirname(__file__), "state.json")
DEFAULT_CONFIG = os.path.join(os.path.dirname(__file__), "config", "sources.yaml")


def load_config(path):
    with open(path) as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["backfill", "sync"])
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--workbook", default=DEFAULT_WORKBOOK)
    parser.add_argument("--state", default=DEFAULT_STATE)
    args = parser.parse_args()

    config = load_config(args.config)

    if not config.get("vikram", {}).get("email") and not config["gmail"].get("groups_and_aliases"):
        print(
            "config/sources.yaml has no Gmail addresses/aliases configured yet.\n"
            "Fill in at least 'vikram.email' or one entry under 'gmail.groups_and_aliases'\n"
            "before running backfill/sync. See README.md."
        )

    if args.command == "backfill":
        report = backfill.run_backfill(config, args.workbook, args.state)
        print(json.dumps(report, indent=2, default=str))
    else:
        report = sync.run_sync(config, args.workbook, args.state)
        print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
