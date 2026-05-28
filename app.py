"""Flask entrypoint that wires config, shared extensions, and blueprints."""

import json

import click
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from werkzeug.exceptions import HTTPException

from config import Config
from webapp.extensions import bcrypt, jwt, limiter
from webapp.routes.auth_routes import auth_bp
from webapp.routes.email_routes import email_bp
from webapp.routes.trip_routes import trip_bp
from webapp.routes.social_routes import social_bp
from webapp.routes.admin_routes import admin_bp
from webapp.services.trip_planning import ml_columns, ml_model
from webapp.services.email_service import process_queue as process_email_queue
from webapp.services.email_service import send_email
from webapp.services.database import log_audit_event
from webapp.services.push_notifications import send_push_to_user
from webapp.services.weather_monitor import run_weather_monitor

app = Flask(__name__)
app.config.from_object(Config)
# Lock CORS to Config.CORS_ORIGINS (FRONTEND_URL / CORS_ORIGINS from .env via config.py).
# supports_credentials is required for HttpOnly refresh cookies on /api/refresh.
_cors_origins = app.config.get('CORS_ORIGINS', [])
CORS(
    app,
    origins=_cors_origins,
    supports_credentials=True,
    allow_headers=['Content-Type', 'Authorization', 'X-CSRF-TOKEN'],
)
if app.config.get('DEBUG'):
    app.logger.info('CORS allowed origins: %s', _cors_origins)
bcrypt.init_app(app)
jwt.init_app(app)
limiter.init_app(app)


@app.after_request
def add_security_headers(response):
    """Apply baseline browser security headers to every backend response."""
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.setdefault('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    response.headers.setdefault('Cache-Control', 'no-store')
    if request.is_secure:
        response.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    return response


@app.errorhandler(HTTPException)
def handle_http_exception(error):
    """Return JSON for framework-level errors without leaking stack traces."""
    return jsonify({
        'error': error.description or error.name,
        'code': error.name.lower().replace(' ', '_'),
    }), error.code or 500


@app.errorhandler(Exception)
def handle_uncaught_exception(error):
    """Log unexpected failures and expose a stable generic API contract."""
    app.logger.exception('Unhandled backend error: %s', error)
    try:
        verify_jwt_in_request(optional=True)
        actor_id = get_jwt_identity()
    except Exception:
        actor_id = None
    try:
        log_audit_event(
            'system.error',
            actor_id=actor_id,
            target_type='request',
            outcome='failure',
            payload={'path': request.path, 'method': request.method, 'error_type': error.__class__.__name__},
            ip_address=request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip(),
            user_agent=request.headers.get('User-Agent', ''),
        )
    except Exception:
        app.logger.warning('Could not write system.error audit event.')
    return jsonify({
        'error': 'An unexpected server error occurred.',
        'code': 'internal_server_error',
    }), 500


@jwt.expired_token_loader
def handle_expired_token(_jwt_header, jwt_payload):
    """Return a stable JSON contract when access or refresh tokens expire."""
    token_type = jwt_payload.get('type', 'access')
    return jsonify({
        'error': 'Session expired. Please log in again.',
        'code': f'{token_type}_token_expired',
    }), 401


@jwt.invalid_token_loader
def handle_invalid_token(reason):
    return jsonify({
        'error': 'Invalid session token. Please log in again.',
        'code': 'invalid_token',
        'detail': reason,
    }), 422


@jwt.unauthorized_loader
def handle_missing_token(reason):
    return jsonify({
        'error': 'Authentication is required. Please log in.',
        'code': 'missing_token',
        'detail': reason,
    }), 401

app.register_blueprint(auth_bp)
app.register_blueprint(email_bp)
app.register_blueprint(trip_bp)
app.register_blueprint(social_bp)
app.register_blueprint(admin_bp)

# This command allows running the weather monitor from the command line with `flask weather-monitor`.
@app.cli.command('weather-monitor')
def weather_monitor_command():
    """Run the weather monitor once and print a JSON summary."""
    result = run_weather_monitor()
    click.echo(json.dumps(result, indent=2, default=str))


@app.cli.command('email-queue')
@click.option('--limit', default=25, show_default=True, type=int)
def email_queue_command(limit):
    """Process queued email jobs once and print a JSON summary."""
    result = process_email_queue(limit=limit)
    click.echo(json.dumps(result, indent=2, default=str))

@app.cli.command('send-test-email')
@click.argument('recipient_email')
def send_test_email_command(recipient_email):
    """Send one immediate SMTP/provider test email to verify mail settings."""
    result = send_email({
        'recipient_email': recipient_email,
        'recipient_name': 'Ano Tara tester',
        'subject': 'Ano Tara email test',
        'template_name': 'email_test',
        'category': 'security',
        'context': {'recipient_email': recipient_email},
    })
    click.echo(json.dumps(result, indent=2, default=str))


@app.cli.command('send-test-push')
@click.argument('user_id', type=int)
def send_test_push_command(user_id):
    """Send one immediate FCM push to a user's registered device tokens."""
    result = send_push_to_user(user_id, {
        'title': 'Ano-Tara! System Alert',
        'body': 'Remote push test from the Ano Tara backend.',
        'url': '/profile',
        'source': 'cli-test',
        'tag': 'anotara-cli-test-push',
    })
    click.echo(json.dumps(result, indent=2, default=str))


# Keep these imports referenced so module loading happens at startup.
_ = ml_model, ml_columns

if __name__ == '__main__':
    app.run(debug=app.config.get('DEBUG', False))
