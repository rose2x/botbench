# Security

## Reporting a problem

Please report security problems privately, using GitHub's "Report a vulnerability" button on the Security tab, not in a public issue.

## If you leaked a token

Anyone who has your bot token can control your bot. If it appeared in a commit, an issue, a screenshot or a log:

1. Open the Discord Developer Portal, your application, Bot, and press **Reset Token**. Do this first.
2. Update your `.env` (never commit it) or your host's secret settings.
3. Removing the commit is not enough. Treat the old token as public and dead.

The same goes for webhook URLs (delete and recreate the webhook) and API keys (revoke at the provider).

## What this project does not do

It uses only Discord's documented API with bot tokens. It contains no self-bot or user-token code, and contributions of that kind will be declined, because they break Discord's Terms of Service.
