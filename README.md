# Job Agent Toolkit

Local, approval-first job discovery and application preparation for OpenClaw and the command line. Milestone one supplies a native OpenClaw tool plugin, a standalone `job-agent` CLI, a shared TypeScript core, SQLite persistence, deterministic matching, and a local Playwright mock workflow that stops before submission.

The previous LinkedIn, Wuzzuf, and Indeed Playwright agent remains under `src/application-agent`. It is not used by the safe milestone-one core and the existing Chrome extension remains unchanged and out of scope.

## What milestone one does

- Imports and validates an editable structured candidate profile with provenance-tracked facts.
- Searches a local fixture adapter, normalizes jobs, and deduplicates by source ID or stable fingerprint.
- Scores jobs with explainable, configurable components.
- Persists campaigns, runs, applications, approvals, transitions, and audit events in SQLite.
- Requires approval for salary, sponsorship, relocation, demographic, legal, unknown, and file-upload answers.
- Fills a deterministic local HTML application through Playwright and stops at `READY_TO_SUBMIT`.
- Registers 18 small, strict OpenClaw tools over the same service used by the CLI.
- Implements dry-run, cancellation signals, an emergency stop, redaction helpers, and duplicate-submission guards.

It does not submit to real job sites, bypass CAPTCHA/MFA/access controls, fine-tune a CV, or provide a Chrome extension UI.

## Quick start

```bash
npm install
npm run build
npm test
npm run plugin:validate
npm run vertical-slice
```

The safe demo resets only `.job-agent/job-agent.sqlite`, imports `fixtures/candidate-profile.json`, creates and runs a weekday fixture campaign, approves the fixture questions, fills `fixtures/mock-application.html`, and persists the review-only timeline. No network or production account is used.

Use the standalone CLI through npm during development:

```bash
npm run job-agent -- profile import fixtures/candidate-profile.json
npm run job-agent -- search --query "Node.js Backend Engineer" --location Egypt --remote
npm run job-agent -- applications list
```

After `npm link`, the same commands are available as `job-agent ...`.

## Architecture

```text
OpenClaw channels ──> OpenClaw ──> typed plugin tools ─┐
                                                       ├─> JobAgentService ─> adapters ─> job sites
Terminal ─────────────────────────> standalone CLI ────┘          │
                                                                  └─> SQLite + redacted artifacts
```

Tool and CLI handlers contain no business rules. Both create the same `JobAgentService`, which owns validation, policy, idempotency, state transitions, persistence, and adapter selection. Website content is data, never executable instructions.

Read [Architecture](docs/ARCHITECTURE.md), [CLI reference](docs/CLI.md), [OpenClaw setup](docs/OPENCLAW.md), [Security](docs/SECURITY.md), and [Troubleshooting](docs/TROUBLESHOOTING.md) before adding a live adapter.

## Current source status

- LinkedIn discovery and application in the legacy code are Playwright implementations. This repository contains no Composio dependency, tool slug, custom action, or current Composio-backed LinkedIn workflow.
- The legacy TypeScript application builds. Its persistent-Chrome mock test requires access to the user’s external Chrome profile; the new milestone-one test instead uses an isolated headless context.
- OpenClaw `2026.7.1-2` generated and validated `openclaw.plugin.json`. The simple typed-tool scaffold does not expose plugin-owned nested CLI registration, so `job-agent` is the supported direct CLI while OpenClaw uses model tools.

## Documentation

- [Architecture and vertical slice](docs/ARCHITECTURE.md)
- [CLI reference](docs/CLI.md)
- [OpenClaw linking and plugin configuration](docs/OPENCLAW.md)
- [Composio status and future integration](docs/COMPOSIO.md)
- [Adding a site adapter](docs/ADAPTERS.md)
- [Candidate profile format](docs/PROFILE.md)
- [Campaigns and scheduling](docs/CAMPAIGNS.md)
- [Security and threat model](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
