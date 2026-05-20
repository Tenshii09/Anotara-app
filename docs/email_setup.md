# Email Setup

## Required Config

- `MAIL_PROVIDER` must be one of `disabled`, `sendgrid`, `mailgun`, or `smtp`.
- `MAIL_API_KEY` is required for SendGrid or Mailgun.
- `MAIL_FROM` and `MAIL_FROM_NAME` define the sender identity.
- `MAIL_WEBHOOK_SECRET` protects the provider webhook.
- `MAIL_DOMAIN` is required for Mailgun.

## Optional Config

- `MAIL_DKIM_SELECTOR`
- `MAIL_SUPPRESSION_DB`
- `MAIL_SEND_IMMEDIATELY`
- `MAIL_SMTP_HOST`
- `MAIL_SMTP_PORT`
- `MAIL_SMTP_USERNAME`
- `MAIL_SMTP_PASSWORD`
- `MAIL_SMTP_USE_TLS`

## Delivery Flow

1. The app queues transactional email jobs into `email_queue`.
2. The `flask email-queue` command processes due jobs once.
3. Provider bounce and complaint events post to `/api/webhooks/email`.
4. Suppressed recipients are skipped on future sends.

## Run Commands

- Process queued jobs once: `flask email-queue`
- Run the weather monitor: `flask weather-monitor`

## Troubleshooting

- No delivery usually means the provider is disabled, `MAIL_FROM` is missing, or the recipient is suppressed.
- If webhook calls fail, confirm the shared secret and payload shape.
- If a message stays queued, check whether `send_at` is still in the future.
