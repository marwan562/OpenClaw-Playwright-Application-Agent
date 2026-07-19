import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { FixtureJobAdapter, MockPlaywrightAdapter, type AdapterContext, type JobSiteAdapter } from '../adapters/index.js';
import { JobAgentDatabase, type AuditRecord, type TransitionRecord } from '../database/index.js';
import {
  ApplicationDraftSchema,
  ApplicationSchema,
  ApprovalSchema,
  CampaignSchema,
  CandidateProfileSchema,
  JobSearchCriteriaSchema,
  type Application,
  type ApplicationState,
  type Approval,
  type Campaign,
  type CandidateProfile,
  type Job,
  type JobSearchCriteria,
  type MatchScore
} from '../schemas/index.js';
import { assertTransition } from './state-machine.js';
import { scoreJob } from './scoring.js';

export interface JobAgentOptions {
  dataDir?: string;
  databasePath?: string;
  dryRun?: boolean;
  adapters?: JobSiteAdapter[];
}

export interface CampaignCreateInput {
  name?: string;
  query: string;
  location?: string;
  remote?: boolean;
  sites?: string[];
  profileId?: string;
  cvVariantId?: string | null;
  minimumScore?: number;
  dailyLimit?: number;
  maximumJobsPerRun?: number;
  mode?: Campaign['mode'];
  schedule: string;
  timezone: string;
}

function now(): string { return new Date().toISOString(); }
function id(): string { return randomUUID(); }

function validateTimezone(timezone: string): void {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new Error(`Invalid IANA timezone: ${timezone}`); }
}

function validateCron(schedule: string): void {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some((field) => !/^[\d*/?,\-]+$/.test(field))) throw new Error(`Invalid five-field cron schedule: ${schedule}`);
}

export function schedulePreview(campaign: Pick<Campaign, 'schedule' | 'timezone' | 'allowedSites' | 'maximumJobsPerRun' | 'minimumScore' | 'mode'>): string {
  const weekdayNine = campaign.schedule === '0 9 * * 1-5' ? 'Every Monday–Friday at 09:00' : `Cron ${campaign.schedule}`;
  const action = campaign.mode === 'research_only'
    ? 'research matching jobs without preparing applications'
    : campaign.mode === 'auto_submit'
      ? 'prepare eligible applications; submission remains subject to approvals and safety settings'
      : 'prepare eligible applications and request approval before submission';
  return `${weekdayNine} ${campaign.timezone}, search ${campaign.allowedSites.join(', ')}. Process at most ${campaign.maximumJobsPerRun} new jobs scoring ${campaign.minimumScore}% or more and ${action}.`;
}

export class JobAgentService {
  readonly dataDir: string;
  readonly database: JobAgentDatabase;
  readonly dryRun: boolean;
  private readonly adapters: JobSiteAdapter[];

  constructor(options: JobAgentOptions = {}) {
    this.dataDir = resolve(options.dataDir ?? process.env.JOB_AGENT_DATA_DIR ?? '.job-agent');
    const databasePath = resolve(options.databasePath ?? process.env.JOB_AGENT_DB_PATH ?? resolve(this.dataDir, 'job-agent.sqlite'));
    this.dryRun = options.dryRun ?? process.env.JOB_AGENT_DRY_RUN !== 'false';
    this.database = new JobAgentDatabase(databasePath);
    this.adapters = options.adapters ?? [new MockPlaywrightAdapter(), new FixtureJobAdapter()];
  }

  close(): void { this.database.close(); }

  private context(signal?: AbortSignal, dryRun = this.dryRun): AdapterContext {
    return { correlationId: id(), dataDir: this.dataDir, dryRun, signal };
  }

  private audit(entityType: string, entityId: string, action: string, details: Record<string, unknown>, correlationId: string): void {
    const record: AuditRecord = { id: id(), entityType, entityId, action, details, correlationId, createdAt: now() };
    this.database.addAudit(record);
  }

