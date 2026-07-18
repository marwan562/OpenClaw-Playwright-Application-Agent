import { BrowserManager } from '../browser/BrowserManager.js';
import { BrowserContext } from '../browser/BrowserContext.js';
import { LinkedInPlatform } from '../platforms/linkedin/LinkedInPlatform.js';
import { WuzzufPlatform } from '../platforms/wuzzuf/WuzzufPlatform.js';
import { IndeedPlatform } from '../platforms/indeed/IndeedPlatform.js';
import { logger } from '../utils/Logger.js';
import { CandidateProfile } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

export class AppRunner {
  public static async runJobApplication(jobUrl: string): Promise<boolean> {
    logger.info(`Orchestrating application for URL: ${jobUrl}...`, 'AppRunner');

    const profilePath = path.resolve(process.cwd(), 'src/application-agent/profile/profile.json');
    if (!fs.existsSync(profilePath)) {
      logger.error(`Profile not found at: ${profilePath}`, 'AppRunner');
      return false;
    }

    const rawProfile = fs.readFileSync(profilePath, 'utf8');
    const profile: CandidateProfile = JSON.parse(rawProfile);

    const browserManager = new BrowserManager();
    let pwContext;
    let browserCtx: BrowserContext | null = null;

    try {
      pwContext = await browserManager.launch();
      const pages = pwContext.pages();
      const page = pages.length > 0 ? pages[0] : await pwContext.newPage();
      browserCtx = new BrowserContext(page, pwContext);

      let platform;
      if (jobUrl.includes('wuzzuf.net')) {
        platform = new WuzzufPlatform(browserCtx, profile);
      } else if (jobUrl.includes('indeed.com')) {
        platform = new IndeedPlatform(browserCtx, profile);
      } else {
        platform = new LinkedInPlatform(browserCtx, profile);
      }

      await platform.openJob(jobUrl);
      const isEasyApply = await platform.detectApplyMethod();
      if (!isEasyApply) {
        logger.warn('This job does not support Quick Apply/Easy Apply workflows.', 'AppRunner');
        await browserManager.close();
        return false;
      }

      let opened = false;
      if (platform instanceof LinkedInPlatform) {
        opened = await platform.openEasyApply();
      } else if (platform instanceof WuzzufPlatform) {
        opened = await platform.openApplyForm();
      } else if (platform instanceof IndeedPlatform) {
        opened = await platform.openApplyForm();
      }

      if (!opened) {
        logger.error('Failed to open application form.', 'AppRunner');
        await browserManager.close();
        return false;
      }

      await platform.fillApplication();
      await platform.review();

      logger.info('Application form successfully filled. Under Review.', 'AppRunner');
      return true;
    } catch (error) {
      logger.error('Error during execution', error, 'AppRunner');
      if (browserCtx) {
        await browserCtx.takeScreenshot('server_runner_error');
      }
      await browserManager.close();
      return false;
    }
  }
}
