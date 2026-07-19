#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command, CommanderError, Option } from 'commander';
import { z } from 'zod';
import { JobAgentService } from '../core/index.js';
import { ApplicationStateSchema, CandidateProfileSchema, CampaignModeSchema } from '../schemas/index.js';

const program = new Command();
program
  .name('job-agent')
  .description('Local, approval-first Job Agent Toolkit')
  .version('0.1.0')
  .option('--json', 'print machine-readable JSON')
  .option('--data-dir <path>', 'local state directory')
  .showHelpAfterError();

function service(): JobAgentService {
  const options = program.opts<{ dataDir?: string }>();
  return new JobAgentService({ dataDir: options.dataDir });
}

function print(value: unknown, summary?: string): void {
  if (program.opts<{ json?: boolean }>().json || !summary) console.log(JSON.stringify(value, null, 2));
  else console.log(summary);
}

async function withService<T>(action: (jobs: JobAgentService) => Promise<T> | T, summary?: (value: T) => string): Promise<void> {
  const jobs = service();
  try {
    const value = await action(jobs);
    print(value, summary?.(value));
  } finally {
    jobs.close();
  }
}

const profile = program.command('profile').description('Manage candidate profiles');
profile.command('import <file>').description('Import a strict structured JSON candidate profile')
  .action((file: string) => withService((jobs) => jobs.importProfile(file), (result) => `Imported profile ${result.displayName} (${result.id}) with ${result.facts.length} provenance-tracked facts.`));
profile.command('show').option('--id <profile-id>').description('Show the active or selected profile')
  .action((options: { id?: string }) => withService((jobs) => jobs.getProfile(options.id), (result) => `${result.displayName}\nSkills: ${result.skills.join(', ')}\nApproved CVs: ${result.approvedCvVariants.filter((cv) => cv.approved).map((cv) => cv.name).join(', ')}`));
profile.command('edit').requiredOption('--input <file>', 'updated structured profile JSON').description('Validate and store an edited profile')
  .action((options: { input: string }) => withService(async (jobs) => {
    const updated = CandidateProfileSchema.parse(JSON.parse(await readFile(resolve(options.input), 'utf8')));
    return jobs.updateProfile(updated);
  }, (result) => `Updated profile ${result.id}.`));

program.command('search')
  .requiredOption('--query <query>')
  .option('--location <location>', 'location filter', '')
  .option('--remote', 'remote jobs only', false)
  .option('--sites <sites>', 'comma-separated adapters', 'fixture')
  .option('--limit <number>', 'result limit', '20')
  .description('Search, normalize and deduplicate jobs')
  .action((options: { query: string; location: string; remote: boolean; sites: string; limit: string }) => withService(
    (jobs) => jobs.search({ query: options.query, location: options.location, remote: options.remote, sites: options.sites.split(','), excludedKeywords: [], limit: Number(options.limit) }),
    (result) => `Stored ${result.jobs.length} new jobs; skipped ${result.duplicates} duplicates.\n${result.jobs.map((job) => `${job.id}  ${job.title} — ${job.employer}`).join('\n')}`
  ));

const jobCommands = program.command('jobs').description('Inspect normalized jobs');
jobCommands.command('list').action(() => withService((jobs) => jobs.listJobs(), (items) => items.length ? items.map((job) => `${job.id}  ${job.title} — ${job.employer}`).join('\n') : 'No jobs stored.'));
jobCommands.command('show <job-id>').action((jobId: string) => withService((jobs) => ({ job: jobs.getJob(jobId), score: jobs.score(jobId) }), (result) => `${result.job.title} — ${result.job.employer}\nScore: ${result.score.score}%\n${result.score.explanation.join('\n')}`));

const campaign = program.command('campaign').description('Manage durable campaigns');
campaign.command('create')
  .requiredOption('--query <query>')
  .requiredOption('--schedule <cron>')
  .requiredOption('--timezone <iana>')
  .option('--name <name>')
  .option('--location <location>', '', '')
  .option('--remote', 'remote jobs only', false)
  .option('--sites <sites>', 'comma-separated adapters', 'fixture')
  .option('--minimum-score <number>', 'minimum score', '80')
  .option('--daily-limit <number>', 'maximum applications per day', '5')
  .option('--maximum-jobs <number>', 'maximum jobs per run', '5')
  .addOption(new Option('--mode <mode>').choices(CampaignModeSchema.options).default('prepare_and_review'))
  .action((options: Record<string, string | boolean>) => withService((jobs) => jobs.createCampaign({
    name: options.name as string | undefined, query: options.query as string, location: options.location as string,
    remote: options.remote as boolean, sites: (options.sites as string).split(','), minimumScore: Number(options.minimumScore),
    dailyLimit: Number(options.dailyLimit), maximumJobsPerRun: Number(options.maximumJobs), mode: options.mode as 'research_only' | 'prepare_and_review' | 'auto_submit',
    schedule: options.schedule as string, timezone: options.timezone as string
  }), (result) => `${result.campaign.id}\n${result.preview}`));
