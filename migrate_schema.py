"""Apply all database schema upgrades for a deployed Anotara instance."""

from app import app
from webapp.services.database import ensure_schema_upgrades


def main():
    """Run the full idempotent schema migration set."""
    # Reuse the Flask app context so the migration sees the same database settings as the API.
    with app.app_context():
        ensure_schema_upgrades()
    print('Schema migration completed successfully.')


if __name__ == '__main__':
    main()