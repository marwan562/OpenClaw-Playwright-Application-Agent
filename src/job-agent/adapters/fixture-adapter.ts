import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { JobSchema, type ApplicationDraft, type CandidateProfile, type Job, type JobSearchCriteria } from '../schemas/index.js';
import { normalizeJob, type RawJobListing } from '../core/normalization.js';
import { prepareAnswer, questionFrom } from '../core/policy.js';
import type { AdapterContext, FillResult, JobSiteAdapter, SubmissionApproval, SubmissionResult } from './types.js';

const RawJobSchema = z.object({
  source: z.string(), sourceId: z.string(), url: z.string(), employer: z.string(), title: z.string(),
  description: z.string(), location: z.string(), workplaceType: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
  seniority: z.string().nullable(), requiredSkills: z.array(z.string()), preferredSkills: z.array(z.string()),
  salary: z.object({ minimum: z.number().nullable(), maximum: z.number().nullable(), currency: z.string().nullable(), period: z.string().nullable() }).nullable(),
  applicationMethod: z.enum(['easy_apply', 'external_form', 'email', 'unknown'])
}).strict();

export class FixtureJobAdapter implements JobSiteAdapter {
  readonly id = 'fixture';

  constructor(private readonly fixturePath = resolve(process.cwd(), 'fixtures/jobs.json')) {}

  matches(input: { source?: string; url?: string }): boolean {
    return input.source === this.id || Boolean(input.url?.startsWith('mock://'));
  }

  async search(criteria: JobSearchCriteria, context: AdapterContext): Promise<Job[]> {
    context.signal?.throwIfAborted();
    const raw = z.array(RawJobSchema).parse(JSON.parse(await readFile(this.fixturePath, 'utf8')));
    const terms = criteria.query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
    return raw
      .map((item) => normalizeJob(item as RawJobListing))
      .filter((job) => {
        const searchable = `${job.title} ${job.description} ${job.requiredSkills.join(' ')}`.toLowerCase();
        const queryMatch = terms.length === 0 || terms.some((term) => searchable.includes(term));
        const locationMatch = !criteria.location || job.location.toLowerCase().includes(criteria.location.toLowerCase()) || job.workplaceType === 'remote';
        const remoteMatch = !criteria.remote || job.workplaceType === 'remote';
        return queryMatch && locationMatch && remoteMatch;
      })
      .slice(0, criteria.limit);
  }

  async inspect(job: Job, context: AdapterContext): Promise<Job> {
    context.signal?.throwIfAborted();
    return JobSchema.parse(job);
  }

  async prepare(job: Job, profile: CandidateProfile, context: AdapterContext): Promise<Omit<ApplicationDraft, 'id' | 'applicationId' | 'profileId' | 'createdAt'>> {
    context.signal?.throwIfAborted();
    const questions = [
      questionFrom('Full name', 'text'),
      questionFrom('Email address', 'email'),
      questionFrom('Phone number', 'tel'),
      questionFrom('Years of Node.js experience', 'number'),
      questionFrom('Will you now or in the future require visa sponsorship?', 'select', true, ['Yes', 'No']),
      questionFrom('Are you legally authorized to work in the job location?', 'select', true, ['Yes', 'No']),
      questionFrom('Expected monthly salary', 'number'),
      questionFrom('Upload approved CV', 'file')
    ];
    return {
      jobId: job.id,
      cvVariantId: profile.approvedCvVariants.find((cv) => cv.approved)?.id ?? null,
      questions,
      answers: questions.map((question) => prepareAnswer(question, profile))
    };
  }

  async fill(_draft: ApplicationDraft, _context: AdapterContext): Promise<FillResult> {
    return { status: 'USER_ACTION_REQUIRED', fieldsFilled: 0, message: 'Fixture search adapter does not control a browser.' };
  }

  async submit(_draft: ApplicationDraft, _approval: SubmissionApproval, _context: AdapterContext): Promise<SubmissionResult> {
    return { status: 'POLICY_BLOCKED', message: 'Fixture adapter never submits applications.' };
  }
}
