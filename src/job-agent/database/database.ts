import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ApplicationSchema,
  ApprovalSchema,
  CampaignSchema,
  CandidateProfileSchema,
  JobSchema,
  type Application,
  type ApplicationState,
  type Approval,
  type Campaign,
  type CandidateProfile,
  type Job
} from '../schemas/index.js';

type JsonRow = { json: string };

export interface TransitionRecord {
  id: string;
  applicationId: string;
  fromState: ApplicationState | null;
  toState: ApplicationState;
  reason: string;
  correlationId: string;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

export class JobAgentDatabase {
  readonly path: string;
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.path = resolve(databasePath);
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cv_metadata (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        approved INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );
      CREATE TABLE IF NOT EXISTS answer_library (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        question_pattern TEXT NOT NULL,
        answer TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        json TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        UNIQUE(source, source_id),
        UNIQUE(fingerprint)
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS campaign_runs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        status TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        correlation_id TEXT NOT NULL,
        FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
      );
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        campaign_id TEXT,
        submission_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES jobs(id),
        FOREIGN KEY(profile_id) REFERENCES profiles(id),
        FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
        UNIQUE(job_id, profile_id, campaign_id)
      );
      CREATE TABLE IF NOT EXISTS state_transitions (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        reason TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(application_id) REFERENCES applications(id)
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        status TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        responded_at TEXT,
        FOREIGN KEY(application_id) REFERENCES applications(id),
        UNIQUE(application_id, question_id)
      );
      CREATE TABLE IF NOT EXISTS schedules (
        campaign_id TEXT PRIMARY KEY,
        cron TEXT NOT NULL,
        timezone TEXT NOT NULL,
        preview TEXT NOT NULL,
        FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details_json TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    `);
  }

  saveProfile(profile: CandidateProfile, active = true): CandidateProfile {
    const valid = CandidateProfileSchema.parse(profile);
    const transaction = this.db.prepare(`
      INSERT INTO profiles(id, json, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET json=excluded.json, active=excluded.active, updated_at=excluded.updated_at
    `);
    if (active) this.db.exec('UPDATE profiles SET active = 0');
    transaction.run(valid.id, JSON.stringify(valid), active ? 1 : 0, valid.createdAt, valid.updatedAt);
    return valid;
  }

  getProfile(id?: string): CandidateProfile | null {
    const row = (id
      ? this.db.prepare('SELECT json FROM profiles WHERE id = ?').get(id)
      : this.db.prepare('SELECT json FROM profiles WHERE active = 1 ORDER BY updated_at DESC LIMIT 1').get()) as JsonRow | undefined;
    return row ? CandidateProfileSchema.parse(JSON.parse(row.json)) : null;
  }

  upsertJob(job: Job): { job: Job; duplicate: boolean } {
    const valid = JobSchema.parse(job);
    const existing = this.db.prepare('SELECT json FROM jobs WHERE (source = ? AND source_id = ?) OR fingerprint = ? LIMIT 1')
      .get(valid.source, valid.sourceId, valid.fingerprint) as JsonRow | undefined;
    if (existing) return { job: JobSchema.parse(JSON.parse(existing.json)), duplicate: true };
    this.db.prepare('INSERT INTO jobs(id, source, source_id, fingerprint, json, discovered_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(valid.id, valid.source, valid.sourceId, valid.fingerprint, JSON.stringify(valid), valid.discoveredAt);
    return { job: valid, duplicate: false };
  }

  getJob(id: string): Job | null {
    const row = this.db.prepare('SELECT json FROM jobs WHERE id = ?').get(id) as JsonRow | undefined;
    return row ? JobSchema.parse(JSON.parse(row.json)) : null;
  }

  listJobs(): Job[] {
    return (this.db.prepare('SELECT json FROM jobs ORDER BY discovered_at DESC').all() as unknown as JsonRow[])
      .map((row) => JobSchema.parse(JSON.parse(row.json)));
  }

  saveCampaign(campaign: Campaign, preview?: string): Campaign {
    const valid = CampaignSchema.parse(campaign);
    this.db.prepare(`
      INSERT INTO campaigns(id, json, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at
    `).run(valid.id, JSON.stringify(valid), valid.createdAt, valid.updatedAt);
    if (preview) {
      this.db.prepare(`INSERT INTO schedules(campaign_id, cron, timezone, preview) VALUES (?, ?, ?, ?)
        ON CONFLICT(campaign_id) DO UPDATE SET cron=excluded.cron, timezone=excluded.timezone, preview=excluded.preview`)
        .run(valid.id, valid.schedule, valid.timezone, preview);
    }
    return valid;
  }

  getCampaign(id: string): Campaign | null {
    const row = this.db.prepare('SELECT json FROM campaigns WHERE id = ?').get(id) as JsonRow | undefined;
    return row ? CampaignSchema.parse(JSON.parse(row.json)) : null;
  }

  listCampaigns(): Campaign[] {
    return (this.db.prepare('SELECT json FROM campaigns ORDER BY created_at DESC').all() as unknown as JsonRow[])
      .map((row) => CampaignSchema.parse(JSON.parse(row.json)));
  }

  saveCampaignRun(run: { id: string; campaignId: string; status: string; summary: unknown; startedAt: string; completedAt: string | null; correlationId: string }): void {
    this.db.prepare(`INSERT INTO campaign_runs(id, campaign_id, status, summary_json, started_at, completed_at, correlation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, summary_json=excluded.summary_json, completed_at=excluded.completed_at`)
      .run(run.id, run.campaignId, run.status, JSON.stringify(run.summary), run.startedAt, run.completedAt, run.correlationId);
  }

  saveApplication(application: Application): Application {
    const valid = ApplicationSchema.parse(application);
    this.db.prepare(`
      INSERT INTO applications(id, job_id, profile_id, campaign_id, submission_key, state, json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state=excluded.state, json=excluded.json, updated_at=excluded.updated_at
    `).run(valid.id, valid.jobId, valid.profileId, valid.campaignId, valid.submissionKey, valid.state, JSON.stringify(valid), valid.createdAt, valid.updatedAt);
    return valid;
  }

  findApplication(jobId: string, profileId: string, campaignId: string | null): Application | null {
    const row = campaignId
      ? this.db.prepare('SELECT json FROM applications WHERE job_id = ? AND profile_id = ? AND campaign_id = ?').get(jobId, profileId, campaignId)
      : this.db.prepare('SELECT json FROM applications WHERE job_id = ? AND profile_id = ? AND campaign_id IS NULL').get(jobId, profileId);
    return row ? ApplicationSchema.parse(JSON.parse((row as JsonRow).json)) : null;
  }

  getApplication(id: string): Application | null {
    const row = this.db.prepare('SELECT json FROM applications WHERE id = ?').get(id) as JsonRow | undefined;
    return row ? ApplicationSchema.parse(JSON.parse(row.json)) : null;
  }

  listApplications(): Application[] {
    return (this.db.prepare('SELECT json FROM applications ORDER BY updated_at DESC').all() as unknown as JsonRow[])
      .map((row) => ApplicationSchema.parse(JSON.parse(row.json)));
  }

  addTransition(record: TransitionRecord): void {
    this.db.prepare(`INSERT INTO state_transitions(id, application_id, from_state, to_state, reason, correlation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.applicationId, record.fromState, record.toState, record.reason, record.correlationId, record.createdAt);
  }

  listTransitions(applicationId: string): TransitionRecord[] {
    return this.db.prepare(`SELECT id, application_id AS applicationId, from_state AS fromState, to_state AS toState,
      reason, correlation_id AS correlationId, created_at AS createdAt FROM state_transitions WHERE application_id = ? ORDER BY created_at, rowid`)
      .all(applicationId) as unknown as TransitionRecord[];
  }

  saveApproval(approval: Approval): Approval {
    const valid = ApprovalSchema.parse(approval);
    this.db.prepare(`INSERT INTO approvals(id, application_id, question_id, status, json, created_at, responded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(application_id, question_id) DO UPDATE SET status=excluded.status, json=excluded.json, responded_at=excluded.responded_at`)
      .run(valid.id, valid.applicationId, valid.questionId, valid.status, JSON.stringify(valid), valid.createdAt, valid.respondedAt);
    return valid;
  }

  getApproval(id: string): Approval | null {
    const row = this.db.prepare('SELECT json FROM approvals WHERE id = ?').get(id) as JsonRow | undefined;
    return row ? ApprovalSchema.parse(JSON.parse(row.json)) : null;
  }

  listApprovals(applicationId: string): Approval[] {
    return (this.db.prepare('SELECT json FROM approvals WHERE application_id = ? ORDER BY created_at').all(applicationId) as unknown as JsonRow[])
      .map((row) => ApprovalSchema.parse(JSON.parse(row.json)));
  }

  addAudit(record: AuditRecord): void {
    this.db.prepare(`INSERT INTO audit_events(id, entity_type, entity_id, action, details_json, correlation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.entityType, record.entityId, record.action, JSON.stringify(record.details), record.correlationId, record.createdAt);
  }

  listAudit(entityType: string, entityId: string): AuditRecord[] {
    const rows = this.db.prepare(`SELECT id, entity_type AS entityType, entity_id AS entityId, action,
      details_json AS detailsJson, correlation_id AS correlationId, created_at AS createdAt
      FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at, rowid`).all(entityType, entityId) as unknown as Array<Omit<AuditRecord, 'details'> & { detailsJson: string }>;
    return rows.map(({ detailsJson, ...row }) => ({ ...row, details: JSON.parse(detailsJson) as Record<string, unknown> }));
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run(key, value, new Date().toISOString());
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  resetForTests(): void {
    this.db.exec(`DELETE FROM approvals; DELETE FROM state_transitions; DELETE FROM applications; DELETE FROM campaign_runs;
      DELETE FROM schedules; DELETE FROM campaigns; DELETE FROM jobs; DELETE FROM answer_library; DELETE FROM cv_metadata;
      DELETE FROM profiles; DELETE FROM audit_events; DELETE FROM settings;`);
  }
}
