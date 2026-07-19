import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';
import { JobAgentService } from '../job-agent/core/index.js';

const Strict = { additionalProperties: false } as const;
const StringArray = Type.Array(Type.String());
const OptionalString = Type.Optional(Type.String());
const OptionalBoolean = Type.Optional(Type.Boolean());
const OptionalNumber = Type.Optional(Type.Number());
const NullableString = Type.Union([Type.String(), Type.Null()]);
const pluginRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const ConfigSchema = Type.Object({
  dataDir: Type.Optional(Type.String({ description: 'Local directory for SQLite state and artifacts.' })),
  dryRun: Type.Optional(Type.Boolean({ default: true })),
  allowedSites: Type.Optional(Type.Array(Type.String(), { default: ['fixture', 'mock'] }))
}, Strict);

function service<T>(config: { dataDir?: string; dryRun?: boolean }, action: (jobs: JobAgentService) => Promise<T> | T): Promise<T> | T {
  const jobs = new JobAgentService({ dataDir: config.dataDir, dryRun: config.dryRun });
  try {
    const result = action(jobs);
    if (result instanceof Promise) return result.finally(() => jobs.close());
    jobs.close();
    return result;
  } catch (error) {
    jobs.close();
    throw error;
  }
}

function safePluginImportPath(input: string): string {
  const target = resolve(pluginRoot, input);
  if (target !== pluginRoot && !target.startsWith(`${pluginRoot}${sep}`)) throw new Error('POLICY_BLOCKED: profile imports must remain inside the linked plugin project');
  return target;
}

