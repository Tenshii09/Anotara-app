"""Weather monitoring and smart suggestion helpers for itineraries."""

from __future__ import annotations

from datetime import datetime, timedelta

import requests

from webapp.services.database import (
    get_active_itineraries,
    get_indoor_place_alternatives,
    get_itinerary_overview,
    get_user_profile,
    list_weather_alerts,
    resolve_weather_alert,
    upsert_weather_alert,
)
from webapp.services.email_service import queue_email
from webapp.services.push_notifications import mark_weather_push_notified, send_push_to_user

RAINY_WEATHER_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
PRECIPITATION_THRESHOLD = 45
MONITOR_WINDOW_HOURS = 72
ALERT_KEY = 'weather-pivot'
ALERT_TYPE = 'weather-risk'


def _notification_signature(payload):
    return '|'.join(
        str(value)
        for value in (
            payload.get('headline'),
            payload.get('message'),
            payload.get('focus_day'),
            payload.get('precipitation_probability'),
            payload.get('weather_code'),
        )
    )


def _coerce_datetime(value):
    if isinstance(value, datetime):
        return value
    if not value:
        return None

    value_text = str(value)
    try:
        return datetime.fromisoformat(value_text)
    except ValueError:
        pass

    for pattern in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(value_text[:19], pattern)
        except ValueError:
            continue
    return None


def _within_monitor_window(created_at):
    parsed_created_at = _coerce_datetime(created_at)
    if not parsed_created_at:
        return True
    return datetime.utcnow() - parsed_created_at <= timedelta(hours=MONITOR_WINDOW_HOURS)


def _weather_snapshot(latitude, longitude):
    weather_url = 'https://api.open-meteo.com/v1/forecast'
    params = {
        'latitude': latitude,
        'longitude': longitude,
        'current': 'temperature_2m,weather_code',
        'daily': 'weather_code,precipitation_probability_max',
        'forecast_days': 1,
        'timezone': 'auto',
    }

    try:
        response = requests.get(weather_url, params=params, timeout=8)
        return response.json()
    except Exception:
        return None


def _get_weather_code(weather_data):
    daily = weather_data.get('daily') or {}
    weather_code = None

    if daily.get('weather_code'):
        weather_code = daily['weather_code'][0]
    elif (weather_data.get('current') or {}).get('weather_code') is not None:
        weather_code = weather_data['current']['weather_code']

    return weather_code


def _get_precipitation_probability(weather_data):
    daily = weather_data.get('daily') or {}
    if daily.get('precipitation_probability_max'):
        return int(daily['precipitation_probability_max'][0] or 0)
    return 0


def _focus_day(items):
    outdoor_days = {}
    for item in items:
        if str(item.get('environment_type') or '').lower() == 'outdoor':
            day_number = item.get('day_number')
            outdoor_days[day_number] = outdoor_days.get(day_number, 0) + 1

    if outdoor_days:
        return max(outdoor_days.items(), key=lambda item: (item[1], -item[0]))[0]

    if items:
        return items[0].get('day_number')

    return None


def build_weather_suggestion(itinerary_id, overview=None, persist=True):
    """Build a weather-aware suggestion payload and optionally persist it."""
    if overview is None:
        overview = get_itinerary_overview(itinerary_id)
    if not overview:
        return None

    itinerary = overview['itinerary']
    items = overview['items']

    latitude = itinerary.get('accommodation_lat')
    longitude = itinerary.get('accommodation_lng')
    if latitude is None or longitude is None:
        first_item = items[0] if items else None
        latitude = first_item.get('latitude') if first_item else None
        longitude = first_item.get('longitude') if first_item else None

    if latitude is None or longitude is None:
        return {
            'alert': False,
            'headline': 'No location data yet',
            'message': 'Add or regenerate an itinerary with coordinates to enable weather suggestions.',
            'indoor_alternatives': [],
            'focus_day': None,
        }

    weather_data = _weather_snapshot(latitude, longitude)
    if weather_data is None:
        return {
            'alert': False,
            'headline': 'Weather temporarily unavailable',
            'message': 'Weather suggestions are temporarily unavailable. The current itinerary was left unchanged.',
            'focus_day': _focus_day(items),
            'precipitation_probability': None,
            'weather_code': None,
            'indoor_alternatives': get_indoor_place_alternatives(
                itinerary.get('destination'),
                excluded_place_ids=[item.get('place_id') for item in items],
                limit=4,
            ),
            'weather_unavailable': True,
        }

    precipitation_probability = _get_precipitation_probability(weather_data)
    weather_code = _get_weather_code(weather_data)
    needs_indoor_pivot = precipitation_probability >= PRECIPITATION_THRESHOLD or weather_code in RAINY_WEATHER_CODES

    used_place_ids = [item.get('place_id') for item in items]
    indoor_alternatives = get_indoor_place_alternatives(
        itinerary.get('destination'),
        excluded_place_ids=used_place_ids,
        limit=4,
    )

    focus_day = _focus_day(items)
    if not needs_indoor_pivot:
        payload = {
            'alert': False,
            'headline': 'Weather looks clear',
            'message': 'No weather pivot is needed right now. Your current route can stay as planned.',
            'focus_day': focus_day,
            'precipitation_probability': precipitation_probability,
            'weather_code': weather_code,
            'indoor_alternatives': indoor_alternatives,
        }
        if persist:
            resolve_weather_alert(itinerary_id, ALERT_KEY)
        return payload

    payload = {
        'alert': True,
        'headline': 'Weather alert detected',
        'message': 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.',
        'focus_day': focus_day,
        'precipitation_probability': precipitation_probability,
        'weather_code': weather_code,
        'indoor_alternatives': indoor_alternatives,
    }
    payload['notification_signature'] = _notification_signature(payload)

    if persist:
        upsert_weather_alert(
            itinerary_id,
            ALERT_KEY,
            ALERT_TYPE,
            payload['headline'],
            payload['message'],
            payload,
        )

    return payload


