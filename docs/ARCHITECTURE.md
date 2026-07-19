# Architecture

## Component map

`src/job-agent/schemas` contains strict Zod contracts for profiles, facts, jobs, scores, questions, answers, campaigns, applications, approvals, and states. External JSON crosses a schema boundary before entering the core.

`src/job-agent/database` owns SQLite migrations and repositories. The first migration stores profiles, CV metadata, answer-library entries, jobs, campaigns, schedules, runs, applications, transitions, approvals, audit events, and global settings. JSON payloads remain schema-validated when read and written; indexed columns enforce identity and idempotency.

`src/job-agent/core` owns normalization, scoring, sensitive-question policy, the state machine, scheduling previews, approvals, the emergency stop, and the `JobAgentService` facade.

`src/job-agent/adapters` defines the provider-independent adapter contract. `FixtureJobAdapter` proves discovery and normalization. `MockPlaywrightAdapter` uses fixed accessible selectors against a saved local HTML fixture, records a screenshot and trace, and cannot submit.

`src/job-agent/cli` and `src/plugin` are thin delivery layers. They call the same service and never execute arbitrary browser JavaScript or accept arbitrary selectors.

The older `src/application-agent` tree is preserved. Its Playwright workflows should be wrapped behind the new adapter contract only after their authentication, question, and submit paths meet the new policy requirements.

## First vertical slice

1. Import `fixtures/candidate-profile.json` and validate every field and provenance record.
2. Create a weekday campaign with a structured cron expression and IANA timezone.
3. Search `fixtures/jobs.json` and normalize all candidates.
4. Deduplicate the repeated Node.js listing by fingerprint.
5. Calculate an explainable deterministic score against the backend profile.
6. Persist one application and every state transition.
7. Extract the fixed mock fields and prepare answers with confidence, fact IDs, model metadata, and timestamps.
8. Create approvals for sponsorship, legal authorization, salary, and CV upload.
9. Fill the local form only after approvals are resolved.
10. Validate the review page, capture screenshot/trace artifacts, and stop at `READY_TO_SUBMIT`.

`npm run vertical-slice` runs this flow without a production account or submission.

## Idempotency

Jobs are unique by `(source, source_id)` and by normalized fingerprint. Applications have a stable SHA-256 submission key derived from job, profile, and campaign. A campaign/job/profile tuple is reused rather than recreated. `SUBMITTED` is terminal, and a repeated apply call returns the persisted result without invoking an adapter. The milestone-one mock adapter is additionally incapable of submission.

## State recovery

The database records the current application plus an append-only transition timeline. Retry is accepted only from `FAILED_RETRYABLE`; it increments the retry counter and reuses the same application and submission key. Process restarts therefore do not lose approval or workflow position.

## Future extension

A future Manifest V3 extension should be UI only. It will authenticate to OpenClaw Gateway RPC and expose chat, campaign state, pending approvals, execution events, application previews, emergency stop, and optional visible-page autofill. It must call the same OpenClaw tools and must not embed business rules, credentials, arbitrary selectors, or submission logic.
