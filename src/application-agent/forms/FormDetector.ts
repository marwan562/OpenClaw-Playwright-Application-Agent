import { Page, Locator } from 'playwright';
import { FormField, FormFieldType } from '../types/index.js';
import { logger } from '../utils/Logger.js';

export class FormDetector {
  /**
   * Scans a form/container for all fillable fields.
   * @param page Playwright Page instance
   * @param containerSelector CSS Selector for form wrapper (defaults to body)
   */
  public async detectFields(page: Page, containerSelector: string = 'body'): Promise<FormField[]> {
    logger.info(`Scanning form container "${containerSelector}" for fields...`, 'FormDetector');
    const fields: FormField[] = [];
    const container = page.locator(containerSelector);

    // 1. Text Inputs and Textareas
    const inputsAndTextareas = container.locator('input[type="text"], input[type="tel"], input[type="email"], input[type="number"], input:not([type]), textarea');
    const inputCount = await inputsAndTextareas.count();
    for (let i = 0; i < inputCount; i++) {
      const locator = inputsAndTextareas.nth(i);
      if (!await locator.isVisible()) {
        continue;
      }
      const label = await this.extractLabelText(page, locator);
      const typeStr = await locator.getAttribute('type') || '';
      const placeholder = await locator.getAttribute('placeholder') || '';
      const name = await locator.getAttribute('name') || '';
      const required = (await locator.getAttribute('required')) !== null || (await locator.getAttribute('aria-required')) === 'true' || label.includes('*');

      let fieldType: FormFieldType = 'text';
      if (typeStr === 'tel') fieldType = 'phone';
      else if (typeStr === 'email') fieldType = 'email';
      else if (typeStr === 'number') fieldType = 'number';
      else if (await locator.evaluate((node: HTMLElement) => node.tagName.toLowerCase() === 'textarea')) fieldType = 'textarea';

      fields.push({
        element: locator,
        type: fieldType,
        label,
        placeholder,
        name,
        required
      });
    }

    // 2. Select Dropdowns
    const selects = container.locator('select');
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i++) {
      const locator = selects.nth(i);
      if (!await locator.isVisible()) {
        continue;
      }
      const label = await this.extractLabelText(page, locator);
      const name = await locator.getAttribute('name') || '';
      const required = (await locator.getAttribute('required')) !== null || (await locator.getAttribute('aria-required')) === 'true' || label.includes('*');
      
      // Extract option values
      const options = await locator.locator('option').evaluateAll((nodes: HTMLOptionElement[]) => 
        nodes.map(n => n.textContent?.trim() || '').filter(t => t.length > 0)
      );

      fields.push({
        element: locator,
        type: 'select',
        label,
        name,
        options,
        required
      });
    }

    // 3. Custom LinkedIn combobox/dropdowns (if standard select is missing, LinkedIn often uses div[role="combobox"] or buttons)
    const customDropdowns = container.locator('div[role="combobox"], button[aria-expanded]');
    const customDropdownsCount = await customDropdowns.count();
    for (let i = 0; i < customDropdownsCount; i++) {
      const locator = customDropdowns.nth(i);
      if (!await locator.isVisible()) {
        continue;
      }
      
      // Skip if it's not a dropdown (e.g. search boxes can be comboboxes)
      const ariaHasPopup = await locator.getAttribute('aria-haspopup');
      if (ariaHasPopup !== 'listbox' && ariaHasPopup !== 'true') {
        // Double check using label or placeholder
        const placeholder = await locator.getAttribute('placeholder') || '';
        if (!placeholder.toLowerCase().includes('select') && !placeholder.toLowerCase().includes('choose')) {
          continue;
        }
      }

      const label = await this.extractLabelText(page, locator);
      const required = label.includes('*');

      fields.push({
        element: locator,
        type: 'select',
        label,
        required,
        options: [] // To be fetched dynamically when clicked
      });
    }

    // 4. File Upload Inputs
    const fileInputs = container.locator('input[type="file"]');
    const fileCount = await fileInputs.count();
    for (let i = 0; i < fileCount; i++) {
      const locator = fileInputs.nth(i);
      if (!await locator.isVisible()) {
        continue;
      }
      const label = await this.extractLabelText(page, locator);
      const required = label.includes('*');

      fields.push({
        element: locator,
        type: 'file',
        label,
        required
      });
    }

    // 5. Radio Buttons (grouped by name/fieldset)
    // To handle radios properly, we group them by parent fieldset or by common question container
    const fieldsets = container.locator('fieldset');
    const fieldsetCount = await fieldsets.count();
    for (let i = 0; i < fieldsetCount; i++) {
      const fieldset = fieldsets.nth(i);
      if (!await fieldset.isVisible()) {
        continue;
      }
      // Check if it contains radios
      const radios = fieldset.locator('input[type="radio"]');
      const radioCount = await radios.count();
      if (radioCount > 0) {
        // Legend acts as the question/label
        const legendText = await fieldset.locator('legend').first().textContent().catch(() => '') || '';
        const required = legendText.includes('*');
        const options: string[] = [];
        
        for (let j = 0; j < radioCount; j++) {
          const radio = radios.nth(j);
          const val = await radio.getAttribute('value') || '';
          // Find adjacent label text
          const id = await radio.getAttribute('id');
          let radioLabel = '';
          if (id) {
            radioLabel = await page.locator(`label[for="${id}"]`).first().textContent().catch(() => '') || '';
          }
          if (!radioLabel) {
            radioLabel = await radio.evaluate((node: HTMLElement) => node.parentElement?.textContent?.trim() || '');
          }
          options.push(radioLabel.trim() || val);
        }

        fields.push({
          element: fieldset, // Reference to fieldset container
          type: 'radio',
          label: legendText.trim(),
          options,
          required
        });
      }
    }

    // 6. Checkboxes (that are not part of radio groups)
    const checkboxes = container.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      const locator = checkboxes.nth(i);
      if (!await locator.isVisible()) {
        continue;
      }
      const label = await this.extractLabelText(page, locator);
      const required = label.includes('*');

      fields.push({
        element: locator,
        type: 'checkbox',
        label,
        required
      });
    }

    logger.info(`Detected ${fields.length} form fields in container.`, 'FormDetector');
    return fields;
  }

  /**
   * Helper to extract label text for a given locator element.
   */
  private async extractLabelText(page: Page, locator: Locator): Promise<string> {
    try {
      const id = await locator.getAttribute('id');
      if (id) {
        const labelEl = page.locator(`label[for="${id}"]`).first();
        if (await labelEl.isVisible()) {
          return (await labelEl.textContent() || '').trim();
        }
      }
      
      // Fallback: look for ancestor label
      const parentLabel = await locator.evaluate((node: HTMLElement) => {
        let parent = node.parentElement;
        while (parent) {
          if (parent.tagName.toLowerCase() === 'label') {
            return parent.textContent?.trim() || '';
          }
          // Also check for standard form-group labels
          const labelChild = parent.querySelector('label');
          if (labelChild) {
            return labelChild.textContent?.trim() || '';
          }
          parent = parent.parentElement;
        }
        return '';
      });

      if (parentLabel) {
        return parentLabel;
      }

      // Fallback to aria-label or placeholder
      const ariaLabel = await locator.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      const placeholder = await locator.getAttribute('placeholder');
      if (placeholder) return placeholder.trim();

      return '';
    } catch {
      return '';
    }
  }
}

export const formDetector = new FormDetector();
