import { readFile } from 'node:fs/promises';
import { createGitHubPullRequest } from './github-pr-flow.js';
import { createAdoPullRequest } from './ado-pr-flow.js';
import { createBitbucketPullRequest } from './bitbucket-pr-flow.js';
import { createGitLabMergeRequest } from './gitlab-pr-flow.js';
import { ensureSpecDirectory } from './spec-directory.js';
import { findAemComponents } from './aem-components.js';
import { readAemDialog } from './aem-dialog.js';
import { saveAemDialogSnapshot, compareAemDialogSnapshotFiles } from './aem-snapshot.js';
import { readHubStatuses } from './hub-status.js';
import { savePullRequestDescription } from './pr-description.js';
import { inspectGitHubWebhook } from './github-webhook.js';
import { claimGitHubWebhook } from './webhook-claim.js';
import { readLimitedFile } from './read-limited.js';
import { installSkill } from './install-skill.js';
import { createGitHubClient } from './github.js';
import { fetchGitHubIssueContext } from './issue-context.js';
import { saveGitHubIssueStory } from './issue-story.js';
import { saveTrackerStory } from './tracker-story.js';
import { createTrackerProvider, createScmProvider, createCiProvider, createDocumentationProvider } from './providers.js';
import { inspectConfiguredReadiness } from './configured-readiness.js';

const usage = 'Usage: node bin/aem-devflow.js <github-pr|github-pr-context|github-issue|github-issue-context> <owner> <repository> <number> [--page <number>]\n       node bin/aem-devflow.js readiness <config.json> <implement.md>\n       node bin/aem-devflow.js tracker-ticket <providers.json> <id>\n       node bin/aem-devflow.js spec-init <ticket-id> <title>\n       node bin/aem-devflow.js install-skill <codex|claude|copilot> <skill> <target-project>\n       node bin/aem-devflow.js aem-components <component-name>\n       node bin/aem-devflow.js aem-dialog <dialog.xml>\n       node bin/aem-devflow.js aem-dialog-snapshot <dialog.xml> <output.json>\n       node bin/aem-devflow.js aem-dialog-compare <before.json> <after.json>\n       node bin/aem-devflow.js hub-status [ticket-id]\n       node bin/aem-devflow.js pr-description <share-plan-or-dash> <explain-or-dash> <plan> <verification> <output>\n       node bin/aem-devflow.js confluence-page <providers.json> <page-id>\n       node bin/aem-devflow.js webhook-inspect <policy.json> <headers.json> <body.json>\n       node bin/aem-devflow.js webhook-claim <policy.json> <headers.json> <body.json> <store-dir>\n       node bin/aem-devflow.js jira-attachment <providers.json> <attachment-id> <output-file>\n       node bin/aem-devflow.js scm-pr <providers.json> <number>\n       node bin/aem-devflow.js ci-runs <providers.json> <commit-sha> [--page <number>]\n       node bin/aem-devflow.js ci-status <providers.json> <commit-sha>\n       node bin/aem-devflow.js ci-run <providers.json> <run-id>\n       node bin/aem-devflow.js ci-dispatch <providers.json> <workflow> <ref> [--inputs-file <json>]\n       node bin/aem-devflow.js ado-builds <providers.json> <branch> [--continuation <token>]\n       node bin/aem-devflow.js ado-build <providers.json> <build-id>\n       node bin/aem-devflow.js tracker-export <providers.json> <id> <output.md>\n       node bin/aem-devflow.js github-issue-export <owner> <repository> <number> <output.md>\n       node bin/aem-devflow.js github-pr-create <owner> <repository> <config> <implement.md> <title> --body-file <path> [--draft]\n       node bin/aem-devflow.js ado-pr-create <organization> <project> <repository> <config> <implement.md> <title> --body-file <path> [--draft] [--work-item <id>]';

