import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY   = os.environ.get('SECRET_KEY', 'anotara-production-secret-key')
    
    # Check for Railway's MySQL variables first, fallback to local XAMPP
    DB_HOST      = os.environ.get('MYSQLHOST', 'localhost')
    DB_USER      = os.environ.get('MYSQLUSER', 'root')
    DB_PASSWORD  = os.environ.get('MYSQLPASSWORD', '')
    DB_NAME      = os.environ.get('MYSQLDATABASE', 'travel_planner')
    
    # Port configuration for Railway
    DB_PORT      = os.environ.get('MYSQLPORT', '3306')
    
    GEOAPIFY_KEY = os.environ.get('GEOAPIFY_KEY')
    MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN')