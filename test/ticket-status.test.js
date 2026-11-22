import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectTicketDirectory } from '../src/ticket-status.js';

test('reports artifact availability without asserting readiness', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ticket-status-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'source-identity.json'), JSON.stringify({ version: 1, provider: 'github', source: 'team/site', id: 'github-7', ignored: 'extra' }));
  await writeFile(join(dir, 'raw-story.md'), 'Source');
  await writeFile(join(dir, 'triage.md'), 'An unverified hypothesis');
  await writeFile(join(dir, 'implement.md'), '### Step 1: Change\n**Status:** pending\n');
  await symlink(join(dir, 'raw-story.md'), join(dir, 'verification.md'));
  const result = await inspectTicketDirectory(dir);
  assert.equal(result.plan.next.number, 1);
  assert.equal(result.identity.ignored, undefined);
  assert.equal(result.files.find(file => file.name === 'dor.md').status, 'missing');
  assert.equal(result.files.find(file => file.name === 'triage.md').status, 'present');
  assert.equal(result.files.find(file => file.name === 'bug-reproduction.md').status, 'missing');
  assert.equal(result.files.find(file => file.name === 'bug-fix.md').status, 'missing');
  assert.equal(result.files.find(file => file.name === 'bug-verification.md').status, 'missing');
  assert.equal(result.files.find(file => file.name === 'verification.md').status, 'unreadable');
  assert.match(result.scope, /not verified/);
});