  async importProfile(filePath: string): Promise<CandidateProfile> {
    const absolutePath = resolve(filePath);
    if (!absolutePath.endsWith('.json')) {
      throw new Error('Milestone one imports a structured JSON profile. PDF extraction is retained in the legacy agent but requires user review before facts can be verified.');
    }
    const parsed = CandidateProfileSchema.parse(JSON.parse(await readFile(absolutePath, 'utf8')));
    const profile = CandidateProfileSchema.parse({
      ...parsed,
      approvedCvVariants: parsed.approvedCvVariants.map((variant) => ({ ...variant, path: resolve(process.cwd(), variant.path) })),
      updatedAt: now()
    });
    this.database.saveProfile(profile, true);
    this.audit('profile', profile.id, 'profile_imported', { sourceFile: absolutePath, factCount: profile.facts.length }, id());
    return profile;
  }

  getProfile(profileId?: string): CandidateProfile {
    const profile = this.database.getProfile(profileId);
    if (!profile) throw new Error('Candidate profile not found. Import one with `job-agent profile import <file>`.');
    return profile;
  }

  updateProfile(profile: CandidateProfile): CandidateProfile {
    const existing = this.getProfile(profile.id);
    const updated = CandidateProfileSchema.parse({ ...profile, createdAt: existing.createdAt, updatedAt: now() });
    this.database.saveProfile(updated, true);
    this.audit('profile', updated.id, 'profile_updated', { factCount: updated.facts.length }, id());
    return updated;
  }

  async search(input: z.input<typeof JobSearchCriteriaSchema>, signal?: AbortSignal): Promise<{ jobs: Job[]; duplicates: number }> {
    this.assertRunning();
    const criteria = JobSearchCriteriaSchema.parse(input);
    const context = this.context(signal);
    const selectedAdapters = this.adapters.filter((adapter) => criteria.sites.includes(adapter.id));
    if (selectedAdapters.length === 0) throw new Error(`No enabled adapter for sites: ${criteria.sites.join(', ')}`);
    const raw = (await Promise.all(selectedAdapters.map((adapter) => adapter.search(criteria, context)))).flat();
    const jobs: Job[] = [];
    let duplicates = 0;
    for (const candidate of raw) {
      const result = this.database.upsertJob(candidate);
      if (result.duplicate) duplicates += 1;
      else jobs.push(result.job);
    }
    this.audit('search', context.correlationId, 'jobs_searched', { criteria, discovered: raw.length, stored: jobs.length, duplicates }, context.correlationId);
    return { jobs, duplicates };
  }

  getJob(jobId: string): Job {
    const job = this.database.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return job;
  }

  listJobs(): Job[] { return this.database.listJobs(); }

  score(jobId: string, profileId?: string, excludedKeywords: string[] = []): MatchScore {
    const result = scoreJob(this.getJob(jobId), this.getProfile(profileId), { excludedKeywords });
    this.audit('job', jobId, 'job_scored', { score: result.score, components: result.components }, id());
    return result;
  }

  private adapterFor(job: Job): JobSiteAdapter {
    const preferred = this.adapters.find((adapter) => adapter.id === 'mock' && adapter.matches({ source: job.source, url: job.url }));
    const adapter = preferred ?? this.adapters.find((candidate) => candidate.matches({ source: job.source, url: job.url }));
    if (!adapter) throw new Error(`No adapter handles ${job.source}: ${job.url}`);
    return adapter;
  }

  private submissionKey(jobId: string, profileId: string, campaignId: string | null): string {
    return createHash('sha256').update(`${jobId}|${profileId}|${campaignId ?? 'manual'}`).digest('hex');
  }

  private transition(application: Application, toState: ApplicationState, reason: string, correlationId: string): Application {
    assertTransition(application.state, toState);
    const fromState = application.state;
    const updated = ApplicationSchema.parse({ ...application, state: toState, updatedAt: now() });
    this.database.saveApplication(updated);
    const transition: TransitionRecord = { id: id(), applicationId: updated.id, fromState, toState, reason, correlationId, createdAt: now() };
    this.database.addTransition(transition);
    this.audit('application', updated.id, 'state_transition', { fromState, toState, reason }, correlationId);
    return updated;
  }

