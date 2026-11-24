---
name: auto-notify
description: Prepare or explicitly send a selected Slack notification without automatic delivery.
---

# Optional Slack notification

Only use this workflow when the user explicitly asks to send a specific message to a specific destination. Read the project instructions and prepare the exact message in a local UTF-8 file. Verify the configured Slack webhook belongs to the intended workspace and channel using an independently trusted method; the destination label is not verified by the CLI. Keep `SLACK_WEBHOOK_URL` in the environment, never in a file, argument, message or report.

Run `slack-notification-plan <destination-label> <body.md>` and show the exact text and destination label. When that concrete message is explicitly authorized, `slack-notification-send <destination-label> <body.md> <preview-sha256>` rechecks the body and webhook and sends one request. Slack can interpret mentions and formatting; review the content accordingly. Never send as a side effect of a webhook, CI event, PR review or task completion.

An unclear response can mean a message was posted; inspect the channel before retrying. The command has only simulated validation and does not establish channel identity or message delivery beyond Slack's acknowledgment.
