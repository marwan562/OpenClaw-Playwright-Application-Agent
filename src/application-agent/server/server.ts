import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { CVParser } from './CVParser.js';
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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'chat') {
        logger.info(`Received WS chat input: "${data.text}"`, 'GatewayServer');
        ws.send(JSON.stringify({ type: 'reply', text: `Prompt processed: "${data.text}". Triggering application pipeline...` }));
      }
    } catch (e) {
      logger.error('Failed to parse incoming WS payload', e, 'GatewayServer');
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    logger.info('Extension Client disconnected from WebSocket.', 'GatewayServer');
  });
});

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
