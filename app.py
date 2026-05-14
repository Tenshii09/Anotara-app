"""Flask entrypoint that wires config, shared extensions, and blueprints."""

from flask import Flask
from flask_cors import CORS
from config import Config
from webapp.extensions import bcrypt, jwt
from webapp.routes.auth_routes import auth_bp
from webapp.routes.trip_routes import trip_bp
from webapp.services.trip_planning import ml_columns, ml_model

app = Flask(__name__)
app.config.from_object(Config)
# Configure the app once, then register the shared extension instances.
CORS(app)
bcrypt.init_app(app)
jwt.init_app(app)

app.register_blueprint(auth_bp)
app.register_blueprint(trip_bp)

# Keep these imports referenced so module loading happens at startup.
_ = ml_model, ml_columns

if __name__ == '__main__':
    app.run(debug=True)
