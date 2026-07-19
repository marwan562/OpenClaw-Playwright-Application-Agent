import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import type { ApplicationDraft, CandidateProfile, Job, JobSearchCriteria } from '../schemas/index.js';
import { assertSafeLocalFile } from '../security/redaction.js';
import { FixtureJobAdapter } from './fixture-adapter.js';
import type { AdapterContext, FillResult, JobSiteAdapter, SubmissionApproval, SubmissionResult } from './types.js';

export class MockPlaywrightAdapter implements JobSiteAdapter {
  readonly id = 'mock';
  private readonly fixtureAdapter: FixtureJobAdapter;

  constructor(
    private readonly formPath = resolve(process.cwd(), 'fixtures/mock-application.html'),
    fixturePath = resolve(process.cwd(), 'fixtures/jobs.json')
  ) {
    this.fixtureAdapter = new FixtureJobAdapter(fixturePath);
  }

  matches(input: { source?: string; url?: string }): boolean {
    return input.source === 'fixture' || input.source === 'mock' || Boolean(input.url?.startsWith('mock://'));
  }

  search(criteria: JobSearchCriteria, context: AdapterContext): Promise<Job[]> {
    return this.fixtureAdapter.search(criteria, context);
  }

  inspect(job: Job, context: AdapterContext): Promise<Job> {
    return this.fixtureAdapter.inspect(job, context);
  }

  prepare(job: Job, profile: CandidateProfile, context: AdapterContext) {
    return this.fixtureAdapter.prepare(job, profile, context);
  }

  private control(page: Page, label: string): Locator {
    return page.getByLabel(label, { exact: true });
  }

  private async pruneArtifacts(root: string, retentionDays: number): Promise<void> {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const target = resolve(root, entry.name);
      if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
    }
  }

  async fill(draft: ApplicationDraft, context: AdapterContext): Promise<FillResult> {
    context.signal?.throwIfAborted();
    const artifactRoot = resolve(context.dataDir, 'artifacts');
    await mkdir(artifactRoot, { recursive: true, mode: 0o700 });
    await this.pruneArtifacts(artifactRoot, context.artifactRetentionDays ?? 14);
    const artifactDir = resolve(artifactRoot, context.correlationId);
    await mkdir(artifactDir, { recursive: true, mode: 0o700 });
    let browser: Browser | null = null;
    let browserContext: BrowserContext | null = null;
    let page: Page | null = null;
    let fieldsFilled = 0;
    try {
      browser = await chromium.launch({ headless: true });
      browserContext = await browser.newContext();
      await browserContext.tracing.start({ screenshots: true, snapshots: true });
      page = await browserContext.newPage();
      await page.goto(pathToFileURL(this.formPath).href);
      for (const question of draft.questions) {
        context.signal?.throwIfAborted();
        const answer = draft.answers.find((item) => item.questionId === question.id);
        if (!answer || (question.required && !answer.proposedAnswer)) throw new Error(`Missing required approved answer for ${question.label}`);
        const control = this.control(page, question.label);
        if (question.type === 'select') await control.selectOption({ label: answer.proposedAnswer });
        else if (question.type === 'file') {
          assertSafeLocalFile(answer.proposedAnswer, context.approvedFilePaths ?? []);
          await control.setInputFiles(answer.proposedAnswer);
        } else await control.fill(answer.proposedAnswer);
        fieldsFilled += 1;
      }
      await page.getByRole('button', { name: 'Review application', exact: true }).click();
      await page.getByRole('heading', { name: 'Review only — not submitted', exact: true }).waitFor();
      const submit = page.getByRole('button', { name: 'Submit application', exact: true });
      if (!(await submit.isVisible()) || await page.locator('[data-submitted="true"]').count()) throw new Error('Mock form did not stop safely at review');
      const screenshotPath = resolve(artifactDir, 'ready-to-submit.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await browserContext.tracing.stop({ path: resolve(artifactDir, 'trace.zip') });
      return { status: 'READY_TO_SUBMIT', fieldsFilled, screenshotPath, message: 'Filled and validated; stopped before final submission.' };
    } catch (error) {
      const screenshotPath = resolve(artifactDir, 'fill-failure.png');
      await page?.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      await browserContext?.tracing.stop({ path: resolve(artifactDir, 'trace-failure.zip') }).catch(() => undefined);
      return { status: 'FAILED_RETRYABLE', fieldsFilled, screenshotPath, message: error instanceof Error ? error.message : 'Unknown fill error' };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  async submit(_draft: ApplicationDraft, _approval: SubmissionApproval, _context: AdapterContext): Promise<SubmissionResult> {
    return { status: 'POLICY_BLOCKED', message: 'The milestone-one mock adapter is intentionally incapable of submission.' };
  }
}
