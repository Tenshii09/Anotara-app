"""Email delivery and webhook routes."""

from flask import Blueprint, jsonify, request, current_app

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

    if expected_secret and provided_secret != expected_secret:
        return jsonify({'error': 'Unauthorized'}), 401

    payload = request.get_json(silent=True) or {}
    return jsonify(process_webhook_payload(payload)), 200