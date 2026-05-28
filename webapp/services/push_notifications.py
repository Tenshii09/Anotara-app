"""Firebase Cloud Messaging helpers for device push delivery."""

from __future__ import annotations

import json
import os
from glob import glob
from urllib.parse import urljoin, urlparse

import requests
from flask import current_app
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account
import firebase_admin
from firebase_admin import credentials as firebase_credentials
from firebase_admin import messaging

from webapp.services.database import (
    delete_push_token,
    list_push_tokens,
    mark_weather_alert_notified,
    save_push_token,
)

_last_credential_error = ''
_firebase_admin_app = None


def _set_credential_error(message):
    global _last_credential_error
    _last_credential_error = message
    if message:
        print(f'FIREBASE CREDENTIAL ERROR: {message}')
        current_app.logger.warning(message)


def _get_credential_error():
    return _last_credential_error


def _project_root():
    return os.path.abspath(os.path.join(current_app.root_path, '..'))


def _candidate_service_account_paths(configured_path):
    root = _project_root()
    candidates = []

    if configured_path:
        candidates.append(os.path.expanduser(os.path.expandvars(configured_path)))

    candidates.extend([
        os.path.join(root, 'firebase-service-account.json'),
        os.path.join(root, 'firebase-adminsdk.json'),
        os.path.join(root, 'anotarasystem-firebase-adminsdk-fbsvc-68333f97d3.json'),
    ])
    candidates.extend(glob(os.path.join(root, '*firebase*adminsdk*.json')))
    candidates.extend(glob(os.path.join(root, '*service*account*.json')))

    seen = set()
    unique_candidates = []
    for path in candidates:
        normalized = os.path.abspath(path)
        if normalized.lower() in seen:
            continue
        seen.add(normalized.lower())
        unique_candidates.append(normalized)

    return unique_candidates


def _load_service_account_credentials():
    global _last_credential_error
    _last_credential_error = ''
    service_account_json = current_app.config.get('FIREBASE_SERVICE_ACCOUNT_JSON', '').strip()
    service_account_path = current_app.config.get('FIREBASE_SERVICE_ACCOUNT_PATH', '').strip()
    scopes = ['https://www.googleapis.com/auth/firebase.messaging']

    if service_account_json:
        try:
            return service_account.Credentials.from_service_account_info(
                json.loads(service_account_json),
                scopes=scopes,
            )
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            _set_credential_error(f'Invalid Firebase service account JSON: {exc}')
            return None

    if service_account_path:
        current_app.logger.info('Configured Firebase service account path: %s', service_account_path)

    checked_paths = _candidate_service_account_paths(service_account_path)
    for candidate_path in checked_paths:
        if not os.path.exists(candidate_path):
            continue

        try:
            current_app.logger.info('Loading Firebase service account file: %s', candidate_path)
            return service_account.Credentials.from_service_account_file(
                candidate_path,
                scopes=scopes,
            )
        except (OSError, ValueError) as exc:
            _set_credential_error(
                f'Unable to load Firebase service account file {candidate_path}: {exc}'
            )
            return None

    if checked_paths:
        _set_credential_error(
            'Firebase service account file was not found. Checked: '
            + ', '.join(checked_paths)
        )
    else:
        _set_credential_error(
            'Firebase service account credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON '
            'or add firebase-service-account.json to the project root.'
        )
    return None


def _load_service_account_info():
    service_account_json = current_app.config.get('FIREBASE_SERVICE_ACCOUNT_JSON', '').strip()
    service_account_path = current_app.config.get('FIREBASE_SERVICE_ACCOUNT_PATH', '').strip()

    if service_account_json:
        try:
            return json.loads(service_account_json)
        except json.JSONDecodeError as exc:
            _set_credential_error(f'Invalid Firebase service account JSON: {exc}')
            return None

    checked_paths = _candidate_service_account_paths(service_account_path)
    for candidate_path in checked_paths:
        if not os.path.exists(candidate_path):
            continue

        try:
            with open(candidate_path, 'r', encoding='utf-8') as service_account_file:
                return json.load(service_account_file)
        except (OSError, json.JSONDecodeError) as exc:
            _set_credential_error(
                f'Unable to load Firebase service account file {candidate_path}: {exc}'
            )
            return None

    _set_credential_error(
        'Firebase service account file was not found. Checked: '
        + ', '.join(checked_paths)
    )
    return None


