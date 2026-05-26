"""Email delivery and webhook routes."""

from flask import Blueprint, jsonify, request, current_app

from webapp.security_utils import parse_json_payload
from webapp.services.email_service import process_webhook_payload

email_bp = Blueprint('email', __name__)


@email_bp.route('/api/webhooks/email', methods=['POST'])
def api_email_webhook():
    """Receive bounce/complaint events from the email provider."""
    expected_secret = current_app.config.get('MAIL_WEBHOOK_SECRET', '').strip()
    provided_secret = (
        request.headers.get('X-Anotara-Webhook-Secret')
        or request.headers.get('X-Webhook-Secret')
        or request.args.get('secret')
        or ''
    ).strip()

    if not expected_secret:
        current_app.logger.warning('Rejected email webhook because MAIL_WEBHOOK_SECRET is not configured.')
        return jsonify({'error': 'Webhook is not configured'}), 503

    if provided_secret != expected_secret:
        return jsonify({'error': 'Unauthorized'}), 401

    payload, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code
    return jsonify(process_webhook_payload(payload)), 200