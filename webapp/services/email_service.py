"""Transactional email delivery helpers for the Anotara backend.

The module keeps provider selection, suppression handling, queueing, template
rendering, and webhook normalization inside the service layer so route handlers
stay thin and the delivery path remains testable.
"""

from __future__ import annotations

import hashlib
import json
import re
import smtplib
from datetime import datetime
from email.message import EmailMessage

import requests
from flask import current_app

from webapp.services.database import get_db, get_user_profile, ensure_user_columns

DEFAULT_EMAIL_PREFERENCES = {
    'security': True,
    'collaboration': True,
    'itinerary_updates': True,
    'weather_alerts': True,
    'messages': True,
    'marketing': False,
}

QUEUE_STATUSES = {'queued', 'sending', 'sent', 'failed', 'suppressed', 'skipped'}


def _utcnow():
    return datetime.utcnow()


def _as_dict(value, fallback=None):
    fallback = {} if fallback is None else fallback
    if value is None:
        return dict(fallback)
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except (TypeError, ValueError):
            pass
    return dict(fallback)


def _normalize_email(email):
    return str(email or '').strip().lower()


def _normalize_text(value):
    return str(value or '').strip()


def _normalize_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    value_text = _normalize_text(value)
    try:
        return datetime.fromisoformat(value_text)
    except ValueError:
        return None


