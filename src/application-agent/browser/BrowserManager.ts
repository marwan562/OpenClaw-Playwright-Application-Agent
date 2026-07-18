import { chromium, Browser, BrowserContext } from 'playwright';
import { logger } from '../utils/Logger.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  public async launch(): Promise<BrowserContext> {
    const headless = process.env.HEADLESS === 'true';
    const slowMo = parseInt(process.env.SLOMO_MS || '500', 10);
    const userDataDir = process.env.BROWSER_USER_DATA_DIR;

    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ];

    if (userDataDir) {
      const absoluteUserDataDir = path.resolve(process.cwd(), userDataDir);
      logger.info(`Launching browser with persistent context at: ${absoluteUserDataDir}`, 'BrowserManager');
      this.context = await chromium.launchPersistentContext(absoluteUserDataDir, {
        // Launch installed Google Chrome, not Playwright's bundled Chromium.
        channel: 'chrome',
        headless,
        slowMo,
        args: launchArgs,
        viewport: null, // Let it use native size or maximize
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
      return this.context;
    } else {
      logger.info('Launching standard browser...', 'BrowserManager');
      this.browser = await chromium.launch({
        // Launch installed Google Chrome, not Playwright's bundled Chromium.
        channel: 'chrome',
        headless,
        slowMo,
        args: launchArgs
      });
      
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });
      return this.context;
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.context) {
        logger.info('Closing browser context...', 'BrowserManager');
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        logger.info('Closing browser...', 'BrowserManager');
        await this.browser.close();
        this.browser = null;
      }
    } catch (error) {
      logger.error('Error during browser closure', error, 'BrowserManager');
    }
  }
}
