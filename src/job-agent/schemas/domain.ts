import { z } from 'zod';

export const ProvenanceKindSchema = z.enum([
  'verified_user_fact',
  'preference',
  'approved_answer',
  'model_generated',
  'unknown'
]);

export const ProfileFactSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  provenance: ProvenanceKindSchema,
  verified: z.boolean(),
  source: z.string().min(1),
  updatedAt: z.string().datetime()
}).strict();

export const ExperienceSchema = z.object({
  employer: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  summary: z.string(),
  skills: z.array(z.string())
}).strict();

export const CandidateProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  identity: z.object({ firstName: z.string(), lastName: z.string() }).strict(),
  contact: z.object({
    email: z.string().email(),
    phone: z.string().min(3)
  }).strict(),
  location: z.object({ city: z.string(), country: z.string() }).strict(),
  workAuthorization: z.array(z.string()),
  sponsorshipRequired: z.boolean().nullable(),
  availability: z.string().nullable(),
  salaryPreferences: z.object({
    minimum: z.number().nonnegative().nullable(),
    currency: z.string().length(3).nullable(),
    period: z.enum(['hour', 'month', 'year']).nullable()
  }).strict(),
  relocationPreference: z.enum(['yes', 'no', 'case_by_case', 'unknown']),
  skills: z.array(z.string()),
  experience: z.array(ExperienceSchema),
  education: z.array(z.record(z.string(), z.string())),
  projects: z.array(z.record(z.string(), z.string())),
  certifications: z.array(z.string()),
  languages: z.array(z.string()),
  portfolioLinks: z.array(z.string().url()),
  approvedCvVariants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    tags: z.array(z.string()),
    approved: z.boolean()
  }).strict()),
  reusableApprovedAnswers: z.array(z.object({
    id: z.string(),
    questionPattern: z.string(),
    answer: z.string(),
    approvedAt: z.string().datetime(),
    sourceApprovalId: z.string()
  }).strict()),
  facts: z.array(ProfileFactSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();

export const WorkplaceTypeSchema = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);

export const JobSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceId: z.string().min(1),
  url: z.string().min(1),
  employer: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  location: z.string(),
  workplaceType: WorkplaceTypeSchema,
  seniority: z.string().nullable(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  salary: z.object({
    minimum: z.number().nullable(),
    maximum: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.string().nullable()
  }).nullable(),
  applicationMethod: z.enum(['easy_apply', 'external_form', 'email', 'unknown']),
  discoveredAt: z.string().datetime(),
  fingerprint: z.string().min(16),
  rawContentTreatedAsUntrusted: z.literal(true)
}).strict();

export const JobSearchCriteriaSchema = z.object({
  query: z.string().min(1),
  location: z.string().default(''),
  remote: z.boolean().default(false),
  sites: z.array(z.string()).default(['fixture']),
  excludedKeywords: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(100).default(20)
}).strict();

export const MatchScoreSchema = z.object({
  jobId: z.string(),
  profileId: z.string(),
  score: z.number().min(0).max(100),
  components: z.record(z.string(), z.number()),
  explanation: z.array(z.string()),
  blockingReasons: z.array(z.string()),
  calculatedAt: z.string().datetime()
}).strict();

export const QuestionCategorySchema = z.enum([
  'identity',
  'contact',
  'experience',
  'salary',
  'sponsorship',
  'relocation',
  'demographic',
  'legal',
  'background_check',
  'disability',
  'security_clearance',
  'file_upload',
  'unknown'
]);

export const ApplicationQuestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'email', 'tel', 'number', 'select', 'radio', 'checkbox', 'file', 'textarea']),
  required: z.boolean(),
  options: z.array(z.string()).default([]),
  category: QuestionCategorySchema
}).strict();

export const PreparedAnswerSchema = z.object({
  questionId: z.string(),
  proposedAnswer: z.string(),
  confidence: z.number().min(0).max(1),
  supportingFactIds: z.array(z.string()),
  confirmationRequired: z.boolean(),
  model: z.object({ provider: z.string(), model: z.string() }).strict(),
  createdAt: z.string().datetime()
}).strict();

export const ApplicationDraftSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  jobId: z.string(),
  profileId: z.string(),
  cvVariantId: z.string().nullable(),
  questions: z.array(ApplicationQuestionSchema),
  answers: z.array(PreparedAnswerSchema),
  createdAt: z.string().datetime()
}).strict();

export const ApplicationStateSchema = z.enum([
  'DISCOVERED', 'NORMALIZED', 'SCORED', 'SELECTED', 'APPLICATION_STARTED',
  'QUESTIONS_EXTRACTED', 'ANSWERS_PREPARED', 'WAITING_FOR_APPROVAL', 'FILLING',
  'VALIDATING', 'READY_TO_SUBMIT', 'SUBMITTING', 'SUBMITTED', 'SKIPPED',
  'DUPLICATE', 'REJECTED_BY_USER', 'AUTH_REQUIRED', 'USER_ACTION_REQUIRED',
  'CAPTCHA_REQUIRED', 'POLICY_BLOCKED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT',
  'CANCELLED'
]);

export const ApplicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  profileId: z.string(),
  campaignId: z.string().nullable(),
  adapterId: z.string(),
  state: ApplicationStateSchema,
  draft: ApplicationDraftSchema.nullable(),
  submissionKey: z.string(),
  submittedAt: z.string().datetime().nullable(),
  retryCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();

export const ApprovalSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  questionId: z.string(),
  category: QuestionCategorySchema,
  prompt: z.string(),
  proposedAnswer: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  responseAnswer: z.string().nullable(),
  createdAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable()
}).strict();

export const CampaignModeSchema = z.enum(['research_only', 'prepare_and_review', 'auto_submit']);

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  state: z.enum(['enabled', 'paused']),
  criteria: JobSearchCriteriaSchema,
  allowedSites: z.array(z.string()),
  profileId: z.string(),
  cvVariantId: z.string().nullable(),
  minimumScore: z.number().min(0).max(100),
  maximumJobsPerRun: z.number().int().positive(),
  maximumApplicationsPerDay: z.number().int().positive(),
  mode: CampaignModeSchema,
  schedule: z.string(),
  timezone: z.string(),
  quietHours: z.object({ start: z.string(), end: z.string() }).nullable(),
  retryPolicy: z.object({ maximumAttempts: z.number().int().min(0), backoffSeconds: z.number().int().min(0) }).strict(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastRunAt: z.string().datetime().nullable()
}).strict();

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobSearchCriteria = z.infer<typeof JobSearchCriteriaSchema>;
export type MatchScore = z.infer<typeof MatchScoreSchema>;
export type ApplicationQuestion = z.infer<typeof ApplicationQuestionSchema>;
export type PreparedAnswer = z.infer<typeof PreparedAnswerSchema>;
export type ApplicationDraft = z.infer<typeof ApplicationDraftSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type ApplicationState = z.infer<typeof ApplicationStateSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
