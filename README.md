# OpenClaw Playwright Application Agent

A modular, production-ready Playwright automation system designed to integrate with OpenClaw. It automates multi-step job applications (e.g., LinkedIn "Easy Apply") based on a candidate's profile and resume details, automatically handles custom questionnaire forms via LLM queries, translates expected salary currencies dynamically based on job location, and pauses at the final Review screen for manual human submission.

---

## Key Features

- **Modular Clean Architecture**: Adheres strictly to SOLID, DRY, and KISS design principles. Avoids single large scripts in favor of specialized, composable services.
- **Robust Browser Abstraction**: Exposes custom wrappers for Playwright actions with embedded retries, exponential backoffs, timing statistics, and automatic screenshot captures on failure.
- **Smart Form Detection & Visibility Filters**: Dynamically scans modal content to detect inputs, dropdowns, radios, checkboxes, and upload buttons. Filters out hidden elements to navigate multi-step SPAs correctly.
- **Dynamic Expected Salary Conversion**: Converts your base USD salary (e.g., $500 USD) into the local target country currency (e.g., EGP for Egypt, SAR for Saudi Arabia, AED for UAE) based on parsed job listing headers.
- **LLM Question Answering**: Extracts custom form queries and submits them to OpenClaw's 9router/LLM endpoint with resume details as context. Employs robust local fallback heuristics if the LLM is offline.
- **Telegram Notification Alerts**: Sends immediate alerts via OpenClaw's Telegram bot channel on run success (with locations and salary stats) or run failures (with execution error details and screenshot paths).
- **Offline Mock Form Integration Tests**: Includes a complete mock form simulator allowing you to test the entire multi-step process safely in a local environment.

---

## Directory Structure

```text
src/
    application-agent/
        browser/
            BrowserManager.ts     # Launches standard/persistent Chromium contexts
            BrowserContext.ts     # Wraps Playwright actions with retries & screenshots
        forms/
            FormDetector.ts       # Parses page DOM controls dynamically
            FieldMapper.ts        # Maps candidate profile to fields
            ResumeUploader.ts     # Automates file uploads
            QuestionAnswerer.ts   # Connects custom questions to LLM / fallbacks
        platforms/
            linkedin/
                LinkedInPlatform.ts # Orchestrates Easy Apply workflow
                selectors.ts        # UI selector definitions
                parser.ts           # String/Job ID parsing utilities
        profile/
            profile.json          # Structured candidate profile details
        test-resources/
            mock-form.html        # Simulated multi-step HTML form
        utils/
            Logger.ts             # Colored console and file logger
            ScreenshotManager.ts  # Captures visual status states
            CurrencyConverter.ts  # Conversions for USD to MENA currencies
            NotificationManager.ts# Telegram API messaging alerts
        types/
            index.ts              # System TypeScript interfaces
    run.ts                        # CLI entry point for active listings
    test-local.ts                 # Local offline form test suite
```

---

## Prerequisites

1. **Node.js**: Ensure Node.js (v20+) is installed.
2. **NPM Dependencies**: Install using `npm install`.

---

## Configuration (`.env`)

Configure parameters inside your [`.env`](file:///Users/marwanhassan/playwright-automation-jobs/.env) file:

- `LLM_API_URL`: URL to OpenClaw's 9router completion gateway (defaults to `http://127.0.0.1:20128/v1`).
- `LLM_API_KEY`: Model API authentication credentials.
- `RESUME_PATH`: Path to your PDF resume (defaults to `/Users/marwanhassan/playwright-automation-jobs/assets/Marwan_Hassan-Resume.pdf`).
- `BROWSER_USER_DATA_DIR`: Path to persistent Chrome user data. Use this to share your logged-in LinkedIn browser session and bypass CAPTCHA issues.
- `TELEGRAM_BOT_TOKEN`: Token for OpenClaw's Telegram Channel.
- `TELEGRAM_CHAT_ID`: Chat ID to receive success and failure execution alerts.

---

## How to Run

### 1. Verification & Offline Testing
To execute the mock form test suite locally and verify form filling, currency conversion (Egypt location converting to EGP), resume uploader, and modal transitions:
```bash
npm test
```

### 2. Live Job Application
To run the agent on an active LinkedIn listing:
```bash
npm start <LINKEDIN_JOB_URL>
```
*Note: The browser window will stay open and halt on the final Review page. Verify the details and click **Submit application** manually.*
