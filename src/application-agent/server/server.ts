import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { CVParser } from './CVParser.js';
import { AppRunner } from './AppRunner.js';
import { logger } from '../utils/Logger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Active WebSocket connections
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  logger.info('Extension Client connected via WebSocket.', 'GatewayServer');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'chat') {
        logger.info(`Received WS chat input: "${data.text}"`, 'GatewayServer');
        
        // Connect to local LLM for conversational responses and action parsing
        const llmResponse = await queryLLM(data.text);
        ws.send(JSON.stringify({ type: 'reply', text: llmResponse.reply }));

        if (llmResponse.action === 'APPLY' && llmResponse.url) {
          ws.send(JSON.stringify({ type: 'reply', text: `Initiating automation for job URL: ${llmResponse.url}...` }));
          AppRunner.runJobApplication(llmResponse.url);
        }
      }
    } catch (e) {
      logger.error('Failed to process message or LLM query', e, 'GatewayServer');
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    logger.info('Extension Client disconnected from WebSocket.', 'GatewayServer');
  });
});

async function queryLLM(userInput: string): Promise<{ reply: string; action?: string; url?: string }> {
  try {
    const apiUrl = process.env.LLM_API_URL || 'http://127.0.0.1:20128/v1';
    
    // Load Profile context to guide conversation
    let profileContext = '';
    const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
    if (fs.existsSync(profilePath)) {
      profileContext = fs.readFileSync(profilePath, 'utf8');
    }

    const response = await axios.post(`${apiUrl}/chat/completions`, {
      model: 'Test',
      messages: [
        {
          role: 'system',
          content: `You are the intelligent brain of the OpenClaw Career Agent.
You assist candidate Maro with his job search.
Profile context: ${profileContext}

Analyze user input. Determine if they want to execute an action (e.g. apply to a job URL).
Always respond with JSON format:
{
  "reply": "Conversational reply back to user",
  "action": "APPLY" | "NONE",
  "url": "Identified job URL from input if any"
}`
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LLM_API_KEY || ''}`
      }
    });

    return JSON.parse(response.data.choices[0].message.content);
  } catch (error) {
    logger.error('LLM routing query failed. Falling back to default parser.', error, 'GatewayServer');
    
    // Fallback extraction regex
    const urlRegex = /(https?:\/\/[^\s]+)/;
    const match = userInput.match(urlRegex);
    if (match) {
      return {
        reply: `I detected a job URL in your message. Initiating Playwright workflow.`,
        action: 'APPLY',
        url: match[0]
      };
    }
    return {
      reply: `Sorry, I couldn't reach the local LLM helper model. Please verify your OpenClaw setup.`,
      action: 'NONE'
    };
  }
}

// Broadcast log helpers
export function broadcastLog(text: string) {
  const payload = JSON.stringify({ type: 'log', text });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// REST Routes
app.post('/api/upload-cv', upload.single('cv'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No CV file uploaded.' });
    return;
  }

  try {
    const structuredProfile = await CVParser.parseCV(req.file.path);
    const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(structuredProfile, null, 2));
    fs.unlinkSync(req.file.path); // Clean temp file
    res.json({ success: true, profile: structuredProfile });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/profile', (req, res) => {
  const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
  if (fs.existsSync(profilePath)) {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    res.json(profile);
  } else {
    res.status(404).json({ error: 'Profile not found.' });
  }
});

app.post('/api/profile', (req, res) => {
  const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
  try {
    fs.writeFileSync(profilePath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  logger.info(`OpenClaw Companion Backend listening on port ${PORT}`, 'GatewayServer');
});
