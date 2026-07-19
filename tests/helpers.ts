import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobAgentService } from '../src/job-agent/core/index.js';

export function temporaryService(options: ConstructorParameters<typeof JobAgentService>[0] = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'job-agent-test-'));
  const jobs = new JobAgentService({ dataDir: directory, databasePath: join(directory, 'test.sqlite'), ...options });
  return {
    directory,
    jobs,
    cleanup: () => {
      jobs.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}
