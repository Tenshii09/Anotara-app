import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY   = os.environ.get('SECRET_KEY', 'fallback-secret')
    DB_HOST      = 'localhost'
    DB_USER      = 'root'
    DB_PASSWORD  = ''
    DB_NAME      = 'travel_planner'
    GEOAPIFY_KEY = os.environ.get('GEOAPIFY_KEY')
    MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN')