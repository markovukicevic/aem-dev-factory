import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImplementationPlan } from '../src/plan-parser.js';

const plan = `---
provenance:
  agent: agent-plan
  model: sonnet
  created: 2026-11-20T12:00:00Z
  confidence: medium
  verified: true
---
# Implementation Plan: Example
## Steps
### Step 1: Add component
**Status:** done
### Step 2: Add test
**Status:** pending
## Testing Plan
### Unit Tests
`;

test('parses reference-style steps and provenance', () => {
  assert.deepEqual(parseImplementationPlan(plan), {
    provenance: { verified: true, confidence: 'medium' },
    steps: [{ number: 1, title: 'Add component', status: 'done' }, { number: 2, title: 'Add test', status: 'pending' }],
  });
});

test('supports legacy plans without provenance', () => {
  assert.equal(parseImplementationPlan('## Step 1: Test\n**Status:** done\n').provenance, null);
});

test('never treats commented or fenced examples as real steps', () => {
  assert.throws(() => parseImplementationPlan('<!--\n### Step 1: Fake\n**Status:** done\n-->\n'));
  assert.throws(() => parseImplementationPlan('```md\n### Step 1: Fake\n**Status:** done\n```\n'));
});

test('rejects missing, ambiguous and unrecognized status or provenance', () => {
  for (const input of [
    '### Step 1: Example\n',
    '### Step 1: Example\n**Status:** done\n### Step 2 Missing colon\n**Status:** pending\n',
    '### Step 1: Example [pending]\n**Status:** done\n',
    '### Step 1: Example\n**Status:** done\n**Status:** pending\n',
    '### Step 1: Example\n**Status:** done\n### Step 1: Duplicate\n**Status:** done\n',
    plan.replace('verified: true', 'verified: maybe'),
    plan.replace('  verified: true', '  verified: true\n  verified: false'),
    plan.replace('  verified: true', '  verified: true\n  <<: *other'),
  ]) assert.throws(() => parseImplementationPlan(input));
});
