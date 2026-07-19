# CLI reference

Use `npm run job-agent -- <command>` in a checkout or `job-agent <command>` after linking/installing the package. Add `--json` for stable JSON output. Validation failures exit `2`; operational failures exit `1`.

## Profiles

```bash
job-agent profile import fixtures/candidate-profile.json
job-agent profile show
job-agent profile show --id profile-backend
job-agent profile edit --input ./edited-profile.json
```

PDF imports use local deterministic text extraction and mark every extracted fact unverified; the imported CV is not approved for upload. Review and edit the structured profile before application use. JSON imports are validated directly against the full profile schema.

## Search and jobs

```bash
job-agent search --query "Node.js Backend Engineer" --location Egypt --remote --sites fixture
job-agent jobs list
job-agent jobs show <job-id>
```

`jobs show` includes the active profile’s explainable match score.

## Campaigns

```bash
job-agent campaign create \
  --query "Node.js Backend Engineer" \
  --schedule "0 9 * * 1-5" \
  --timezone "Africa/Cairo" \
  --sites fixture \
  --minimum-score 80 \
  --daily-limit 5 \
  --mode prepare_and_review

job-agent campaign list
job-agent campaign run <campaign-id>
job-agent campaign pause <campaign-id>
job-agent campaign resume <campaign-id>
```

## Applications and approvals

```bash
job-agent applications list
job-agent applications list --state FAILED_RETRYABLE
job-agent applications show <application-id>
job-agent applications approve <application-id>
job-agent applications reject <application-id>
job-agent applications fill <application-id>
job-agent applications retry <application-id>
```

`approve` approves all currently pending answers without changing their text. When exactly one approval is pending, `--answer "edited answer"` stores an edited response. `fill` is dry-run. `--allow-submit` requests submission, but an adapter and all policy settings must also permit it; the mock adapter always blocks it.

## Operations

```bash
job-agent status
job-agent emergency-stop
job-agent demo --reset
```

The emergency stop is durable. Clearing it is intentionally a service/API administration operation not exposed as a model tool in milestone one.
