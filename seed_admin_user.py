"""Create or promote the local Anotara super admin account.

Run from the repository root after database environment variables are loaded:
    ANOTARA_ADMIN_PASSWORD="your-password" python seed_admin_user.py
"""

import os

import bcrypt
import mysql.connector
from dotenv import load_dotenv


ADMIN_USERNAME = "Juan Dela Cruz"
ADMIN_EMAIL = "juandelacruz@gmail.com"


def seed_admin_user():
    """Upsert the known local super admin user with a bcrypt-hashed password."""
    load_dotenv()
    admin_password = os.environ.get("ANOTARA_ADMIN_PASSWORD")
    if not admin_password:
        raise RuntimeError("Set ANOTARA_ADMIN_PASSWORD before running this script.")

    hashed_password = bcrypt.hashpw(admin_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db = mysql.connector.connect(
        host=os.environ.get("MYSQLHOST"),
        user=os.environ.get("MYSQLUSER"),
        password=os.environ.get("MYSQLPASSWORD"),
        database=os.environ.get("MYSQLDATABASE"),
        port=os.environ.get("MYSQLPORT", "3306"),
    )
    cursor = db.cursor()
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'")
    except mysql.connector.Error as error:
        if error.errno != 1060:
            raise

    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (ADMIN_EMAIL,))
        existing_user = cursor.fetchone()

        if existing_user:
            cursor.execute(
                """
                UPDATE users
                SET username = %s, password = %s, role = 'super_admin'
                WHERE email = %s
                """,
                (ADMIN_USERNAME, hashed_password, ADMIN_EMAIL),
            )
        else:
            cursor.execute(
                """
                INSERT INTO users (username, email, password, role)
                VALUES (%s, %s, %s, 'super_admin')
                """,
                (ADMIN_USERNAME, ADMIN_EMAIL, hashed_password),
            )
        db.commit()
    finally:
        cursor.close()
        db.close()

    print(f"Super admin access is ready for {ADMIN_EMAIL}.")


if __name__ == "__main__":
    seed_admin_user()
