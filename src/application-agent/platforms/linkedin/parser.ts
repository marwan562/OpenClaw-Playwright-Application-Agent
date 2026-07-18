import { logger } from '../../utils/Logger.js';

export class LinkedInParser {
  /**
   * Extracts the Job ID from a LinkedIn URL.
   */
  public static extractJobId(url: string): string | null {
    try {
      const match = url.match(/(?:jobs\/view\/|jobs\/currentHistory=\d+&jobs\/view\/|jobs\/search\/\?currentJobId=)(\d+)/);
      if (match && match[1]) {
        return match[1];
      }
      // Alternate check query params
      const parsedUrl = new URL(url);
      const jobId = parsedUrl.searchParams.get('currentJobId') || parsedUrl.searchParams.get('jobId');
      if (jobId) return jobId;
    } catch (e) {
      logger.error('Failed to parse Job ID from URL', e, 'LinkedInParser');
    }
    return null;
  }

  /**
   * Standardizes text strings for comparison.
   */
  public static cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}
