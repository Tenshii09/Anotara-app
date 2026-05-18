"""Central environment-based configuration for the Flask backend."""

import os
from dotenv import load_dotenv

# Load variables from the .env file into the environment
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'anotara-secret-key')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'super-secret-jwt-key')
    
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