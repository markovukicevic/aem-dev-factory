import { createHash } from 'node:crypto';
import { compareTicketSource } from './ticket-source-refresh.js';

/** Preview or create one explicitly requested Jira remote link to a GitHub PR. */
export async function processJiraGitHubPrLink({ path, config, key, number, tracker, scm, expectedDigest }) {
  if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(key) || !Number.isSafeInteger(number) || number < 1 || (expectedDigest !== undefined && !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid link request');
  const target = config?.scm;
  if (config?.tracker?.provider !== 'jira' || target?.provider !== 'github' || !/^[A-Za-z0-9-]+$/.test(target.owner ?? '') || !/^[A-Za-z0-9_.-]+$/.test(target.repository ?? '') || ['.', '..'].includes(target.repository) || scm?.provider !== 'github') throw new TypeError('Jira tracker and GitHub SCM required');
  const url = `https://github.com/${target.owner}/${target.repository}/pull/${number}`, title = `GitHub PR #${number}`;
  async function collect() {
    const [ticket, pr, links] = await Promise.all([tracker.getTicket(key), scm.getPullRequest(number), tracker.listRemoteIssueLinks(key)]);
    const source = await compareTicketSource({ path, config: config.tracker, ticket });
    const repo = pr?.base?.repo?.full_name, head = pr?.head?.sha, base = pr?.base?.sha;
    if (ticket.key?.toUpperCase() !== key.toUpperCase() || pr?.number !== number || typeof repo !== 'string' || repo.toLowerCase() !== `${target.owner}/${target.repository}`.toLowerCase() || typeof pr.html_url !== 'string' || pr.html_url.toLowerCase() !== url.toLowerCase() || !/^[a-f0-9]{40}$/i.test(head ?? '') || !/^[a-f0-9]{40}$/i.test(base ?? '') || !['open', 'closed'].includes(pr.state)) throw new Error('Ticket or PR identity is not established');
    if (!Array.isArray(links) || links.length > 1000 || links.some(link => typeof link?.url !== 'string')) throw new Error('Invalid remote links');
    const exists = links.some(link => link.url.toLowerCase() === url.toLowerCase());
    const snapshot = { provider: source.provider, id: source.id, sourceDigest: source.localDigest, matches: source.matches, repository: repo.toLowerCase(), number, url: url.toLowerCase(), head: head.toLowerCase(), base: base.toLowerCase(), state: pr.state, exists };
    return { ...snapshot, digest: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
  }
  const first = await collect();
  const blockers = [...(!first.matches ? ['The tracker ticket does not match the local source.'] : []), ...(first.exists ? ['The PR is already linked to this Jira issue.'] : [])];
  const result = { created: false, allowed: !blockers.length, key, number, url, title, state: first.state, head: first.head, blockers, digest: first.digest, scope: 'Observed ticket export, PR revisions and Jira links only. Jira and GitHub may change afterward; link creation is not atomic with duplicate checks and does not change ticket status or send a comment.' };
  if (expectedDigest === undefined) return result;
  if (!result.allowed || expectedDigest !== first.digest) return { ...result, allowed: false, blockers: [...blockers, ...(expectedDigest !== first.digest ? ['The preview changed.'] : [])] };
  const last = await collect();
  if (!last.matches || last.exists || last.digest !== first.digest) return { ...result, allowed: false, blockers: ['Ticket, PR or existing links changed before the write.'] };
  const created = await tracker.createRemoteIssueLink({ key, url, title });
  if (created?.created !== true) throw new Error('Remote link result unclear; inspect Jira before retrying');
  return { ...result, created: true, linkId: created.id };
}