/** Execute an explicitly requested CLI command; dependencies are injectable for tests. */
export async function runCli(args, { env = process.env, output = console, makeClient = createGitHubClient, inspect = inspectConfiguredReadiness, createPullRequest = createGitHubPullRequest, createAzurePullRequest = createAdoPullRequest, createBitbucketPr = createBitbucketPullRequest, createGitlabMr = createGitLabMergeRequest, makeTracker = createTrackerProvider, makeScm = createScmProvider, makeCi = createCiProvider, makeDocumentation = createDocumentationProvider, readBody = readFile, cwd = process.cwd() } = {}) {
  if (args[0] === 'ado-builds' || args[0] === 'ado-build') {
    const listing = args[0] === 'ado-builds';
    const validContinuation = listing && args.length === 5 && args[3] === '--continuation' && typeof args[4] === 'string' && args[4].length > 0;
    if ((args.length !== 3 && !validContinuation) || (listing ? !args[2]?.trim() : !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.ci?.provider !== 'ado-pipelines') throw new Error('Azure Pipelines configuration required');
      const ci = makeCi(config.ci, { adoToken: env.ADO_PAT });
      const result = listing ? await ci.listBuilds({ branch: args[2], ...(validContinuation ? { continuationToken: args[4] } : {}) }) : await ci.getBuild(Number(args[2]));
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch {
      output.error('Unable to read Azure builds. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'ci-status') {
    if (args.length !== 3 || !/^[a-f0-9]{7,64}$/i.test(args[2])) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.ci?.provider === 'github-actions' && !env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
      if (config.ci?.provider === 'gitlab-ci' && !env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
      if (config.ci?.provider === 'bitbucket-pipelines' && !env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
      const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      const result = config.ci?.provider === 'bitbucket-pipelines' ? await ci.getCommitStatuses(args[2]) : config.ci?.provider === 'gitlab-ci' ? await ci.listPipelines({ sha: args[2] }) : await ci.getCommitStatus(args[2]);
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch {
      output.error('Unable to read CI status. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'ci-dispatch') {
    const hasInputs = args.length === 6 && args[4] === '--inputs-file' && !!args[5]?.trim();
    if ((args.length !== 4 && !hasInputs) || !args[2]?.trim() || !args[3]?.trim()) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.ci?.provider !== 'github-actions') throw new Error('GitHub Actions configuration required');
      const inputs = hasInputs ? JSON.parse(await readBody(args[5], 'utf8')) : {};
      const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN });
      output.log(JSON.stringify(await ci.dispatchWorkflow({ workflow: args[2], ref: args[3], inputs }), null, 2));
      return 0;
    } catch {
      output.error('Unable to dispatch workflow. Check the configuration, inputs and connection; inspect GitHub before retrying.');
      return 1;
    }
  }
  if (args[0] === 'ci-runs' || args[0] === 'ci-run') {
    const listing = args[0] === 'ci-runs';
    const validPage = listing && args.length === 5 && args[3] === '--page' && /^[1-9][0-9]*$/.test(args[4]) && Number.isSafeInteger(Number(args[4]));
    if ((args.length !== 3 && !validPage) || (listing ? !/^[a-f0-9]{7,64}$/i.test(args[2]) : !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN });
      const result = listing ? await ci.listWorkflowRuns({ sha: args[2], page: validPage ? Number(args[4]) : 1 }) : await ci.getWorkflowRun(Number(args[2]));
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch {
      output.error('Unable to read CI workflow runs. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'install-skill') {
    if (args.length !== 4 || args.slice(1).some(value => typeof value !== 'string' || !value.trim())) { output.error(usage); return 2; }
    try {
      output.log(JSON.stringify(await installSkill({ client: args[1], name: args[2], target: args[3] }), null, 2));
      return 0;
    } catch {
      output.error('Unable to install skill. Check the client, source, target and existing files.');
      return 1;
    }
  }
  if (args[0] === 'webhook-inspect' || args[0] === 'webhook-claim') {
    const claim = args[0] === 'webhook-claim';
    if (args.length !== (claim ? 5 : 4) || args.slice(1).some(value => typeof value !== 'string' || !value.trim())) { output.error(usage); return 2; }
    if (!env.GITHUB_WEBHOOK_SECRET) { output.error('Set GITHUB_WEBHOOK_SECRET in the environment.'); return 2; }
    try {
      const [policyBytes, headerBytes, body] = await Promise.all([readLimitedFile(args[1], 65536), readLimitedFile(args[2], 65536), readLimitedFile(args[3], 1024 * 1024)]);
      const policy = JSON.parse(policyBytes.toString('utf8'));
      const headers = JSON.parse(headerBytes.toString('utf8'));
      const input = { body, secret: env.GITHUB_WEBHOOK_SECRET, signature: headers.signature, event: headers.event, deliveryId: headers.deliveryId, allowedRepositories: policy.allowedRepositories, allowedActors: policy.allowedActors };
      const result = claim ? await claimGitHubWebhook(input, { directory: args[4] }) : inspectGitHubWebhook(input);
      output.log(JSON.stringify(result, null, 2));
      return result.accepted ? 0 : 1;
    } catch {
      output.error('Unable to inspect webhook. Check the policy and input files.');
      return 1;
    }
  }
  if (args[0] === 'pr-description') {
    if (args.length !== 6 || args.slice(1).some(value => typeof value !== 'string' || !value.trim()) || (args[1] === '-' && args[2] === '-')) { output.error(usage); return 2; }
    try {
      const result = await savePullRequestDescription({ sharePlanPath: args[1] === '-' ? null : args[1], explanationPath: args[2] === '-' ? null : args[2], planPath: args[3], verificationPath: args[4], outputPath: args[5] });
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to create PR description. Check source files and completed plan steps.');
      return 1;
    }
  }
  if (args[0] === 'jira-attachment') {
    if (args.length !== 4 || !/^[1-9][0-9]{0,30}$/.test(args[2]) || !args[3]?.trim()) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.tracker?.provider !== 'jira') throw new Error('Jira tracker configuration required');
      const tracker = makeTracker(config.tracker, { jiraEmail: env.JIRA_EMAIL, jiraToken: env.JIRA_API_TOKEN });
      output.log(JSON.stringify(await tracker.saveAttachment(args[2], args[3]), null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to download Jira attachment. Check the configuration, attachment and size limit.');
      return 1;
    }
  }
  if (args[0] === 'confluence-page') {
    if (args.length !== 3 || !/^[1-9][0-9]{0,30}$/.test(args[2])) { output.error(usage); return 2; }
    if (!env.CONFLUENCE_EMAIL || !env.CONFLUENCE_API_TOKEN) { output.error('Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const provider = makeDocumentation(config.documentation, { confluenceEmail: env.CONFLUENCE_EMAIL, confluenceToken: env.CONFLUENCE_API_TOKEN });
      output.log(JSON.stringify(await provider.getPage(args[2]), null, 2));
      return 0;
    } catch {
      output.error('Unable to read Confluence page. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'hub-status') {
    if (args.length > 2) { output.error(usage); return 2; }
    try {
      const result = await readHubStatuses({ cwd, ticket: args[1] });
      output.log(JSON.stringify(result, null, 2));
      return result.complete ? 0 : 1;
    } catch {
      output.error('Unable to read hub status. Check the hub configuration and state directory.');
      return 1;
    }
  }
  if (args[0] === 'aem-dialog-snapshot' || args[0] === 'aem-dialog-compare') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try {
      const result = args[0] === 'aem-dialog-snapshot' ? await saveAemDialogSnapshot({ dialogPath: args[1], outputPath: args[2] }) : await compareAemDialogSnapshotFiles(args[1], args[2]);
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to save or compare local dialog snapshots.');
      return 1;
    }
  }
  if (args[0] === 'aem-dialog') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try {
      output.log(JSON.stringify(await readAemDialog(args[1]), null, 2));
      return 0;
    } catch {
      output.error('Unable to inspect the local dialog. Check the XML file and size limit.');
      return 1;
    }
  }
  if (args[0] === 'aem-components') {
    if (args.length !== 2) { output.error(usage); return 2; }
    try {
      output.log(JSON.stringify(await findAemComponents({ cwd, name: args[1] }), null, 2));
      return 0;
    } catch {
      output.error('Unable to search AEM components. Check the name, repository and search limits.');
      return 1;
    }
  }
  if (args[0] === 'spec-init') {
    if (args.length !== 3) { output.error(usage); return 2; }
    try {
      output.log(JSON.stringify(await ensureSpecDirectory({ cwd, id: args[1], title: args[2] }), null, 2));
      return 0;
    } catch {
      output.error('Unable to create or select a unique ticket directory. Check the ID and existing directories.');
      return 1;
    }
  }
  if (args[0] === 'gitlab-mr-create') {
    const valid = (args.length === 7 || (args.length === 8 && args[7] === '--draft')) && args[5] === '--body-file' && args.slice(1, 5).every(value => typeof value === 'string' && value.trim()) && args[6]?.trim();
    if (!valid) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try {
      const body = await readBody(args[6], 'utf8');
      const result = await createGitlabMr({ cwd, project: args[1], configPath: args[2], planPath: args[3], title: args[4], token: env.GITLAB_TOKEN, body, draft: args.length === 8 });
      output.log(JSON.stringify(result, null, 2));
      return result.created ? 0 : 1;
    } catch (error) {
      output.error(Number.isInteger(error?.status) ? `GitLab request failed (${error.status})` : 'Unable to create merge request. Check the configuration, plan, branch and connection.');
      return 1;
    }
  }
  if (args[0] === 'bitbucket-pr-create') {
    const valid = (args.length === 8 || (args.length === 9 && args[8] === '--draft')) && args[6] === '--body-file' && args.slice(1, 6).every(value => typeof value === 'string' && value.trim()) && args[7]?.trim();
    if (!valid) { output.error(usage); return 2; }
    if (!env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try {
      const body = await readBody(args[7], 'utf8');
      const result = await createBitbucketPr({ cwd, workspace: args[1], repository: args[2], configPath: args[3], planPath: args[4], title: args[5], token: env.BITBUCKET_TOKEN, body, draft: args.length === 9 });
      output.log(JSON.stringify(result, null, 2));
      return result.created ? 0 : 1;
    } catch (error) {
      output.error(Number.isInteger(error?.status) ? `Bitbucket request failed (${error.status})` : 'Unable to create pull request. Check the configuration, plan, branch and connection.');
      return 1;
    }
  }
  if (args[0] === 'ado-pr-create') {
    if (args.length < 9 || args.slice(1, 7).some(value => typeof value !== 'string' || !value.trim())) { output.error(usage); return 2; }
    let bodyPath;
    let draft = false;
    const workItemIds = [];
    for (let index = 7; index < args.length; index++) {
      if (args[index] === '--body-file' && !bodyPath && args[index + 1]?.trim()) bodyPath = args[++index];
      else if (args[index] === '--draft' && !draft) draft = true;
      else if (args[index] === '--work-item' && /^[1-9][0-9]*$/.test(args[index + 1] ?? '') && Number.isSafeInteger(Number(args[index + 1])) && Number(args[index + 1]) <= 2147483647) workItemIds.push(Number(args[++index]));
      else { output.error(usage); return 2; }
    }
    if (!bodyPath) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const body = await readBody(bodyPath, 'utf8');
      const result = await createAzurePullRequest({ cwd, organization: args[1], project: args[2], repository: args[3], configPath: args[4], planPath: args[5], title: args[6], token: env.ADO_PAT, body, draft, workItemIds });
      output.log(JSON.stringify(result, null, 2));
      return result.created ? 0 : 1;
    } catch (error) {
      output.error(Number.isInteger(error?.status) ? `Azure DevOps request failed (${error.status})` : 'Unable to create pull request. Check the configuration, plan, branch and connection.');
      return 1;
    }
  }
  if (args[0] === 'scm-pr') {
    if (args.length !== 3 || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.scm?.provider === 'github' && !env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
      if (config.scm?.provider === 'ado' && !env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
      if (config.scm?.provider === 'gitlab' && !env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
      if (config.scm?.provider === 'bitbucket-cloud' && !env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      output.log(JSON.stringify(await scm.getPullRequest(Number(args[2])), null, 2));
      return 0;
    } catch {
      output.error('Unable to read pull request. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'tracker-ticket' || args[0] === 'tracker-export') {
    const exporting = args[0] === 'tracker-export';
    if (args.length !== (exporting ? 4 : 3) || typeof args[2] !== 'string' || !args[2].trim() || (exporting && !args[3]?.trim())) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.tracker?.provider === 'github' && !env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment before running this command.'); return 2; }
      if (config.tracker?.provider === 'jira' && (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN)) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
      if (config.tracker?.provider === 'gitlab' && !env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
      if (config.tracker?.provider === 'ado' && !env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
      const numeric = ['github', 'ado', 'gitlab'].includes(config.tracker?.provider);
      if (numeric && (!/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])))) { output.error(usage); return 2; }
      const tracker = makeTracker(config.tracker, { token: env.GITHUB_TOKEN, jiraEmail: env.JIRA_EMAIL, jiraToken: env.JIRA_API_TOKEN, adoToken: env.ADO_PAT, gitlabToken: env.GITLAB_TOKEN });
      const ticket = await tracker.getTicket(numeric ? Number(args[2]) : args[2]);
      output.log(JSON.stringify(exporting ? await saveTrackerStory(ticket, args[3]) : ticket, null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to read or export tracker ticket. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'github-pr-create') {
    const valid = (args.length === 8 || (args.length === 9 && args[8] === '--draft')) && args[6] === '--body-file' && args.slice(1, 6).every(value => typeof value === 'string' && value.trim()) && args[7]?.trim();
    if (!valid) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment before running this command.'); return 2; }
    try {
      const body = await readBody(args[7], 'utf8');
      const result = await createPullRequest({ cwd, owner: args[1], repository: args[2], configPath: args[3], planPath: args[4], title: args[5], token: env.GITHUB_TOKEN, body, draft: args.length === 9 });
      output.log(JSON.stringify(result, null, 2));
      return result.created ? 0 : 1;
    } catch (error) {
      output.error(Number.isInteger(error?.status) ? `GitHub request failed (${error.status})` : 'Unable to create pull request. Check the configuration, plan, branch and connection.');
      return 1;
    }
  }
  if (args[0] === 'readiness') {
    if (args.length !== 3) { output.error(usage); return 2; }
    try {
      const result = await inspect({ cwd, configPath: args[1], planPath: args[2] });
      output.log(JSON.stringify(result, null, 2));
      return result.ready ? 0 : 1;
    } catch {
      output.error('Unable to inspect readiness. Check the configuration, plan and Git repository.');
      return 1;
    }
  }
  if (args[0] === 'github-issue-export') {
    if (args.length !== 5 || !/^[1-9][0-9]*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3])) || !args[4]?.trim()) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment before running this command.'); return 2; }
    try {
      const client = makeClient({ owner: args[1], repository: args[2], token: env.GITHUB_TOKEN });
      const issue = await fetchGitHubIssueContext({ client, number: Number(args[3]) });
      const result = await saveGitHubIssueStory(issue, args[4]);
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to export GitHub issue. Check the issue, output path and connection.');
      return 1;
    }
  }
  const validPage = args.length === 6 && args[0] === 'github-pr-context' && args[4] === '--page' && /^[1-9][0-9]*$/.test(args[5]) && Number.isSafeInteger(Number(args[5]));
  if ((args.length !== 4 && !validPage) || !['github-pr', 'github-pr-context', 'github-issue', 'github-issue-context'].includes(args[0]) || !/^[1-9][0-9]*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3]))) {
    output.error(usage);
    return 2;
  }
  if (!env.GITHUB_TOKEN) {
    output.error('Set GITHUB_TOKEN in the environment before running this command.');
    return 2;
  }
  try {
    const number = Number(args[3]);
    const client = makeClient({ owner: args[1], repository: args[2], token: env.GITHUB_TOKEN });
    if (args[0] === 'github-issue-context') {
      output.log(JSON.stringify(await fetchGitHubIssueContext({ client, number }), null, 2));
      return 0;
    }
    if (args[0] === 'github-issue') {
      output.log(JSON.stringify(await client.getIssue(number), null, 2));
      return 0;
    }
    const pullRequest = await client.getPullRequest(number);
    if (args[0] === 'github-pr') {
      output.log(JSON.stringify(pullRequest, null, 2));
    } else {
      const sha = pullRequest?.head?.sha;
      const page = validPage ? Number(args[5]) : 1;
      const [reviewComments, conversationComments, checkRuns, commitStatus] = await Promise.all([
        client.listReviewComments(number, { page }), client.listIssueComments(number, { page }),
        client.listCheckRuns(sha, { page }), client.getCommitStatus(sha),
      ]);
      output.log(JSON.stringify({ pullRequest, reviewComments, conversationComments, checkRuns, commitStatus,
        pagination: { page, perPage: 100, note: 'Comments and checks contain only the requested page.' } }, null, 2));
    }
    return 0;
  } catch (error) {
    // Remote response bodies and credentials are never printed.
    output.error(Number.isInteger(error?.status) ? `GitHub request failed (${error.status})` : 'Could not read GitHub data. Check the arguments and connection.');
    return 1;
  }
}
