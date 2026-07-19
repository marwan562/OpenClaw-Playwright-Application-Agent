# Troubleshooting

## Plugin validation reports OpenClaw state warnings

In restricted environments, OpenClaw may warn that it cannot harden or update its global state database. If the command still ends with `Plugin job-agent is valid`, plugin metadata is valid; the warnings concern external OpenClaw state. Run runtime inspection from a normal user terminal after linking.

## Legacy test cannot launch Chrome

`npm run test:legacy` uses the existing persistent Chrome profile under the user’s OpenClaw directory and may fail under filesystem/process sandboxing. `npm test` uses the new isolated headless mock adapter and does not need that profile.

## Approval required

Inspect the application:

```bash
job-agent applications show <application-id>
job-agent applications approve <application-id>
```

Review sensitive answers before approval. If a proposed answer is wrong, approve the single pending item with `--answer` or use `jobs_approval_respond` through OpenClaw.

## Emergency stop is active

`job-agent status` shows the durable flag. Milestone one exposes activation broadly but deliberately omits a model-callable clear operation. Clear it only through a reviewed local administration path or reset a development database with `job-agent demo --reset`.

## No adapter for a site

Only `fixture` and `mock` are enabled in milestone one. LinkedIn, Wuzzuf, and Indeed legacy classes are not registered with the safe core. Follow [Adding a site adapter](ADAPTERS.md) rather than adding the site to `allowedSites` alone.

## Playwright browser is missing

Install the project’s pinned browser runtime from a normal terminal if needed:

```bash
npx playwright install chromium
```

Do not point the new adapter at a personal browser profile.
