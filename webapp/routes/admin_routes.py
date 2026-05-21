"""Admin operations routes for secure Ano-Tara management."""

from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt_identity

from train_model import train_model
from webapp.security import requires_role
from webapp.services.email_service import list_admin_email_ops, queue_email
from webapp.services.database import (
    create_admin_backup,
    create_admin_place,
    create_admin_notification_log,
    create_ml_training_run,
    ensure_admin_tables,
    export_feedback_training_dataset,
    finish_ml_training_run,
    get_admin_analytics,
    get_admin_audit_log,
    get_admin_backup_record,
    get_admin_itinerary_detail,
    get_admin_notification_overview,
    get_admin_overview,
    get_latest_ml_training_run,
    list_admin_backups,
    list_admin_weather_alerts,
    list_admin_itineraries,
    list_admin_places,
    list_admin_push_recipient_ids,
    list_admin_settings,
    list_admin_users,
    list_ml_training_runs,
    log_admin_action,
    restore_admin_backup,
    update_admin_setting,
    update_admin_place,
    update_admin_user_role,
    update_admin_user_status,
)
from webapp.services.push_notifications import send_push_to_topic, send_push_to_user

admin_bp = Blueprint('admin', __name__)


def _request_context():
    """Capture request metadata for audit entries."""
    return {
        'ip_address': request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip(),
        'user_agent': request.headers.get('User-Agent', ''),
    }


def _log_action(actor_id, action, target_type, target_id=None, payload=None):
    context = _request_context()
    return log_admin_action(
        actor_id,
        action,
        target_type,
        target_id=target_id,
        payload=payload,
        ip_address=context['ip_address'],
        user_agent=context['user_agent'],
    )


admin_required = requires_role('admin', 'super_admin')
super_admin_required = requires_role('super_admin')


@admin_bp.before_request
def ensure_admin_schema():
    """Keep local/staging databases upgraded when admin endpoints are used."""
    if request.path.startswith('/api/admin'):
        ensure_admin_tables()


@admin_bp.route('/api/admin/overview', methods=['GET'])
@admin_required
def api_admin_overview():
    """Return the admin command-center summary."""
    return jsonify(get_admin_overview()), 200


@admin_bp.route('/api/admin/users', methods=['GET'])
@admin_required
def api_admin_users():
    """Return searchable user and admin account rows."""
    users = list_admin_users(
        search_query=request.args.get('q', ''),
        page=request.args.get('page', 1),
        limit=request.args.get('limit', 50),
    )
    return jsonify(users), 200


@admin_bp.route('/api/admin/users/<int:user_id>/role', methods=['PATCH'])
@super_admin_required
def api_admin_update_user_role(user_id):
    """Promote, demote, or normalize a user's role."""
    actor_id = get_jwt_identity()
    data = request.get_json() or {}
    role = data.get('role')
    result, error = update_admin_user_role(actor_id, user_id, role)
    if error:
        return jsonify({'error': error}), 400

    _log_action(actor_id, 'user.role.update', 'user', user_id, {'role': role})
    return jsonify(result), 200


@admin_bp.route('/api/admin/users/<int:user_id>/status', methods=['PATCH'])
@admin_required
def api_admin_update_user_status(user_id):
    """Suspend or reactivate a user account."""
    actor_id = get_jwt_identity()
    data = request.get_json() or {}
    status = data.get('account_status') or data.get('status')
    reason = data.get('reason') or ''
    result, error = update_admin_user_status(actor_id, user_id, status, reason)
    if error:
        return jsonify({'error': error}), 400

    if result.get('email'):
        queue_email({
            'recipient_user_id': result['id'],
            'recipient_email': result['email'],
            'recipient_name': result.get('username'),
            'subject': f"Your account status changed to {result.get('account_status')}",
            'template_name': 'account_status_changed',
            'category': 'security',
            'context': {
                'username': result.get('username'),
                'account_status': result.get('account_status'),
                'reason': reason,
                'previous_account_status': result.get('previous_account_status'),
            },
        })

    _log_action(actor_id, 'user.status.update', 'user', user_id, {'account_status': status, 'reason': reason})
    return jsonify(result), 200


