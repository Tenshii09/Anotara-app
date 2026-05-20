"""Central environment-based configuration for the Flask backend."""

import os
from datetime import timedelta
from dotenv import load_dotenv

# Load variables from the .env file into the environment
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'anotara-secret-key')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'super-secret-jwt-key')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.environ.get('JWT_ACCESS_TOKEN_MINUTES', '15'))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.environ.get('JWT_REFRESH_TOKEN_DAYS', '30'))
    )
    JWT_TOKEN_LOCATION = ['headers', 'cookies']
    JWT_COOKIE_SECURE = os.environ.get('JWT_COOKIE_SECURE', 'false').lower() == 'true'
    JWT_COOKIE_SAMESITE = os.environ.get('JWT_COOKIE_SAMESITE', 'Lax')
    JWT_REFRESH_COOKIE_PATH = '/api/refresh'
    
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
    MAIL_SMTP_PORT = int(os.environ.get('MAIL_SMTP_PORT', '587'))
    MAIL_SMTP_USERNAME = os.environ.get('MAIL_SMTP_USERNAME', '')
    MAIL_SMTP_PASSWORD = os.environ.get('MAIL_SMTP_PASSWORD', '')
    MAIL_SMTP_USE_TLS = os.environ.get('MAIL_SMTP_USE_TLS', 'true').lower() == 'true'