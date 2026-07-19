import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryService } from './helpers.js';
import { normalizeJob } from '../src/job-agent/core/index.js';
import type { JobSiteAdapter } from '../src/job-agent/adapters/index.js';

describe('durable application workflow', () => {
  it('deduplicates search and preparation, then requires approvals', async () => {
    const fixture = temporaryService();
    try {
      await fixture.jobs.importProfile(resolve('fixtures/candidate-profile.json'));
      const search = await fixture.jobs.search({ query: 'Node.js Backend', location: 'Egypt', remote: true, sites: ['fixture'], excludedKeywords: [], limit: 10 });
      expect(search.jobs).toHaveLength(1);
      expect(search.duplicates).toBe(1);
      const prepared = await fixture.jobs.prepareApplication(search.jobs[0].id);
      expect(prepared.application.state).toBe('WAITING_FOR_APPROVAL');
      expect(prepared.approvals.map((approval) => approval.category)).toEqual(expect.arrayContaining(['salary', 'sponsorship', 'legal', 'file_upload']));
      const duplicate = await fixture.jobs.prepareApplication(search.jobs[0].id);
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.application.id).toBe(prepared.application.id);
      await expect(fixture.jobs.apply(prepared.application.id)).rejects.toThrow('Approval required');
    } finally { fixture.cleanup(); }
  });

  it('persists a complete safe fill timeline and never submits', async () => {
    const fixture = temporaryService();
    try {
      await fixture.jobs.importProfile(resolve('fixtures/candidate-profile.json'));
      const search = await fixture.jobs.search({ query: 'Node.js Backend', location: 'Egypt', remote: true, sites: ['fixture'], excludedKeywords: [], limit: 10 });
      const prepared = await fixture.jobs.prepareApplication(search.jobs[0].id);
      for (const approval of prepared.approvals) fixture.jobs.respondToApproval(approval.id, 'approve');
      const result = await fixture.jobs.apply(prepared.application.id, { dryRun: true });
      expect(result.application.state).toBe('READY_TO_SUBMIT');
      expect(result.application.submittedAt).toBeNull();
      const persisted = fixture.jobs.getApplication(result.application.id);
      expect(persisted.timeline.map((item) => item.toState)).toEqual(expect.arrayContaining(['DISCOVERED', 'QUESTIONS_EXTRACTED', 'WAITING_FOR_APPROVAL', 'FILLING', 'VALIDATING', 'READY_TO_SUBMIT']));
      const repeated = await fixture.jobs.apply(result.application.id, { dryRun: true });
      expect(repeated.result).toEqual({ status: 'READY_TO_SUBMIT', idempotent: true });
      expect(fixture.jobs.getApplication(result.application.id).timeline.filter((item) => item.toState === 'READY_TO_SUBMIT')).toHaveLength(1);
    } finally { fixture.cleanup(); }
  });

  it('cannot submit the same application twice', async () => {
    let submitCalls = 0;
    const fake: JobSiteAdapter = {
      id: 'fake', matches: () => true,
      search: async () => [], inspect: async (job) => job,
      prepare: async (job) => ({ jobId: job.id, cvVariantId: null, questions: [], answers: [] }),
      fill: async () => ({ status: 'READY_TO_SUBMIT', fieldsFilled: 0, message: 'ready' }),
      submit: async () => { submitCalls += 1; return { status: 'SUBMITTED', externalId: 'only-once', message: 'submitted' }; }
    };
    const fixture = temporaryService({ adapters: [fake], dryRun: false });
    try {
      const profile = await fixture.jobs.importProfile(resolve('fixtures/candidate-profile.json'));
      const stored = fixture.jobs.database.upsertJob(normalizeJob({ source: 'fake', sourceId: 'one', url: 'fake://one', employer: 'Acme', title: 'Node Engineer', description: 'Safe job data', location: 'Egypt' })).job;
      const prepared = await fixture.jobs.prepareApplication(stored.id, profile.id);
      const first = await fixture.jobs.apply(prepared.application.id, { dryRun: false, approveSubmission: true });
      const second = await fixture.jobs.apply(prepared.application.id, { dryRun: false, approveSubmission: true });
      expect(first.application.state).toBe('SUBMITTED');
      expect(second.application.state).toBe('SUBMITTED');
      expect(submitCalls).toBe(1);
    } finally { fixture.cleanup(); }
  });
});