campaign.command('list').action(() => withService((jobs) => jobs.listCampaigns(), (items) => items.length ? items.map((item) => `${item.id}  ${item.state}  ${item.name}`).join('\n') : 'No campaigns stored.'));
campaign.command('run <campaign-id>').action((campaignId: string) => withService((jobs) => jobs.runCampaign(campaignId), (result) => `Campaign run ${result.runId}: discovered ${result.discovered}, prepared ${result.prepared}, submitted 0.`));
campaign.command('pause <campaign-id>').action((campaignId: string) => withService((jobs) => jobs.setCampaignState(campaignId, 'paused'), (result) => `Paused campaign ${result.id}.`));
campaign.command('resume <campaign-id>').action((campaignId: string) => withService((jobs) => jobs.setCampaignState(campaignId, 'enabled'), (result) => `Resumed campaign ${result.id}.`));

const applications = program.command('applications').description('Inspect and act on applications');
applications.command('list').addOption(new Option('--state <state>').choices(ApplicationStateSchema.options))
  .action((options: { state?: z.infer<typeof ApplicationStateSchema> }) => withService((jobs) => jobs.listApplications(options.state), (items) => items.length ? items.map((item) => `${item.id}  ${item.state}  job=${item.jobId}`).join('\n') : 'No applications stored.'));
applications.command('show <application-id>').action((applicationId: string) => withService((jobs) => jobs.getApplication(applicationId), (result) => `${result.application.id}  ${result.application.state}\nPending approvals: ${result.approvals.filter((approval) => approval.status === 'pending').length}\nTimeline:\n${result.timeline.map((item) => `${item.createdAt} ${item.toState} — ${item.reason}`).join('\n')}`));
applications.command('approve <application-id>').option('--answer <answer>', 'edited answer; only valid when one approval is pending')
  .action((applicationId: string, options: { answer?: string }) => withService((jobs) => {
    const pending = jobs.getApplication(applicationId).approvals.filter((approval) => approval.status === 'pending');
    if (options.answer && pending.length !== 1) throw new Error('--answer requires exactly one pending approval');
    return pending.map((approval) => jobs.respondToApproval(approval.id, 'approve', options.answer));
  }, (results) => `Approved ${results.length} pending answers for ${applicationId}.`));
applications.command('reject <application-id>').action((applicationId: string) => withService((jobs) => {
  const pending = jobs.getApplication(applicationId).approvals.filter((approval) => approval.status === 'pending');
  if (!pending[0]) throw new Error('No pending approval');
  return jobs.respondToApproval(pending[0].id, 'reject');
}, () => `Rejected application ${applicationId}.`));
applications.command('retry <application-id>').action((applicationId: string) => withService((jobs) => jobs.retryApplication(applicationId), (result) => `Retry result: ${result.application.state}.`));
applications.command('fill <application-id>').option('--allow-submit', 'request submission after fill; site and safety policy still apply', false)
  .action((applicationId: string, options: { allowSubmit: boolean }) => withService((jobs) => jobs.apply(applicationId, { dryRun: !options.allowSubmit, approveSubmission: options.allowSubmit }), (result) => `Application ${result.application.id}: ${result.application.state}.`));

program.command('status').action(() => withService((jobs) => jobs.status(), (result) => `Emergency stop: ${result.emergencyStop ? 'ACTIVE' : 'off'}\nDry run: ${result.dryRun}\nJobs: ${result.jobs}; campaigns: ${result.campaigns}; applications: ${result.applications}; failed: ${result.failedApplications}`));
program.command('emergency-stop').description('Immediately block new searches, runs, fills and submissions')
  .action(() => withService((jobs) => jobs.emergencyStop(true), (result) => `Emergency stop activated at ${result.changedAt}.`));

program.command('demo').option('--reset', 'reset only the selected local database before the demo', false).description('Run the safe fixture-to-review vertical slice')
  .action((options: { reset: boolean }) => withService(async (jobs) => {
    if (options.reset) jobs.database.resetForTests();
    const profileResult = await jobs.importProfile(resolve('fixtures/candidate-profile.json'));
    const created = jobs.createCampaign({ query: 'Node.js Backend Engineer', location: 'Egypt', remote: true, sites: ['fixture'], minimumScore: 80, dailyLimit: 5, maximumJobsPerRun: 5, mode: 'prepare_and_review', schedule: '0 9 * * 1-5', timezone: 'Africa/Cairo' });
    const run = await jobs.runCampaign(created.campaign.id);
    const application = jobs.listApplications()[0];
    if (!application) throw new Error('Vertical slice did not prepare an application');
    for (const approval of jobs.getApplication(application.id).approvals.filter((item) => item.status === 'pending')) jobs.respondToApproval(approval.id, 'approve');
    const fill = await jobs.apply(application.id, { dryRun: true });
    return { profileId: profileResult.id, campaign: created, run, application: jobs.getApplication(fill.application.id), fillResult: fill.result, status: jobs.status() };
  }, (result) => `Vertical slice complete. Application ${result.application.application.id} is ${result.application.application.state}; ${result.application.timeline.length} transitions persisted. No submission occurred.`));

program.parseAsync().catch((error: unknown) => {
  if (error instanceof CommanderError) process.exitCode = error.exitCode;
  else if (error instanceof z.ZodError) {
    console.error(`Validation failed: ${error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    process.exitCode = 2;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
