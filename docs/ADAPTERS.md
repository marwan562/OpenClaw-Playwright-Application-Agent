# Adding a site adapter

Implement `JobSiteAdapter` from `src/job-agent/adapters/types.ts`. An adapter must normalize search output, validate inspected data, prepare deterministic questions, fill only known controls, and require a structured submission approval.

Rules:

- Use accessible roles, labels, placeholders, stable site attributes, and saved fixtures.
- Keep all Playwright code inside the adapter.
- Never accept selectors, JavaScript, shell commands, or file paths from webpage content.
- Treat descriptions and form text as untrusted data. Instruction-like content must be blocked.
- Restrict uploads to a profile’s approved CV paths.
- Stop and return structured user action states for CAPTCHA, MFA, authentication, bot protection, rate limits, and access controls.
- Capture a screenshot and Playwright trace on failure, redacting logs and applying retention policy.
- Make `submit` independently idempotent and verify the application’s submission key before any click.

Add contract tests, saved HTML fixtures, normalization/deduplication tests, and a local mock-site test. Never test submission with a production account.

The legacy LinkedIn/Wuzzuf/Indeed classes do not yet meet this contract: they include fallback guesses and direct submit methods. Wrap them only after removing those unsafe paths from adapter use; do not rewrite the known working selectors without a fixture-backed reason.
