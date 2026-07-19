import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { CVParser } from './CVParser.js';
import { AppRunner } from './AppRunner.js';
import { jobScheduler } from './JobScheduler.js';
import { logger } from '../utils/Logger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Enable CORS manually
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// Set up CV upload storage
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({ dest: 'uploads/' });

// Active WebSocket clients
const clients = new Set<WebSocket>();

// Listen to logging events from core agent and broadcast to clients
logger.addListener((text) => {
  broadcast({ type: 'log', text });
});

// Broadcast helper
function broadcast(data: any) {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  logger.info('Companion Extension connected via WebSocket.', 'GatewayServer');

  // Immediately send initial status on connect
  sendStatusToClient(ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.info(`Received WS message type: "${data.type}"`, 'GatewayServer');

      if (data.type === 'chat') {
        logger.info(`Received chat text: "${data.text}"`, 'GatewayServer');
        const llmResponse = await queryLLM(data.text);
        ws.send(JSON.stringify({ type: 'reply', text: llmResponse.reply }));

        if (llmResponse.action === 'APPLY' && llmResponse.url) {
          ws.send(JSON.stringify({ type: 'reply', text: `Starting automated application flow for: ${llmResponse.url}...` }));
          executeApplicationFlow(llmResponse.url);
        }
      } 
      
      else if (data.type === 'apply') {
        executeApplicationFlow(data.url);
      } 
      
      else if (data.type === 'approve') {
        const run = AppRunner.activeRuns.get(data.url);
        if (run) {
          logger.info(`Approval received for URL ${data.url}: ${data.action}`, 'GatewayServer');
          run.resolve(data.action);
          // Broadcast status change
          broadcast({ type: 'status_change', url: data.url, status: data.action === 'SUBMIT' ? 'submitting' : 'cancelled' });
        } else {
          logger.warn(`No active run found pending approval for URL: ${data.url}`, 'GatewayServer');
        }
      } 
      
      else if (data.type === 'get_status') {
        sendStatusToClient(ws);
      }
    } catch (e) {
      logger.error('Failed processing WebSocket client message', e, 'GatewayServer');
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    logger.info('Companion Extension disconnected from WebSocket.', 'GatewayServer');
  });
});

function sendStatusToClient(ws: WebSocket) {
  const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
  const settingsPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/settings.json');
  const historyPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/applications.json');

  const profileExists = fs.existsSync(profilePath);
  let profile = null;
  if (profileExists) {
    try {
      profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    } catch {}
  }

  let settings = {
    mode: 'approval',
    crawlIntervalMinutes: 60,
    crawlerEnabled: false,
    matchThreshold: 70,
    routerUrl: 'http://127.0.0.1:20128/v1',
    telegramEnabled: true
  };
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {}
  }

  let history = [];
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {}
  }

  // Active runs list
  const activeJobs = Array.from(AppRunner.activeRuns.keys());

  ws.send(JSON.stringify({
    type: 'status',
    data: {
      onboardingCompleted: profileExists && profile?.firstName,
      profile,
      settings,
      history,
      activeJobs
    }
  }));
}

async function executeApplicationFlow(url: string) {
  broadcast({ type: 'reply', text: `Launching browser engine. Running in foreground...` });
  
  // Track listing in history
  const historyPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/applications.json');
  let history: any[] = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch {}
  }

  let existingJobIndex = history.findIndex(h => h.url === url);
  const now = new Date().toISOString();
  if (existingJobIndex === -1) {
    history.push({
      id: String(Math.random()),
      title: 'Active Job Application',
      company: 'External Platform',
      location: 'Direct Link',
      url,
      status: 'discovered',
      dateAdded: now
    });
    existingJobIndex = history.length - 1;
  }
  
  history[existingJobIndex].status = 'discovered';
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  broadcast({ type: 'history_update' });

  // Expose callbacks to communicate runner phase changes
  try {
    const success = await AppRunner.runJobApplication(url);
    
    // Update final job application state
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      if (history[existingJobIndex]) {
        history[existingJobIndex].status = success ? 'applied' : 'ignored';
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
        broadcast({ type: 'history_update' });
      }
    } catch {}

    broadcast({ 
      type: 'run_complete', 
      url, 
      success, 
      message: success ? 'Application successfully processed.' : 'Application aborted or rejected.' 
    });
  } catch (err: any) {
    logger.error('Failed to run job application flow', err);
    broadcast({ type: 'run_complete', url, success: false, message: err.message || 'Fatal automation failure.' });
  }
}

