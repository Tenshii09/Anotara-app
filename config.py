# config.py — Central configuration for the app
# Update DB credentials to match your XAMPP setup

class Config:
    SECRET_KEY = 'your-very-secret-key-change-this'  # Used for session encryption

    # MySQL connection settings (XAMPP defaults)
    DB_HOST     = 'localhost'
    DB_USER     = 'root'
    DB_PASSWORD = ''          # XAMPP default is empty
    DB_NAME     = 'travel_planner'

    # Geoapify API key — get a free key at [myprojects.geoapify.com](https://myprojects.geoapify.com)
    GEOAPIFY_KEY = '342991708b9e4c3f8720876ba5d01dec'
