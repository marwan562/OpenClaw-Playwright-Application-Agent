import axios from 'axios';
import { CandidateProfile } from '../types/index.js';
import { logger } from '../utils/Logger.js';
import { CurrencyConverter } from '../utils/CurrencyConverter.js';
import * as dotenv from 'dotenv';

dotenv.config();

export class QuestionAnswerer {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiUrl = process.env.LLM_API_URL || 'http://127.0.0.1:20128/v1';
    this.apiKey = process.env.LLM_API_KEY || 'sk-74eff4eea5b795f5-nzb0q4-fcabea40';
    this.model = process.env.LLM_MODEL || 'Test';
  }

  /**
   * Contacts OpenClaw LLM API to answer a custom question based on the candidate profile.
   */
  public async answerQuestion(
    questionText: string,
    fieldType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox',
    profile: CandidateProfile,
    options?: string[],
    locationText: string = ''
  ): Promise<string> {
    const systemPrompt = `You are an AI Job Application Assistant helping candidate ${profile.firstName} ${profile.lastName} apply for a job.
Your task is to answer a custom application question accurately and concisely based on the candidate's profile.

Here is the candidate's profile information:
${JSON.stringify(profile, null, 2)}

Target Job Location Context: "${locationText}"

Instructions:
1. Answer the question truthfully using the candidate's profile data.
2. If the field is a dropdown ('select'), radio button group, or checkbox list, you MUST choose the single best option from the list of options provided. Do not invent any new option. Return the exact selected option text.
3. If the question requires a numerical value (e.g., years of experience) and you only have range or exact info, estimate reasonably or use the profile values.
4. If the question asks for your expected salary or compensation, you MUST convert the base salary of $500 USD to the local currency of the target job location (e.g., convert to EGP for Egypt, SAR for Saudi Arabia, AED for UAE, etc.) using current standard rates, and output it (e.g., "24000 EGP" for Egypt, "1875 SAR" for Saudi Arabia).
5. Keep the answer professional and tailored to the profile.
6. Return your response in JSON format: { "answer": "YOUR_ANSWER_HERE" }`;

    const userPrompt = `Question: "${questionText}"
Field Type: "${fieldType}"
Available Options: ${options && options.length > 0 ? JSON.stringify(options) : 'None (Free Text/Textarea)'}`;

    logger.info(`Sending question to OpenClaw LLM: "${questionText}"`, 'QuestionAnswerer');

    try {
      const response = await axios.post(
        `${this.apiUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000 // 20s timeout
        }
      );

      const responseText = response.data.choices[0].message.content;
      logger.info(`LLM response content: ${responseText}`, 'QuestionAnswerer');
      
      const parsed = JSON.parse(responseText);
      const answer = parsed.answer ? String(parsed.answer).trim() : '';
      
      logger.info(`Formulated answer: "${answer}"`, 'QuestionAnswerer');
      return answer;
    } catch (error) {
      logger.error(`Error generating answer via OpenClaw LLM:`, error, 'QuestionAnswerer');
      
      // Fallback heuristics if LLM is unavailable or fails
      return this.fallbackAnswer(questionText, fieldType, profile, options, locationText);
    }
  }

  /**
   * Local rule-based fallback if the LLM is offline or times out.
   */
  private fallbackAnswer(
    questionText: string,
    fieldType: string,
    profile: CandidateProfile,
    options?: string[],
    locationText: string = ''
  ): string {
    logger.warn(`Using local fallback heuristics for question: "${questionText}"`, 'QuestionAnswerer');
    const question = questionText.toLowerCase();

    // Check for years of experience questions
    if (question.includes('experience') || question.includes('years')) {
      if (options && options.length > 0) {
        // Return first option that contains numbers matching experience
        const expStr = String(profile.experience);
        const match = options.find(opt => opt.includes(expStr));
        if (match) return match;
      }
      return String(profile.experience);
    }

    // Check for salary questions
    if (question.includes('salary') || question.includes('compensation')) {
      const baseSalaryText = String(profile.additionalInfo?.salaryExpectation || '500 USD');
      const usdAmount = parseInt(baseSalaryText.replace(/[^0-9]/g, ''), 10) || 500;
      return CurrencyConverter.convertSalary(usdAmount, locationText);
    }

    // Check for notice period questions
    if (question.includes('notice') || question.includes('start date') || question.includes('available')) {
      return String(profile.additionalInfo?.noticePeriod || 'Immediately');
    }

    // Check for work authorization / sponsorship
    if (question.includes('sponsor') || question.includes('visa')) {
      const needsSponsorship = !profile.visaSponsorship;
      if (options && options.length > 0) {
        const yesNo = needsSponsorship ? 'yes' : 'no';
        const match = options.find(opt => opt.toLowerCase().includes(yesNo));
        if (match) return match;
      }
      return needsSponsorship ? 'Yes' : 'No';
    }

    // Check for yes/no questions
    if (options && options.length > 0) {
      const lowerOptions = options.map(o => o.toLowerCase());
      if (lowerOptions.includes('yes') || lowerOptions.includes('no')) {
        // Default to safe 'Yes' for general questions, or parse profile relocate/remote
        if (question.includes('relocate')) {
          const idx = lowerOptions.indexOf(profile.relocate ? 'yes' : 'no');
          if (idx !== -1) return options[idx];
        }
        if (question.includes('remote')) {
          const idx = lowerOptions.indexOf(profile.remote ? 'yes' : 'no');
          if (idx !== -1) return options[idx];
        }
        
        const yesIdx = lowerOptions.indexOf('yes');
        if (yesIdx !== -1) return options[yesIdx];
      }
      return options[0]; // fallback to first option
    }

    return '';
  }
}

export const questionAnswerer = new QuestionAnswerer();
