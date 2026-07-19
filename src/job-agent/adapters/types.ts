import type {
  ApplicationDraft,
  CandidateProfile,
  Job,
  JobSearchCriteria
} from '../schemas/index.js';

export interface JobSourceInput { source?: string; url?: string; }

export interface AdapterContext {
  correlationId: string;
  dataDir: string;
  dryRun: boolean;
  signal?: AbortSignal;
  approvedFilePaths?: string[];
  artifactRetentionDays?: number;
}

export interface FillResult {
  status: 'READY_TO_SUBMIT' | 'USER_ACTION_REQUIRED' | 'CAPTCHA_REQUIRED' | 'FAILED_RETRYABLE';
  fieldsFilled: number;
  screenshotPath?: string;
  message: string;
}

export interface SubmissionApproval {
  approved: boolean;
  approvedAt: string;
  approvalId: string;
}

export interface SubmissionResult {
  status: 'SUBMITTED' | 'POLICY_BLOCKED' | 'USER_ACTION_REQUIRED' | 'FAILED_RETRYABLE';
  externalId?: string;
  message: string;
}

export interface JobSiteAdapter {
  id: string;
  matches(input: JobSourceInput): boolean;
  search(criteria: JobSearchCriteria, context: AdapterContext): Promise<Job[]>;
  inspect(job: Job, context: AdapterContext): Promise<Job>;
  prepare(job: Job, profile: CandidateProfile, context: AdapterContext): Promise<Omit<ApplicationDraft, 'id' | 'applicationId' | 'profileId' | 'createdAt'>>;
  fill(draft: ApplicationDraft, context: AdapterContext): Promise<FillResult>;
  submit(draft: ApplicationDraft, approval: SubmissionApproval, context: AdapterContext): Promise<SubmissionResult>;
}
