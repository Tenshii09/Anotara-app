"""Central environment-based configuration for the Flask backend."""

import os
import secrets
from datetime import timedelta
from dotenv import load_dotenv

# Load variables from the .env file into the environment
load_dotenv()


def _env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {'1', 'true', 'yes', 'on'}


def _env_int(name, default):
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return int(default)


def _required_secret(name):
    value = os.environ.get(name, '').strip()
    environment = os.environ.get('FLASK_ENV') or os.environ.get('APP_ENV') or 'development'
    if value:
        return value
    if environment.lower() in {'production', 'prod'}:
        raise RuntimeError(f'{name} must be configured in production')
    return secrets.token_urlsafe(48)


def _normalize_origin(url):
    """Strip trailing slashes so CORS origin matching stays consistent."""
    return str(url or '').strip().rstrip('/')


def _cors_origins():
    raw_origins = os.environ.get('CORS_ORIGINS', '').strip()
    if raw_origins:
        return sorted({
            _normalize_origin(origin)
            for origin in raw_origins.split(',')
            if _normalize_origin(origin) and _normalize_origin(origin) != '*'
        })

    frontend_url = _normalize_origin(
        os.environ.get('FRONTEND_URL', 'http://127.0.0.1:5173')
    )
    environment = os.environ.get('FLASK_ENV') or os.environ.get('APP_ENV') or 'development'
    if environment.lower() in {'production', 'prod'}:
        if not frontend_url or frontend_url == '*':
            raise RuntimeError(
                'FRONTEND_URL must be set to your deployed SPA origin in production '
                '(for example https://anotara.vercel.app).'
            )
        return [frontend_url]

    origins = {
        frontend_url,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    }
    return sorted(origin for origin in origins if origin and origin != '*')


class Config:
    ENVIRONMENT = os.environ.get('FLASK_ENV') or os.environ.get('APP_ENV') or 'development'
    DEBUG = _env_bool('FLASK_DEBUG', ENVIRONMENT.lower() == 'development')
    TESTING = _env_bool('FLASK_TESTING', False)
    SECRET_KEY = _required_secret('SECRET_KEY')
    JWT_SECRET_KEY = _required_secret('JWT_SECRET_KEY')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=_env_int('JWT_ACCESS_TOKEN_MINUTES', 15)
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=_env_int('JWT_REFRESH_TOKEN_DAYS', 30)
    )
    JWT_TOKEN_LOCATION = ['headers', 'cookies']
    JWT_COOKIE_SECURE = _env_bool('JWT_COOKIE_SECURE', ENVIRONMENT.lower() in {'production', 'prod'})
    JWT_COOKIE_SAMESITE = os.environ.get('JWT_COOKIE_SAMESITE', 'Lax')
    JWT_COOKIE_CSRF_PROTECT = _env_bool('JWT_COOKIE_CSRF_PROTECT', True)
    JWT_REFRESH_COOKIE_PATH = '/api/refresh'
    JWT_COOKIE_HTTPONLY = True
    RATELIMIT_STORAGE_URI = os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')
    CORS_ORIGINS = _cors_origins()
    MAX_CONTENT_LENGTH = _env_int('MAX_CONTENT_LENGTH', 2 * 1024 * 1024)
    
    # These names MUST match exactly
    DB_HOST     = os.environ.get('MYSQLHOST')
    DB_USER     = os.environ.get('MYSQLUSER')
    DB_PASSWORD = os.environ.get('MYSQLPASSWORD')
    DB_NAME     = os.environ.get('MYSQLDATABASE')
    DB_PORT     = os.environ.get('MYSQLPORT', '3306')
    
    # API Keys
    GEOAPIFY_KEY = os.environ.get('GEOAPIFY_KEY')
    MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN')
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
    FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', '')
    FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON', '')
    FIREBASE_SERVICE_ACCOUNT_PATH = os.environ.get('FIREBASE_SERVICE_ACCOUNT_PATH', '')

    MAIL_PROVIDER = os.environ.get('MAIL_PROVIDER', 'disabled').strip().lower()
    MAIL_API_KEY = os.environ.get('MAIL_API_KEY', '')
    MAIL_FROM = os.environ.get('MAIL_FROM', '')
    MAIL_FROM_NAME = os.environ.get('MAIL_FROM_NAME', 'Ano Tara!')
    MAIL_DOMAIN = os.environ.get('MAIL_DOMAIN', '')
    MAIL_DKIM_SELECTOR = os.environ.get('MAIL_DKIM_SELECTOR', '')
    MAIL_WEBHOOK_SECRET = os.environ.get('MAIL_WEBHOOK_SECRET', '')
    MAIL_SUPPRESSION_DB = os.environ.get('MAIL_SUPPRESSION_DB', '')
    MAIL_SEND_IMMEDIATELY = os.environ.get('MAIL_SEND_IMMEDIATELY', 'true')
    MAIL_SMTP_HOST = os.environ.get('MAIL_SMTP_HOST', '')
    MAIL_SMTP_PORT = _env_int('MAIL_SMTP_PORT', 587)
    MAIL_SMTP_USERNAME = os.environ.get('MAIL_SMTP_USERNAME', '')
    MAIL_SMTP_PASSWORD = os.environ.get('MAIL_SMTP_PASSWORD', '')
    MAIL_SMTP_USE_TLS = os.environ.get('MAIL_SMTP_USE_TLS', 'true').lower() == 'true'
    OTP_EXPIRES_MINUTES = _env_int('OTP_EXPIRES_MINUTES', 5)
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

    ADMIN_BACKUP_DIR = os.environ.get('ADMIN_BACKUP_DIR', os.path.join(os.path.dirname(__file__), 'admin_backups'))