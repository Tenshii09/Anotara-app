"""Security helpers for authentication, authorization, and input hygiene."""

from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from webapp.services.database import get_user_role


def requires_role(*roles):
    """Require one of the provided live database roles for a route."""
    allowed_roles = {str(role).strip() for role in roles if str(role).strip()}

    def decorator(route_handler):
        @wraps(route_handler)
        @jwt_required()
        def wrapped(*args, **kwargs):
            current_user_id = get_jwt_identity()
            user = get_user_role(current_user_id)
            if (
                not user
                or user.get('account_status') != 'active'
                or user.get('role') not in allowed_roles
            ):
                return jsonify({'error': 'Insufficient permissions'}), 403
            return route_handler(*args, **kwargs)

        return wrapped

    return decorator
