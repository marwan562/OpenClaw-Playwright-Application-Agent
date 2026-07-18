import { logger } from './Logger.js';

export interface CurrencyDetails {
  currency: string;
  rate: number;
}

export class CurrencyConverter {
  // Exchange rates relative to 1 USD
  private static readonly RATES: Record<string, CurrencyDetails> = {
    egypt: { currency: 'EGP', rate: 48.0 },
    cairo: { currency: 'EGP', rate: 48.0 },
    alexandria: { currency: 'EGP', rate: 48.0 },
    saudi: { currency: 'SAR', rate: 3.75 },
    riyadh: { currency: 'SAR', rate: 3.75 },
    jeddah: { currency: 'SAR', rate: 3.75 },
    'united arab emirates': { currency: 'AED', rate: 3.67 },
    uae: { currency: 'AED', rate: 3.67 },
    dubai: { currency: 'AED', rate: 3.67 },
    'abu dhabi': { currency: 'AED', rate: 3.67 },
    kuwait: { currency: 'KWD', rate: 0.31 },
    qatar: { currency: 'QAR', rate: 3.64 },
    doha: { currency: 'QAR', rate: 3.64 },
    bahrain: { currency: 'BHD', rate: 0.38 },
    manama: { currency: 'BHD', rate: 0.38 },
    oman: { currency: 'OMR', rate: 0.38 },
    muscat: { currency: 'OMR', rate: 0.38 },
    jordan: { currency: 'JOD', rate: 0.71 },
    amman: { currency: 'JOD', rate: 0.71 }
  };

  /**
   * Converts USD salary to target local currency based on job location.
   */
  public static convertSalary(usdAmount: number, locationText: string): string {
    const locLower = locationText.toLowerCase();
    logger.info(`Converting base USD salary $${usdAmount} for job location: "${locationText}"`, 'CurrencyConverter');

    // Search for matching keyword in rates
    for (const [key, details] of Object.entries(this.RATES)) {
      if (locLower.includes(key)) {
        const converted = Math.round(usdAmount * details.rate);
        const result = `${converted} ${details.currency}`;
        logger.info(`Currency match found! Keyword: "${key}". Converted: ${result}`, 'CurrencyConverter');
        return result;
      }
    }

    // Default fallback: return USD formatted
    logger.info(`No currency match found for location: "${locationText}". Defaulting to USD.`, 'CurrencyConverter');
    return `${usdAmount} USD`;
  }
}
