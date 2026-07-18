import fs from 'fs';
import pdf from 'pdf-parse';
import axios from 'axios';
import { logger } from '../utils/Logger.js';

export class CVParser {
  public static async parseCV(pdfPath: string): Promise<any> {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await (pdf as any)(dataBuffer);
      const rawText = data.text;

      logger.info('Sending parsed raw CV text to 9Router LLM...', 'CVParser');

      const apiUrl = process.env.LLM_API_URL || 'http://127.0.0.1:20128/v1';
      const response = await axios.post(`${apiUrl}/chat/completions`, {
        model: 'Test',
        messages: [
          {
            role: 'system',
            content: 'Extract the structured candidate information from the CV raw text. Return standard JSON matching: { personal: { name: "", email: "", phone: "", location: "" }, skills: [], experience: [{ role: "", company: "", duration: "" }] }'
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
