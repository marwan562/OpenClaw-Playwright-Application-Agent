# Campaigns and scheduling

A campaign persists its search criteria, sites, profile/CV selection, threshold, per-run and daily limits, mode, five-field cron schedule, IANA timezone, quiet hours, retry policy, and timestamps.

Modes:

- `research_only`: discover and score only.
- `prepare_and_review`: prepare qualifying applications and request approvals. This is the default.
- `auto_submit`: permits the workflow to request submission only after all sensitive answers and the final action are explicitly approved, dry-run is disabled, site settings allow it, and the adapter implements safe idempotent submission.

Before saving, the service validates the cron shape and timezone and returns a preview. For `0 9 * * 1-5` in `Africa/Cairo`, the preview begins “Every Monday–Friday at 09:00 Africa/Cairo”.

Conversational schedules should be created in OpenClaw and call `jobs_campaign_run` with the campaign ID. Store the same structured cron/timezone in this toolkit so the workflow remains explainable. Pausing a campaign preserves its schedule and history but blocks runs.

Campaign runs reuse normalized jobs and application submission keys. Per-run summary counts include discovered, duplicates, scored, selected, prepared, submitted, and failed items.
