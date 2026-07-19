import { BrowserManager } from '../browser/BrowserManager.js';
import { BrowserContext } from '../browser/BrowserContext.js';
import { AppRunner } from './AppRunner.js';
import { logger } from '../utils/Logger.js';
import { CandidateProfile } from '../types/index.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description?: string;
  score?: number;
  reason?: string;
  status: 'discovered' | 'applied' | 'ignored' | 'pending_approval';
  dateAdded: string;
}

export class JobScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isCrawling: boolean = false;

  private getProfile(): CandidateProfile | null {
    const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
    if (fs.existsSync(profilePath)) {
      try {
        return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      } catch (e) {
        logger.error('Failed to read profile in JobScheduler', e);
      }
    }
    return null;
  }

  private getSettings() {
    const settingsPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch {}
    }
    return {
      mode: 'approval',
      crawlIntervalMinutes: 60,
      crawlerEnabled: false,
      matchThreshold: 70,
      routerUrl: 'http://127.0.0.1:20128/v1',
      telegramEnabled: true
    };
  }

  private getHistory(): JobListing[] {
    const historyPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/applications.json');
    if (fs.existsSync(historyPath)) {
      try {
        return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      } catch {}
    }
    return [];
  }

  private saveHistory(history: JobListing[]) {
    const historyPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/applications.json');
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  public start() {
    if (this.timer) return;
    const settings = this.getSettings();
    if (!settings.crawlerEnabled) {
      logger.info('Scheduler not started because crawlerEnabled is false.', 'JobScheduler');
      return;
    }

    const intervalMs = settings.crawlIntervalMinutes * 60 * 1000;
    logger.info(`Starting crawler scheduler. Running every ${settings.crawlIntervalMinutes} minutes.`, 'JobScheduler');
    
    this.timer = setInterval(() => {
      this.crawlAndProcess().catch(err => {
        logger.error('Error in crawl cycle', err, 'JobScheduler');
      });
    }, intervalMs);

    // Run once immediately
    this.crawlAndProcess().catch(err => {
      logger.error('Initial crawl run failed', err, 'JobScheduler');
    });
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Stopped crawler scheduler.', 'JobScheduler');
    }
  }

  public async crawlAndProcess(): Promise<void> {
    if (this.isCrawling) {
      logger.warn('Crawl cycle already in progress, skipping.', 'JobScheduler');
      return;
    }

    const profile = this.getProfile();
    if (!profile) {
      logger.error('No candidate profile found. Skipping crawl.', 'JobScheduler');
      return;
    }

    this.isCrawling = true;
    logger.info('Starting job search crawl cycle...', 'JobScheduler');

    try {
      const keyword = (profile.additionalInfo?.desiredJobTitles as string) || 'Software Engineer';
      const location = profile.city || 'Cairo, Egypt';
      
      const discoveredJobs = await this.performScraping(keyword, location);
      logger.info(`Crawl discovered ${discoveredJobs.length} raw jobs. Filtering and scoring...`, 'JobScheduler');

      const history = this.getHistory();
      const settings = this.getSettings();

      for (const job of discoveredJobs) {
        // Deduplicate by URL or unique key
        const alreadyExists = history.some(h => h.url === job.url || h.id === job.id);
        if (alreadyExists) {
          continue;
        }

        logger.info(`Evaluating new job: "${job.title}" at "${job.company}"`, 'JobScheduler');
        
        // Evaluate details & score job
        const scoreResult = await this.scoreJobWithLLM(job, profile);
        job.score = scoreResult.score;
        job.reason = scoreResult.reason;
        
        if (job.score >= settings.matchThreshold) {
          logger.info(`Job matched threshold (${job.score}/100). Status: ${settings.mode === 'autonomous' ? 'autonomous application triggered' : 'pending approval'}.`, 'JobScheduler');
          
          if (settings.mode === 'autonomous') {
            job.status = 'applied'; // Will update status after attempt
            history.push(job);
            this.saveHistory(history);
            
            // Execute autonomous run (bypass manual click / resolve immediately)
            AppRunner.runJobApplication(job.url, true).catch(err => {
              logger.error(`Failed autonomous application for ${job.url}`, err);
            });
          } else {
            job.status = 'pending_approval';
            history.push(job);
            this.saveHistory(history);
          }
        } else {
          logger.info(`Job discarded below threshold (${job.score}/100).`, 'JobScheduler');
          job.status = 'ignored';
          history.push(job);
          this.saveHistory(history);
        }
      }

      logger.info('Completed job search crawl cycle.', 'JobScheduler');
    } catch (error) {
      logger.error('Fatal error during crawling/scoring cycle', error, 'JobScheduler');
    } finally {
      this.isCrawling = false;
    }
  }

  private async performScraping(keywords: string, location: string): Promise<JobListing[]> {
    logger.info(`Crawling job portals for keywords: "${keywords}", location: "${location}"...`, 'JobScheduler');
    
    const browserManager = new BrowserManager();
    let context;
    const listings: JobListing[] = [];

    try {
      context = await browserManager.launch();
      const page = await context.newPage();
      const browserCtx = new BrowserContext(page, context);

      // Search on LinkedIn public jobs page to avoid complex authentication walls during crawl
      const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&f_TPR=r86400`; // last 24h
      logger.info(`Navigating to crawler search URL: ${searchUrl}`, 'JobScheduler');
      await browserCtx.goto(searchUrl);
      await page.waitForTimeout(3000);

      // Extract job cards
      const jobCards = page.locator('ul.jobs-search__results-list li, .jobs-search-results__list-item, div.base-card');
      const count = Math.min(await jobCards.count(), 10); // Check first 10 results
      logger.info(`Found ${count} job cards on search page.`, 'JobScheduler');

      for (let i = 0; i < count; i++) {
        try {
          const card = jobCards.nth(i);
          
          let title = '';
          let company = '';
          let jobLocation = '';
          let url = '';

          // Support multiple selector variants for public vs logged-in search card markup
          if (await card.locator('a.base-card__full-link').count() > 0) {
            const linkLoc = card.locator('a.base-card__full-link');
            title = (await card.locator('.base-search-card__title').textContent() || '').trim();
            company = (await card.locator('.base-search-card__subtitle').textContent() || '').trim();
            jobLocation = (await card.locator('.job-search-card__location').textContent() || '').trim();
            url = await linkLoc.getAttribute('href') || '';
          } else if (await card.locator('.job-card-list__title').count() > 0) {
            title = (await card.locator('.job-card-list__title').textContent() || '').trim();
            company = (await card.locator('.job-card-container__company-name').textContent() || '').trim();
            jobLocation = (await card.locator('.job-card-container__metadata-item').first().textContent() || '').trim();
            url = 'https://www.linkedin.com' + (await card.locator('a.job-card-list__title').getAttribute('href') || '').split('?')[0];
          }

          if (title && url) {
            // Parse unique ID from url (e.g. /view/123456)
            const idMatch = url.match(/\/view\/(\d+)/) || url.match(/currentJobId=(\d+)/) || [null, String(Math.random())];
            const id = idMatch[1];
            
            listings.push({
              id,
              title,
              company,
              location: jobLocation || location,
              url: url.split('?')[0],
              status: 'discovered',
              dateAdded: new Date().toISOString()
            });
          }
        } catch (e) {
          logger.warn(`Failed parsing card index ${i}: ${e}`);
        }
      }

      // Quick description retrieval for high-level matching
      for (const list of listings) {
        try {
          logger.info(`Fetching details for: ${list.title} - ${list.company}`, 'JobScheduler');
          await browserCtx.goto(list.url);
          await page.waitForTimeout(2000);

          // Get job description text content
          const descriptionSelectors = [
            '.show-more-less-html__markup',
            '#job-details',
            '.jobs-description__content',
            '.jobsearch-JobComponent-description'
          ];

          let description = '';
          for (const sel of descriptionSelectors) {
            if (await browserCtx.isVisible(sel)) {
              description = (await browserCtx.textContent(sel) || '').trim();
              break;
            }
          }
          list.description = description || 'No description extracted.';
        } catch (e) {
          logger.warn(`Failed extracting description for ${list.title}: ${e}`);
          list.description = 'Failed to load details.';
        }
      }

      await browserManager.close();
    } catch (err) {
      logger.error('Scraping error', err, 'JobScheduler');
      await browserManager.close();
    }

    return listings;
  }

  private async scoreJobWithLLM(job: JobListing, profile: CandidateProfile): Promise<{ score: number; reason: string }> {
    try {
      const apiUrl = process.env.LLM_API_URL || 'http://127.0.0.1:20128/v1';
      const model = process.env.LLM_MODEL || 'Test';

      const prompt = `Evaluate the following job listing details against the candidate profile.
Calculate a match score from 0 to 100 representing how well the candidate fits the requirements.
Also write a concise 1-sentence reason explaining the score (e.g. highlight matching skills or missing experience).

Candidate Profile:
${JSON.stringify({
  firstName: profile.firstName,
  lastName: profile.lastName,
  experience: profile.experience,
  skills: profile.additionalInfo?.skills || '',
  remote: profile.remote,
  relocate: profile.relocate
}, null, 2)}

Job Details:
Title: "${job.title}"
Company: "${job.company}"
Location: "${job.location}"
Description:
"${job.description?.substring(0, 1500) || 'No description available.'}"

Return your response in standard JSON:
{
  "score": 85,
  "reason": "Reason details here"
}`;

      const response = await axios.post(`${apiUrl}/chat/completions`, {
        model,
        messages: [
          { role: 'system', content: 'You are an expert recruitment matching engine.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LLM_API_KEY || ''}`
        },
        timeout: 15000
      });

      const parsed = JSON.parse(response.data.choices[0].message.content);
      return {
        score: parseInt(parsed.score, 10) || 0,
        reason: parsed.reason || 'No reason provided.'
      };
    } catch (e) {
      logger.error('Failed to match job via LLM. Defaulting to score 50.', e, 'JobScheduler');
      return {
        score: 50,
        reason: 'Failed to communicate with LLM matching engine.'
      };
    }
  }
}

export const jobScheduler = new JobScheduler();
