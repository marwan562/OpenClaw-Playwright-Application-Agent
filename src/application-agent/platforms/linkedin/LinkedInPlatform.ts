import { Page } from 'playwright';
import { BrowserContext } from '../../browser/BrowserContext.js';
import { JobPlatform, CandidateProfile, FormField } from '../../types/index.js';
import { logger } from '../../utils/Logger.js';
import { SELECTORS } from './selectors.js';
import { formDetector } from '../../forms/FormDetector.js';
import { fieldMapper } from '../../forms/FieldMapper.js';
import { resumeUploader } from '../../forms/ResumeUploader.js';
import { questionAnswerer } from '../../forms/QuestionAnswerer.js';

export class LinkedInPlatform implements JobPlatform {
  private browserCtx: BrowserContext;
  private profile: CandidateProfile;
  private jobLocation: string = '';

  constructor(browserCtx: BrowserContext, profile: CandidateProfile) {
    this.browserCtx = browserCtx;
    this.profile = profile;
  }

  public async openJob(url: string): Promise<void> {
    logger.info(`Navigating to LinkedIn Job URL: ${url}`, 'LinkedInPlatform');
    await this.browserCtx.goto(url);
    await this.browserCtx.takeScreenshot('job_page_opened');
    this.jobLocation = await this.extractJobLocation();
  }

  public async detectApplyMethod(): Promise<boolean> {
    logger.info('Detecting application method...', 'LinkedInPlatform');
    for (const selector of SELECTORS.easyApplyButton) {
      if (await this.browserCtx.isVisible(selector)) {
        logger.info(`Easy Apply button detected using selector: "${selector}"`, 'LinkedInPlatform');
        return true;
      }
    }
    logger.warn('Easy Apply button NOT found on this page.', 'LinkedInPlatform');
    return false;
  }

  public async openEasyApply(): Promise<boolean> {
    logger.info('Attempting to open Easy Apply modal...', 'LinkedInPlatform');
    
    // Find the visible Easy Apply button
    let easyApplySelector = '';
    for (const selector of SELECTORS.easyApplyButton) {
      if (await this.browserCtx.isVisible(selector)) {
        easyApplySelector = selector;
        break;
      }
    }

    if (!easyApplySelector) {
      logger.error('Cannot open Easy Apply: No apply button found.', null, 'LinkedInPlatform');
      return false;
    }

    await this.browserCtx.click(easyApplySelector);
    await this.browserCtx.waitUntilStable();

    // Verify modal is open
    let modalSelector = '';
    for (const selector of SELECTORS.modalContainer) {
      if (await this.browserCtx.isVisible(selector)) {
        modalSelector = selector;
        break;
      }
    }

    if (modalSelector) {
      logger.info('Easy Apply modal opened successfully.', 'LinkedInPlatform');
      await this.browserCtx.takeScreenshot('easy_apply_modal_opened');
      return true;
    }

    logger.error('Failed to open Easy Apply modal: Container not visible.', null, 'LinkedInPlatform');
    return false;
  }

  public async fillApplication(): Promise<void> {
    logger.info('Starting Easy Apply automation flow...', 'LinkedInPlatform');
    
    // Check if modal is open
    const modalSelector = await this.findVisibleSelector(SELECTORS.modalContainer);
    if (!modalSelector) {
      throw new Error('Easy Apply modal is not open.');
    }

    const formContentSelector = await this.findVisibleSelector(SELECTORS.modalFormContent) || modalSelector;

    let step = 1;
    let previousStepHtml = '';
    let sameStepCount = 0;

    while (true) {
      logger.info(`---- Processing Step ${step} ----`, 'LinkedInPlatform');
      await this.browserCtx.waitUntilStable();

      // Take a screenshot at the beginning of each step
      await this.browserCtx.takeScreenshot(`step_${step}_start`);

      // Detect if we are on the final Review page
      const isReviewPage = await this.detectReviewPage();
      if (isReviewPage) {
        logger.info('Detected final Review / Submit page! Stopping automation.', 'LinkedInPlatform');
        await this.browserCtx.takeScreenshot('final_review_page');
        break;
      }

      // Detect fields in current step
      const fields = await formDetector.detectFields(this.browserCtx.page, formContentSelector);
      
      if (fields.length === 0) {
        logger.warn('No form fields detected in this step. Attempting to proceed.', 'LinkedInPlatform');
      } else {
        // Fill fields in this step
        for (const field of fields) {
          try {
            await this.processField(field);
          } catch (err) {
            logger.error(`Failed to process field "${field.label}"`, err, 'LinkedInPlatform');
          }
        }
      }

      // Check if there is a resume upload needed in this step
      const hasFileField = fields.some(f => f.type === 'file');
      if (hasFileField) {
        const resumePath = process.env.RESUME_PATH || '';
        if (resumePath) {
          await resumeUploader.uploadResume(this.browserCtx, formContentSelector, resumePath);
        } else {
          logger.warn('RESUME_PATH is not set in environment, skipping resume upload.', 'LinkedInPlatform');
        }
      }

      // Check for validation errors or identical page content (detect stuck state)
      const currentHtml = await this.browserCtx.page.locator(formContentSelector).innerHTML().catch(() => '');
      if (currentHtml === previousStepHtml) {
        sameStepCount++;
        if (sameStepCount >= 3) {
          logger.error('Automation stuck on the same page. A required field may have failed validation.', null, 'LinkedInPlatform');
          await this.browserCtx.takeScreenshot('stuck_validation_error');
          throw new Error('Stuck on the same step. Application automated filling aborted.');
        }
      } else {
        sameStepCount = 0;
        previousStepHtml = currentHtml;
      }

      // Click next/continue step button
      const proceeded = await this.clickNextStep();
      if (!proceeded) {
        logger.warn('Could not find Next or Review button. Taking final screenshot.', 'LinkedInPlatform');
        await this.browserCtx.takeScreenshot('cannot_proceed_step');
        break;
      }

      step++;
      // Safety cap to avoid infinite loops
      if (step > 15) {
        logger.error('Safety step limit exceeded (15 steps). Exiting flow.', null, 'LinkedInPlatform');
        break;
      }
    }
  }

