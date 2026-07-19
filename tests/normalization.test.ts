import { describe, expect, it } from 'vitest';
import { fingerprintJob, normalizeJob } from '../src/job-agent/core/index.js';
import { temporaryService } from './helpers.js';

describe('job normalization and deduplication', () => {
  it('creates a stable normalized fingerprint', () => {
    const a = fingerprintJob({ employer: ' Example, Inc. ', title: 'Node.js Engineer', location: 'Cairo', description: 'Build APIs' });
    const b = fingerprintJob({ employer: 'example inc', title: 'node.js engineer', location: 'CAIRO', description: 'Build   APIs' });
    expect(a).toBe(b);
  });

  it('deduplicates by fingerprint even when source ids differ', () => {
    const fixture = temporaryService();
    try {
      const raw = { source: 'fixture', sourceId: 'one', url: 'mock://one', employer: 'Acme', title: 'Node Engineer', description: 'Node APIs', location: 'Egypt' };
      expect(fixture.jobs.database.upsertJob(normalizeJob(raw)).duplicate).toBe(false);
      expect(fixture.jobs.database.upsertJob(normalizeJob({ ...raw, sourceId: 'two', url: 'mock://two' })).duplicate).toBe(true);
      expect(fixture.jobs.listJobs()).toHaveLength(1);
    } finally { fixture.cleanup(); }
  });
});