  async prepareApplication(jobId: string, profileId?: string, campaignId: string | null = null, signal?: AbortSignal): Promise<{ application: Application; approvals: Approval[]; duplicate: boolean }> {
    this.assertRunning();
    const profile = this.getProfile(profileId);
    const existing = this.database.findApplication(jobId, profile.id, campaignId);
    if (existing) return { application: existing, approvals: this.database.listApprovals(existing.id), duplicate: true };
    const job = this.getJob(jobId);
    const adapter = this.adapterFor(job);
    const context = this.context(signal);
    let application = ApplicationSchema.parse({
      id: id(), jobId: job.id, profileId: profile.id, campaignId, adapterId: adapter.id, state: 'DISCOVERED', draft: null,
      submissionKey: this.submissionKey(job.id, profile.id, campaignId), submittedAt: null, retryCount: 0, lastError: null,
      createdAt: now(), updatedAt: now()
    });
    this.database.saveApplication(application);
    this.database.addTransition({ id: id(), applicationId: application.id, fromState: null, toState: 'DISCOVERED', reason: 'Application record created from normalized job', correlationId: context.correlationId, createdAt: now() });
    application = this.transition(application, 'NORMALIZED', 'Job conforms to normalized schema', context.correlationId);
    application = this.transition(application, 'SCORED', `Match score ${this.score(job.id, profile.id).score}`, context.correlationId);
    application = this.transition(application, 'SELECTED', 'Selected for preparation', context.correlationId);
    application = this.transition(application, 'APPLICATION_STARTED', 'Safe local preparation started', context.correlationId);
    const prepared = await adapter.prepare(job, profile, context);
    application = this.transition(application, 'QUESTIONS_EXTRACTED', `${prepared.questions.length} fields extracted by fixed adapter`, context.correlationId);
    const draft = ApplicationDraftSchema.parse({ ...prepared, id: id(), applicationId: application.id, profileId: profile.id, createdAt: now() });
    application = ApplicationSchema.parse({ ...application, draft, updatedAt: now() });
    this.database.saveApplication(application);
    application = this.transition(application, 'ANSWERS_PREPARED', 'Answers prepared with provenance and confidence', context.correlationId);
    const approvals = draft.answers.filter((answer) => answer.confirmationRequired).map((answer) => {
      const question = draft.questions.find((candidate) => candidate.id === answer.questionId)!;
      return this.database.saveApproval(ApprovalSchema.parse({
        id: id(), applicationId: application.id, questionId: question.id, category: question.category,
        prompt: question.label, proposedAnswer: answer.proposedAnswer, status: 'pending', responseAnswer: null,
        createdAt: now(), respondedAt: null
      }));
    });
    if (approvals.length > 0) application = this.transition(application, 'WAITING_FOR_APPROVAL', `${approvals.length} sensitive or uncertain answers require approval`, context.correlationId);
    return { application, approvals, duplicate: false };
  }

  getApplication(applicationId: string): { application: Application; approvals: Approval[]; timeline: TransitionRecord[]; audit: AuditRecord[] } {
    const application = this.database.getApplication(applicationId);
    if (!application) throw new Error(`Application not found: ${applicationId}`);
    return {
      application,
      approvals: this.database.listApprovals(applicationId),
      timeline: this.database.listTransitions(applicationId),
      audit: this.database.listAudit('application', applicationId)
    };
  }

  listApplications(state?: ApplicationState): Application[] {
    return this.database.listApplications().filter((application) => !state || application.state === state);
  }

  respondToApproval(approvalId: string, decision: 'approve' | 'reject', editedAnswer?: string): { approval: Approval; application: Application } {
    const current = this.database.getApproval(approvalId);
    if (!current) throw new Error(`Approval not found: ${approvalId}`);
    if (current.status !== 'pending') return { approval: current, application: this.getApplication(current.applicationId).application };
    const responded = ApprovalSchema.parse({
      ...current,
      status: decision === 'approve' ? 'approved' : 'rejected',
      responseAnswer: editedAnswer ?? current.proposedAnswer,
      respondedAt: now()
    });
    this.database.saveApproval(responded);
    let application = this.getApplication(current.applicationId).application;
    if (decision === 'reject') {
      application = this.transition(application, 'REJECTED_BY_USER', `Approval rejected: ${current.prompt}`, id());
      return { approval: responded, application };
    }
    if (application.draft) {
      const answers = application.draft.answers.map((answer) => answer.questionId === current.questionId
        ? { ...answer, proposedAnswer: responded.responseAnswer ?? answer.proposedAnswer, confidence: 1, confirmationRequired: false }
        : answer);
      application = ApplicationSchema.parse({ ...application, draft: { ...application.draft, answers }, updatedAt: now() });
      this.database.saveApplication(application);
    }
    this.audit('application', application.id, 'approval_responded', { approvalId, decision, edited: editedAnswer !== undefined }, id());
    return { approval: responded, application };
  }

