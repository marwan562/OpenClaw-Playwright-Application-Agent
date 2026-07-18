import { Page, BrowserContext as PWContext } from 'playwright';
import { logger } from '../utils/Logger.js';
import { screenshotManager } from '../utils/ScreenshotManager.js';
import * as dotenv from 'dotenv';

dotenv.config();

export class BrowserContext {
  public page: Page;
  public context: PWContext;
  private defaultTimeout: number;

  constructor(page: Page, context: PWContext) {
    this.page = page;
    this.context = context;
    this.defaultTimeout = parseInt(process.env.ACTION_TIMEOUT_MS || '15000', 10);
  }

  /**
   * Helper to run an operation with retry and automatic screenshot on final failure.
   */
  private async executeSafe<T>(
    actionName: string,
    operation: () => Promise<T>,
    selector?: string,
    retries: number = 3
  ): Promise<T> {
    const key = `${actionName}_${Date.now()}`;
    logger.startDuration(key);
    logger.action(actionName, 'Started execution', selector);

    let attempt = 0;
    while (attempt < retries) {
      try {
        const result = await operation();
        logger.endDuration(key, actionName, 'Succeeded');
        return result;
      } catch (error) {
        attempt++;
        logger.warn(`Action "${actionName}" failed on attempt ${attempt}/${retries}. Error: ${error instanceof Error ? error.message : String(error)}`);
        
        if (attempt >= retries) {
          // Final failure: take a screenshot and log error
          const screenshotName = `failure_${actionName}_attempt_${attempt}`;
          await screenshotManager.capture(this.page, screenshotName);
          logger.endDuration(key, actionName, `Failed after ${retries} attempts`);
          throw error;
        }

        // Exponential backoff wait
        const delay = Math.pow(2, attempt) * 1000;
        await this.page.waitForTimeout(delay);
      }
    }
    throw new Error(`Unexpected failure in action: ${actionName}`);
  }

  public async goto(url: string, timeout?: number): Promise<void> {
    const t = timeout ?? parseInt(process.env.NAVIGATION_TIMEOUT_MS || '30000', 10);
    await this.executeSafe(`goto`, async () => {
      await this.page.goto(url, { waitUntil: 'load', timeout: t });
      await this.waitUntilStable();
    }, url);
  }

  public async click(selector: string, timeout?: number): Promise<void> {
    const t = timeout ?? this.defaultTimeout;
    await this.executeSafe(`click`, async () => {
      const locator = this.page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: t });
      // Scroll into view first and click with force option to bypass overlapping overlays
      await locator.scrollIntoViewIfNeeded({ timeout: t }).catch(() => {});
      await locator.click({ timeout: t, force: true });
    }, selector);
  }

  public async fill(selector: string, value: string, timeout?: number): Promise<void> {
    const t = timeout ?? this.defaultTimeout;
    await this.executeSafe(`fill`, async () => {
      const locator = this.page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: t });
      await locator.fill(value, { timeout: t });
    }, selector);
  }

  public async selectOption(selector: string, value: string, timeout?: number): Promise<void> {
    const t = timeout ?? this.defaultTimeout;
    await this.executeSafe(`selectOption`, async () => {
      const locator = this.page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: t });
      await locator.selectOption(value, { timeout: t });
    }, selector);
  }

  public async check(selector: string, timeout?: number): Promise<void> {
    const t = timeout ?? this.defaultTimeout;
    await this.executeSafe(`check`, async () => {
      const locator = this.page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: t });
      await locator.check({ timeout: t });
    }, selector);
  }

  public async upload(selector: string, filePath: string, timeout?: number): Promise<void> {
    const t = timeout ?? this.defaultTimeout;
    await this.executeSafe(`upload`, async () => {
      const fileInput = this.page.locator(selector).first();
      // Set input files directly on the input element
      await fileInput.setInputFiles(filePath, { timeout: t });
    }, selector);
  }

  public async waitFor(selector: string, state: 'attached' | 'detached' | 'visible' | 'hidden' = 'visible', timeout?: number): Promise<void> {
    const t = timeout ?? this.defaultTimeout;
    await this.executeSafe(`waitFor[${state}]`, async () => {
      await this.page.locator(selector).first().waitFor({ state, timeout: t });
    }, selector);
  }

  public async isVisible(selector: string): Promise<boolean> {
    try {
      return await this.page.locator(selector).first().isVisible();
    } catch {
      return false;
    }
  }

  public async getAttribute(selector: string, attributeName: string): Promise<string | null> {
    try {
      return await this.page.locator(selector).first().getAttribute(attributeName);
    } catch {
      return null;
    }
  }

  public async textContent(selector: string): Promise<string | null> {
    try {
      return await this.page.locator(selector).first().textContent();
    } catch {
      return null;
    }
  }

  public async takeScreenshot(actionName: string): Promise<string | null> {
    return await screenshotManager.capture(this.page, actionName);
  }

  /**
   * Helper to wait until the page state is stable.
   * Resolves when DOM loads, and tries to wait for network idle (gracefully handles timeouts).
   */
  public async waitUntilStable(timeout: number = 5000): Promise<void> {
    try {
      await this.page.waitForLoadState('load', { timeout });
      await this.page.waitForLoadState('domcontentloaded', { timeout });
      // Gracefully attempt network idle (often times out due to advertising/tracking scripts)
      await this.page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 2000) });
    } catch (e) {
      // Ignore networkidle timeout, we still consider the page reasonably stable
      logger.info('waitUntilStable hit timeout during networkidle (expected), continuing...', 'BrowserContext');
    }
    // Small extra padding to let UI animations finish
    await this.page.waitForTimeout(500);
  }
}
