import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import { logger } from './Logger.js';

export class ScreenshotManager {
  private screenshotsDir: string;

  constructor() {
    this.screenshotsDir = path.resolve(process.cwd(), 'screenshots');
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  public async capture(page: Page, actionName: string): Promise<string | null> {
    try {
      const sanitizedActionName = actionName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${timestamp}_${sanitizedActionName}.png`;
      const filepath = path.join(this.screenshotsDir, filename);

      logger.info(`Taking screenshot for action: ${actionName}...`, 'ScreenshotManager');
      await page.screenshot({ path: filepath, fullPage: false });
      logger.info(`Screenshot saved to: ${filepath}`, 'ScreenshotManager');
      return filepath;
    } catch (error) {
      logger.error(`Failed to take screenshot for ${actionName}`, error, 'ScreenshotManager');
      return null;
    }
  }
}

export const screenshotManager = new ScreenshotManager();