@admin_bp.route('/api/admin/places', methods=['GET'])
@admin_required
def api_admin_places():
    """Return searchable destination/content records."""
    places = list_admin_places(
        search_query=request.args.get('q', ''),
        page=request.args.get('page', 1),
        limit=request.args.get('limit', 80),
    )
    return jsonify(places), 200


@admin_bp.route('/api/admin/places', methods=['POST'])
@admin_required
def api_admin_create_place():
    """Create a destination/content record."""
    actor_id = get_jwt_identity()
    data = request.get_json() or {}
    result, error = create_admin_place(actor_id, data)
    if error:
        return jsonify({'error': error}), 400

    _log_action(actor_id, 'place.create', 'place', result['id'], data)
    return jsonify(result), 201


@admin_bp.route('/api/admin/places/<int:place_id>', methods=['PATCH'])
@admin_required
def api_admin_update_place(place_id):
    """Update destination/content metadata."""
    actor_id = get_jwt_identity()
    data = request.get_json() or {}
    result, error = update_admin_place(actor_id, place_id, data)
    if error:
        return jsonify({'error': error}), 400

    _log_action(actor_id, 'place.update', 'place', place_id, data)
    return jsonify(result), 200


@admin_bp.route('/api/admin/analytics', methods=['GET'])
@admin_required
def api_admin_analytics():
    """Return data-series for admin visualizations."""
    return jsonify(get_admin_analytics(
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date'),
    )), 200


@admin_bp.route('/api/admin/itineraries', methods=['GET'])
@admin_required
def api_admin_itineraries():
    """Return searchable saved-trip rows for admin inspection."""
    return jsonify(list_admin_itineraries(
            search_query=request.args.get('q', ''),
            status=request.args.get('status', ''),
            page=request.args.get('page', 1),
            limit=request.args.get('limit', 60),
        )), 200


@admin_bp.route('/api/admin/itineraries/<int:itinerary_id>', methods=['GET'])
@admin_required
def api_admin_itinerary_detail(itinerary_id):
    """Return detailed itinerary metadata and stops for support review."""
    detail = get_admin_itinerary_detail(itinerary_id)
    if not detail:
        return jsonify({'error': 'Itinerary not found'}), 404
    return jsonify(detail), 200


@admin_bp.route('/api/admin/notifications', methods=['GET'])
@admin_required
def api_admin_notifications():
    """Return push coverage and recent admin notification sends."""
    return jsonify(get_admin_notification_overview()), 200


@admin_bp.route('/api/admin/backups', methods=['GET'])
@admin_required
def api_admin_backups():
    """Return backup history for export and restore operations."""
    return jsonify(list_admin_backups(
        page=request.args.get('page', 1),
        limit=request.args.get('limit', 10),
    )), 200


@admin_bp.route('/api/admin/backups', methods=['POST'])
@admin_required
def api_admin_create_backup():
    """Create a full database backup and register it in history."""
    actor_id = get_jwt_identity()
    backup = create_admin_backup(actor_id)
    _log_action(actor_id, 'backup.export', 'backup', backup['id'], backup)
    return jsonify(backup), 201


@admin_bp.route('/api/admin/backups/<int:backup_id>/download', methods=['GET'])
@admin_required
def api_admin_download_backup(backup_id):
    """Download a previously exported backup archive."""
    record = get_admin_backup_record(backup_id)
    if not record:
        return jsonify({'error': 'Backup not found'}), 404

    file_path = Path(record.get('file_path') or '')
    if not file_path.exists():
        return jsonify({'error': 'Backup file is no longer available.'}), 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name=record.get('file_name') or file_path.name,
        mimetype='application/zip',
    )


@admin_bp.route('/api/admin/backups/<int:backup_id>/restore', methods=['POST'])
@super_admin_required
def api_admin_restore_backup_from_history(backup_id):
    """Restore the database from a stored backup archive."""
    actor_id = get_jwt_identity()
    record = get_admin_backup_record(backup_id)
    if not record:
        return jsonify({'error': 'Backup not found'}), 404

    file_path = record.get('file_path')
    if not file_path:
        return jsonify({'error': 'Backup file is not available.'}), 404

    restored = restore_admin_backup(actor_id, file_path)
    _log_action(actor_id, 'backup.restore', 'backup', backup_id, restored)
    return jsonify(restored), 200


