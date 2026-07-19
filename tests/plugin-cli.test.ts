import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getToolPluginMetadata } from 'openclaw/plugin-sdk/tool-plugin';
import plugin from '../src/plugin/index.js';

describe('OpenClaw plugin and standalone CLI', () => {
  it('registers the complete narrow tool contract', () => {
    const names = getToolPluginMetadata(plugin)?.tools.map((tool) => tool.name);
    expect(names).toHaveLength(18);
    expect(names).toEqual(expect.arrayContaining(['jobs_search', 'jobs_prepare_application', 'jobs_campaign_pause', 'jobs_emergency_stop']));
    for (const tool of getToolPluginMetadata(plugin)?.tools ?? []) expect(tool.parameters.additionalProperties).toBe(false);
  });

  it('returns JSON and meaningful status through the standalone CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'job-agent-cli-'));
    try {
      const output = execFileSync(process.execPath, [resolve('dist/job-agent/cli/index.js'), '--data-dir', directory, '--json', 'status'], { encoding: 'utf8' });
      expect(JSON.parse(output)).toMatchObject({ emergencyStop: false, applications: 0 });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
