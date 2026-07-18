import * as fs from 'fs';
import * as path from 'path';
import { broadcastLog } from '../server/server.js';

export class Logger {
  private logFilePath: string;
  private durationMap: Map<string, number> = new Map();

  constructor() {
    const logsDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFilePath = path.join(logsDir, 'app-agent.log');
  }

  private writeToFile(message: string): void {
    const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, ''); // strip colors
    fs.appendFileSync(this.logFilePath, cleanMessage + '\n', 'utf8');
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  public info(message: string, context?: string): void {
    const ctxStr = context ? `[${context}] ` : '';
    const formatted = `[\x1b[36m${this.formatTimestamp()}\x1b[0m] [\x1b[32mINFO\x1b[0m] ${ctxStr}${message}`;
    console.log(formatted);
    this.writeToFile(`[${this.formatTimestamp()}] [INFO] ${ctxStr}${message}`);
    try {
      broadcastLog(`[INFO] ${ctxStr}${message}`);
    } catch {}
  }

  public warn(message: string, context?: string): void {
    const ctxStr = context ? `[${context}] ` : '';
    const formatted = `[\x1b[36m${this.formatTimestamp()}\x1b[0m] [\x1b[33mWARN\x1b[0m] ${ctxStr}${message}`;
    console.warn(formatted);
    this.writeToFile(`[${this.formatTimestamp()}] [WARN] ${ctxStr}${message}`);
    try {
      broadcastLog(`[WARN] ${ctxStr}${message}`);
    } catch {}
  }

  public error(message: string, error?: any, context?: string): void {
    const ctxStr = context ? `[${context}] ` : '';
    let errDetail = '';
    if (error) {
      errDetail = error instanceof Error ? ` - ${error.message}\n${error.stack}` : ` - ${JSON.stringify(error)}`;
    }
    const formatted = `[\x1b[36m${this.formatTimestamp()}\x1b[0m] [\x1b[31mERROR\x1b[0m] ${ctxStr}${message}${errDetail}`;
    console.error(formatted);
    this.writeToFile(`[${this.formatTimestamp()}] [ERROR] ${ctxStr}${message}${errDetail}`);
    try {
      broadcastLog(`[ERROR] ${ctxStr}${message}${errDetail}`);
    } catch {}
  }

  public action(actionName: string, details: string, selector?: string): void {
    const selStr = selector ? ` | selector: ${selector}` : '';
    const message = `Action: ${actionName} | ${details}${selStr}`;
    const formatted = `[\x1b[36m${this.formatTimestamp()}\x1b[0m] [\x1b[35mACTION\x1b[0m] ${message}`;
    console.log(formatted);
    this.writeToFile(`[${this.formatTimestamp()}] [ACTION] ${message}`);
  }

  public startDuration(key: string): void {
    this.durationMap.set(key, Date.now());
  }

  public endDuration(key: string, actionName: string, details: string): void {
    const startTime = this.durationMap.get(key);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.durationMap.delete(key);
      const message = `Duration: ${duration}ms | Action: ${actionName} | ${details}`;
      const formatted = `[\x1b[36m${this.formatTimestamp()}\x1b[0m] [\x1b[34mTIME\x1b[0m] ${message}`;
      console.log(formatted);
      this.writeToFile(`[${this.formatTimestamp()}] [TIME] ${message}`);
    }
  }
}

export const logger = new Logger();