  public async review(): Promise<void> {
    logger.info('Application is filled and stopping at the Review page.', 'LinkedInPlatform');
    logger.info('HUMAN DECISION REQUIRED: Review the application details on the browser window, then click Submit manually.', 'LinkedInPlatform');
  }

  public async close(): Promise<void> {
    // Standard cleanup if needed (e.g. close browser context)
    logger.info('LinkedIn platform worker complete.', 'LinkedInPlatform');
  }

  /**
   * Processes a single detected form field.
   */
  private async processField(field: FormField): Promise<void> {
    logger.info(`Processing field: Type: "${field.type}" | Label: "${field.label}"`, 'LinkedInPlatform');

    // 1. Try mapping the field using FieldMapper rules
    let value = fieldMapper.mapField(field, this.profile, this.jobLocation);

    // 2. If standard mapping fails, ask OpenClaw LLM
    if (value === null) {
      if (field.type === 'file') {
        return; // Handled separately by ResumeUploader
      }
      
      logger.info(`Field mapping failed for "${field.label}". Querying OpenClaw LLM...`, 'LinkedInPlatform');
      value = await questionAnswerer.answerQuestion(
        field.label,
        field.type as any,
        this.profile,
        field.options,
        this.jobLocation
      );
    }

    if (value === null || value === undefined) {
      logger.warn(`Could not determine answer for field "${field.label}"`, 'LinkedInPlatform');
      return;
    }

    // 3. Fill the element depending on type
    const page = this.browserCtx.page;
    
    switch (field.type) {
      case 'text':
      case 'phone':
      case 'email':
      case 'number':
      case 'textarea':
        await field.element.fill(value);
        logger.info(`Filled text input for "${field.label}" with value: "${value}"`, 'LinkedInPlatform');
        break;

      case 'select':
        if (await field.element.evaluate((node: HTMLElement) => node.tagName.toLowerCase() === 'select')) {
          // Standard HTML select element
          const options = field.options || [];
          const matchedOption = fieldMapper.matchOption(value, options);
          if (matchedOption) {
            await field.element.selectOption(matchedOption);
            logger.info(`Selected option "${matchedOption}" for standard select "${field.label}"`, 'LinkedInPlatform');
          } else {
            // fallback to value directly or first option
            await field.element.selectOption({ label: value }).catch(async () => {
              await field.element.selectOption({ index: 1 });
            });
            logger.info(`Fell back select option for "${field.label}" to "${value}"`, 'LinkedInPlatform');
          }
        } else {
          // Custom LinkedIn combobox/dropdown (div/button)
          logger.info(`Interacting with custom combobox/dropdown for "${field.label}"...`, 'LinkedInPlatform');
          await field.element.click();
          await page.waitForTimeout(500); // Wait for popup menu options to render

          // Try to type value to trigger typeahead options if it's a combobox input
          const isInput = await field.element.evaluate((node: HTMLElement) => node.tagName.toLowerCase() === 'input' || node.querySelector('input') !== null);
          if (isInput) {
            const inputLoc = field.element.locator('input').or(field.element);
            await inputLoc.fill(value);
            await page.waitForTimeout(800);
          }

          // Search for option list items
          let optionSelected = false;
          for (const sugSel of SELECTORS.citySuggestionItem) {
            const suggestionCount = await page.locator(sugSel).count();
            if (suggestionCount > 0) {
              // Extract and compare labels of suggestions
              for (let i = 0; i < suggestionCount; i++) {
                const sug = page.locator(sugSel).nth(i);
                const txt = await sug.textContent() || '';
                if (txt.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(txt.toLowerCase())) {
                  await sug.click();
                  logger.info(`Selected custom dropdown option "${txt.trim()}" for "${field.label}"`, 'LinkedInPlatform');
                  optionSelected = true;
                  break;
                }
              }
            }
            if (optionSelected) break;
          }

          if (!optionSelected) {
            // If no match, click the first option in the dropdown list to avoid blocking the flow
            for (const sugSel of SELECTORS.citySuggestionItem) {
              if (await page.locator(sugSel).first().isVisible()) {
                await page.locator(sugSel).first().click();
                logger.info(`Fell back to clicking first available custom option for "${field.label}"`, 'LinkedInPlatform');
                optionSelected = true;
                break;
              }
            }
          }

          if (!optionSelected) {
            // Close dropdown by clicking away if stuck open
            await page.click('body', { delay: 100 }).catch(() => {});
            logger.warn(`Could not select option in custom dropdown for "${field.label}"`, 'LinkedInPlatform');
          }
        }
        break;

      case 'checkbox':
        // If checkbox is required and not checked, check it.
        const isChecked = await field.element.isChecked();
        if (!isChecked && field.required) {
          await field.element.check();
          logger.info(`Checked required checkbox: "${field.label}"`, 'LinkedInPlatform');
        }
        break;

      case 'radio':
        // Look for radio item containing target value inside the fieldset container
        const options = field.options || [];
        const matchedRadioOpt = fieldMapper.matchOption(value, options);
        if (matchedRadioOpt) {
          // Find matching radio input inside fieldset and click it
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

            if (txt.trim() === matchedRadioOpt) {
              // Click the label or the radio button
              if (id && await page.locator(`label[for="${id}"]`).first().isVisible()) {
                await page.locator(`label[for="${id}"]`).first().click();
              } else {
                await radio.click();
              }
              logger.info(`Selected radio option "${matchedRadioOpt}" for field "${field.label}"`, 'LinkedInPlatform');
              radioClicked = true;
              break;
            }
          }

          if (!radioClicked) {
            // Fallback: click first radio
            await radioInputs.first().click().catch(() => {});
            logger.warn(`Fell back to first radio option for "${field.label}"`, 'LinkedInPlatform');
          }
        } else {
          // Default to clicking first radio to satisfy required validations
          await field.element.locator('input[type="radio"]').first().click().catch(() => {});
          logger.warn(`Fell back to first radio button for field "${field.label}"`, 'LinkedInPlatform');
        }
        break;

      default:
        logger.warn(`Skipping unhandled form field type "${field.type}" for "${field.label}"`, 'LinkedInPlatform');
    }
  }

  /**
   * Helper to identify if we are on the Review step.
   */
  private async detectReviewPage(): Promise<boolean> {
    for (const selector of SELECTORS.submitButton) {
      if (await this.browserCtx.isVisible(selector)) {
        logger.info(`Submit button detected with selector: "${selector}"`, 'LinkedInPlatform');
        return true;
      }
    }
    return false;
  }

  /**
   * Clicks next, continue or review button in the modal.
   * Returns true if a button was clicked successfully.
   */
  private async clickNextStep(): Promise<boolean> {
    // 1. Look for Next/Continue
    for (const selector of SELECTORS.nextButton) {
      if (await this.browserCtx.isVisible(selector)) {
        logger.info(`Clicking Next button: "${selector}"`, 'LinkedInPlatform');
        await this.browserCtx.click(selector);
        return true;
      }
    }

    // 2. Look for Review button
    for (const selector of SELECTORS.reviewButton) {
      if (await this.browserCtx.isVisible(selector)) {
        logger.info(`Clicking Review button: "${selector}"`, 'LinkedInPlatform');
        await this.browserCtx.click(selector);
        return true;
      }
    }

    return false;
  }

  /**
   * Helper to find which selector in a list is currently visible.
   */
  private async findVisibleSelector(selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      if (await this.browserCtx.isVisible(selector)) {
        return selector;
      }
    }
    return null;
  }

  public getJobLocation(): string {
    return this.jobLocation;
  }

  /**
   * Extracts target job location text from the header description.
   */
  public async extractJobLocation(): Promise<string> {
    const url = this.browserCtx.page.url();
    if (url.includes('mock-form.html') || url.startsWith('file://')) {
      logger.info('Local mock URL detected. Using "Cairo, Egypt" as mock job location.', 'LinkedInPlatform');
      return 'Cairo, Egypt';
    }

    try {
      const page = this.browserCtx.page;
      const selectors = [
        '.jobs-unified-top-card__primary-description',
        '.job-details-jobs-unified-top-card__primary-description-container',
        '.jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__bullet-container'
      ];

      for (const sel of selectors) {
        if (await this.browserCtx.isVisible(sel)) {
          const text = await this.browserCtx.textContent(sel) || '';
          const cleanText = text.replace(/\s+/g, ' ').trim();
          logger.info(`Extracted raw header text for location check: "${cleanText}"`, 'LinkedInPlatform');
          
          const parts = cleanText.split(/·|•/);
          if (parts.length > 1) {
            const locCandidate = parts[1].trim();
            if (locCandidate.length > 3) {
              return locCandidate;
            }
          }
          if (cleanText.length > 3) {
            return cleanText;
          }
        }
      }
    } catch (e) {
      logger.warn('Failed to extract job location from page header', 'LinkedInPlatform');
    }
    return '';
  }
}
