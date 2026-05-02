import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'anotara-secret-key')
    
    # These names MUST match image_a32481.png exactly
    DB_HOST     = os.environ.get('MYSQLHOST')
    DB_USER     = os.environ.get('MYSQLUSER')
    DB_PASSWORD = os.environ.get('MYSQLPASSWORD')
    DB_NAME     = os.environ.get('MYSQLDATABASE')
    DB_PORT     = os.environ.get('MYSQLPORT', '3306')
    
    # API Keys
    GEOAPIFY_KEY = os.environ.get('GEOAPIFY_KEY')
    MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN')