"""Pure input-validation and text-sanitization helpers."""

from html import escape
import re

from flask import jsonify, request


USERNAME_PATTERN = re.compile(r'^[A-Za-z0-9_.-]+$')
EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def sanitize_user_text(value, *, max_length=255):
    """Normalize and HTML-escape user-generated text before persistence."""
    if value is None:
        return ''
    text = str(value).strip()
    text = ''.join(char for char in text if char == '\n' or char == '\t' or ord(char) >= 32)
    text = text[:max(0, int(max_length or 255))]
    return escape(text, quote=True)


def validate_string_field(data, field_name, *, required=True, min_length=0, max_length=255, pattern=None):
    """Return a cleaned string plus an error message when validation fails."""
    if not isinstance(data, dict):
        return '', 'JSON payload must be an object'

    raw_value = data.get(field_name)
    if raw_value is None:
        if required:
            return '', f'{field_name} is required'
        return '', None

    if not isinstance(raw_value, str):
        return '', f'{field_name} must be a string'

    value = raw_value.strip()
    if required and not value:
        return '', f'{field_name} is required'
    if value and len(value) < min_length:
        return '', f'{field_name} must be at least {min_length} characters'
    if len(value) > max_length:
        return '', f'{field_name} must be at most {max_length} characters'
    if pattern and value and not pattern.match(value):
        return '', f'{field_name} contains invalid characters'

    return value, None


def parse_json_payload():
    """Read a JSON object payload without allowing silent malformed bodies."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, jsonify({'error': 'JSON payload must be an object'}), 400
    return data, None, None


def parse_optional_json_payload():
    """Read an optional JSON object payload and reject malformed non-objects."""
    if not request.data:
        return {}, None, None
    return parse_json_payload()


def parse_int(value, field_name, *, minimum=None, maximum=None):
    """Return an integer plus an error message when a scalar is invalid."""
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, f'{field_name} must be an integer'
    if minimum is not None and parsed < minimum:
        return None, f'{field_name} must be at least {minimum}'
    if maximum is not None and parsed > maximum:
        return None, f'{field_name} must be at most {maximum}'
    return parsed, None


def validate_choice(value, field_name, allowed_values, *, required=True):
    """Normalize and validate a string enum field."""
    if value is None:
        if required:
            return '', f'{field_name} is required'
        return '', None
    normalized = str(value).strip()
    if required and not normalized:
        return '', f'{field_name} is required'
    if normalized and normalized not in allowed_values:
        return '', f'{field_name} must be one of: {", ".join(sorted(allowed_values))}'
    return normalized, None