  async apply(applicationId: string, options: { dryRun?: boolean; approveSubmission?: boolean; signal?: AbortSignal } = {}): Promise<{ application: Application; result: unknown }> {
    this.assertRunning();
    let application = this.getApplication(applicationId).application;
    if (application.state === 'READY_TO_SUBMIT' && (options.dryRun ?? this.dryRun)) return { application, result: { status: 'READY_TO_SUBMIT', idempotent: true } };
    if (application.state === 'SUBMITTED') return { application, result: { status: 'SUBMITTED', idempotent: true } };
    const approvals = this.database.listApprovals(applicationId);
    const pending = approvals.filter((approval) => approval.status === 'pending');
    if (pending.length) throw new Error(`Approval required: ${pending.map((approval) => approval.id).join(', ')}`);
    if (approvals.some((approval) => approval.status === 'rejected')) throw new Error('Application was rejected by the user');
    if (!application.draft) throw new Error('Application has no prepared draft');
    if (application.state === 'WAITING_FOR_APPROVAL' || application.state === 'ANSWERS_PREPARED') {
      application = this.transition(application, 'FILLING', 'All required answers approved; filling local form', id());
    } else if (application.state === 'FAILED_RETRYABLE') {
      application = this.transition(application, 'FILLING', 'Retrying failed fill', id());
    }
    const profile = this.getProfile(application.profileId);
    const context = this.context(options.signal, options.dryRun ?? this.dryRun);
    context.approvedFilePaths = profile.approvedCvVariants.filter((cv) => cv.approved).map((cv) => cv.path);
    const adapter = this.adapters.find((candidate) => candidate.id === application.adapterId) ?? this.adapterFor(this.getJob(application.jobId));
    const fillResult = await adapter.fill(application.draft, context);
    if (fillResult.status !== 'READY_TO_SUBMIT') {
      application = this.transition(application, fillResult.status, fillResult.message, context.correlationId);
      return { application, result: fillResult };
    }
    application = this.transition(application, 'VALIDATING', `Filled ${fillResult.fieldsFilled} fields`, context.correlationId);
    application = this.transition(application, 'READY_TO_SUBMIT', fillResult.message, context.correlationId);
    const dryRun = options.dryRun ?? this.dryRun;
    if (dryRun || !options.approveSubmission) return { application, result: fillResult };
    application = this.transition(application, 'SUBMITTING', 'Explicit submission approval supplied', context.correlationId);
    const submission = await adapter.submit(application.draft, { approved: true, approvedAt: now(), approvalId: id() }, context);
    if (submission.status === 'SUBMITTED') {
      application = ApplicationSchema.parse({ ...application, submittedAt: now(), updatedAt: now() });
      this.database.saveApplication(application);
      application = this.transition(application, 'SUBMITTED', submission.message, context.correlationId);
    } else {
      application = this.transition(application, submission.status, submission.message, context.correlationId);
    }
    return { application, result: submission };
  }

  async retryApplication(applicationId: string, signal?: AbortSignal) {
    const application = this.getApplication(applicationId).application;
    if (application.state !== 'FAILED_RETRYABLE') throw new Error(`Only FAILED_RETRYABLE applications can be retried; current state is ${application.state}`);
    const updated = ApplicationSchema.parse({ ...application, retryCount: application.retryCount + 1, lastError: null, updatedAt: now() });
    this.database.saveApplication(updated);
    return this.apply(applicationId, { dryRun: true, signal });
  }