def _get_firebase_admin_app():
    global _firebase_admin_app, _last_credential_error
    _last_credential_error = ''

    if _firebase_admin_app:
        return _firebase_admin_app

    service_account_info = _load_service_account_info()
    if not service_account_info:
        return None

    project_id = current_app.config.get('FIREBASE_PROJECT_ID', '').strip() or service_account_info.get('project_id')
    if not project_id:
        _set_credential_error('Firebase project id is missing from config and service account credentials.')
        return None

    app_name = f"anotara-{project_id}"
    try:
        _firebase_admin_app = firebase_admin.get_app(app_name)
    except ValueError:
        _firebase_admin_app = firebase_admin.initialize_app(
            firebase_credentials.Certificate(service_account_info),
            {'projectId': project_id},
            name=app_name,
        )

    return _firebase_admin_app


def store_push_token(user_id, token, user_agent=None, platform='web'):
    save_push_token(user_id, token, user_agent=user_agent, platform=platform)


def remove_push_token(user_id, token):
    delete_push_token(user_id, token)


def subscribe_token_to_topic(token, topic='all_users'):
    """Subscribe one FCM registration token to a Firebase topic."""
    cleaned_token = str(token or '').strip()
    cleaned_topic = str(topic or 'all_users').strip()
    if not cleaned_token:
        return {'success_count': 0, 'failure_count': 0, 'skipped': True, 'reason': 'token is required'}

    app = _get_firebase_admin_app()
    if app is None:
        return {
            'success_count': 0,
            'failure_count': 0,
            'skipped': True,
            'reason': _get_credential_error() or 'Firebase Admin is not configured.',
        }

    try:
        response = messaging.subscribe_to_topic([cleaned_token], cleaned_topic, app=app)
        errors = [
            {'index': error.index, 'reason': error.reason}
            for error in response.errors
        ]
        return {
            'success_count': response.success_count,
            'failure_count': response.failure_count,
            'skipped': False,
            'errors': errors,
        }
    except Exception as exc:
        current_app.logger.exception(
            'Firebase topic subscription failed topic=%s token=%s error=%s',
            cleaned_topic,
            _token_debug_id(cleaned_token),
            exc,
        )
        return {
            'success_count': 0,
            'failure_count': 1,
            'skipped': False,
            'reason': str(exc),
        }


def _token_debug_id(token):
    if not token:
        return 'empty-token'
    return f'{token[:8]}...{token[-6:]}'


def _response_json(response):
    try:
        return response.json()
    except ValueError:
        return None


def _fcm_error_code(response_json):
    error = (response_json or {}).get('error') or {}
    for detail in error.get('details') or []:
        if detail.get('@type') == 'type.googleapis.com/google.firebase.fcm.v1.FcmError':
            return detail.get('errorCode')
    return error.get('status')


def _should_remove_rejected_token(response, response_json):
    error_code = _fcm_error_code(response_json)
    if response.status_code == 404 and error_code == 'UNREGISTERED':
        return True
    if response.status_code == 400 and error_code in {'INVALID_ARGUMENT', 'UNREGISTERED'}:
        return True
    if response.status_code == 403 and error_code == 'SENDER_ID_MISMATCH':
        return True
    if response.status_code == 401 and error_code == 'THIRD_PARTY_AUTH_ERROR':
        return True
    return False


def _fcm_rejection_reason(response_json):
    error = (response_json or {}).get('error') or {}
    error_code = _fcm_error_code(response_json)
    message = error.get('message') or 'Firebase rejected the push message.'
    if error_code == 'SENDER_ID_MISMATCH':
        configured_project = current_app.config.get('FIREBASE_PROJECT_ID', '')
        current_app.logger.error(
            'Firebase sender/project mismatch: backend_project=%s provider_message=%s',
            configured_project,
            message,
        )
        return (
            f'{message}. The browser token was created by a different Firebase sender/project '
            f'than backend project {configured_project}. Make client/.env Firebase values and '
            f'the backend service-account JSON come from the same Firebase project, then re-register push.'
        )
    if error_code == 'THIRD_PARTY_AUTH_ERROR':
        return (
            f'{message}. Firebase rejected the web push authentication for this browser token. '
            'Hard reset push notifications, restart Vite, then re-register with the current VAPID key.'
        )
    return message


