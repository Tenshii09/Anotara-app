"""Admin analytics and retraining helpers for Sprint 5."""

from datetime import datetime
import json
import os
import subprocess
import sys
from pathlib import Path

from webapp.services.database import (
    ensure_feedback_columns,
    get_db,
    list_admin_accounts,
    list_admin_activity,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
TRAINING_SUMMARY_PATH = REPO_ROOT / 'anotara_model_metrics.json'
MODEL_ARTIFACTS = [
    REPO_ROOT / 'anotara_ml_model.pkl',
    REPO_ROOT / 'anotara_model_columns.pkl',
]


def _artifact_details(path):
    if not path.exists():
        return {
            'exists': False,
            'path': str(path),
            'size_bytes': 0,
            'updated_at': None,
        }

    stat = path.stat()
    return {
        'exists': True,
        'path': str(path),
        'size_bytes': stat.st_size,
        'updated_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def get_model_status():
    """Return filesystem metadata for the current training artifacts."""
    summary = {}
    if TRAINING_SUMMARY_PATH.exists():
        try:
            summary = json.loads(TRAINING_SUMMARY_PATH.read_text(encoding='utf-8'))
        except Exception:
            summary = {}

    return {
        'summary': summary,
        'artifacts': [_artifact_details(path) for path in MODEL_ARTIFACTS],
        'training_summary_file': _artifact_details(TRAINING_SUMMARY_PATH),
    }


def get_admin_analytics():
    """Aggregate feedback and model readiness data for the admin dashboard."""
    ensure_feedback_columns()
    connection = get_db()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute('SELECT COUNT(*) AS total_users FROM users')
        total_users = int(cursor.fetchone()['total_users'])

        cursor.execute('SELECT COUNT(*) AS total_itineraries FROM itineraries')
        total_itineraries = int(cursor.fetchone()['total_itineraries'])

        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_feedback,
                SUM(CASE WHEN rating_type = 'Best Pick' THEN 1 ELSE 0 END) AS positive_feedback,
                SUM(CASE WHEN rating_type = 'Not Ideal' THEN 1 ELSE 0 END) AS negative_feedback,
                COUNT(DISTINCT itinerary_id) AS feedback_itineraries,
                COUNT(DISTINCT user_id) AS feedback_users
            FROM trip_feedback
            """
        )
        feedback_overview = cursor.fetchone() or {}
        total_feedback = int(feedback_overview.get('total_feedback') or 0)
        positive_feedback = int(feedback_overview.get('positive_feedback') or 0)
        negative_feedback = int(feedback_overview.get('negative_feedback') or 0)
        feedback_itineraries = int(feedback_overview.get('feedback_itineraries') or 0)
        feedback_users = int(feedback_overview.get('feedback_users') or 0)

        cursor.execute(
            """
            SELECT
                COALESCE(p.category, 'Unknown') AS category,
                COUNT(*) AS feedback_count,
                SUM(CASE WHEN tf.rating_type = 'Best Pick' THEN 1 ELSE 0 END) AS positive_count,
                SUM(CASE WHEN tf.rating_type = 'Not Ideal' THEN 1 ELSE 0 END) AS negative_count,
                ROUND(
                    AVG(CASE WHEN tf.rating_type = 'Best Pick' THEN 1 ELSE 0 END),
                    2
                ) AS positive_rate
            FROM trip_feedback tf
            INNER JOIN places p ON p.id = tf.place_id
            GROUP BY COALESCE(p.category, 'Unknown')
            ORDER BY feedback_count DESC, category ASC
            """
        )
        category_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                p.id AS place_id,
                p.name,
                p.category,
                p.city,
                COUNT(*) AS feedback_count,
                SUM(CASE WHEN tf.rating_type = 'Best Pick' THEN 1 ELSE 0 END) AS positive_count,
                SUM(CASE WHEN tf.rating_type = 'Not Ideal' THEN 1 ELSE 0 END) AS negative_count,
                ROUND(
                    AVG(CASE WHEN tf.rating_type = 'Best Pick' THEN 1 ELSE 0 END),
                    2
                ) AS positive_rate,
                MAX(tf.created_at) AS last_feedback_at
            FROM trip_feedback tf
            INNER JOIN places p ON p.id = tf.place_id
            GROUP BY p.id, p.name, p.category, p.city
            ORDER BY feedback_count DESC, positive_rate DESC, p.name ASC
            LIMIT 10
            """
        )
        top_places = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                DATE(created_at) AS feedback_day,
                COUNT(*) AS total_feedback,
                SUM(CASE WHEN rating_type = 'Best Pick' THEN 1 ELSE 0 END) AS positive_feedback
            FROM trip_feedback
            WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY feedback_day ASC
            """
        )
        feedback_trend = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                tf.id AS feedback_id,
                tf.itinerary_id,
                tf.place_id,
                tf.rating_type,
                tf.feedback_notes,
                tf.created_at,
                u.username,
                u.email,
                p.name AS place_name,
                p.category,
                p.city
            FROM trip_feedback tf
            INNER JOIN users u ON u.id = tf.user_id
            INNER JOIN places p ON p.id = tf.place_id
            ORDER BY tf.created_at DESC, tf.id DESC
            LIMIT 10
            """
        )
        recent_feedback = cursor.fetchall()
    finally:
        cursor.close()
        connection.close()

    dataset_rows = total_feedback
    retraining_ready = dataset_rows >= 25 and feedback_itineraries >= 5

    return {
        'summary': {
            'total_users': total_users,
            'total_itineraries': total_itineraries,
            'total_feedback': total_feedback,
            'positive_feedback': positive_feedback,
            'negative_feedback': negative_feedback,
            'feedback_itineraries': feedback_itineraries,
            'feedback_users': feedback_users,
            'retraining_ready': retraining_ready,
            'retraining_threshold': 25,
        },
        'category_breakdown': category_rows,
        'top_places': top_places,
        'feedback_trend': feedback_trend,
        'recent_feedback': recent_feedback,
        'admin_accounts': list_admin_accounts(),
        'admin_activity': list_admin_activity(25),
        'model_status': get_model_status(),
    }


def retrain_model():
    """Run the reranker training script and return the command result."""
    script_path = REPO_ROOT / 'train_model.py'
    if not script_path.exists():
        raise FileNotFoundError('train_model.py was not found')

    # Windows uses a legacy code page by default, so force UTF-8 for emoji progress output.
    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUTF8'] = '1'

    completed = subprocess.run(
        [sys.executable, '-X', 'utf8', str(script_path)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        env=env,
        timeout=1800,
        check=False,
    )

    return {
        'success': completed.returncode == 0,
        'returncode': completed.returncode,
        'stdout': completed.stdout,
        'stderr': completed.stderr,
        'model_status': get_model_status(),
        'trained_at': datetime.utcnow().isoformat(),
    }