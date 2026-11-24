node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';
const bytes = await readFile(process.env.GITHUB_EVENT_PATH);
if (bytes.length > 1024 * 1024) throw new Error('Event exceeds limit');
const event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const repo = process.env.GITHUB_REPOSITORY, actor = process.env.GITHUB_ACTOR;
if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || typeof actor !== 'string' || typeof process.env.GITHUB_TOKEN !== 'string' || !process.env.GITHUB_TOKEN) throw new Error('Missing event context');
const number = event.issue?.number, id = event.comment?.id, body = event.comment?.body;
if (event.action !== 'created' || !Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(id) || id < 1 || typeof body !== 'string' || !/^@aem-dev(?:\s|$)/i.test(body) || typeof event.sender?.login !== 'string' || event.sender.login.toLowerCase() !== actor.toLowerCase() || typeof event.comment?.user?.login !== 'string' || event.comment.user.login.toLowerCase() !== actor.toLowerCase() || typeof event.repository?.full_name !== 'string' || event.repository.full_name.toLowerCase() !== repo.toLowerCase()) throw new Error('Event identity mismatch');
const path = `/repos/${repo.split('/').map(encodeURIComponent).join('/')}`;
const response = await fetch(`https://api.github.com${path}/issues/comments/${id}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('Current comment unavailable');
const reader = response.body.getReader(), chunks = []; let size = 0;
try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Comment exceeds limit'); } chunks.push(value); } } finally { reader.releaseLock(); }
const comment = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
let issueUrl; try { issueUrl = new URL(comment.issue_url); } catch { throw new Error('Comment issue identity unavailable'); }
if (issueUrl.origin !== 'https://api.github.com' || issueUrl.username || issueUrl.password || issueUrl.search || issueUrl.hash || issueUrl.pathname.toLowerCase() !== `${path}/issues/${number}`.toLowerCase() || comment.id !== id || comment.body !== body || typeof comment.user?.login !== 'string' || comment.user.login.toLowerCase() !== actor.toLowerCase()) throw new Error('Current comment changed or mismatched');
console.log('Trigger comment rechecked; task has not started.');
NODE