  createCampaign(input: CampaignCreateInput): { campaign: Campaign; preview: string } {
    validateCron(input.schedule);
    validateTimezone(input.timezone);
    const profile = this.getProfile(input.profileId);
    const timestamp = now();
    const campaign = CampaignSchema.parse({
      id: id(), name: input.name ?? input.query, state: 'enabled',
      criteria: { query: input.query, location: input.location ?? '', remote: input.remote ?? false, sites: input.sites ?? ['fixture'], excludedKeywords: [], limit: input.maximumJobsPerRun ?? 5 },
      allowedSites: input.sites ?? ['fixture'], profileId: profile.id, cvVariantId: input.cvVariantId ?? profile.approvedCvVariants.find((cv) => cv.approved)?.id ?? null,
      minimumScore: input.minimumScore ?? 80, maximumJobsPerRun: input.maximumJobsPerRun ?? 5,
      maximumApplicationsPerDay: input.dailyLimit ?? 5, mode: input.mode ?? 'prepare_and_review',
      schedule: input.schedule, timezone: input.timezone, quietHours: null,
      retryPolicy: { maximumAttempts: 2, backoffSeconds: 30 }, createdAt: timestamp, updatedAt: timestamp, lastRunAt: null
    });
    const preview = schedulePreview(campaign);
    this.database.saveCampaign(campaign, preview);
    this.audit('campaign', campaign.id, 'campaign_created', { preview }, id());
    return { campaign, preview };
  }

  listCampaigns(): Campaign[] { return this.database.listCampaigns(); }

  setCampaignState(campaignId: string, state: 'enabled' | 'paused'): Campaign {
    const campaign = this.database.getCampaign(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    const updated = CampaignSchema.parse({ ...campaign, state, updatedAt: now() });
    this.database.saveCampaign(updated, schedulePreview(updated));
    this.audit('campaign', updated.id, state === 'paused' ? 'campaign_paused' : 'campaign_resumed', {}, id());
    return updated;
  }

  async runCampaign(campaignId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    this.assertRunning();
    let campaign = this.database.getCampaign(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    if (campaign.state === 'paused') throw new Error('Campaign is paused');
    const runId = id();
    const correlationId = id();
    const startedAt = now();
    this.database.saveCampaignRun({ id: runId, campaignId, status: 'running', summary: {}, startedAt, completedAt: null, correlationId });
    try {
      const search = await this.search(campaign.criteria, signal);
      const scores = search.jobs.map((job) => this.score(job.id, campaign!.profileId, campaign!.criteria.excludedKeywords));
      const selected = scores.filter((score) => score.score >= campaign!.minimumScore).slice(0, campaign.maximumJobsPerRun);
      const prepared: Application[] = [];
      if (campaign.mode !== 'research_only') {
        for (const score of selected) {
          signal?.throwIfAborted();
          const result = await this.prepareApplication(score.jobId, campaign.profileId, campaign.id, signal);
          prepared.push(result.application);
        }
      }
      const summary = { runId, discovered: search.jobs.length, duplicates: search.duplicates, scored: scores.length, selected: selected.length, prepared: prepared.length, submitted: 0, failed: 0 };
      this.database.saveCampaignRun({ id: runId, campaignId, status: 'completed', summary, startedAt, completedAt: now(), correlationId });
      campaign = CampaignSchema.parse({ ...campaign, lastRunAt: now(), updatedAt: now() });
      this.database.saveCampaign(campaign, schedulePreview(campaign));
      return summary;
    } catch (error) {
      const summary = { runId, error: error instanceof Error ? error.message : 'Unknown campaign error' };
      this.database.saveCampaignRun({ id: runId, campaignId, status: 'failed', summary, startedAt, completedAt: now(), correlationId });
      throw error;
    }
  }

  emergencyStop(active = true): { active: boolean; changedAt: string } {
    this.database.setSetting('emergency_stop', active ? '1' : '0');
    const changedAt = now();
    this.audit('system', 'global', active ? 'emergency_stop_activated' : 'emergency_stop_cleared', {}, id());
    return { active, changedAt };
  }

  status(): Record<string, unknown> {
    const applications = this.database.listApplications();
    return {
      emergencyStop: this.database.getSetting('emergency_stop') === '1',
      dryRun: this.dryRun,
      databasePath: this.database.path,
      profiles: this.database.getProfile() ? 1 : 0,
      jobs: this.database.listJobs().length,
      campaigns: this.database.listCampaigns().length,
      applications: applications.length,
      failedApplications: applications.filter((application) => application.state.startsWith('FAILED')).length,
      adapters: this.adapters.map((adapter) => ({ id: adapter.id, enabled: true }))
    };
  }

  private assertRunning(): void {
    if (this.database.getSetting('emergency_stop') === '1') throw new Error('Global emergency stop is active');
  }
}
