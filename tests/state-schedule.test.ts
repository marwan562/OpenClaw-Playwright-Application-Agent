import { describe, expect, it } from 'vitest';
import { canTransition, schedulePreview } from '../src/job-agent/core/index.js';
import { temporaryService } from './helpers.js';
import { resolve } from 'node:path';

describe('state machine and campaign scheduling', () => {
  it('imports a PDF without fabricating verified facts or approving the upload', async () => {
    const fixture = temporaryService();
    try {
      const profile = await fixture.jobs.importProfile(resolve('assets/Marwan_Hassan-Resume.pdf'));
      expect(profile.facts.length).toBeGreaterThan(0);
      expect(profile.facts.every((fact) => !fact.verified && fact.provenance === 'model_generated')).toBe(true);
      expect(profile.approvedCvVariants[0].approved).toBe(false);
    } finally { fixture.cleanup(); }
  });

  it('allows the durable happy path and rejects duplicate submission transitions', () => {
    expect(canTransition('READY_TO_SUBMIT', 'SUBMITTING')).toBe(true);
    expect(canTransition('SUBMITTING', 'SUBMITTED')).toBe(true);
    expect(canTransition('SUBMITTED', 'SUBMITTING')).toBe(false);
  });

  it('validates timezone and produces an activation preview', async () => {
    const fixture = temporaryService();
    try {
      await fixture.jobs.importProfile(resolve('fixtures/candidate-profile.json'));
      const result = fixture.jobs.createCampaign({ query: 'Node.js', schedule: '0 9 * * 1-5', timezone: 'Africa/Cairo', sites: ['fixture'] });
      expect(result.preview).toContain('Every Monday–Friday at 09:00 Africa/Cairo');
      expect(schedulePreview(result.campaign)).toContain('request approval');
      expect(() => fixture.jobs.createCampaign({ query: 'Node.js', schedule: 'bad', timezone: 'Mars/Olympus' })).toThrow();
    } finally { fixture.cleanup(); }
  });
});
