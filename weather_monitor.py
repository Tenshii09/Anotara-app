"""Standalone entrypoint for the weather monitor worker."""

import argparse
import json
import time

from app import app
from webapp.services.weather_monitor import run_weather_monitor


def _run_once():
    with app.app_context():
        result = run_weather_monitor()
    print(json.dumps(result, indent=2, default=str))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run the Anotara weather monitor.')
    parser.add_argument('--loop', action='store_true', help='Run continuously on a fixed interval.')
    parser.add_argument('--interval', type=int, default=21600, help='Seconds to wait between checks when looping.')
    args = parser.parse_args()

    if args.loop:
        while True:
            _run_once()
            time.sleep(max(60, int(args.interval)))
    else:
        _run_once()