import { BrowserContext } from '../../browser/BrowserContext.js';
import { JobPlatform, CandidateProfile, FormField } from '../../types/index.js';
import { logger } from '../../utils/Logger.js';
import { SELECTORS } from './selectors.js';
import { formDetector } from '../../forms/FormDetector.js';
import { fieldMapper } from '../../forms/FieldMapper.js';
import { resumeUploader } from '../../forms/ResumeUploader.js';
import { questionAnswerer } from '../../forms/QuestionAnswerer.js';

export class IndeedPlatform implements JobPlatform {
  private browserCtx: BrowserContext;
  private profile: CandidateProfile;
  private jobLocation: string = '';

  constructor(browserCtx: BrowserContext, profile: CandidateProfile) {
    this.browserCtx = browserCtx;
    this.profile = profile;
  }

  public async openJob(url: string): Promise<void> {
    logger.info(`Navigating to Indeed Job URL: ${url}`, 'IndeedPlatform');
    await this.browserCtx.goto(url);
    await this.browserCtx.takeScreenshot('indeed_job_page_opened');
    this.jobLocation = await this.extractJobLocation();
  }

  public async detectApplyMethod(): Promise<boolean> {
    logger.info('Detecting Indeed application method...', 'IndeedPlatform');
    for (const selector of SELECTORS.applyButton) {
      if (await this.browserCtx.isVisible(selector)) {
        logger.info(`Indeed Apply button detected using selector: "${selector}"`, 'IndeedPlatform');
        return true;
      }
    }
    logger.warn('Indeed Apply button NOT found on this page.', 'IndeedPlatform');
    return false;
  }

  public async openApplyForm(): Promise<boolean> {
    logger.info('Attempting to open Indeed application form...', 'IndeedPlatform');
    let applySelector = '';
    for (const selector of SELECTORS.applyButton) {
      if (await this.browserCtx.isVisible(selector)) {
        applySelector = selector;
        break;
      }
    }

    if (!applySelector) {
      logger.error('Cannot open Indeed form: No apply button found.', null, 'IndeedPlatform');
      return false;
    }

    await this.browserCtx.click(applySelector);
    await this.browserCtx.waitUntilStable();
    await this.browserCtx.takeScreenshot('indeed_form_opened');
    return true;
  }

  public async fillApplication(): Promise<void> {
    logger.info('Starting Indeed application filling...', 'IndeedPlatform');
    
    // Find container
    let formContainerSelector = 'body';
    for (const selector of SELECTORS.formContainer) {
      if (await this.browserCtx.isVisible(selector)) {
        formContainerSelector = selector;
        break;
      }
    }

    let step = 1;
    let previousStepHtml = '';
    let sameStepCount = 0;

    while (true) {
      logger.info(`---- Processing Indeed Step ${step} ----`, 'IndeedPlatform');
      await this.browserCtx.waitUntilStable();
      await this.browserCtx.takeScreenshot(`indeed_step_${step}_start`);

      // Check review/submit page
      const isReviewPage = await this.detectReviewPage();
      if (isReviewPage) {
        logger.info('Detected final Indeed Review / Submit page. Stopping automation.', 'IndeedPlatform');
        await this.browserCtx.takeScreenshot('indeed_final_review_page');
        break;
      }

      // Detect fields
      const fields = await formDetector.detectFields(this.browserCtx.page, formContainerSelector);
      if (fields.length === 0) {
        logger.warn('No form fields detected. Checking for next button.', 'IndeedPlatform');
      } else {
        for (const field of fields) {
          try {
            await this.processField(field);
          } catch (err) {
            logger.error(`Failed to process field "${field.label}"`, err, 'IndeedPlatform');
          }
        }
      }

      // Check file upload
      const hasFileField = fields.some(f => f.type === 'file');
      if (hasFileField) {
        const resumePath = process.env.RESUME_PATH || '/Users/marwanhassan/playwright-automation-jobs/assets/Marwan_Hassan-Resume.pdf';
        await resumeUploader.uploadResume(this.browserCtx, formContainerSelector, resumePath);
      }

      const currentHtml = await this.browserCtx.page.locator(formContainerSelector).innerHTML().catch(() => '');
      if (currentHtml === previousStepHtml) {
        sameStepCount++;
        if (sameStepCount >= 3) {
          logger.error('Indeed automation stuck on the same page. Field validation error.', null, 'IndeedPlatform');
          await this.browserCtx.takeScreenshot('indeed_stuck_validation');
          throw new Error('Stuck on the same step.');
        }
      } else {
        sameStepCount = 0;
        previousStepHtml = currentHtml;
      }

      const proceeded = await this.clickNextStep();
      if (!proceeded) {
        logger.warn('Could not find Next or Review button.', 'IndeedPlatform');
        break;
      }

      step++;
      if (step > 15) {
        logger.error('Safety step limit exceeded.', null, 'IndeedPlatform');
        break;
      }
    }
  }