@admin_bp.route('/api/admin/backups/restore', methods=['POST'])
@super_admin_required
def api_admin_restore_backup_upload():
    """Restore the database from an uploaded backup archive."""
    actor_id = get_jwt_identity()
    backup_file = request.files.get('backup_file')
    if not backup_file:
        return jsonify({'error': 'A backup_file upload is required.'}), 400

    suffix = Path(backup_file.filename or '').suffix.lower()
    if suffix not in {'.zip'}:
        return jsonify({'error': 'Backups must be uploaded as .zip archives.'}), 400

    upload_dir = Path(current_app.config.get('ADMIN_BACKUP_DIR') or (Path(current_app.root_path).resolve().parent / 'admin_backups'))
    upload_dir.mkdir(parents=True, exist_ok=True)
    uploaded_name = Path(backup_file.filename or 'backup.zip').name
    uploaded_path = upload_dir / f"uploaded-{uploaded_name}"
    backup_file.save(uploaded_path)

    try:
        restored = restore_admin_backup(actor_id, uploaded_path)
    finally:
        if uploaded_path.exists():
            uploaded_path.unlink(missing_ok=True)

    _log_action(actor_id, 'backup.restore', 'backup', restored['id'], restored)
    return jsonify(restored), 200


@admin_bp.route('/api/admin/email', methods=['GET'])
@admin_required
def api_admin_email_ops():
    """Return email queue, delivery logs, and suppression records."""
    return jsonify(list_admin_email_ops(
        search_query=request.args.get('q', ''),
        page=request.args.get('page', 1),
        limit=request.args.get('limit', 30),
    )), 200


@admin_bp.route('/api/admin/weather', methods=['GET'])
@admin_required
def api_admin_weather_ops():
    """Return the latest stored weather alerts for admin review."""
    active_only = request.args.get('active_only')
    if active_only is None or active_only == '':
        active_flag = None
    else:
        active_flag = str(active_only).lower() in {'1', 'true', 'yes'}
    return jsonify(list_admin_weather_alerts(
        search_query=request.args.get('q', ''),
        active_only=active_flag,
        page=request.args.get('page', 1),
        limit=request.args.get('limit', 50),
    )), 200


@admin_bp.route('/api/admin/notifications/send', methods=['POST'])
@admin_required
def api_admin_send_notification():
    """Send a targeted or broad operational push notification."""
    return _send_admin_notification()


@admin_bp.route('/api/send-notification', methods=['POST'])
@admin_required
def api_send_notification():
    """Send the Admin UI notification payload through Firebase."""
    return _send_admin_notification()


def _send_admin_notification():
    """Send a targeted token push or all-user topic broadcast."""
    actor_id = get_jwt_identity()
    data = request.get_json() or {}
    title = str(data.get('title') or '').strip()
    body = str(data.get('body') or '').strip()
    audience_type = str(data.get('audience_type') or data.get('audience') or 'all').strip().lower()
    target_user_id = data.get('target_user_id')

    if audience_type in ('all_users', 'all reachable users', 'all-reachable-users'):
        audience_type = 'all'

    if not title or not body:
        return jsonify({'error': 'Notification title and body are required.'}), 400
    if audience_type not in ('user', 'all'):
        return jsonify({'error': 'Invalid notification audience.'}), 400
    if audience_type == 'user' and not target_user_id:
        return jsonify({'error': 'Target user is required for targeted notifications.'}), 400

    result = {
        'recipient_count': 0,
        'sent': 0,
        'failed': 0,
        'skipped': 0,
        'details': [],
    }
    payload = {
        'title': title[:140],
        'body': body,
        'source': 'system',
        'audience_type': audience_type,
        'url': '/notifications',
        'tag': 'anotara-admin-broadcast',
        'icon': '/ano-tara-notification-icon.png',
        'badge': '/ano-tara-notification-icon.png',
    }

    if audience_type == 'all':
        delivery = send_push_to_topic('all_users', payload)
        result['sent'] += int(delivery.get('sent') or 0)
        result['failed'] += int(delivery.get('failed') or 0)
        if delivery.get('skipped'):
            result['skipped'] += 1
        result['details'].append(delivery)
    else:
        recipient_ids = list_admin_push_recipient_ids(audience_type, target_user_id)
        result['recipient_count'] = len(recipient_ids)
        for recipient_id in recipient_ids:
            delivery = send_push_to_user(recipient_id, payload)
            result['sent'] += int(delivery.get('sent') or 0)
            result['failed'] += int(delivery.get('failed') or 0)
            if delivery.get('skipped'):
                result['skipped'] += 1
            result['details'].append({'user_id': recipient_id, **delivery})

    log_id = create_admin_notification_log(
        actor_id,
        audience_type,
        target_user_id if audience_type == 'user' else None,
        title,
        body,
        result,
    )
    _log_action(actor_id, 'notification.send', 'notification', log_id, {
        'audience_type': audience_type,
        'target_user_id': target_user_id,
        'title': title,
        'recipient_count': result['recipient_count'],
        'topic': 'all_users' if audience_type == 'all' else None,
    })
    return jsonify({'id': log_id, 'result': result}), 200