def _client_fcm_error_message(response_json):
    error_code = _fcm_error_code(response_json)
    if error_code == 'SENDER_ID_MISMATCH':
        return (
            'Firebase project mismatch. Update client/.env to use the same Firebase project as '
            'the backend service account, then restart Vite and re-register push notifications.'
        )
    if error_code == 'THIRD_PARTY_AUTH_ERROR':
        return (
            'Firebase rejected the saved browser push credentials. Click Hard Reset Push, restart Vite, '
            'refresh the page, and test again so a fresh token is created with the current VAPID key.'
        )
    return _fcm_rejection_reason(response_json)


def _absolute_frontend_url(path_or_url):
    value = str(path_or_url or '/itinerary').strip() or '/itinerary'
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        return value

    frontend_url = str(current_app.config.get('FRONTEND_URL') or '').rstrip('/')
    if not frontend_url:
        return value

    return urljoin(f'{frontend_url}/', value.lstrip('/'))


def _build_fcm_message(token, payload):
    notification_title = payload.get('title') or 'Anotara weather alert'
    notification_body = payload.get('body') or 'Weather changed for one of your active itineraries.'
    target_url = payload.get('url') or '/itinerary'
    click_url = _absolute_frontend_url(target_url)
    message_data = {
        key: '' if value is None else str(value)
        for key, value in payload.items()
    }
    message_data.setdefault('title', notification_title)
    message_data.setdefault('body', notification_body)
    message_data.setdefault('url', target_url)

    message = {
        'message': {
            'token': token,
            'notification': {
                'title': notification_title,
                'body': notification_body,
            },
            'data': message_data,
            'webpush': {
                'notification': {
                    'title': notification_title,
                    'body': notification_body,
                    'icon': payload.get('icon') or '/ano-tara-notification-icon.png',
                    'badge': payload.get('badge') or '/ano-tara-notification-icon.png',
                    'tag': payload.get('tag') or 'anotara-push',
                },
            },
        },
    }
    if urlparse(click_url).scheme == 'https':
        message['message']['webpush']['fcm_options'] = {'link': click_url}
    return message


def _build_admin_topic_message(topic, payload):
    notification_title = payload.get('title') or 'Ano-Tara! System Alert'
    notification_body = payload.get('body') or 'New update from Ano Tara.'
    target_url = payload.get('url') or '/notifications'
    click_url = _absolute_frontend_url(target_url)
    message_data = {
        key: '' if value is None else str(value)
        for key, value in payload.items()
    }
    message_data.setdefault('title', notification_title)
    message_data.setdefault('body', notification_body)
    message_data.setdefault('url', target_url)

    message = messaging.Message(
        topic=topic,
        notification=messaging.Notification(
            title=notification_title,
            body=notification_body,
        ),
        data=message_data,
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(
                title=notification_title,
                body=notification_body,
                icon=payload.get('icon') or '/ano-tara-notification-icon.png',
                badge=payload.get('badge') or '/ano-tara-notification-icon.png',
                tag=payload.get('tag') or 'anotara-admin-broadcast',
            ),
            fcm_options=messaging.WebpushFCMOptions(link=click_url)
            if urlparse(click_url).scheme == 'https'
            else None,
        ),
    )
    return message