  public async review(): Promise<void> {
    logger.info('Indeed Application filled and stopping at Review.', 'IndeedPlatform');
  }

  public async close(): Promise<void> {
    logger.info('Indeed platform worker complete.', 'IndeedPlatform');
  }

  private async processField(field: FormField): Promise<void> {
    logger.info(`Indeed field: Type: "${field.type}" | Label: "${field.label}"`, 'IndeedPlatform');

    let value = fieldMapper.mapField(field, this.profile, this.jobLocation);
    if (value === null) {
      if (field.type === 'file') return;
      value = await questionAnswerer.answerQuestion(
        field.label,
        field.type as any,
        this.profile,
        field.options,
        this.jobLocation
      );
    }

    if (value === null || value === undefined) return;

    const page = this.browserCtx.page;
    switch (field.type) {
      case 'text':
      case 'phone':
      case 'email':
      case 'number':
      case 'textarea':
        await field.element.fill(value);
        break;

      case 'select':
        if (await field.element.evaluate((node: HTMLElement) => node.tagName.toLowerCase() === 'select')) {
          const matchedOption = fieldMapper.matchOption(value, field.options || []);
          if (matchedOption) {
            await field.element.selectOption(matchedOption);
          } else {
            await field.element.selectOption({ label: value }).catch(async () => {
              await field.element.selectOption({ index: 1 });
            });
          }
        }
        break;

      case 'checkbox':
        if (field.required && !(await field.element.isChecked())) {
          await field.element.check();
        }
        break;

      case 'radio':
        const matchedRadio = fieldMapper.matchOption(value, field.options || []);
        if (matchedRadio) {
          const radioInputs = field.element.locator('input[type="radio"]');
          const count = await radioInputs.count();
          let radioClicked = false;
          for (let i = 0; i < count; i++) {
            const radio = radioInputs.nth(i);
            const id = await radio.getAttribute('id');
            let txt = '';
            if (id) {
              txt = await page.locator(`label[for="${id}"]`).first().textContent().catch(() => '') || '';
            }
            if (!txt) {
              txt = await radio.evaluate((node: HTMLElement) => node.parentElement?.textContent?.trim() || '');
            }
            if (txt.trim() === matchedRadio) {
              if (id && await page.locator(`label[for="${id}"]`).first().isVisible()) {
                await page.locator(`label[for="${id}"]`).first().click();
              } else {
                await radio.click();
              }
              radioClicked = true;
              break;
            }
          }
          if (!radioClicked) await radioInputs.first().click().catch(() => {});
        } else {
          await field.element.locator('input[type="radio"]').first().click().catch(() => {});
        }
        break;
    }
  }

  private async detectReviewPage(): Promise<boolean> {
    for (const selector of SELECTORS.submitButton) {
      if (await this.browserCtx.isVisible(selector)) {
        return true;
      }
    }
    return false;
  }

  private async clickNextStep(): Promise<boolean> {
    for (const selector of SELECTORS.nextButton) {
      if (await this.browserCtx.isVisible(selector)) {
        await this.browserCtx.click(selector);
        return true;
      }
    }
    return false;
  }

  public getJobLocation(): string {
    return this.jobLocation;
  }

  private async extractJobLocation(): Promise<string> {
    try {
      const page = this.browserCtx.page;
      const selectors = [
        'div.jobsearch-JobInfoHeader-subtitle',
        'div.ia-JobInfoHeader-subtitle',
        '#jobLocation'
      ];
      for (const sel of selectors) {
        if (await this.browserCtx.isVisible(sel)) {
          const text = await this.browserCtx.textContent(sel) || '';
          return text.replace(/\s+/g, ' ').trim();
        }
      }
    } catch {}
    return 'Cairo, Egypt';
  }

  public async submitApplication(): Promise<boolean> {
    logger.info('Submitting application...', 'IndeedPlatform');
    for (const selector of SELECTORS.submitButton) {
      if (await this.browserCtx.isVisible(selector)) {
        await this.browserCtx.click(selector);
        await this.browserCtx.waitUntilStable(5000);
        logger.info('Application submitted successfully!', 'IndeedPlatform');
        await this.browserCtx.takeScreenshot('indeed_application_submitted');
        return true;
      }
    }
    logger.error('Failed to submit application: Submit button not visible.', null, 'IndeedPlatform');
    return false;
  }
}
