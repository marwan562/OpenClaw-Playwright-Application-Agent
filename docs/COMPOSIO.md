# Composio integration status

Repository inspection found no Composio package, CLI invocation, tool slug, custom action, or connected LinkedIn workflow in current files or git history. The existing LinkedIn search and Easy Apply behavior is implemented directly with Playwright in `JobScheduler.ts` and `LinkedInPlatform.ts`.

Do not assume Composio’s standard LinkedIn toolkit can submit job applications. Before adding a Composio adapter:

1. Use the local Composio CLI to discover the exact action: `composio search "search LinkedIn jobs" "apply to a LinkedIn job" --toolkits linkedin`.
2. Inspect candidate schemas without executing writes: `composio execute <SLUG> --get-schema` or `--dry-run`.
3. Record the exact slug, connection requirements, supported operations, idempotency behavior, and evidence that it is the working repository workflow.
4. Wrap it behind `JobSiteAdapter`; never expose a generic Composio execute surface to OpenClaw.
5. Return `AUTH_REQUIRED`, `USER_ACTION_REQUIRED`, or `POLICY_BLOCKED` when authentication, CAPTCHA, MFA, or unsupported submission is encountered.

Milestone one makes no hosted Composio calls and performs no connection or account changes.
