"""Flask entrypoint that wires config, shared extensions, and blueprints."""

import json

import click
from flask import Flask
from flask_cors import CORS
from config import Config
from webapp.extensions import bcrypt, jwt
from webapp.routes.admin_routes import admin_bp
from webapp.routes.auth_routes import auth_bp
from webapp.routes.trip_routes import trip_bp
from webapp.services.trip_planning import ml_columns, ml_model
from webapp.services.weather_monitor import run_weather_monitor
from webapp.services.database import ensure_schema_upgrades

app = Flask(__name__)
app.config.from_object(Config)
# Configure the app once, then register the shared extension instances.
CORS(app)
bcrypt.init_app(app)
jwt.init_app(app)

app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(trip_bp)

# This command allows running the weather monitor from the command line with `flask weather-monitor`.
@app.cli.command('weather-monitor')
def weather_monitor_command():
    """Run the weather monitor once and print a JSON summary."""
    result = run_weather_monitor()
    click.echo(json.dumps(result, indent=2, default=str))


@app.cli.command('migrate-schema')
def migrate_schema_command():
    """Apply all schema upgrades needed by the deployed database."""
    # This CLI hook mirrors migrate_schema.py for deployments that prefer Flask commands.
    with app.app_context():
        ensure_schema_upgrades()
    click.echo('Schema migration completed successfully.')

# Keep these imports referenced so module loading happens at startup.
_ = ml_model, ml_columns

if __name__ == '__main__':
    app.run(debug=True)
