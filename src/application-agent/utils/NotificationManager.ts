import axios from 'axios';
import { logger } from './Logger.js';
import * as dotenv from 'dotenv';

dotenv.config();

export class NotificationManager {
  private botToken: string | undefined;
  private chatId: string | undefined;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
  }

  /**
   * Helper to send raw text message to Telegram.
   */
  public async sendTelegramMessage(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      logger.warn('Telegram notification skipped: Bot Token or Chat ID not configured in .env', 'NotificationManager');
      return false;
    }

    try {
      logger.info(`Sending Telegram notification to chat: ${this.chatId}...`, 'NotificationManager');
      const response = await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: this.chatId,
          text: text,
          parse_mode: 'HTML'
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000 // 10s timeout
        }
      );

      if (response.data && response.data.ok) {
        logger.info('Telegram notification sent successfully.', 'NotificationManager');
        return true;
      } else {
        logger.error(`Telegram API responded with error`, response.data, 'NotificationManager');
        return false;
      }
    } catch (error) {
      logger.error('Failed to send Telegram notification', error, 'NotificationManager');
      return false;
    }
  }

  /**
   * Sends success alert when application filling successfully pauses at Review step.
   */
  public async sendSuccess(jobUrl: string, location: string, salaryUsed: string): Promise<boolean> {
    const text = `⚡ <b>OpenClaw Job Application Agent</b> ⚡\n\n` +
      `✅ <b>Application Ready for Review!</b>\n` +
      `📍 <b>Location:</b> ${location}\n` +
      `💵 <b>Expected Salary Used:</b> ${salaryUsed}\n` +
      `🔗 <b>Job URL:</b> <a href="${jobUrl}">View Listing</a>\n\n` +
      `<i>The automation successfully completed all steps and stopped at the Review page. Please review details in the browser window and click Submit manually.</i>`;
    return await this.sendTelegramMessage(text);
  }

  /**
   * Sends error alert when application automation fails.
   */
  public async sendFailure(jobUrl: string, errorMessage: string, screenshotPath?: string): Promise<boolean> {
    const screenshotMsg = screenshotPath ? `\n📸 <b>Failure Screenshot:</b> <code>${screenshotPath}</code>` : '';
    const text = `⚠️ <b>OpenClaw Job Application Agent ALERT</b> ⚠️\n\n` +
      `❌ <b>Application Filling Failed!</b>\n` +
      `🔗 <b>Job URL:</b> <a href="${jobUrl}">View Listing</a>\n` +
      `🚨 <b>Error Details:</b> <code>${errorMessage}</code>` +
      screenshotMsg + `\n\n` +
      `<i>Please inspect logs or try filling manually.</i>`;
    return await this.sendTelegramMessage(text);
  }
}

export const notificationManager = new NotificationManager();