def run_weather_monitor():
    """Check active itineraries and refresh stored weather alerts."""
    now = datetime.utcnow()
    summary = {
        'checked': 0,
        'alerted': 0,
        'cleared': 0,
        'skipped_outside_window': 0,
        'skipped_no_coordinates': 0,
        'errors': [],
    }

    for itinerary in get_active_itineraries():
        if not _within_monitor_window(itinerary.get('created_at')):
            summary['skipped_outside_window'] += 1
            continue

        itinerary_id = itinerary['id']
        try:
            overview = get_itinerary_overview(itinerary_id)
            if not overview:
                summary['errors'].append({'itinerary_id': itinerary_id, 'error': 'Itinerary not found'})
                continue

            prior_alerts = list_weather_alerts(itinerary_id, active_only=True)
            prior_alert = prior_alerts[0] if prior_alerts else None

            suggestion = build_weather_suggestion(itinerary_id, overview=overview, persist=True)
            if not suggestion:
                summary['errors'].append({'itinerary_id': itinerary_id, 'error': 'Could not build weather suggestion'})
                continue

            if suggestion.get('weather_unavailable'):
                summary['errors'].append({'itinerary_id': itinerary_id, 'error': 'Weather API unavailable'})
                continue

            if suggestion.get('focus_day') is None and not suggestion.get('alert'):
                summary['skipped_no_coordinates'] += 1
                continue

            summary['checked'] += 1
            if suggestion.get('alert'):
                summary['alerted'] += 1
                current_signature = suggestion.get('notification_signature')
                if current_signature and prior_alert and prior_alert.get('notification_signature') == current_signature:
                    continue

                push_result = send_push_to_user(overview['itinerary']['user_id'], {
                    'title': suggestion['headline'],
                    'body': suggestion['message'],
                    'url': '/itinerary',
                    'itinerary_id': itinerary_id,
                    'focus_day': suggestion.get('focus_day'),
                    'alert': True,
                    'notification_signature': current_signature,
                })
                summary.setdefault('push', []).append({
                    'itinerary_id': itinerary_id,
                    'result': push_result,
                })
                if current_signature:
                    mark_weather_push_notified(itinerary_id, ALERT_KEY, current_signature)
                if push_result.get('skipped') or push_result.get('sent', 0) == 0:
                    owner_profile = get_user_profile(overview['itinerary']['user_id'])
                    if owner_profile and owner_profile.get('email'):
                        queue_email({
                            'recipient_user_id': owner_profile.get('id'),
                            'recipient_email': owner_profile.get('email'),
                            'recipient_name': owner_profile.get('username'),
                            'subject': f'Weather alert for {suggestion["headline"]}',
                            'template_name': 'weather_alert',
                            'category': 'weather_alerts',
                            'context': {
                                'recipient_name': owner_profile.get('username'),
                                'destination': overview['itinerary'].get('destination'),
                            },
                        })
            else:
                summary['cleared'] += 1
        except Exception as error:
            summary['errors'].append({'itinerary_id': itinerary_id, 'error': str(error)})

    summary['checked_at'] = now.isoformat() + 'Z'
    return summary