export default defineToolPlugin({
  id: 'job-agent',
  name: 'Job Agent',
  description: 'Local approval-first job discovery, scoring, campaign and application tools.',
  configSchema: ConfigSchema,
  tools: (tool) => [
    tool({
      name: 'jobs_profile_import', description: 'Import a structured candidate profile JSON from the linked project only.',
      parameters: Type.Object({ path: Type.String({ description: 'Project-relative path to profile JSON.' }) }, Strict),
      execute: ({ path }, config) => service(config, (jobs) => jobs.importProfile(safePluginImportPath(path)))
    }),
    tool({
      name: 'jobs_profile_get', description: 'Get the active or specified structured candidate profile with provenance.',
      parameters: Type.Object({ profileId: OptionalString }, Strict),
      execute: ({ profileId }, config) => service(config, (jobs) => jobs.getProfile(profileId))
    }),
    tool({
      name: 'jobs_profile_update', description: 'Update a narrow set of editable profile preferences and skills.',
      parameters: Type.Object({
        profileId: OptionalString,
        displayName: OptionalString,
        skills: Type.Optional(StringArray),
        workAuthorization: Type.Optional(StringArray),
        sponsorshipRequired: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
        relocationPreference: Type.Optional(Type.Union([Type.Literal('yes'), Type.Literal('no'), Type.Literal('case_by_case'), Type.Literal('unknown')])),
        salaryMinimum: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
        salaryCurrency: Type.Optional(Type.Union([Type.String({ minLength: 3, maxLength: 3 }), Type.Null()]))
      }, Strict),
      execute: (params, config) => service(config, (jobs) => {
        const current = jobs.getProfile(params.profileId);
        return jobs.updateProfile({
          ...current,
          displayName: params.displayName ?? current.displayName,
          skills: params.skills ?? current.skills,
          workAuthorization: params.workAuthorization ?? current.workAuthorization,
          sponsorshipRequired: params.sponsorshipRequired !== undefined ? params.sponsorshipRequired : current.sponsorshipRequired,
          relocationPreference: params.relocationPreference ?? current.relocationPreference,
          salaryPreferences: {
            ...current.salaryPreferences,
            minimum: params.salaryMinimum !== undefined ? params.salaryMinimum : current.salaryPreferences.minimum,
            currency: params.salaryCurrency !== undefined ? params.salaryCurrency : current.salaryPreferences.currency
          }
        });
      })
    }),
    tool({
      name: 'jobs_search', description: 'Search enabled job adapters, normalize listings and persist only new jobs.',
      parameters: Type.Object({
        query: Type.String({ minLength: 1 }), location: Type.Optional(Type.String()), remote: OptionalBoolean,
        sites: Type.Optional(StringArray), excludedKeywords: Type.Optional(StringArray), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
      }, Strict),
      execute: (params, config, context) => service(config, (jobs) => jobs.search({
        query: params.query, location: params.location ?? '', remote: params.remote ?? false,
        sites: params.sites ?? config.allowedSites ?? ['fixture'], excludedKeywords: params.excludedKeywords ?? [], limit: params.limit ?? 20
      }, context.signal))
    }),
    tool({
      name: 'jobs_get', description: 'Get one normalized job and its untrusted-content boundary marker.',
      parameters: Type.Object({ jobId: Type.String() }, Strict),
      execute: ({ jobId }, config) => service(config, (jobs) => jobs.getJob(jobId))
    }),
    tool({
      name: 'jobs_score', description: 'Calculate an explainable deterministic match score.',
      parameters: Type.Object({ jobId: Type.String(), profileId: OptionalString, excludedKeywords: Type.Optional(StringArray) }, Strict),
      execute: ({ jobId, profileId, excludedKeywords }, config) => service(config, (jobs) => jobs.score(jobId, profileId, excludedKeywords))
    }),
    tool({
      name: 'jobs_prepare_application', description: 'Prepare answers from verified facts and create approvals for sensitive or uncertain fields.',
      parameters: Type.Object({ jobId: Type.String(), profileId: OptionalString, campaignId: Type.Optional(NullableString) }, Strict),
      execute: ({ jobId, profileId, campaignId }, config, context) => service(config, (jobs) => jobs.prepareApplication(jobId, profileId, campaignId ?? null, context.signal))
    }),
    tool({
      name: 'jobs_apply', description: 'Fill a prepared application through its fixed adapter. Dry-run defaults to true and stops before submission.',
      parameters: Type.Object({ applicationId: Type.String(), dryRun: OptionalBoolean, approveSubmission: OptionalBoolean }, Strict),
      execute: ({ applicationId, dryRun, approveSubmission }, config, context) => service(config, (jobs) => jobs.apply(applicationId, { dryRun: dryRun ?? true, approveSubmission: approveSubmission ?? false, signal: context.signal }))
    }),
    tool({
      name: 'jobs_application_get', description: 'Get an application with approvals, state-transition timeline and audit events.',
      parameters: Type.Object({ applicationId: Type.String() }, Strict),
      execute: ({ applicationId }, config) => service(config, (jobs) => jobs.getApplication(applicationId))
    }),
    tool({
      name: 'jobs_application_list', description: 'List durable applications, optionally filtering by state.',
      parameters: Type.Object({ state: OptionalString }, Strict),
      execute: ({ state }, config) => service(config, (jobs) => jobs.listApplications(state as Parameters<typeof jobs.listApplications>[0]))
    }),
    tool({
      name: 'jobs_application_retry', description: 'Retry an application only when its durable state is FAILED_RETRYABLE.',
      parameters: Type.Object({ applicationId: Type.String() }, Strict),
      execute: ({ applicationId }, config, context) => service(config, (jobs) => jobs.retryApplication(applicationId, context.signal))
    }),
    tool({
      name: 'jobs_campaign_create', description: 'Create and persist a campaign and return its human-readable schedule preview.',
      parameters: Type.Object({
        name: OptionalString, query: Type.String({ minLength: 1 }), location: Type.Optional(Type.String()), remote: OptionalBoolean,
        sites: Type.Optional(StringArray), profileId: OptionalString, cvVariantId: Type.Optional(NullableString), minimumScore: OptionalNumber,
        maximumJobsPerRun: OptionalNumber, dailyLimit: OptionalNumber,
        mode: Type.Optional(Type.Union([Type.Literal('research_only'), Type.Literal('prepare_and_review'), Type.Literal('auto_submit')])),
        schedule: Type.String(), timezone: Type.String()
      }, Strict),
      execute: (params, config) => service(config, (jobs) => jobs.createCampaign(params))
    }),
    tool({
      name: 'jobs_campaign_list', description: 'List persisted job campaigns.',
      parameters: Type.Object({}, Strict),
      execute: (_params, config) => service(config, (jobs) => jobs.listCampaigns())
    }),
    tool({
      name: 'jobs_campaign_run', description: 'Run one idempotent campaign cycle now.',
      parameters: Type.Object({ campaignId: Type.String() }, Strict),
      execute: ({ campaignId }, config, context) => service(config, (jobs) => jobs.runCampaign(campaignId, context.signal))
    }),
    tool({
      name: 'jobs_campaign_pause', description: 'Pause a campaign without deleting its state or schedule.',
      parameters: Type.Object({ campaignId: Type.String() }, Strict),
      execute: ({ campaignId }, config) => service(config, (jobs) => jobs.setCampaignState(campaignId, 'paused'))
    }),
    tool({
      name: 'jobs_campaign_resume', description: 'Resume a paused campaign.',
      parameters: Type.Object({ campaignId: Type.String() }, Strict),
      execute: ({ campaignId }, config) => service(config, (jobs) => jobs.setCampaignState(campaignId, 'enabled'))
    }),
    tool({
      name: 'jobs_approval_respond', description: 'Approve or reject one pending answer, optionally replacing its proposed answer.',
      parameters: Type.Object({ approvalId: Type.String(), decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]), editedAnswer: OptionalString }, Strict),
      execute: ({ approvalId, decision, editedAnswer }, config) => service(config, (jobs) => jobs.respondToApproval(approvalId, decision, editedAnswer))
    }),
    tool({
      name: 'jobs_emergency_stop', description: 'Activate the global emergency stop immediately.',
      parameters: Type.Object({}, Strict),
      execute: (_params, config) => service(config, (jobs) => jobs.emergencyStop(true))
    })
  ]
});
