"""Shared Flask extensions for the Anotara backend.

Keeping extension objects here avoids circular imports when routes are split
across multiple blueprint modules.
"""

from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager

bcrypt = Bcrypt()
jwt = JWTManager()