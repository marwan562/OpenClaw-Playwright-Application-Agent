import { BrowserManager } from './application-agent/browser/BrowserManager.js';
import { BrowserContext } from './application-agent/browser/BrowserContext.js';
import { LinkedInPlatform } from './application-agent/platforms/linkedin/LinkedInPlatform.js';
import { logger } from './application-agent/utils/Logger.js';
import { CandidateProfile } from './application-agent/types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function runLocalTest() {
  logger.info('=== Starting Local Mock Application Automation Test ===');

  // 1. Verify actual resume file exists
  const resumePath = path.resolve(process.cwd(), 'assets/Marwan_Hassan-Resume.pdf');
  if (!fs.existsSync(resumePath)) {
    logger.error(`Resume PDF not found at path: ${resumePath}`);
    process.exit(1);
  }

  // 2. Load Profile
  const profilePath = path.resolve(process.cwd(), 'src/application-agent/profile/profile.json');
  if (!fs.existsSync(profilePath)) {
    logger.error('profile.json not found, make sure npm install has run and project is initialized.');
    process.exit(1);
  }
  const rawProfile = fs.readFileSync(profilePath, 'utf8');
  const profile: CandidateProfile = JSON.parse(rawProfile);

  // Set resume path dynamically in environment
  process.env.RESUME_PATH = resumePath;

  // 3. Initialize Browser
  const browserManager = new BrowserManager();
  let pwContext;
  let browserCtx: BrowserContext | null = null;

  try {
    pwContext = await browserManager.launch();
    const pages = pwContext.pages();
    const page = pages.length > 0 ? pages[0] : await pwContext.newPage();
    browserCtx = new BrowserContext(page, pwContext);

    // Get absolute path to local mock HTML file
    const htmlPath = path.resolve(process.cwd(), 'src/application-agent/test-resources/mock-form.html');
    const mockFileUrl = `file://${htmlPath}`;

    // Instantiate platform logic
    const platform = new LinkedInPlatform(browserCtx, profile);

    // 4. Open Job Details (Mock HTML)
    await platform.openJob(mockFileUrl);

    // 5. Detect and Open Easy Apply
    const isEasyApply = await platform.detectApplyMethod();
    if (!isEasyApply) {
      throw new Error('Easy Apply button not detected in mock form.');
    }

    const opened = await platform.openEasyApply();
    if (!opened) {
      throw new Error('Failed to open Easy Apply modal.');
    }

    // 6. Fill Application Step by Step
    await platform.fillApplication();

    // 7. Verify we are stopped on Review step and submit is NOT clicked
    await platform.review();

    logger.info('=== Local Mock Application Automation Test SUCCEEDED! ===');
    logger.info('Browser remains open for 10 seconds for review, then will close.');
    await page.waitForTimeout(10000);
    
    await browserManager.close();
  } catch (error) {
    logger.error('Local Mock Test FAILED with error', error);
    if (browserCtx) {
      await browserCtx.takeScreenshot('mock_test_failure');
    }
    await browserManager.close();
    process.exit(1);
  }
}

runLocalTest();