async function queryLLM(userInput: string): Promise<{ reply: string; action?: string; url?: string }> {
  try {
    const apiUrl = process.env.LLM_API_URL || 'http://127.0.0.1:20128/v1';
    const model = process.env.LLM_MODEL || 'Test';
    
    let profileContext = '';
    const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
    if (fs.existsSync(profilePath)) {
      profileContext = fs.readFileSync(profilePath, 'utf8');
    }

    const response = await axios.post(`${apiUrl}/chat/completions`, {
      model,
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
      },
      timeout: 15000
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
    
    broadcast({ type: 'profile_update' });
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
    broadcast({ type: 'profile_update' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', (req, res) => {
  const settingsPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    res.json(settings);
  } else {
    // Default settings
    res.json({
      mode: 'approval',
      crawlIntervalMinutes: 60,
      crawlerEnabled: false,
      matchThreshold: 70,
      routerUrl: 'http://127.0.0.1:20128/v1',
      telegramEnabled: true
    });
  }
});

app.post('/api/settings', (req, res) => {
  const settingsPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
    broadcast({ type: 'settings_update' });
    
    // Restart scheduler if status changed
    jobScheduler.stop();
    if (req.body.crawlerEnabled) {
      jobScheduler.start();
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history', (req, res) => {
  const historyPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/applications.json');
  if (fs.existsSync(historyPath)) {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    res.json(history);
  } else {
    res.json([]);
  }
});

app.post('/api/clear-history', (req, res) => {
  const historyPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/applications.json');
  try {
    fs.writeFileSync(historyPath, JSON.stringify([], null, 2));
    broadcast({ type: 'history_update' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function scoreJobDirectly(title: string, company: string, location: string, description: string, profile: any) {
  try {
    const apiUrl = process.env.LLM_API_URL || 'http://127.0.0.1:20128/v1';
    const model = process.env.LLM_MODEL || 'Test';

    const prompt = `Evaluate the following job listing details against the candidate profile.
Calculate a match score from 0 to 100 representing how well the candidate fits the requirements.
Also write a concise 1-sentence reason explaining the score (e.g. highlight matching skills or missing experience).

Candidate Profile:
${JSON.stringify({
  firstName: profile.firstName,
  lastName: profile.lastName,
  experience: profile.experience,
  skills: profile.additionalInfo?.skills || '',
  remote: profile.remote,
  relocate: profile.relocate
}, null, 2)}

Job Details:
Title: "${title}"
Company: "${company}"
Location: "${location}"
Description:
"${description?.substring(0, 1500) || 'No description available.'}"

Return your response in standard JSON:
{
  "score": 85,
  "reason": "Reason details here"
}`;

    const response = await axios.post(`${apiUrl}/chat/completions`, {
      model,
      messages: [
        { role: 'system', content: 'You are an expert recruitment matching engine.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LLM_API_KEY || ''}`
      },
      timeout: 15000
    });

    const parsed = JSON.parse(response.data.choices[0].message.content);
    return {
      score: parseInt(parsed.score, 10) || 0,
      reason: parsed.reason || 'No reason provided.'
    };
  } catch (e: any) {
    logger.error('Failed to match job via LLM direct scoring API', e, 'GatewayServer');
    return {
      score: 50,
      reason: 'Failed to communicate with local LLM matching engine.'
    };
  }
}

app.post('/api/score-job', async (req, res) => {
  const { title, company, location, description } = req.body;
  const profilePath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/profile.json');
  
  if (!fs.existsSync(profilePath)) {
    res.status(400).json({ error: 'No profile found to score against.' });
    return;
  }

  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const result = await scoreJobDirectly(title, company, location, description, profile);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 18789;
server.listen(PORT, () => {
  logger.info(`OpenClaw Gateway Server listening on port ${PORT}`, 'GatewayServer');
  
  // Start job crawler if configured on boot
  const settingsPath = path.resolve('/Users/marwanhassan/playwright-automation-jobs/src/application-agent/profile/settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.crawlerEnabled) {
        jobScheduler.start();
      }
    } catch {}
  }
});
