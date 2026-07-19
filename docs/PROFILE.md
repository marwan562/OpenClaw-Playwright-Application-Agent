# Candidate profile format

`CandidateProfileSchema` is the source of truth. A profile contains identity, contact data, experience, education, skills, projects, certifications, languages, portfolio links, location, work authorization, sponsorship, availability, salary and relocation preferences, approved CV variants, reusable approved answers, and provenance facts.

Each fact has:

- a stable fact ID used by prepared answers;
- a field path and scalar value;
- provenance: `verified_user_fact`, `preference`, `approved_answer`, `model_generated`, or `unknown`;
- a separate `verified` flag;
- source and update timestamp.

Every prepared answer stores its proposed text, confidence, supporting fact IDs, confirmation requirement, deterministic/model provider metadata, and creation time. Approving edited prose stores the answer response; it does not convert the prose into a verified candidate fact.

CV variants must be explicitly approved and tagged. The mock uploader accepts only the exact resolved paths present in `approvedCvVariants`. Keep CV binaries local and do not put secrets or authentication data in profile JSON.

Use `fixtures/candidate-profile.json` as an editable example. It is based on data already present in this repository’s user-provided CV and legacy profile.
