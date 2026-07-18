import { CandidateProfile, FormField } from '../types/index.js';
import { logger } from '../utils/Logger.js';
import { CurrencyConverter } from '../utils/CurrencyConverter.js';

export class FieldMapper {
  /**
   * Tries to map a form field to a value in the candidate's profile based on its label.
   * Returns the mapped string value, or null if no mapping fits (which triggers LLM fallback).
   */
  public mapField(field: FormField, profile: CandidateProfile, locationText: string = ''): string | null {
    const label = field.label.toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();

    logger.info(`Attempting standard mapping for field label: "${field.label}"`, 'FieldMapper');

    // Email
    if (label.includes('email') || label.includes('e-mail') || placeholder.includes('email')) {
      return profile.email;
    }

    // Phone
    if (label.includes('phone') || label.includes('mobile') || label.includes('telephone') || label.includes('contact number')) {
      return profile.phone;
    }

    // First Name
    if (label.includes('first name') || label.includes('given name') || (label.includes('first') && !label.includes('last'))) {
      return profile.firstName;
    }

    // Last Name
    if (label.includes('last name') || label.includes('family name') || label.includes('surname') || (label.includes('last') && !label.includes('first'))) {
      return profile.lastName;
    }

    // Full Name (sometimes combined)
    if (label.includes('full name') || (label.includes('name') && !label.includes('first') && !label.includes('last') && !label.includes('company') && !label.includes('employer'))) {
      return `${profile.firstName} ${profile.lastName}`;
    }

    // City
    if (label.includes('city') || label.includes('town') || label.includes('location')) {
      // Don't map full address here
      if (!label.includes('address line') && !label.includes('street')) {
        return profile.city;
      }
    }

    // Country
    if (label.includes('country') || label.includes('nation') || label.includes('state/province')) {
      return profile.country;
    }

    // LinkedIn
    if (label.includes('linkedin')) {
      return profile.linkedin;
    }

    // GitHub
    if (label.includes('github')) {
      return profile.github;
    }

    // Portfolio / Website
    if (label.includes('portfolio') || label.includes('website') || label.includes('personal website') || label.includes('blog')) {
      return profile.portfolio;
    }

    // Experience Years (standard match)
    if ((label.includes('experience') || label.includes('years')) && (label.includes('how many') || label.includes('number of'))) {
      // Return experience as string
      return String(profile.experience);
    }

    // Expected Salary (converted to local currency based on job location)
    if (label.includes('salary') || label.includes('compensation') || label.includes('pay rate')) {
      const baseSalaryText = String(profile.additionalInfo?.salaryExpectation || '500 USD');
      const usdAmount = parseInt(baseSalaryText.replace(/[^0-9]/g, ''), 10) || 500;
      return CurrencyConverter.convertSalary(usdAmount, locationText);
    }

    // Work Authorization / Sponsorship (if standard yes/no)
    if (label.includes('sponsor') || label.includes('require visa') || label.includes('authorized to work')) {
      const needsSponsorship = profile.visaSponsorship;
      const isAuthorized = !needsSponsorship; // simplification

      if (label.includes('sponsor') || label.includes('require')) {
        return needsSponsorship ? 'Yes' : 'No';
      }
      if (label.includes('authorized') || label.includes('legally')) {
        return isAuthorized ? 'Yes' : 'No';
      }
    }

    // Remote / Relocation (if standard yes/no)
    if (label.includes('relocate')) {
      return profile.relocate ? 'Yes' : 'No';
    }
    if (label.includes('remote')) {
      return profile.remote ? 'Yes' : 'No';
    }

    // Custom profile fields in additionalInfo
    if (profile.additionalInfo) {
      for (const [key, val] of Object.entries(profile.additionalInfo)) {
        const keyLower = key.toLowerCase();
        if (label.includes(keyLower) || keyLower.includes(label)) {
          return String(val);
        }
      }
    }

    logger.info(`No standard mapping found for label: "${field.label}"`, 'FieldMapper');
    return null;
  }

  /**
   * Matches a target value against select options to choose the best fit.
   */
  public matchOption(value: string, options: string[]): string | null {
    const valueLower = value.toLowerCase();

    // Direct match
    let match = options.find(o => o.toLowerCase() === valueLower);
    if (match) return match;

    // Contains match
    match = options.find(o => o.toLowerCase().includes(valueLower) || valueLower.includes(o.toLowerCase()));
    if (match) return match;

    // Yes/No standard mapping
    if (valueLower === 'yes' || valueLower === 'y') {
      match = options.find(o => o.toLowerCase() === 'yes' || o.toLowerCase().startsWith('y'));
      if (match) return match;
    }
    if (valueLower === 'no' || valueLower === 'n') {
      match = options.find(o => o.toLowerCase() === 'no' || o.toLowerCase().startsWith('n'));
      if (match) return match;
    }

    return null;
  }
}

export const fieldMapper = new FieldMapper();
