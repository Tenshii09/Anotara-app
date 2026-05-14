"""Firebase Cloud Messaging helpers for device push delivery."""

from __future__ import annotations

import json

import requests
from flask import current_app
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account

from webapp.services.database import (
    delete_push_token,
    list_push_tokens,
    mark_weather_alert_notified,
    save_push_token,
)


def _load_service_account_credentials():
    service_account_json = current_app.config.get('FIREBASE_SERVICE_ACCOUNT_JSON', '').strip()
    service_account_path = current_app.config.get('FIREBASE_SERVICE_ACCOUNT_PATH', '').strip()
    scopes = ['https://www.googleapis.com/auth/firebase.messaging']

    if service_account_json:
        return service_account.Credentials.from_service_account_info(
            json.loads(service_account_json),
            scopes=scopes,
        )

    if service_account_path:
        return service_account.Credentials.from_service_account_file(
            service_account_path,
            scopes=scopes,
        )

    return None


def store_push_token(user_id, token, user_agent=None, platform='web'):
    save_push_token(user_id, token, user_agent=user_agent, platform=platform)


def remove_push_token(user_id, token):
    delete_push_token(user_id, token)


def send_push_to_user(user_id, payload):
    """Send a push payload to every stored FCM token for the user."""
    credentials = _load_service_account_credentials()
    project_id = current_app.config.get('FIREBASE_PROJECT_ID', '').strip() or getattr(
        credentials,
        'project_id',
        '',
    )
    if not project_id or credentials is None:
        return {
            'sent': 0,
            'failed': 0,
            'skipped': True,
            'reason': 'Firebase credentials are not configured.',
        }

    credentials.refresh(GoogleAuthRequest())
    access_token = credentials.token

    tokens = list_push_tokens(user_id)
    if not tokens:
        return {
            'sent': 0,
            'failed': 0,
            'skipped': True,
            'reason': 'No Firebase tokens are registered for this user.',
        }

    sent = 0
    failed = 0

    notification_title = payload.get('title') or 'Anotara weather alert'
    notification_body = payload.get('body') or 'Weather changed for one of your active itineraries.'
    message_data = {
        key: '' if value is None else str(value)
        for key, value in payload.items()
    }
    send_url = f'https://fcm.googleapis.com/v1/projects/{project_id}/messages:send'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json; charset=utf-8',
    }

    for token_row in tokens:
        message = {
            'message': {
                'token': token_row['token'],
                'notification': {
                    'title': notification_title,
                    'body': notification_body,
                },
                'data': message_data,
            }
        }

        try:
            response = requests.post(
                send_url,
                headers=headers,
                json=message,
                timeout=10,
            )
            if response.ok:
                sent += 1
                continue

            failed += 1
            if response.status_code in (400, 404):
                remove_push_token(user_id, token_row['token'])
        except requests.RequestException:
            failed += 1

    return {
        'sent': sent,
        'failed': failed,
        'skipped': False,
    }


def mark_weather_push_notified(itinerary_id, alert_key, notification_signature):
    mark_weather_alert_notified(itinerary_id, alert_key, notification_signature)