@admin_bp.route('/api/admin/settings', methods=['GET'])
@admin_required
def api_admin_settings():
    """Return editable admin settings."""
    return jsonify({'settings': list_admin_settings()}), 200


@admin_bp.route('/api/admin/settings/<setting_key>', methods=['PATCH'])
@super_admin_required
def api_admin_update_setting(setting_key):
    """Update one operations setting."""
    actor_id = get_jwt_identity()
    data = request.get_json() or {}
    result, error = update_admin_setting(actor_id, setting_key, data.get('setting_value'))
    if error:
        return jsonify({'error': error}), 400

    _log_action(actor_id, 'setting.update', 'setting', None, result)
    return jsonify(result), 200


@admin_bp.route('/api/admin/ml/status', methods=['GET'])
@admin_required
def api_admin_ml_status():
    """Return model status and recent training history."""
    return jsonify({
        'latest': get_latest_ml_training_run(),
        'history': list_ml_training_runs(),
    }), 200


@admin_bp.route('/api/admin/ml/retrain', methods=['POST'])
@admin_required
def api_admin_ml_retrain():
    """Retrain the RandomForest classifier from user-generated feedback signals."""
    actor_id = get_jwt_identity()
    dataset_path, dataset_rows = export_feedback_training_dataset()
    if not dataset_path:
        return jsonify({'error': 'No feedback training data is available yet.'}), 400

    run_id = create_ml_training_run(actor_id, dataset_rows=dataset_rows)
    _log_action(actor_id, 'ml.retrain.request', 'ml_training_run', run_id, {'dataset_rows': dataset_rows})

    try:
        _model, _columns, metrics = train_model(dataset_path=dataset_path, return_metrics=True)
        finish_ml_training_run(
            run_id,
            status='completed',
            dataset_rows=dataset_rows,
            accuracy=metrics.get('accuracy'),
            metrics=metrics,
            artifact_paths=metrics.get('artifact_paths'),
        )
    except Exception as error:  # pragma: no cover - surfaced to admin API.
        finish_ml_training_run(
            run_id,
            status='failed',
            dataset_rows=dataset_rows,
            error_message=str(error),
        )
        return jsonify({'error': 'Retraining failed.', 'detail': str(error), 'run_id': run_id}), 500

    return jsonify({'run_id': run_id, 'status': 'completed', 'metrics': metrics}), 200


@admin_bp.route('/api/admin/audit-log', methods=['GET'])
@admin_required
def api_admin_audit_log():
    """Return privileged-action audit events."""
    page = max(1, int(request.args.get('page', 1)))
    limit = max(1, int(request.args.get('limit', 30)))
    events = get_admin_audit_log(
        limit=limit,
        offset=(page - 1) * limit,
        action=request.args.get('action', ''),
        target_type=request.args.get('target_type', ''),
        actor_id=request.args.get('actor_id'),
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date'),
    )
    return jsonify(events), 200
