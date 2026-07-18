import { Page } from 'playwright';
import { BrowserContext } from '../browser/BrowserContext.js';
import { logger } from '../utils/Logger.js';
import * as fs from 'fs';
import * as path from 'path';

export class ResumeUploader {
  /**
   * Locates file inputs and uploads the resume.
   * @param browserCtx wrapped browser context
   * @param containerSelector form container selector
   * @param resumePath path to the PDF resume
   */
  public async uploadResume(
    browserCtx: BrowserContext,
    containerSelector: string,
    resumePath: string
  ): Promise<boolean> {
    logger.info(`Starting resume upload process using file: "${resumePath}"...`, 'ResumeUploader');

    if (!fs.existsSync(resumePath)) {
      logger.error(`Resume file does not exist at path: "${resumePath}"`, null, 'ResumeUploader');
      return false;
    }

    const page = browserCtx.page;
    const container = page.locator(containerSelector);

    // Find file inputs
    const fileInput = container.locator('input[type="file"]').first();
    const count = await fileInput.count();

    if (count === 0) {
      logger.warn('No file input [type="file"] found in this form step. Skipping resume upload.', 'ResumeUploader');
      return true; // Return true as there was nothing to upload in this step
    }

    try {
      // Perform upload
      logger.info('Uploading resume file...', 'ResumeUploader');
      
      // Make sure the input element is attached
      await fileInput.waitFor({ state: 'attached', timeout: 10000 });
      
      // Set input files
      const absolutePath = path.resolve(resumePath);
      await fileInput.setInputFiles(absolutePath);
      
      logger.info('File upload input triggered. Waiting for completion...', 'ResumeUploader');
      
      // Wait for file upload visual state change (sometimes there is a loading indicator or success label)
      await browserCtx.waitUntilStable(3000);

      // Verify upload success by inspecting text content or existence of checkmarks/filenames
      // LinkedIn typically shows the uploaded file name or a success badge
      const containerText = await container.textContent() || '';
      const filename = path.basename(resumePath);
      
      if (containerText.includes(filename) || containerText.toLowerCase().includes('pdf') || containerText.toLowerCase().includes('success') || containerText.toLowerCase().includes('uploaded')) {
        logger.info(`Resume upload verified successfully! File name "${filename}" detected in form markup.`, 'ResumeUploader');
      } else {
        logger.warn(`Could not explicitly verify upload from text: "${containerText.substring(0, 100)}...", assuming standard browser upload succeeded.`, 'ResumeUploader');
      }

      // Take a screenshot of the upload success state
      await browserCtx.takeScreenshot('resume_uploaded');
      return true;
    } catch (error) {
      logger.error('Failed to upload resume', error, 'ResumeUploader');
      await browserCtx.takeScreenshot('resume_upload_failed');
      return false;
    }
  }
}

export const resumeUploader = new ResumeUploader();
