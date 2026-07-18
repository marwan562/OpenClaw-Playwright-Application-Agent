import { BrowserManager } from './application-agent/browser/BrowserManager.js';
import { BrowserContext } from './application-agent/browser/BrowserContext.js';
import { LinkedInPlatform } from './application-agent/platforms/linkedin/LinkedInPlatform.js';
import { logger } from './application-agent/utils/Logger.js';
import { CandidateProfile } from './application-agent/types/index.js';
import { notificationManager } from './application-agent/utils/NotificationManager.js';
import { CurrencyConverter } from './application-agent/utils/CurrencyConverter.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Validate CLI arguments
  const args = process.argv.slice(2);
  const jobUrl = args[0];

  if (!jobUrl) {
    logger.error('Usage: npm start <LinkedIn_Job_URL>');
    process.exit(1);
  }

  logger.info(`Starting job application worker for URL: ${jobUrl}...`);

  // Load Profile JSON
  const profilePath = path.resolve(process.cwd(), 'src/application-agent/profile/profile.json');
  if (!fs.existsSync(profilePath)) {
    logger.error(`Profile configuration file not found at: ${profilePath}`);
    process.exit(1);
  }

  let profile: CandidateProfile;
  try {
    const rawProfile = fs.readFileSync(profilePath, 'utf8');
    profile = JSON.parse(rawProfile);
    logger.info(`Loaded candidate profile: ${profile.firstName} ${profile.lastName}`);
  } catch (error) {
    logger.error('Failed to parse candidate profile.json', error);
    process.exit(1);
  }

  // Initialize Browser
  const browserManager = new BrowserManager();
  let pwContext;
  let browserCtx: BrowserContext | null = null;

  try {
    pwContext = await browserManager.launch();
    // Get the first page or create a new one
    const pages = pwContext.pages();
    const page = pages.length > 0 ? pages[0] : await pwContext.newPage();
    browserCtx = new BrowserContext(page, pwContext);

    // Initialize LinkedIn platform
    const platform = new LinkedInPlatform(browserCtx, profile);

    // 1. Open Job URL
    await platform.openJob(jobUrl);

    // 2. Detect Easy Apply
    const isEasyApply = await platform.detectApplyMethod();
    if (!isEasyApply) {
      logger.warn('This job listing does not support "Easy Apply". Automated filling is not possible.');
      return;
    }

    // 3. Open Easy Apply modal
    const opened = await platform.openEasyApply();
    if (!opened) {
      logger.error('Failed to open Easy Apply modal. Aborting application.');
      return;
    }

    // 4. Fill Application Steps
    await platform.fillApplication();

    // 5. Present to user and wait on Review page
    await platform.review();

    logger.info('Application form successfully filled. Browser left open for your review.');

    // Send Telegram Success Notification
    const finalSalaryUsed = CurrencyConverter.convertSalary(500, platform.getJobLocation());
    await notificationManager.sendSuccess(jobUrl, platform.getJobLocation(), finalSalaryUsed);
    
    // Maintain node process alive so user can review and click submit in browser
    logger.info('Press Ctrl+C to terminate the process and close the browser.');
    
    // We intentionally do not close the browser here so the user can interact with the page
    // and click "Submit" manually.
  } catch (error) {
    logger.error('An error occurred during application automation', error);
    let screenshotPath: string | undefined;
    if (browserCtx) {
      const pathResult = await browserCtx.takeScreenshot('final_error_exit');
      if (pathResult) screenshotPath = pathResult;
    }
    
    // Send Telegram Failure Notification
    await notificationManager.sendFailure(
      jobUrl,
      error instanceof Error ? error.message : String(error),
      screenshotPath
    );

    await browserManager.close();
  }
}

// Execute
main().catch(err => {
  logger.error('Unhandled fatal exception', err);
});