def _dedupe_key(payload):
    raw_value = json.dumps(
        {
            'recipient_email': payload.get('recipient_email'),
            'template_name': payload.get('template_name'),
            'subject': payload.get('subject'),
            'category': payload.get('category'),
            'context': payload.get('context') or {},
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(raw_value.encode('utf-8')).hexdigest()


def ensure_email_tables():
    """Create queue, log, and suppression tables on demand."""
    ensure_user_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS email_queue (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                recipient_user_id INT NULL,
                recipient_email VARCHAR(255) NOT NULL,
                recipient_name  VARCHAR(120) NULL,
                subject         VARCHAR(200) NOT NULL,
                template_name   VARCHAR(120) NOT NULL,
                category        VARCHAR(40) NOT NULL DEFAULT 'messages',
                context         JSON NOT NULL,
                provider        VARCHAR(30) NOT NULL DEFAULT 'disabled',
                status          VARCHAR(20) NOT NULL DEFAULT 'queued',
                priority        INT NOT NULL DEFAULT 50,
                attempts        INT NOT NULL DEFAULT 0,
                max_attempts    INT NOT NULL DEFAULT 5,
                send_at         DATETIME NULL,
                dedupe_key      CHAR(64) NOT NULL,
                last_error      TEXT,
                provider_message_id VARCHAR(160),
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                queued_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at         DATETIME NULL,
                failed_at       DATETIME NULL,
                UNIQUE KEY unique_email_dedupe (dedupe_key)
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS email_logs (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                queue_id        INT NULL,
                recipient_email VARCHAR(255) NOT NULL,
                recipient_user_id INT NULL,
                subject         VARCHAR(200) NOT NULL,
                template_name   VARCHAR(120) NOT NULL,
                category        VARCHAR(40) NOT NULL,
                provider        VARCHAR(30) NOT NULL,
                status          VARCHAR(20) NOT NULL,
                response_code   VARCHAR(40) NULL,
                response_body   MEDIUMTEXT,
                provider_message_id VARCHAR(160),
                attempt_number  INT NOT NULL DEFAULT 1,
                payload         JSON NOT NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (queue_id) REFERENCES email_queue(id) ON DELETE SET NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS email_suppression (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                email           VARCHAR(255) NOT NULL,
                reason          VARCHAR(80) NOT NULL,
                source          VARCHAR(80) NOT NULL,
                details         JSON,
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_suppressed_email (email)
            )
            """
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def _table_columns(table_name):
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            """,
            (current_app.config['DB_NAME'], table_name),
        )
        return {row[0] for row in cursor.fetchall()}
    finally:
        cursor.close()
        db.close()


def render_email(template_name, context=None):
    """Render matching HTML and plaintext templates from templates/emails/."""
    ensure_email_tables()
    template_context = _as_dict(context)
    template_context.setdefault('app_name', 'Ano Tara!')
    template_context.setdefault('support_email', current_app.config.get('MAIL_FROM') or '')
    template_context.setdefault('base_url', current_app.config.get('FRONTEND_URL', ''))

    html_template = current_app.jinja_env.get_template(f'emails/{template_name}.html')
    html_body = html_template.render(**template_context)

    try:
        text_template = current_app.jinja_env.get_template(f'emails/{template_name}.txt')
        text_body = text_template.render(**template_context)
    except Exception:
        text_body = _strip_html(html_body)

    return {'html': html_body, 'text': text_body, 'context': template_context}


def _strip_html(html_body):
    text = re.sub(r'<\s*br\s*/?>', '\n', html_body, flags=re.I)
    text = re.sub(r'</p\s*>', '\n\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _user_email_profile(user_id):
    if not user_id:
        return None
    profile = get_user_profile(user_id)
    if not profile:
        return None
    profile['email_preferences'] = _as_dict(profile.get('email_preferences'), DEFAULT_EMAIL_PREFERENCES)
    return profile


def is_email_suppressed(email):
    ensure_email_tables()
    safe_email = _normalize_email(email)
    if not safe_email:
        return False

    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, reason, source
            FROM email_suppression
            WHERE email = %s AND is_active = TRUE
            """,
            (safe_email,),
        )
        return cursor.fetchone() is not None
    finally:
        cursor.close()
        db.close()


def _should_send_for_profile(profile, category):
    if not profile:
        return True

    category = _normalize_text(category) or 'messages'
    if category == 'security':
        return True

    preferences = _as_dict(profile.get('email_preferences'), DEFAULT_EMAIL_PREFERENCES)
    if category in preferences:
        return bool(preferences.get(category))
    return bool(DEFAULT_EMAIL_PREFERENCES.get(category, True))


def _provider_name():
    return _normalize_text(current_app.config.get('MAIL_PROVIDER', 'disabled')).lower() or 'disabled'


def _provider_enabled():
    return _provider_name() not in {'', 'disabled', 'off', 'false', 'none'}


def _smtp_settings_available():
    return bool(current_app.config.get('MAIL_SMTP_HOST'))


def _send_via_provider(recipient_email, recipient_name, subject, html_body, text_body, category, template_name):
    provider = _provider_name()
    from_email = _normalize_email(current_app.config.get('MAIL_FROM'))
    from_name = _normalize_text(current_app.config.get('MAIL_FROM_NAME') or 'Ano Tara!')

    if not _provider_enabled():
        return {
            'sent': False,
            'skipped': True,
            'reason': 'Mail provider is disabled.',
            'provider': provider,
        }

    if not from_email:
        return {
            'sent': False,
            'skipped': True,
            'reason': 'MAIL_FROM is not configured.',
            'provider': provider,
        }

    if provider == 'sendgrid':
        response = requests.post(
            'https://api.sendgrid.com/v3/mail/send',
            headers={
                'Authorization': f"Bearer {current_app.config.get('MAIL_API_KEY', '')}",
                'Content-Type': 'application/json',
            },
            json={
                'personalizations': [{
                    'to': [{'email': recipient_email, 'name': recipient_name or recipient_email}],
                    'subject': subject,
                }],
                'from': {'email': from_email, 'name': from_name},
                'content': [
                    {'type': 'text/plain', 'value': text_body},
                    {'type': 'text/html', 'value': html_body},
                ],
                'custom_args': {
                    'category': category,
                    'template_name': template_name,
                },
            },
            timeout=15,
        )
        return {
            'sent': response.status_code in (200, 202),
            'provider': provider,
            'status_code': response.status_code,
            'message_id': response.headers.get('X-Message-Id') or response.headers.get('X-Message-ID'),
            'response_body': response.text,
        }

    if provider == 'mailgun':
        domain = _normalize_text(current_app.config.get('MAIL_DOMAIN'))
        if not domain:
            return {
                'sent': False,
                'skipped': True,
                'reason': 'MAIL_DOMAIN is required for Mailgun.',
                'provider': provider,
            }

        response = requests.post(
            f'https://api.mailgun.net/v3/{domain}/messages',
            auth=('api', current_app.config.get('MAIL_API_KEY', '')),
            data={
                'from': f'{from_name} <{from_email}>',
                'to': recipient_email,
                'subject': subject,
                'text': text_body,
                'html': html_body,
                'o:tag': category,
                'o:tag': template_name,
            },
            timeout=15,
        )
        return {
            'sent': response.status_code in (200, 201, 202),
            'provider': provider,
            'status_code': response.status_code,
            'message_id': response.json().get('id') if response.ok else None,
            'response_body': response.text,
        }

    if provider == 'smtp':
        if not _smtp_settings_available():
            return {
                'sent': False,
                'skipped': True,
                'reason': 'SMTP host is not configured.',
                'provider': provider,
            }

        message = EmailMessage()
        message['Subject'] = subject
        message['From'] = f'{from_name} <{from_email}>'
        message['To'] = recipient_email
        message.set_content(text_body)
        message.add_alternative(html_body, subtype='html')

        with smtplib.SMTP(current_app.config.get('MAIL_SMTP_HOST'), int(current_app.config.get('MAIL_SMTP_PORT', 587))) as client:
            if current_app.config.get('MAIL_SMTP_USE_TLS', True):
                client.starttls()
            username = _normalize_text(current_app.config.get('MAIL_SMTP_USERNAME'))
            password = _normalize_text(current_app.config.get('MAIL_SMTP_PASSWORD'))
            if username:
                client.login(username, password)
            client.send_message(message)

        return {
            'sent': True,
            'provider': provider,
            'status_code': 250,
            'message_id': None,
            'response_body': 'SMTP delivery completed.',
        }

    return {
        'sent': False,
        'skipped': True,
        'reason': f'Unsupported mail provider: {provider}',
        'provider': provider,
    }


def _log_email(queue_id, payload, result, attempt_number=1):
    ensure_email_tables()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO email_logs
                (queue_id, recipient_email, recipient_user_id, subject, template_name, category,
                 provider, status, response_code, response_body, provider_message_id, attempt_number, payload)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                queue_id,
                payload.get('recipient_email'),
                payload.get('recipient_user_id'),
                payload.get('subject'),
                payload.get('template_name'),
                payload.get('category'),
                result.get('provider') or _provider_name(),
                'sent' if result.get('sent') else result.get('status') or ('skipped' if result.get('skipped') else 'failed'),
                str(result.get('status_code') or ''),
                result.get('response_body'),
                result.get('message_id'),
                int(attempt_number or 1),
                json.dumps(payload, default=str),
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def _update_queue_state(queue_id, status, last_error=None, provider_message_id=None, sent_at=None, failed_at=None, attempts=None):
    ensure_email_tables()
    db = get_db()
    cursor = db.cursor()
    try:
        assignments = ['status = %s']
        params = [status]
        if last_error is not None:
            assignments.append('last_error = %s')
            params.append(last_error)
        if provider_message_id is not None:
            assignments.append('provider_message_id = %s')
            params.append(provider_message_id)
        if sent_at is not None:
            assignments.append('sent_at = %s')
            params.append(sent_at)
        if failed_at is not None:
            assignments.append('failed_at = %s')
            params.append(failed_at)
        if attempts is not None:
            assignments.append('attempts = %s')
            params.append(int(attempts))
        params.append(queue_id)
        cursor.execute(
            f"UPDATE email_queue SET {', '.join(assignments)} WHERE id = %s",
            tuple(params),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def _fetch_queue_jobs(limit=25, queue_id=None):
    ensure_email_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        query = """
            SELECT *
            FROM email_queue
            WHERE status IN ('queued', 'failed')
              AND (send_at IS NULL OR send_at <= CURRENT_TIMESTAMP)
        """
        params = []
        if queue_id is not None:
            query += ' AND id = %s'
            params.append(int(queue_id))
        query += ' ORDER BY priority ASC, COALESCE(send_at, queued_at) ASC, id ASC LIMIT %s'
        params.append(max(1, min(int(limit or 25), 100)))
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def _coerce_json_field(value, fallback=None):
    fallback = {} if fallback is None else fallback
    if value is None:
        return dict(fallback)
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except (TypeError, ValueError):
            pass
    return dict(fallback)


def list_admin_email_queue(search_query='', limit=30):
    """Return the current email queue for admin operations."""
    ensure_email_tables()
    safe_query = _normalize_text(search_query)
    safe_limit = max(1, min(int(limit or 30), 100))
    conditions = []
    params = []
    if safe_query:
        like_value = f'%{safe_query}%'
        conditions.append(
            '(recipient_email LIKE %s OR recipient_name LIKE %s OR subject LIKE %s OR template_name LIKE %s OR category LIKE %s OR status LIKE %s)'
        )
        params.extend([like_value, like_value, like_value, like_value, like_value, like_value])
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ''

    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT
                id,
                recipient_user_id,
                recipient_email,
                recipient_name,
                subject,
                template_name,
                category,
                provider,
                status,
                priority,
                attempts,
                max_attempts,
                send_at,
                last_error,
                provider_message_id,
                created_at,
                updated_at,
                queued_at,
                sent_at,
                failed_at
            FROM email_queue
            {where_sql}
            ORDER BY queued_at DESC, id DESC
            LIMIT %s
            """,
            tuple(params + [safe_limit]),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def list_admin_email_logs(search_query='', limit=30):
    """Return recent email delivery logs for the admin console."""
    ensure_email_tables()
    safe_query = _normalize_text(search_query)
    safe_limit = max(1, min(int(limit or 30), 100))
    conditions = []
    params = []
    if safe_query:
        like_value = f'%{safe_query}%'
        conditions.append(
            '(logs.recipient_email LIKE %s OR logs.subject LIKE %s OR logs.template_name LIKE %s OR logs.category LIKE %s OR logs.status LIKE %s)'
        )
        params.extend([like_value, like_value, like_value, like_value, like_value])
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ''

    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT
                logs.id,
                logs.queue_id,
                logs.recipient_email,
                logs.recipient_user_id,
                logs.subject,
                logs.template_name,
                logs.category,
                logs.provider,
                logs.status,
                logs.response_code,
                logs.response_body,
                logs.provider_message_id,
                logs.attempt_number,
                logs.payload,
                logs.created_at,
                users.username AS recipient_name
            FROM email_logs logs
            LEFT JOIN users ON users.id = logs.recipient_user_id
            {where_sql}
            ORDER BY logs.created_at DESC, logs.id DESC
            LIMIT %s
            """,
            tuple(params + [safe_limit]),
        )
        rows = cursor.fetchall()
        for row in rows:
            row['payload'] = _coerce_json_field(row.get('payload'), {})
        return rows
    finally:
        cursor.close()
        db.close()


def list_admin_email_suppressions(search_query='', limit=30):
    """Return active and inactive suppression rows for review."""
    ensure_email_tables()
    safe_query = _normalize_text(search_query)
    safe_limit = max(1, min(int(limit or 30), 100))
    conditions = []
    params = []
    if safe_query:
        like_value = f'%{safe_query}%'
        conditions.append('(email LIKE %s OR reason LIKE %s OR source LIKE %s)')
        params.extend([like_value, like_value, like_value])
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ''

    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT
                id,
                email,
                reason,
                source,
                details,
                is_active,
                created_at,
                updated_at
            FROM email_suppression
            {where_sql}
            ORDER BY updated_at DESC, id DESC
            LIMIT %s
            """,
            tuple(params + [safe_limit]),
        )
        rows = cursor.fetchall()
        for row in rows:
            row['details'] = _coerce_json_field(row.get('details'), {})
        return rows
    finally:
        cursor.close()
        db.close()


def list_admin_email_ops(search_query='', limit=30):
    """Return the email operations dashboard payload for admin review."""
    ensure_email_tables()
    queue = list_admin_email_queue(search_query=search_query, limit=limit)
    logs = list_admin_email_logs(search_query=search_query, limit=limit)
    suppressions = list_admin_email_suppressions(search_query=search_query, limit=limit)

    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute('SELECT COUNT(*) AS value FROM email_queue')
        queue_total = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM email_queue WHERE status = 'queued'")
        queued_total = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM email_queue WHERE status = 'sending'")
        sending_total = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute('SELECT COUNT(*) AS value FROM email_logs')
        log_total = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM email_suppression WHERE is_active = TRUE")
        active_suppressions = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute('SELECT COUNT(*) AS value FROM email_suppression')
        suppression_total = int((cursor.fetchone() or {}).get('value') or 0)

        return {
            'summary': {
                'queue_total': queue_total,
                'queued_total': queued_total,
                'sending_total': sending_total,
                'log_total': log_total,
                'active_suppressions': active_suppressions,
                'suppression_total': suppression_total,
            },
            'queue': queue,
            'logs': logs,
            'suppressions': suppressions,
        }
    finally:
        cursor.close()
        db.close()


def queue_email(payload):
    """Persist an email job for later delivery."""
    ensure_email_tables()
    normalized = _prepare_payload(payload)
    if normalized.get('skipped'):
        return normalized

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO email_queue
                (recipient_user_id, recipient_email, recipient_name, subject, template_name,
                 category, context, provider, status, priority, attempts, max_attempts, send_at, dedupe_key)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'queued', %s, 0, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                recipient_name = VALUES(recipient_name),
                subject = VALUES(subject),
                template_name = VALUES(template_name),
                category = VALUES(category),
                context = VALUES(context),
                provider = VALUES(provider),
                id = LAST_INSERT_ID(id),
                status = 'queued',
                priority = VALUES(priority),
                attempts = 0,
                max_attempts = VALUES(max_attempts),
                send_at = VALUES(send_at),
                last_error = NULL,
                provider_message_id = NULL,
                sent_at = NULL,
                failed_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                normalized.get('recipient_user_id'),
                normalized['recipient_email'],
                normalized.get('recipient_name'),
                normalized['subject'],
                normalized['template_name'],
                normalized['category'],
                json.dumps(normalized.get('context') or {}, default=str),
                normalized.get('provider') or _provider_name(),
                int(normalized.get('priority') or 50),
                int(normalized.get('max_attempts') or 5),
                normalized.get('send_at'),
                normalized.get('dedupe_key'),
            ),
        )
        db.commit()
        queue_id = cursor.lastrowid
    finally:
        cursor.close()
        db.close()

    queued_payload = dict(normalized)
    queued_payload['queue_id'] = queue_id
    queued_payload['status'] = 'queued'

    send_immediately = str(current_app.config.get('MAIL_SEND_IMMEDIATELY', 'true')).lower() == 'true'
    if send_immediately:
        process_queue(queue_id=queue_id, limit=1)

    return queued_payload


def _prepare_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError('Email payload must be an object')

    template_name = _normalize_text(payload.get('template_name'))
    subject = _normalize_text(payload.get('subject'))
    category = _normalize_text(payload.get('category') or 'messages').lower()
    recipient_name = _normalize_text(payload.get('recipient_name'))
    context = _as_dict(payload.get('context'))
    recipient_user_id = payload.get('recipient_user_id')
    recipient_email = _normalize_email(payload.get('recipient_email'))
    provider = _normalize_text(payload.get('provider') or _provider_name()).lower()
    send_at = _normalize_datetime(payload.get('send_at'))
    priority = int(payload.get('priority') or 50)
    max_attempts = int(payload.get('max_attempts') or 5)

    if not recipient_email:
        raise ValueError('recipient_email is required')
    if not template_name:
        raise ValueError('template_name is required')
    if not subject:
        raise ValueError('subject is required')
    if category not in DEFAULT_EMAIL_PREFERENCES:
        category = 'messages'

    if recipient_user_id is not None:
        try:
            recipient_user_id = int(recipient_user_id)
        except (TypeError, ValueError):
            recipient_user_id = None

    profile = _user_email_profile(recipient_user_id)
    if not recipient_email and profile:
        recipient_email = _normalize_email(profile.get('email'))
    if not recipient_name and profile:
        recipient_name = _normalize_text(profile.get('username') or '')

    if is_email_suppressed(recipient_email):
        return {
            'recipient_email': recipient_email,
            'template_name': template_name,
            'subject': subject,
            'category': category,
            'recipient_name': recipient_name,
            'context': context,
            'provider': provider,
            'recipient_user_id': recipient_user_id,
            'send_at': send_at,
            'priority': priority,
            'max_attempts': max_attempts,
            'dedupe_key': _dedupe_key({
                'recipient_email': recipient_email,
                'template_name': template_name,
                'subject': subject,
                'category': category,
                'context': context,
            }),
            'skipped': True,
            'status': 'suppressed',
            'reason': 'recipient is suppressed',
        }

    if profile and not _should_send_for_profile(profile, category):
        return {
            'recipient_email': recipient_email,
            'template_name': template_name,
            'subject': subject,
            'category': category,
            'recipient_name': recipient_name,
            'context': context,
            'provider': provider,
            'recipient_user_id': recipient_user_id,
            'send_at': send_at,
            'priority': priority,
            'max_attempts': max_attempts,
            'dedupe_key': _dedupe_key({
                'recipient_email': recipient_email,
                'template_name': template_name,
                'subject': subject,
                'category': category,
                'context': context,
            }),
            'skipped': True,
            'status': 'skipped',
            'reason': 'recipient preference disabled',
        }

    if not recipient_email:
        raise ValueError('recipient_email is required')

    return {
        'recipient_email': recipient_email,
        'recipient_name': recipient_name,
        'recipient_user_id': recipient_user_id,
        'subject': subject,
        'template_name': template_name,
        'category': category,
        'context': context,
        'provider': provider,
        'send_at': send_at,
        'priority': priority,
        'max_attempts': max_attempts,
        'dedupe_key': _dedupe_key({
            'recipient_email': recipient_email,
            'template_name': template_name,
            'subject': subject,
            'category': category,
            'context': context,
        }),
    }


def send_email(payload):
    """Render and deliver an email immediately without queue persistence."""
    ensure_email_tables()
    normalized = _prepare_payload(payload)
    if normalized.get('skipped'):
        return normalized

    rendered = render_email(normalized['template_name'], normalized.get('context'))
    delivery = _send_via_provider(
        normalized['recipient_email'],
        normalized.get('recipient_name'),
        normalized['subject'],
        rendered['html'],
        rendered['text'],
        normalized['category'],
        normalized['template_name'],
    )
    result = dict(normalized)
    result.update(delivery)
    _log_email(None, {**normalized, 'context': normalized.get('context') or {}}, result, attempt_number=1)
    return result


def process_queue(limit=25, queue_id=None):
    """Deliver queued emails that are due for sending."""
    ensure_email_tables()
    jobs = _fetch_queue_jobs(limit=limit, queue_id=queue_id)
    processed = []

    for job in jobs:
        payload = {
            'recipient_user_id': job.get('recipient_user_id'),
            'recipient_email': job.get('recipient_email'),
            'recipient_name': job.get('recipient_name'),
            'subject': job.get('subject'),
            'template_name': job.get('template_name'),
            'category': job.get('category'),
            'context': _as_dict(job.get('context')),
            'provider': job.get('provider'),
            'send_at': job.get('send_at'),
            'priority': job.get('priority'),
            'max_attempts': job.get('max_attempts'),
            'dedupe_key': job.get('dedupe_key'),
        }
        attempt_number = int(job.get('attempts') or 0) + 1

        _update_queue_state(job['id'], 'sending', attempts=attempt_number)
        rendered = render_email(payload['template_name'], payload.get('context'))
        delivery = _send_via_provider(
            payload['recipient_email'],
            payload.get('recipient_name'),
            payload['subject'],
            rendered['html'],
            rendered['text'],
            payload['category'],
            payload['template_name'],
        )

        result = dict(payload)
        result.update(delivery)
        if delivery.get('sent'):
            _update_queue_state(
                job['id'],
                'sent',
                provider_message_id=delivery.get('message_id'),
                sent_at=_utcnow(),
                attempts=attempt_number,
            )
        elif delivery.get('skipped'):
            _update_queue_state(
                job['id'],
                'skipped',
                last_error=delivery.get('reason'),
                attempts=attempt_number,
            )
        else:
            status = 'failed' if attempt_number < int(job.get('max_attempts') or 5) else 'dead'
            _update_queue_state(
                job['id'],
                status,
                last_error=delivery.get('response_body') or delivery.get('reason') or 'Delivery failed',
                failed_at=_utcnow(),
                attempts=attempt_number,
            )

        _log_email(job['id'], result, result, attempt_number=attempt_number)
        processed.append({'queue_id': job['id'], 'status': result.get('status', delivery.get('status') or ('sent' if delivery.get('sent') else 'failed'))})

    return {
        'processed': len(processed),
        'results': processed,
        'provider': _provider_name(),
    }


def suppress_email(email, reason, source='manual', details=None):
    """Store or refresh an email suppression record."""
    ensure_email_tables()
    safe_email = _normalize_email(email)
    if not safe_email:
        return None

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO email_suppression (email, reason, source, details, is_active)
            VALUES (%s, %s, %s, %s, TRUE)
            ON DUPLICATE KEY UPDATE
                reason = VALUES(reason),
                source = VALUES(source),
                details = VALUES(details),
                is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
            """,
            (safe_email, _normalize_text(reason)[:80], _normalize_text(source)[:80], json.dumps(details or {}, default=str)),
        )
        db.commit()
        return True
    finally:
        cursor.close()
        db.close()


def process_webhook_payload(payload):
    """Normalize provider webhook payloads into suppression records."""
    ensure_email_tables()
    if not isinstance(payload, dict):
        return {'processed': 0, 'suppressed': 0, 'events': []}

    events = payload.get('events')
    if isinstance(events, list):
        raw_events = events
    else:
        raw_events = [payload]

    processed = 0
    suppressed = 0
    normalized_events = []

    for event in raw_events:
        if not isinstance(event, dict):
            continue
        processed += 1
        event_type = _normalize_text(event.get('event') or event.get('type') or event.get('status')).lower()
        email = _normalize_email(
            event.get('email')
            or event.get('recipient')
            or event.get('recipient_email')
            or (event.get('data') or {}).get('email')
            or (event.get('message') or {}).get('to')
        )
        if event_type in {'bounce', 'complaint', 'unsubscribed', 'unsubscribe', 'blocked', 'dropped'} and email:
            suppress_email(email, reason=event_type or 'webhook', source='provider_webhook', details=event)
            suppressed += 1
            normalized_events.append({'email': email, 'event': event_type, 'suppressed': True})
        else:
            normalized_events.append({'email': email, 'event': event_type, 'suppressed': False})

    return {'processed': processed, 'suppressed': suppressed, 'events': normalized_events}