def send_push_to_topic(topic, payload):
    """Send one Firebase Admin notification to an FCM topic."""
    app = _get_firebase_admin_app()
    if app is None:
        return {
            'sent': 0,
            'failed': 0,
            'skipped': True,
            'reason': _get_credential_error() or 'Firebase Admin is not configured.',
            'topic': topic,
        }

    try:
        response = messaging.send(_build_admin_topic_message(topic, payload), app=app)
        current_app.logger.info(
            'FCM topic push accepted topic=%s response=%s payload=%s',
            topic,
            response,
            json.dumps(payload, default=str),
        )
        return {
            'sent': 1,
            'failed': 0,
            'skipped': False,
            'topic': topic,
            'response': response,
        }
    except Exception as exc:
        current_app.logger.exception(
            'FCM topic push failed topic=%s payload=%s error=%s',
            topic,
            json.dumps(payload, default=str),
            exc,
        )
        return {
            'sent': 0,
            'failed': 1,
            'skipped': False,
            'topic': topic,
            'errors': [{'reason': str(exc)}],
        }


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
            'reason': _get_credential_error() or 'Firebase credentials are not configured.',
        }

    tokens = list_push_tokens(user_id)
    if not tokens:
        return {
            'sent': 0,
            'failed': 0,
            'skipped': True,
            'reason': 'No Firebase tokens are registered for this user.',
        }

    try:
        current_app.logger.info('Refreshing Firebase credentials for project %s', project_id)
        credentials.refresh(GoogleAuthRequest())
    except Exception as exc:
        current_app.logger.exception(
            'Firebase credential refresh failed for project %s: %s',
            project_id,
            exc,
        )
        return {
            'sent': 0,
            'failed': len(tokens),
            'skipped': False,
            'reason': 'Firebase credential refresh failed. Check terminal logs for provider details.',
        }

    access_token = credentials.token

    sent = 0
    failed = 0
    errors = []

    send_url = f'https://fcm.googleapis.com/v1/projects/{project_id}/messages:send'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json; charset=utf-8',
    }

    for token_row in tokens:
        token = token_row['token']
        token_debug_id = _token_debug_id(token)
        message = _build_fcm_message(token, payload)

        try:
            current_app.logger.info(
                'Sending FCM push to user_id=%s token=%s project=%s payload=%s',
                user_id,
                token_debug_id,
                project_id,
                json.dumps({
                    'message': {
                        **message['message'],
                        'token': token_debug_id,
                    },
                }, default=str),
            )
            print(f"PUSH API SEND START user_id={user_id} token={token_debug_id} url={send_url}")
            response = requests.post(
                send_url,
                headers=headers,
                json=message,
                timeout=10,
            )
            print(f"PUSH API RAW RESPONSE status={response.status_code} body={response.text}")
            response_json = _response_json(response)
            if response.ok:
                sent += 1
                current_app.logger.info(
                    'FCM push accepted for user_id=%s token=%s response=%s',
                    user_id,
                    token_debug_id,
                    response_json or response.text,
                )
                continue

            failed += 1
            rejection_reason = _fcm_rejection_reason(response_json)
            errors.append({
                'token': token_debug_id,
                'status': response.status_code,
                'error_code': _fcm_error_code(response_json),
                'reason': rejection_reason,
                'client_message': _client_fcm_error_message(response_json),
            })
            current_app.logger.error(
                'FCM push rejected for user_id=%s token=%s status=%s reason=%s response=%s',
                user_id,
                token_debug_id,
                response.status_code,
                rejection_reason,
                response_json or response.text,
            )
            if _should_remove_rejected_token(response, response_json):
                current_app.logger.warning(
                    'Removing rejected FCM token for user_id=%s token=%s error_code=%s',
                    user_id,
                    token_debug_id,
                    _fcm_error_code(response_json),
                )
                remove_push_token(user_id, token)
        except requests.RequestException as exc:
            failed += 1
            print(f"PUSH API ERROR: {str(exc)}")
            errors.append({
                'token': token_debug_id,
                'reason': str(exc),
            })
            current_app.logger.exception(
                'FCM push request failed for user_id=%s token=%s url=%s error=%s',
                user_id,
                token_debug_id,
                send_url,
                exc,
            )
        except Exception as exc:
            failed += 1
            print(f"PUSH API ERROR: {str(exc)}")
            errors.append({
                'token': token_debug_id,
                'reason': str(exc),
            })
            current_app.logger.exception(
                'Unexpected FCM push failure for user_id=%s token=%s error=%s',
                user_id,
                token_debug_id,
                exc,
            )

    return {
        'sent': sent,
        'failed': failed,
        'skipped': False,
        'errors': errors,
    }


def mark_weather_push_notified(itinerary_id, alert_key, notification_signature):
    mark_weather_alert_notified(itinerary_id, alert_key, notification_signature)