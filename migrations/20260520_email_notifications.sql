ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_preferences JSON NULL;

CREATE TABLE IF NOT EXISTS email_queue (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    recipient_user_id   INT NULL,
    recipient_email     VARCHAR(255) NOT NULL,
    recipient_name      VARCHAR(120) NULL,
    subject             VARCHAR(200) NOT NULL,
    template_name       VARCHAR(120) NOT NULL,
    category            VARCHAR(40) NOT NULL DEFAULT 'messages',
    context             JSON NOT NULL,
    provider            VARCHAR(30) NOT NULL DEFAULT 'disabled',
    status              VARCHAR(20) NOT NULL DEFAULT 'queued',
    priority            INT NOT NULL DEFAULT 50,
    attempts            INT NOT NULL DEFAULT 0,
    max_attempts        INT NOT NULL DEFAULT 5,
    send_at             DATETIME NULL,
    dedupe_key          CHAR(64) NOT NULL,
    last_error          TEXT,
    provider_message_id VARCHAR(160),
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    queued_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at             DATETIME NULL,
    failed_at           DATETIME NULL,
    UNIQUE KEY unique_email_dedupe (dedupe_key)
);

CREATE TABLE IF NOT EXISTS email_logs (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    queue_id            INT NULL,
    recipient_email     VARCHAR(255) NOT NULL,
    recipient_user_id   INT NULL,
    subject             VARCHAR(200) NOT NULL,
    template_name       VARCHAR(120) NOT NULL,
    category            VARCHAR(40) NOT NULL,
    provider            VARCHAR(30) NOT NULL,
    status              VARCHAR(20) NOT NULL,
    response_code       VARCHAR(40) NULL,
    response_body       MEDIUMTEXT,
    provider_message_id VARCHAR(160),
    attempt_number      INT NOT NULL DEFAULT 1,
    payload             JSON NOT NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (queue_id) REFERENCES email_queue(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS email_suppression (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    reason      VARCHAR(80) NOT NULL,
    source      VARCHAR(80) NOT NULL,
    details     JSON,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_suppressed_email (email)
);