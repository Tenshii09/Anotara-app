"""Flask entrypoint that wires config, shared extensions, and blueprints."""

import json

import click
from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from webapp.extensions import bcrypt, jwt
from webapp.routes.auth_routes import auth_bp
from webapp.routes.email_routes import email_bp
from webapp.routes.trip_routes import trip_bp
from webapp.routes.social_routes import social_bp
from webapp.routes.admin_routes import admin_bp
from webapp.services.trip_planning import ml_columns, ml_model
from webapp.services.email_service import process_queue as process_email_queue
from webapp.services.weather_monitor import run_weather_monitor

app = Flask(__name__)
app.config.from_object(Config)
# Configure the app once, then register the shared extension instances.
CORS(app, supports_credentials=True)
bcrypt.init_app(app)
jwt.init_app(app)


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

# Keep these imports referenced so module loading happens at startup.
_ = ml_model, ml_columns

if __name__ == '__main__':
    app.run(debug=True)
