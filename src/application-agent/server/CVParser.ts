import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import axios from 'axios';
import { logger } from '../utils/Logger.js';

export class CVParser {
  public static async parseCV(pdfPath: string): Promise<any> {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const parser = new PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      await parser.destroy();
      const rawText = data.text;

      logger.info('Sending parsed raw CV text to 9Router LLM...', 'CVParser');

      const apiUrl = process.env.LLM_API_URL || 'http://127.0.0.1:20128/v1';
      const model = process.env.LLM_MODEL || 'Test';
      const response = await axios.post(`${apiUrl}/chat/completions`, {
        model,
        messages: [
          {
            role: 'system',
            content: 'Extract the structured candidate information from the CV raw text. Return standard JSON matching the CandidateProfile interface:\n{\n  "firstName": "string",\n  "lastName": "string",\n  "email": "string",\n  "phone": "string",\n  "city": "string",\n  "country": "string",\n  "linkedin": "string",\n  "github": "string",\n  "portfolio": "string",\n  "experience": number, // total years of experience as a number\n  "remote": boolean, // remote preference\n  "relocate": boolean, // relocation preference\n  "visaSponsorship": boolean, // visa sponsorship requirement\n  "additionalInfo": {\n    "salaryExpectation": "string (e.g. \'500 USD\')",\n    "noticePeriod": "string (e.g. \'Immediately\')",\n    "authorizedToWorkInUS": "string (Yes/No)",\n    "skills": "comma-separated skills list"\n  }\n}'
          },
          {
            role: 'user',
            content: rawText
          }
        ],
        response_format: { type: 'json_object' }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LLM_API_KEY || ''}`
        }
      });

      const structuredProfile = JSON.parse(response.data.choices[0].message.content);
      return structuredProfile;
    } catch (e: any) {
      logger.error('Failed to parse CV using pdf-parse or LLM', e, 'CVParser');
      throw e;
    }
  }
}
