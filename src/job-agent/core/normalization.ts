import { createHash, randomUUID } from 'node:crypto';
import { JobSchema, type Job } from '../schemas/index.js';

export interface RawJobListing {
  source: string;
  sourceId: string;
  url: string;
  employer: string;
  title: string;
  description?: string;
  location?: string;
  workplaceType?: Job['workplaceType'];
  seniority?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  salary?: Job['salary'];
  applicationMethod?: Job['applicationMethod'];
  discoveredAt?: string;
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9+#]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function fingerprintJob(input: Pick<RawJobListing, 'employer' | 'title' | 'location' | 'description'>): string {
  const canonical = [input.employer, input.title, input.location ?? '', input.description ?? '']
    .map(normalizedText)
    .join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

export function normalizeJob(input: RawJobListing): Job {
  return JobSchema.parse({
    id: randomUUID(),
    source: input.source.trim().toLowerCase(),
    sourceId: input.sourceId.trim(),
    url: input.url.trim(),
    employer: input.employer.trim(),
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    location: (input.location ?? '').trim(),
    workplaceType: input.workplaceType ?? 'unknown',
    seniority: input.seniority?.trim() || null,
    requiredSkills: [...new Set((input.requiredSkills ?? []).map((skill) => skill.trim()).filter(Boolean))],
    preferredSkills: [...new Set((input.preferredSkills ?? []).map((skill) => skill.trim()).filter(Boolean))],
    salary: input.salary ?? null,
    applicationMethod: input.applicationMethod ?? 'unknown',
    discoveredAt: input.discoveredAt ?? new Date().toISOString(),
    fingerprint: fingerprintJob(input),
    rawContentTreatedAsUntrusted: true
  });
}
