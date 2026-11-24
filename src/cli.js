import { readFile, writeFile } from 'node:fs/promises';
import { createGitHubPullRequest } from './github-pr-flow.js';
import { createAdoPullRequest } from './ado-pr-flow.js';
import { createBitbucketPullRequest } from './bitbucket-pr-flow.js';
import { createGitLabMergeRequest } from './gitlab-pr-flow.js';
import { ensureSpecDirectory } from './spec-directory.js';
import { findAemComponents } from './aem-components.js';
import { readAemDialog } from './aem-dialog.js';
import { auditAemDialog } from './aem-dialog-audit.js';
import { readAxeResult, compareAxeResults, saveAxeReport } from './axe-results.js';
import { runAxeAccessibility } from './axe-run.js';
import { inspectLocalSupertype } from './aem-supertype.js';
import { saveAemDialogSnapshot, compareAemDialogSnapshotFiles } from './aem-snapshot.js';
import { readHubStatuses } from './hub-status.js';
import { savePullRequestDescription } from './pr-description.js';
import { inspectGitHubWebhook } from './github-webhook.js';
import { inspectGitLabWebhook } from './gitlab-webhook.js';
import { inspectBitbucketWebhook } from './bitbucket-webhook.js';
import { readPipelineStatus } from './ci-pipeline-status.js';
import { claimExternalWebhook } from './external-webhook-claim.js';
import { claimGitHubWebhook } from './webhook-claim.js';
import { readLimitedFile } from './read-limited.js';
import { installSkill } from './install-skill.js';
import { planSkillInstallation } from './skill-install-plan.js';
import { compareInstalledSkill, auditInstalledSkills } from './skill-compare.js';
import { processSkillUpgrade } from './skill-upgrade.js';
import { proposeProjectProviders } from './project-provider-propose.js';
import { initializeReadiness } from './readiness-init.js';
import { processSkillSync } from './skill-sync.js';
import { processSkillRestore } from './skill-restore.js';
import { diagnoseCiRun } from './ci-run-diagnose.js';
import { processCiRetry } from './ci-retry.js';
import { processCiCancel } from './ci-cancel.js';
import { saveCiDiagnosis, checkCiDiagnosis } from './ci-diagnosis-evidence.js';
import { inspectCiLogCandidates, compareCiLogCandidates } from './ci-log-candidates.js';
import { processGitHubJobLog } from './github-job-log.js';
import { processBitbucketStepLog } from './bitbucket-step-log.js';
import { readGitHubCiSummary } from './github-ci-summary.js';
import { readCiObservations } from './ci-observations.js';
import { readPullRequestContext } from './pr-context.js';
import { readGitHubPullRequestFiles } from './github-pr-files.js';
import { readGitHubPullRequestCommits } from './github-pr-commits.js';
import { readGitLabMergeRequestDiffs } from './gitlab-mr-diffs.js';
import { readGitLabMergeRequestCommits } from './gitlab-mr-commits.js';
import { readGitHubReviewContext } from './github-review-context.js';
import { readPlanStatus } from './plan-status.js';
import { readBitbucketPrDiffstat } from './bitbucket-pr-diffstat.js';
import { readBitbucketPrCommits } from './bitbucket-pr-commits.js';
import { readAzurePrCommitPage } from './ado-pr-commits.js';
import { readScmPrCommits } from './scm-pr-commits.js';
import { readScmReviewContext } from './scm-review-context.js';
import { readScmReviewBatch } from './scm-review-batch.js';
import { listScmPullRequests } from './scm-pr-list.js';
import { readReviewCiContext } from './review-ci-context.js';
import { saveReviewEvidence } from './review-evidence.js';
import { saveJiraAttachments, saveJiraTicketAttachments, previewJiraTicketAttachments } from './jira-attachments.js';
import { saveAttachmentManifest, checkAttachmentManifest } from './attachment-manifest.js';
import { saveJiraTicketEvidence } from './jira-ticket-evidence.js';
import { checkReviewEvidence } from './review-evidence-check.js';
import { describeProviderSources } from './provider-sources.js';
import { listSkills } from './list-skills.js';
import { initializeTicket } from './ticket-init.js';
import { compareTicketSource } from './ticket-source-refresh.js';
import { saveTaskPlan, checkTaskPlan } from './task-plan.js';
import { summarizeTaskEstimates } from './task-estimate.js';
import { processJiraSubtask } from './jira-subtask.js';
import { processAdoSubtask } from './ado-subtask.js';
import { processGitHubSubtask } from './github-subtask.js';
import { processGitHubComment } from './github-comment.js';
import { processGitLabComment, readGitLabDiscussions } from './gitlab-comment.js';
import { processBitbucketReply } from './bitbucket-reply.js';
import { processAdoReply } from './ado-reply.js';
import { processIssueState } from './issue-state.js';
import { listJiraTransitions, processJiraTransition } from './jira-transition.js';
import { listAdoStates, processAdoState } from './ado-state.js';
import { processJiraComment } from './jira-comment.js';
import { processAdoComment } from './ado-comment.js';
import { searchLiveAemUsage, searchLiveAemUsageMany, readLiveAemNode } from './aem-live-usage.js';
import { saveAemLiveSnapshot, compareAemLiveSnapshots, compareAemLiveNodes } from './aem-live-snapshot.js';
import { captureAemScreenshot, compareAemScreenshots } from './aem-screenshot.js';
import { processGitHubReview } from './github-review-submit.js';
import { processScmComment } from './scm-comment.js';
import { processGitHubInline } from './github-inline.js';
import { processGitLabInline } from './gitlab-inline.js';
import { processGitLabApproval } from './gitlab-approval.js';
import { processBitbucketApproval } from './bitbucket-approval.js';
import { processBitbucketInline } from './bitbucket-inline.js';
import { readAzurePrIterations, readAzureLatestIterationChanges } from './ado-pr-iterations.js';
import { processAzureInline } from './ado-inline.js';
import { readGitHubRunJobs } from './github-ci-jobs.js';
import { readGitLabPipelineJobs } from './gitlab-ci-jobs.js';
import { readAzureBuildTimeline } from './ado-ci-timeline.js';
import { readBitbucketPipelineSteps } from './bitbucket-ci-steps.js';
import { saveGitLabJobLog } from './gitlab-job-log.js';
import { saveAzureBuildLog } from './ado-build-log.js';
import { processGitLabSubtask } from './gitlab-subtask.js';
import { searchTicketFiles } from './ticket-file-search.js';
import { inspectTicketDirectory } from './ticket-status.js';
import { inspectWorkflowStatus } from './workflow-status.js';
import { previewWorkflowStep, startWorkflowStep, finishWorkflowStep, checkWorkflowStepEvidence } from './workflow-step.js';
import { auditWorkflowEvidence } from './workflow-evidence-audit.js';
import { previewCommit } from './commit-preview.js';
import { importLocalRequirements, checkLocalRequirements } from './requirements-import.js';
import { savePlanReview, checkPlanReview } from './plan-review.js';
import { saveWorkflowSnapshot, compareWorkflowSnapshot } from './workflow-snapshot.js';
import { initializeProject } from './project-init.js';
import { inspectProject } from './project-inspect.js';
import { inspectProjectProfile } from './project-profile.js';
import { inspectProjectConventions } from './project-conventions.js';
import { inspectAemComponent, inspectOsgiConfigs } from './aem-doctor.js';
import { inspectAemComponentOverview, saveAemComponentOverview } from './aem-component-overview.js';
import { saveAemQaHandoff, inspectAemQaHandoff } from './aem-qa-handoff.js';
import { saveAemEditorialGuide } from './aem-editorial-guide.js';
import { inspectAemClientlibs } from './aem-clientlibs.js';
import { inspectAemClientlibFiles } from './aem-clientlib-files.js';
import { inspectAemClientlibsOverview, saveAemClientlibsOverview } from './aem-clientlibs-overview.js';
import { findAemSourceUsage, saveAemSourceUsage } from './aem-source-usage.js';
import { inspectAemProjectLayout, initializeAemProject, inspectAemProjectSettings } from './aem-project-layout.js';
import { searchConfiguredAemContent, saveConfiguredAemSearch } from './aem-configured-search.js';
import { searchConfiguredAemComponents } from './aem-configured-components.js';
import { previewAemRefresh, importAemRefresh } from './aem-refresh.js';
import { compareAemRefresh, saveAemRefreshComparison } from './aem-refresh-compare.js';
import { stageAemRefresh } from './aem-refresh-stage.js';
import { inspectAemKnowledge, searchAemKnowledge } from './aem-knowledge.js';
import { inspectHubRepositories, selectHubRepositories, discoverHubRepositories, discoverHubCommentRepositories, discoverHubScopeTable } from './hub-repos.js';
import { initializeHub } from './hub-init.js';
import { inspectProviderConfiguration, inspectWorkflowSetup } from './project-doctor.js';
import { readAzureCommitBuilds } from './ado-commit-builds.js';
import { saveAemComponentReport } from './aem-component-report.js';
import { startLocalGitHubWebhookListener } from './webhook-listener.js';
import { startExternalWebhookListener } from './external-webhook-listener.js';
import { initializeLocalAutomation, inspectLocalAutomation } from './automation-local.js';
import { diagnoseLocalAutomation } from './automation-doctor.js';
import { processAutomationEnqueueBatch, enqueueAutomationClaim, listAutomationJobs } from './automation-queue.js';
import { inspectAdoWebhook } from './ado-webhook.js';
import { claimAdoWebhook, startAdoWebhookListener } from './ado-webhook-listener.js';
import { processHubRouting } from './hub-routing.js';
import { compareFigmaNodes, saveFigmaComparison } from './figma-compare.js';
import { saveFigmaNodeReport } from './figma-report.js';
import { readFigmaNode, saveFigmaNode, checkFigmaNode } from './figma-node.js';
import { stageHubDiscoveredTask } from './hub-task-stage.js';
import { planHubDiscovery } from './hub-discovery-plan.js';
import { discoverHubSimpleRepositories } from './hub-simple-route.js';
import { inspectAemSimpleBlock } from './aem-simple-block.js';
import { inspectAutomationQueueStatus } from './automation-queue-status.js';
import { readAutomationJobContext, readAutomationJobContextBatch, exportAutomationJobContext, exportAutomationJobContextBatch } from './automation-job-context.js';
import { processAutomationJob, inspectAutomationExecution } from './automation-job-run.js';
import { processAutomationBatch } from './automation-batch.js';
import { processSlackNotification } from './slack-notification.js';
import { listWebhookClaims } from './webhook-claims.js';
import { transitionPlanFile } from './plan-transition.js';
import { saveTestEvidence, checkTestEvidence } from './test-evidence.js';
import { installSkills } from './install-skills.js';
import { runHubTask, previewHubTask } from './hub-run.js';
import { saveResponseDraft } from './pr-response-draft.js';
import { saveReviewReport } from './pr-review-report.js';
import { saveReviewReports } from './pr-reviews-report.js';
import { scanChangedFiles, scanCommittedChanges, scanCommitHistory } from './security-scan.js';
import { saveSecurityEvidence } from './security-evidence.js';
import { createGitHubClient } from './github.js';
import { fetchGitHubIssueContext } from './issue-context.js';
import { saveGitHubIssueStory } from './issue-story.js';
import { saveTrackerStory } from './tracker-story.js';
import { createTrackerProvider, createScmProvider, createCiProvider, createDocumentationProvider } from './providers.js';
import { inspectConfiguredReadiness } from './configured-readiness.js';

const usage = 'Usage: node bin/aem-devflow.js <github-pr|github-pr-context|github-issue|github-issue-context> <owner> <repository> <number> [--page <number>]\n       node bin/aem-devflow.js readiness <config.json> <implement.md>\n       node bin/aem-devflow.js verification-run <config.json> <implement.md> <output.md>\n       node bin/aem-devflow.js verification-check <config.json> <implement.md> <evidence.md>\n       node bin/aem-devflow.js plan-status <implement.md>\n       node bin/aem-devflow.js plan-review-record <implement.md> <review.json> <output.md>\n       node bin/aem-devflow.js plan-review-check <implement.md> <review.md>\n       node bin/aem-devflow.js plan-transition <implement.md> <step> <from> <to> <expected-sha256>\n       node bin/aem-devflow.js tracker-ticket <providers.json> <id>\n       node bin/aem-devflow.js ticket-init <providers.json> <id>\n       node bin/aem-devflow.js ticket-source-compare <providers.json> <id> <spec-directory>\n       node bin/aem-devflow.js ticket-source-stage <providers.json> <id> <spec-directory> <output.md>\n       node bin/aem-devflow.js requirements-import <slug> <source-file>\n       node bin/aem-devflow.js requirements-import-check <spec-directory>\n       node bin/aem-devflow.js task-plan-create <spec-directory> <input.json> <output.json>\n       node bin/aem-devflow.js task-plan-check <spec-directory> <record.json>\n       node bin/aem-devflow.js task-plan-estimate <spec-directory> <record.json>\n       node bin/aem-devflow.js jira-subtask-plan <providers.json> <spec-directory> <record.json> <index> <issue-type-id>\n       node bin/aem-devflow.js jira-subtask-create <providers.json> <spec-directory> <record.json> <index> <issue-type-id> <preview-sha256>\n       node bin/aem-devflow.js ado-subtask-plan <providers.json> <spec-directory> <record.json> <index> <work-item-type>\n       node bin/aem-devflow.js ado-subtask-create <providers.json> <spec-directory> <record.json> <index> <work-item-type> <preview-sha256>\n       node bin/aem-devflow.js github-subtask-plan <providers.json> <spec-directory> <record.json> <index>\n       node bin/aem-devflow.js github-subtask-create <providers.json> <spec-directory> <record.json> <index> <preview-sha256>\n       node bin/aem-devflow.js github-issue-comment-plan <providers.json> <issue> <body.md>\n       node bin/aem-devflow.js github-issue-comment-send <providers.json> <issue> <body.md> <preview-sha256>\n       node bin/aem-devflow.js github-review-reply-plan <providers.json> <pr> <comment-id> <body.md>\n       node bin/aem-devflow.js github-review-reply-send <providers.json> <pr> <comment-id> <body.md> <preview-sha256>\n       node bin/aem-devflow.js gitlab-mr-discussions <providers.json> <mr>\n       node bin/aem-devflow.js gitlab-issue-comment-plan <providers.json> <issue> <body.md>\n       node bin/aem-devflow.js gitlab-issue-comment-send <providers.json> <issue> <body.md> <preview-sha256>\n       node bin/aem-devflow.js gitlab-review-reply-plan <providers.json> <mr> <discussion-id> <body.md>\n       node bin/aem-devflow.js gitlab-review-reply-send <providers.json> <mr> <discussion-id> <body.md> <preview-sha256>\n       node bin/aem-devflow.js bitbucket-review-reply-plan <providers.json> <pr> <comment-id> <body.md>\n       node bin/aem-devflow.js bitbucket-review-reply-send <providers.json> <pr> <comment-id> <body.md> <preview-sha256>\n       node bin/aem-devflow.js ado-review-reply-plan <providers.json> <pr> <thread-id> <comment-id> <body.md>\n       node bin/aem-devflow.js ado-review-reply-send <providers.json> <pr> <thread-id> <comment-id> <body.md> <preview-sha256>\n       node bin/aem-devflow.js issue-state-plan <providers.json> <issue> <open|closed>\n       node bin/aem-devflow.js issue-state-apply <providers.json> <issue> <open|closed> <preview-sha256>\n       node bin/aem-devflow.js jira-transitions <providers.json> <issue-key>\n       node bin/aem-devflow.js jira-transition-plan <providers.json> <issue-key> <transition-id>\n       node bin/aem-devflow.js jira-transition-apply <providers.json> <issue-key> <transition-id> <preview-sha256>\n       node bin/aem-devflow.js ado-work-item-states <providers.json> <work-item-id>\n       node bin/aem-devflow.js ado-work-item-state-plan <providers.json> <work-item-id> <state>\n       node bin/aem-devflow.js ado-work-item-state-apply <providers.json> <work-item-id> <state> <preview-sha256>\n       node bin/aem-devflow.js jira-comment-plan <providers.json> <issue-key> <body-adf.json>\n       node bin/aem-devflow.js jira-comment-send <providers.json> <issue-key> <body-adf.json> <preview-sha256>\n       node bin/aem-devflow.js ado-work-item-comment-plan <providers.json> <work-item-id> <body.md>\n       node bin/aem-devflow.js ado-work-item-comment-send <providers.json> <work-item-id> <body.md> <preview-sha256>\n       node bin/aem-devflow.js aem-live-usage <author-origin> <content-root> <resource-type>\n       node bin/aem-devflow.js aem-live-snapshot <author-origin> <content-root> <resource-type> <dialog.xml> <output.json>\n       node bin/aem-devflow.js aem-live-snapshot-compare <before.json> <after.json>\n       node bin/aem-devflow.js aem-live-usage-many <author-origin> <resource-type> <content-root> [root ...]\n       node bin/aem-devflow.js aem-live-node <author-origin> <node-path> <depth>\n       node bin/aem-devflow.js aem-live-node-snapshot <author-origin> <node-path> <depth> <output.json>\n       node bin/aem-devflow.js aem-live-node-compare <before.json> <after.json>\n       node bin/aem-devflow.js aem-screenshot <project-directory> <config.json> <output.png>\n       node bin/aem-devflow.js aem-screenshot-compare <project-directory> <before.png> <after.png> [--threshold <0-255>]\n       node bin/aem-devflow.js github-review-plan <providers.json> <pr> <APPROVE|REQUEST_CHANGES|COMMENT> <body.md>\n       node bin/aem-devflow.js github-review-submit <providers.json> <pr> <APPROVE|REQUEST_CHANGES|COMMENT> <body.md> <preview-sha256>\n       node bin/aem-devflow.js scm-comment-plan <providers.json> <pr> <body.md>\n       node bin/aem-devflow.js scm-comment-send <providers.json> <pr> <body.md> <preview-sha256>\n       node bin/aem-devflow.js github-inline-plan <providers.json> <pr> <path> <LEFT|RIGHT> <line> <body.md>\n       node bin/aem-devflow.js github-inline-send <providers.json> <pr> <path> <LEFT|RIGHT> <line> <body.md> <preview-sha256>\n       node bin/aem-devflow.js hub-discover-table <source-file>\n       node bin/aem-devflow.js github-run-jobs <providers.json> <run-id>\n       node bin/aem-devflow.js gitlab-pipeline-jobs <providers.json> <pipeline-id>\n       node bin/aem-devflow.js ado-build-timeline <providers.json> <build-id>\n       node bin/aem-devflow.js bitbucket-pipeline-steps <providers.json> <pipeline-uuid>\n       node bin/aem-devflow.js gitlab-job-log <providers.json> <pipeline-id> <job-id> <output-file>\n       node bin/aem-devflow.js ado-build-log <providers.json> <build-id> <log-id> <output-file>\n       node bin/aem-devflow.js project-workflow-doctor <project-directory> <codex|claude|copilot>\n       node bin/aem-devflow.js skill-audit <codex|claude|copilot> <target-project>\n       node bin/aem-devflow.js skill-upgrade-plan <codex|claude|copilot> <target-project> <skill>\n       node bin/aem-devflow.js skill-upgrade-apply <codex|claude|copilot> <target-project> <skill> <preview-sha256>\n       node bin/aem-devflow.js project-provider-propose <project-directory>\n       node bin/aem-devflow.js readiness-init <input.json>\n       node bin/aem-devflow.js ci-log-candidates <log-file>\n       node bin/aem-devflow.js github-job-log-plan <providers.json> <run-id> <job-id>\n       node bin/aem-devflow.js github-job-log-save <providers.json> <run-id> <job-id> <output-file> <preview-sha256>\n       node bin/aem-devflow.js bitbucket-step-log-plan <providers.json> <pipeline-uuid> <step-uuid>\n       node bin/aem-devflow.js bitbucket-step-log-save <providers.json> <pipeline-uuid> <step-uuid> <output-file> <preview-sha256>\n       node bin/aem-devflow.js skill-sync-plan <codex|claude|copilot> <skill> <targets.json>\n       node bin/aem-devflow.js skill-sync-apply <codex|claude|copilot> <skill> <targets.json> <preview-sha256>\n       node bin/aem-devflow.js skill-restore-plan <codex|claude|copilot> <target-project> <skill> <backup-directory>\n       node bin/aem-devflow.js skill-restore-apply <codex|claude|copilot> <target-project> <skill> <backup-directory> <preview-sha256>\n       node bin/aem-devflow.js ci-run-diagnose <providers.json> <run-id>\n       node bin/aem-devflow.js ci-retry-plan <providers.json> <run-id>\n       node bin/aem-devflow.js ci-retry-apply <providers.json> <run-id> <preview-sha256>\n       node bin/aem-devflow.js ci-cancel-plan <providers.json> <run-id>\n       node bin/aem-devflow.js ci-cancel-apply <providers.json> <run-id> <preview-sha256>\n       node bin/aem-devflow.js ci-diagnosis-save <providers.json> <run-id> <output.json>\n       node bin/aem-devflow.js ci-diagnosis-check <providers.json> <evidence.json>\n       node bin/aem-devflow.js ci-log-compare <before.log> <after.log>\n       node bin/aem-devflow.js gitlab-inline-plan <providers.json> <mr> <new-path> <LEFT|RIGHT> <line> <body.md>\n       node bin/aem-devflow.js gitlab-inline-send <providers.json> <mr> <new-path> <LEFT|RIGHT> <line> <body.md> <preview-sha256>\n       node bin/aem-devflow.js gitlab-approval-plan <providers.json> <mr> <reviewed-sha>\n       node bin/aem-devflow.js gitlab-approval-apply <providers.json> <mr> <reviewed-sha> <preview-sha256>\n       node bin/aem-devflow.js bitbucket-approval-plan <providers.json> <pr> <reviewed-sha>\n       node bin/aem-devflow.js bitbucket-approval-apply <providers.json> <pr> <reviewed-sha> <preview-sha256>\n       node bin/aem-devflow.js automation-job-plan <target-project> <claim-sha256> <command.json> <external-store>\n       node bin/aem-devflow.js automation-job-run <target-project> <claim-sha256> <command.json> <external-store> <preview-sha256>\n       node bin/aem-devflow.js automation-execution-status <target-project> <claim-sha256> <external-store>\n       node bin/aem-devflow.js slack-notification-plan <destination-label> <body.md>\n       node bin/aem-devflow.js slack-notification-send <destination-label> <body.md> <preview-sha256>\n       node bin/aem-devflow.js automation-batch-plan <target-project> <claims.json> <command.json> <external-store>\n       node bin/aem-devflow.js automation-batch-run <target-project> <claims.json> <command.json> <external-store> <preview-sha256>\n       node bin/aem-devflow.js bitbucket-inline-plan <providers.json> <pr> <path> <LEFT|RIGHT> <line> <body.md>\n       node bin/aem-devflow.js bitbucket-inline-send <providers.json> <pr> <path> <LEFT|RIGHT> <line> <body.md> <preview-sha256>\n       node bin/aem-devflow.js ado-pr-iterations <providers.json> <pr>\n       node bin/aem-devflow.js ado-pr-latest-changes <providers.json> <pr> <reviewed-sha>\n       node bin/aem-devflow.js ado-inline-plan <providers.json> <pr> <reviewed-sha> <path> <LEFT|RIGHT> <line> <body.md>\n       node bin/aem-devflow.js ado-inline-send <providers.json> <pr> <reviewed-sha> <path> <LEFT|RIGHT> <line> <body.md> <preview-sha256>\n       node bin/aem-devflow.js gitlab-subtask-plan <providers.json> <spec-directory> <record.json> <index> <work-item-type-id>\n       node bin/aem-devflow.js gitlab-subtask-create <providers.json> <spec-directory> <record.json> <index> <work-item-type-id> <preview-sha256>\n       node bin/aem-devflow.js ticket-file-search <terms.json>\n       node bin/aem-devflow.js project-init <providers.json>\n       node bin/aem-devflow.js project-inspect\n       node bin/aem-devflow.js project-profile <project-directory>\n       node bin/aem-devflow.js project-conventions <project-directory>\n       node bin/aem-devflow.js commit-preview\n       node bin/aem-devflow.js security-scan\n       node bin/aem-devflow.js security-scan-commit <full-base-sha>\n       node bin/aem-devflow.js security-scan-history <full-base-sha>\n       node bin/aem-devflow.js security-evidence <full-base-sha> <output.md>\n       node bin/aem-devflow.js project-doctor <providers.json>\n       node bin/aem-devflow.js ticket-status <spec-directory>\n       node bin/aem-devflow.js workflow-status <spec-directory>\n       node bin/aem-devflow.js workflow-step-plan <spec-directory> <step>\n       node bin/aem-devflow.js workflow-step-start <spec-directory> <step> <expected-sha256>\n       node bin/aem-devflow.js workflow-step-finish <spec-directory> <step> <done|blocked> <evidence.json> <output.json> <expected-sha256>\n       node bin/aem-devflow.js workflow-step-evidence-check <spec-directory> <step> <record.json>\n       node bin/aem-devflow.js workflow-evidence-audit <spec-directory> <index.json>\n       node bin/aem-devflow.js workflow-snapshot <spec-directory> <output.json> [--repo <directory>]\n       node bin/aem-devflow.js workflow-snapshot-compare <spec-directory> <snapshot.json> [--repo <directory>]\n       node bin/aem-devflow.js spec-init <ticket-id> <title>\n       node bin/aem-devflow.js install-skill <codex|claude|copilot> <skill> <target-project>\n       node bin/aem-devflow.js install-skills <codex|claude|copilot> <target-project> <skill> [skill ...]\n       node bin/aem-devflow.js install-skills-plan <codex|claude|copilot> <target-project> <skill> [skill ...]\n       node bin/aem-devflow.js skill-compare <codex|claude|copilot> <target-project> <skill>\n       node bin/aem-devflow.js list-skills\n       node bin/aem-devflow.js aem-components <component-name>\n       node bin/aem-devflow.js aem-doctor-component <component-directory>\n       node bin/aem-devflow.js aem-component-overview <component-directory> [--jcr-root <directory>]\n       node bin/aem-devflow.js aem-component-overview-report <component-directory> <output.md> [--jcr-root <directory>]\n       node bin/aem-devflow.js aem-qa-handoff <input.json> <output.md>\n       node bin/aem-devflow.js aem-qa-status <handoff.md>\n       node bin/aem-devflow.js aem-editorial-guide <dialog.xml> <output.md>\n       node bin/aem-devflow.js aem-clientlibs <directory>\n       node bin/aem-devflow.js aem-project-inspect <directory>\n       node bin/aem-devflow.js aem-project-init <input.json>\n       node bin/aem-devflow.js aem-project-status\n       node bin/aem-devflow.js aem-knowledge-status <target-project>\n       node bin/aem-devflow.js aem-knowledge-search <target-project> <query>\n       node bin/aem-devflow.js aem-refresh-plan <source-directory> <target-project>\n       node bin/aem-devflow.js aem-refresh-import <source-directory> <target-project>\n       node bin/aem-devflow.js aem-refresh-compare <source-directory> <target-project>\n       node bin/aem-devflow.js aem-refresh-comparison <source-directory> <target-project> <output.md>\n       node bin/aem-devflow.js aem-refresh-stage <source-directory> <target-project> <new-staging-directory>\n       node bin/aem-devflow.js aem-configured-search <resource-type>\n       node bin/aem-devflow.js aem-configured-components <name>\n       node bin/aem-devflow.js aem-configured-search-report <resource-type> <output.md>\n       node bin/aem-devflow.js aem-source-usage <directory> <resource-type> [--jcr-base <content-path>]\n       node bin/aem-devflow.js aem-source-usage-report <directory> <resource-type> <output.md> [--jcr-base <content-path>]\n       node bin/aem-devflow.js aem-clientlib-files <directory>\n       node bin/aem-devflow.js aem-clientlibs-overview <directory>\n       node bin/aem-devflow.js aem-clientlibs-report <directory> <output.md>\n       node bin/aem-devflow.js aem-supertype <component-directory> <jcr-root>\n       node bin/aem-devflow.js aem-component-report <component-directory> <output.md>\n       node bin/aem-devflow.js aem-doctor-osgi <config-directory>\n       node bin/aem-devflow.js aem-dialog <dialog.xml>\n       node bin/aem-devflow.js aem-dialog-audit <dialog.xml>\n       node bin/aem-devflow.js axe-run <project-directory> <config.json> <output.json>\n       node bin/aem-devflow.js axe-summary <result.json>\n       node bin/aem-devflow.js axe-report <result.json> <output.md>\n       node bin/aem-devflow.js axe-compare <before.json> <after.json>\n       node bin/aem-devflow.js aem-dialog-snapshot <dialog.xml> <output.json>\n       node bin/aem-devflow.js aem-dialog-compare <before.json> <after.json>\n       node bin/aem-devflow.js hub-status [ticket-id]\n       node bin/aem-devflow.js hub-repos\n       node bin/aem-devflow.js hub-select <name> [name ...]\n       node bin/aem-devflow.js hub-discover <source-file>\n       node bin/aem-devflow.js hub-discover-comment <comment-file>\n       node bin/aem-devflow.js hub-discover-simple <source-file>\n       node bin/aem-devflow.js hub-discovery-plan <source-file> [comment-file]\n       node bin/aem-devflow.js hub-task-stage <source-file> <comment-file-or-dash> <template.json> <output.json>\n       node bin/aem-devflow.js hub-routing-plan <routes.json>\n       node bin/aem-devflow.js hub-routing-apply <routes.json> <preview-sha256>\n       node bin/aem-devflow.js aem-simple-inspect <source-file>\n       node bin/aem-devflow.js figma-node <file-key> <node-id> <depth>\n       node bin/aem-devflow.js figma-node-save <file-key> <node-id> <depth> <output.json>\n       node bin/aem-devflow.js figma-node-check <file-key> <node-id> <depth> <evidence.json>\n       node bin/aem-devflow.js figma-node-report <evidence.json> <output.md>\n       node bin/aem-devflow.js figma-node-compare <before.json> <after.json>\n       node bin/aem-devflow.js figma-compare-report <before.json> <after.json> <output.md>\n       node bin/aem-devflow.js hub-init <repos.json>\n       node bin/aem-devflow.js hub-run <task.json> [--preview <sha256>]\n       node bin/aem-devflow.js hub-plan <task.json>\n       node bin/aem-devflow.js pr-description <share-plan-or-dash> <explain-or-dash> <plan> <verification> <output>\n       node bin/aem-devflow.js pr-response-draft <context.json> <output.md>\n       node bin/aem-devflow.js pr-review-report <findings.json> <output.md>\n       node bin/aem-devflow.js pr-reviews-report <reviews.json> <output.md>\n       node bin/aem-devflow.js confluence-page <providers.json> <page-id>\n       node bin/aem-devflow.js confluence-search <providers.json> <cql>\n       node bin/aem-devflow.js confluence-search-all <providers.json> <cql>\n       node bin/aem-devflow.js confluence-export <providers.json> <page-id> <output.md>\n       node bin/aem-devflow.js confluence-export-many <providers.json> <directory> <page-id> [id ...]\n       node bin/aem-devflow.js confluence-export-check <providers.json> <output.md>\n       node bin/aem-devflow.js confluence-export-check-many <providers.json> <directory> <id> [id ...]\n       node bin/aem-devflow.js automation-init <policy.json> <target-project>\n       node bin/aem-devflow.js automation-status <target-project>\n       node bin/aem-devflow.js automation-doctor <target-project>\n       node bin/aem-devflow.js automation-enqueue <target-project> <claim-sha256>\n       node bin/aem-devflow.js automation-enqueue-batch-plan <target-project> <claims.json>\n       node bin/aem-devflow.js automation-enqueue-batch-apply <target-project> <claims.json> <preview-sha256>\n       node bin/aem-devflow.js automation-jobs <target-project>\n       node bin/aem-devflow.js automation-queue-status <target-project> <external-store> [--offset <number>]\n       node bin/aem-devflow.js automation-job-context <target-project> <claim-sha256> <providers.json>\n       node bin/aem-devflow.js automation-context-batch <target-project> <claims.json> <providers.json>\n       node bin/aem-devflow.js automation-context-export <target-project> <claim-sha256> <providers.json> <output.json>\n       node bin/aem-devflow.js automation-context-export-batch <target-project> <claims.json> <providers.json> <external-directory>\n       node bin/aem-devflow.js webhook-inspect <policy.json> <headers.json> <body.json>\n       node bin/aem-devflow.js gitlab-webhook-inspect <policy.json> <headers.json> <body.json>\n       node bin/aem-devflow.js ado-webhook-inspect <policy.json> <body.json>\n       node bin/aem-devflow.js ado-webhook-claim <policy.json> <body.json> <store-dir>\n       node bin/aem-devflow.js ado-webhook-listen <policy.json> <store-dir> <port>\n       node bin/aem-devflow.js bitbucket-webhook-inspect <policy.json> <headers.json> <body.json>\n       node bin/aem-devflow.js gitlab-webhook-claim <policy.json> <headers.json> <body.json> <store-dir>\n       node bin/aem-devflow.js bitbucket-webhook-claim <policy.json> <headers.json> <body.json> <store-dir>\n       node bin/aem-devflow.js webhook-listen <policy.json> <store-dir> <port>\n       node bin/aem-devflow.js gitlab-webhook-listen <policy.json> <store-dir> <port>\n       node bin/aem-devflow.js bitbucket-webhook-listen <policy.json> <store-dir> <port>\n       node bin/aem-devflow.js webhook-claim <policy.json> <headers.json> <body.json> <store-dir>\n       node bin/aem-devflow.js webhook-claims <store-dir>\n       node bin/aem-devflow.js jira-attachment <providers.json> <attachment-id> <output-file>\n       node bin/aem-devflow.js jira-attachments <providers.json> <directory> <attachment-id> [id ...]\n       node bin/aem-devflow.js jira-ticket-attachments <providers.json> <issue-key> <directory> <attachment-id> [id ...]\n       node bin/aem-devflow.js jira-attachment-plan <providers.json> <issue-key> <directory> <id> [id ...]\n       node bin/aem-devflow.js jira-ticket-evidence <providers.json> <issue-key> <directory> <manifest.json> <id> [id ...]\n       node bin/aem-devflow.js jira-attachment-manifest <directory> <output.json> <id> [id ...]\n       node bin/aem-devflow.js jira-attachment-check <directory> <manifest.json>\n       node bin/aem-devflow.js scm-pr <providers.json> <number>\n       node bin/aem-devflow.js scm-pr-list <providers.json>\n       node bin/aem-devflow.js scm-pr-context <providers.json> <number>\n       node bin/aem-devflow.js scm-review-context <providers.json> <number> [--iteration <id>]\n       node bin/aem-devflow.js scm-review-batch <providers.json> <number> [number ...]\n       node bin/aem-devflow.js scm-review-ci <providers.json> <number> <full-sha> [--branch <name>]\n       node bin/aem-devflow.js scm-review-evidence <providers.json> <number> <full-sha> <output.md> [--branch <name>]\n       node bin/aem-devflow.js scm-review-evidence-check <providers.json> <output.md>\n       node bin/aem-devflow.js scm-pr-commits <providers.json> <number> [--continuation <token>]\n       node bin/aem-devflow.js github-pr-files <providers.json> <number>\n       node bin/aem-devflow.js github-pr-commits <providers.json> <number>\n       node bin/aem-devflow.js github-review-context <providers.json> <number>\n       node bin/aem-devflow.js gitlab-mr-diffs <providers.json> <number>\n       node bin/aem-devflow.js gitlab-mr-commits <providers.json> <number>\n       node bin/aem-devflow.js bitbucket-pr-statuses <providers.json> <number>\n       node bin/aem-devflow.js bitbucket-pr-commits <providers.json> <number>\n       node bin/aem-devflow.js bitbucket-pr-diffstat <providers.json> <number>\n       node bin/aem-devflow.js ado-pr-changes <providers.json> <number> <iteration>\n       node bin/aem-devflow.js ado-pr-commits <providers.json> <number> [--continuation <token>]\n       node bin/aem-devflow.js ci-runs <providers.json> <commit-sha> [--page <number>]\n       node bin/aem-devflow.js ci-status <providers.json> <commit-sha>\n       node bin/aem-devflow.js ci-status-all <providers.json> <commit-sha>\n       node bin/aem-devflow.js ci-summary <providers.json> <commit-sha>\n       node bin/aem-devflow.js ci-observations <providers.json> <full-sha> [--branch <name>]\n       node bin/aem-devflow.js ci-run <providers.json> <run-id>\n       node bin/aem-devflow.js ci-dispatch <providers.json> <workflow> <ref> [--inputs-file <json>]\n       node bin/aem-devflow.js gitlab-pipeline-dispatch <providers.json> <branch>\n       node bin/aem-devflow.js bitbucket-pipeline-dispatch <providers.json> <branch> <custom-pipeline>\n       node bin/aem-devflow.js gitlab-pipeline-status <providers.json> <id>\n       node bin/aem-devflow.js bitbucket-pipeline-status <providers.json> <uuid>\n       node bin/aem-devflow.js ado-pipeline-dispatch <providers.json> <definition-id> <branch> [--commit <sha>]\n       node bin/aem-devflow.js ado-pipeline-status <providers.json> <build-id>\n       node bin/aem-devflow.js ado-builds <providers.json> <branch> [--continuation <token>]\n       node bin/aem-devflow.js ado-ci-commit <providers.json> <branch> <full-commit-sha>\n       node bin/aem-devflow.js ado-build <providers.json> <build-id>\n       node bin/aem-devflow.js tracker-export <providers.json> <id> <output.md>\n       node bin/aem-devflow.js github-issue-export <owner> <repository> <number> <output.md>\n       node bin/aem-devflow.js github-pr-create <owner> <repository> <config> <implement.md> <title> --body-file <path> [--draft]\n       node bin/aem-devflow.js ado-pr-create <organization> <project> <repository> <config> <implement.md> <title> --body-file <path> [--draft] [--work-item <id>]\n       node bin/aem-devflow.js gitlab-mr-create <project> <config> <implement.md> <title> --body-file <path> [--draft]\n       node bin/aem-devflow.js bitbucket-pr-create <workspace> <repository> <config> <implement.md> <title> --body-file <path> [--draft]';

async function readBitbucketPrStatuses(scm, number) {
  if (scm?.provider !== 'bitbucket-cloud') throw new Error('Bitbucket Cloud configuration required');
  return { provider: 'bitbucket-cloud', pullRequest: number, statuses: await scm.getPullRequestStatuses(number), scope: 'Returned PR statuses only; required checks and branch protection are not evaluated.' };
}

/** Execute an explicitly requested CLI command; dependencies are injectable for tests. */
export async function runCli(args, { env = process.env, output = console, makeClient = createGitHubClient, inspect = inspectConfiguredReadiness, createPullRequest = createGitHubPullRequest, createAzurePullRequest = createAdoPullRequest, createBitbucketPr = createBitbucketPullRequest, createGitlabMr = createGitLabMergeRequest, makeTracker = createTrackerProvider, makeScm = createScmProvider, makeCi = createCiProvider, makeDocumentation = createDocumentationProvider, readBody = readFile, startWebhook = startLocalGitHubWebhookListener, cwd = process.cwd() } = {}) {
  if (args.length === 1 && ['help', '--help', '-h'].includes(args[0])) { output.log(usage); return 0; }
  if (args[0] === 'aem-component-report') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveAemComponentReport({ componentPath: args[1], outputPath: args[2] }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Report already exists; it was not overwritten.' : 'Unable to create local AEM component report.'); return 1; }
  }
  if (args[0] === 'figma-node-compare' || args[0] === 'figma-compare-report') {
    const saving = args[0] === 'figma-compare-report';
    if (args.length !== (saving ? 4 : 3) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = saving ? await saveFigmaComparison({ beforePath: args[1], afterPath: args[2], outputPath: args[3] }) : await compareFigmaNodes({ beforePath: args[1], afterPath: args[2] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Figma comparison report already exists; it was not overwritten.' : 'Unable to compare Figma observations. Check their identity, depth and contents.'); return 1; }
  }
  if (args[0] === 'figma-node-report') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveFigmaNodeReport({ evidencePath: args[1], outputPath: args[2] }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Figma report already exists; it was not overwritten.' : 'Unable to create Figma report. Check the saved observation and output path.'); return 1; }
  }
  if (['figma-node', 'figma-node-save', 'figma-node-check'].includes(args[0])) {
    const mode = args[0], needsFile = mode !== 'figma-node';
    if (args.length !== (needsFile ? 5 : 4) || args.slice(1).some(value => !value?.trim()) || !/^[1-5]$/.test(args[3])) { output.error(usage); return 2; }
    if (!env.FIGMA_TOKEN) { output.error('Set FIGMA_TOKEN in the environment.'); return 2; }
    try { const input = { fileKey: args[1], nodeId: args[2], depth: Number(args[3]), token: env.FIGMA_TOKEN }; const result = mode === 'figma-node' ? await readFigmaNode(input) : mode === 'figma-node-save' ? await saveFigmaNode({ ...input, outputPath: args[4] }) : await checkFigmaNode({ ...input, evidencePath: args[4] }); output.log(JSON.stringify(result, null, 2)); return mode === 'figma-node-check' && !result.matches ? 1 : 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Figma evidence already exists; it was not overwritten.' : 'Unable to read or compare the Figma node. Check identity, access, depth and evidence.'); return 1; }
  }
  if (args[0] === 'hub-run' || args[0] === 'hub-plan') {
    if (!args[1]?.trim() || (args[0] === 'hub-plan' && args.length !== 2) || (args[0] === 'hub-run' && !(args.length === 2 || (args.length === 4 && args[2] === '--preview' && /^[a-f0-9]{64}$/.test(args[3]))))) { output.error(usage); return 2; }
    try {
      const task = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      if (args[0] === 'hub-plan') { output.log(JSON.stringify(await previewHubTask({ cwd, task }), null, 2)); return 0; }
      const result = await runHubTask({ cwd, task, ...(args.length === 4 ? { expectedDigest: args[3] } : {}) });
      output.log(JSON.stringify(result, null, 2));
      return result.complete ? 0 : 1;
    } catch { output.error('Unable to prepare or run the hub task. Check task, repositories and existing state.'); return 1; }
  }
  if (args[0] === 'hub-discover-table') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await discoverHubScopeTable({ cwd, path: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch { output.error('Unable to resolve the scope table. Check the document and hub registry.'); return 1; }
  }
  if (args[0] === 'hub-init') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try {
      const repos = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      output.log(JSON.stringify(await initializeHub({ cwd, repos }), null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Hub configuration already exists; it was not overwritten.' : 'Unable to initialize the hub. Check repository entries and existing directories.');
      return 1;
    }
  }
  if (args[0] === 'aem-simple-inspect') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectAemSimpleBlock(args[1]), null, 2)); return 0; }
    catch { output.error('Unable to inspect the simple block. Check its syntax, page URL and uniqueness.'); return 1; }
  }
  if (args[0] === 'hub-routing-plan' || args[0] === 'hub-routing-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 3 : 2) || !args[1]?.trim() || (applying && !/^[a-f0-9]{64}$/.test(args[2]))) { output.error(usage); return 2; }
    try { const routes = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const result = await processHubRouting({ cwd, routes, ...(applying ? { expectedDigest: args[2] } : {}) }); output.log(JSON.stringify(result, null, 2)); return applying && !result.applied ? 1 : 0; }
    catch { output.error('Unable to configure hub routing. Check registry, input and existing configuration.'); return 1; }
  }
  if (args[0] === 'hub-task-stage') {
    if (args.length !== 5 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await stageHubDiscoveredTask({ cwd, sourcePath: args[1], ...(args[2] === '-' ? {} : { commentPath: args[2] }), templatePath: args[3], outputPath: args[4] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Task output already exists; it was not overwritten.' : 'Unable to stage a hub task. Check discovery, template and output.'); return 1; }
  }
  if (args[0] === 'hub-discovery-plan') {
    if (![2, 3].includes(args.length) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await planHubDiscovery({ cwd, sourcePath: args[1], ...(args[2] ? { commentPath: args[2] } : {}) }); output.log(JSON.stringify(result, null, 2)); return result.selectedTier === 'none' || result.result?.complete === false ? 1 : 0; }
    catch { output.error('Unable to propose repositories. Inspect the selected comment, simple block, scope table and hub configuration.'); return 1; }
  }
  if (args[0] === 'hub-discover-simple') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await discoverHubSimpleRepositories({ cwd, path: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to route the simple block. Check routing metadata, platform, brand, scope and hub registry.'); return 1; }
  }
  if (args[0] === 'hub-discover-comment') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await discoverHubCommentRepositories({ cwd, path: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to resolve a single tagged repository directive. Check the comment and hub registry.'); return 1; }
  }
  if (args[0] === 'hub-discover') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await discoverHubRepositories({ cwd, path: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to resolve a unique repository directive. Check the source and hub registry.'); return 1; }
  }
  if (args[0] === 'hub-select') {
    if (args.length < 2 || args.slice(1).some(name => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await selectHubRepositories({ cwd, names: args.slice(1) }), null, 2)); return 0; }
    catch { output.error('Unable to select hub repositories. Check names and hub configuration.'); return 1; }
  }
  if (args[0] === 'hub-repos') {
    if (args.length !== 1) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectHubRepositories({ cwd }), null, 2)); return 0; }
    catch { output.error('Unable to inspect hub repositories. Check the hub configuration.'); return 1; }
  }
  if (args[0] === 'aem-knowledge-status' || args[0] === 'aem-knowledge-search') {
    const searching = args[0] === 'aem-knowledge-search';
    if (args.length !== (searching ? 3 : 2) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const result = searching ? await searchAemKnowledge({ target: args[1], query: args[2] }) : await inspectAemKnowledge({ target: args[1] });
      output.log(JSON.stringify(result, null, 2)); return searching && result.limited ? 1 : 0;
    } catch { output.error('Unable to inspect local AEM knowledge. Check the project and query.'); return 1; }
  }
  if (args[0] === 'aem-refresh-stage') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await stageAemRefresh({ source: args[1], target: args[2], stage: args[3] }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Staging directory already exists; it was not overwritten.' : 'Unable to prepare AEM knowledge staging. Check the source, target and separate destination.'); return 1; }
  }
  if (args[0] === 'aem-refresh-compare' || args[0] === 'aem-refresh-comparison') {
    const saving = args[0] === 'aem-refresh-comparison';
    if (args.length !== (saving ? 4 : 3) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const result = saving ? await saveAemRefreshComparison({ source: args[1], target: args[2], outputPath: args[3] }) : await compareAemRefresh({ source: args[1], target: args[2] });
      output.log(JSON.stringify(result, null, 2)); return result.inspectionComplete ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Comparison report already exists; it was not overwritten.' : 'Unable to compare local AEM knowledge. Check source and target directories.'); return 1; }
  }
  if (args[0] === 'aem-refresh-plan' || args[0] === 'aem-refresh-import') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const preview = args[0] === 'aem-refresh-plan';
      const result = preview ? await previewAemRefresh({ source: args[1], target: args[2] }) : await importAemRefresh({ source: args[1], target: args[2] });
      output.log(JSON.stringify(result, null, 2)); return (preview ? result.ready : result.complete) ? 0 : 1;
    } catch { output.error('Unable to prepare local AEM knowledge import. Check source and target directories.'); return 1; }
  }
  if (args[0] === 'aem-project-inspect') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await inspectAemProjectLayout({ path: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.limited ? 1 : 0; }
    catch { output.error('Unable to inspect AEM project layout. Check the directory and permissions.'); return 1; }
  }
  if (args[0] === 'aem-configured-components') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await searchConfiguredAemComponents({ cwd, name: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.allRootsInspected ? 0 : 1; }
    catch { output.error('Unable to search configured AEM components. Check settings and component name.'); return 1; }
  }
  if (args[0] === 'aem-configured-search-report') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await saveConfiguredAemSearch({ cwd, resourceType: args[1], outputPath: args[2] }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Search report already exists; it was not overwritten.' : 'Unable to save configured AEM content search. Check settings and paths.'); return 1; }
  }
  if (args[0] === 'aem-configured-search') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await searchConfiguredAemContent({ cwd, resourceType: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch { output.error('Unable to search configured AEM content. Check settings and resource type.'); return 1; }
  }
  if (args[0] === 'aem-project-status') {
    if (args.length !== 1) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectAemProjectSettings({ cwd }), null, 2)); return 0; }
    catch { output.error('Unable to inspect AEM settings. Check the configuration and project directory.'); return 1; }
  }
  if (args[0] === 'aem-project-init') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); output.log(JSON.stringify(await initializeAemProject({ cwd, config }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'AEM configuration already exists; it was not overwritten.' : 'Unable to initialize AEM settings. Check explicit paths and configuration.'); return 1; }
  }
  if (args[0] === 'aem-source-usage-report') {
    const withBase = args.length === 6 && args[4] === '--jcr-base' && !!args[5]?.trim();
    if ((args.length !== 4 && !withBase) || args.slice(1, 4).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await saveAemSourceUsage({ path: args[1], resourceType: args[2], outputPath: args[3], ...(withBase ? { jcrBase: args[5] } : {}) }); output.log(JSON.stringify(result, null, 2)); return result.limited ? 1 : 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Reference report already exists; it was not overwritten.' : 'Unable to save local AEM content references. Check the paths and resource type.'); return 1; }
  }
  if (args[0] === 'aem-source-usage') {
    const withBase = args.length === 5 && args[3] === '--jcr-base' && !!args[4]?.trim();
    if ((args.length !== 3 && !withBase) || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { const result = await findAemSourceUsage({ path: args[1], resourceType: args[2], ...(withBase ? { jcrBase: args[4] } : {}) }); output.log(JSON.stringify(result, null, 2)); return result.limited ? 1 : 0; }
    catch { output.error('Unable to inspect local AEM content references. Check the directory and resource type.'); return 1; }
  }
  if (args[0] === 'aem-clientlibs-overview' || args[0] === 'aem-clientlibs-report') {
    const saving = args[0] === 'aem-clientlibs-report';
    if (args.length !== (saving ? 3 : 2) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const result = saving ? await saveAemClientlibsOverview({ path: args[1], outputPath: args[2] }) : await inspectAemClientlibsOverview({ path: args[1] });
      output.log(JSON.stringify(result, null, 2)); return 0;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Client library report already exists; it was not overwritten.' : 'Unable to inspect local client libraries. Check paths and limits.'); return 1; }
  }
  if (args[0] === 'aem-clientlib-files') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectAemClientlibFiles({ path: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect local client library manifests. Check the directory.'); return 1; }
  }
  if (args[0] === 'aem-clientlibs') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectAemClientlibs({ path: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect local client libraries. Check the path and search limits.'); return 1; }
  }
  if (args[0] === 'aem-editorial-guide') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveAemEditorialGuide({ dialogPath: args[1], outputPath: args[2] }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Field reference already exists; it was not overwritten.' : 'Unable to create the local dialog field reference.'); return 1; }
  }
  if (args[0] === 'aem-qa-status') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectAemQaHandoff(args[1]), null, 2)); return 0; }
    catch { output.error('Unable to inspect AEM QA handoff. Check its path and format.'); return 1; }
  }
  if (args[0] === 'aem-qa-handoff') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveAemQaHandoff({ inputPath: args[1], outputPath: args[2] }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'QA handoff already exists; it was not overwritten.' : 'Unable to create AEM QA handoff. Check input and destination.'); return 1; }
  }
  if (args[0] === 'aem-component-overview-report') {
    const withRoot = args.length === 5 && args[3] === '--jcr-root' && !!args[4]?.trim();
    if ((args.length !== 3 && !withRoot) || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveAemComponentOverview({ path: args[1], outputPath: args[2], ...(withRoot ? { jcrRoot: args[4] } : {}) }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Overview report already exists; it was not overwritten.' : 'Unable to save local component overview. Check paths and permissions.'); return 1; }
  }
  if (args[0] === 'aem-component-overview') {
    const withRoot = args.length === 4 && args[2] === '--jcr-root' && !!args[3]?.trim();
    if ((args.length !== 2 && !withRoot) || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectAemComponentOverview({ path: args[1], ...(withRoot ? { jcrRoot: args[3] } : {}) }), null, 2)); return 0; }
    catch { output.error('Unable to inspect the local component. Check the component path and permissions.'); return 1; }
  }
  if (args[0] === 'aem-doctor-component' || args[0] === 'aem-doctor-osgi') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = args[0] === 'aem-doctor-component' ? await inspectAemComponent({ path: args[1] }) : await inspectOsgiConfigs({ path: args[1] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to inspect the local AEM files.'); return 1; }
  }
  if (args[0] === 'security-evidence') {
    if (args.length !== 3 || !/^[a-f0-9]{40,64}$/i.test(args[1]) || !args[2]?.trim()) { output.error(usage); return 2; }
    try { const result = await saveSecurityEvidence({ cwd, base: args[1], outputPath: args[2] }); output.log(JSON.stringify(result, null, 2)); return result.complete && result.findingCount === 0 ? 0 : 1; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Evidence file already exists; it was not overwritten.' : 'Unable to record local security evidence. Check the base, repository and scan limits.'); return 1; }
  }
  if (args[0] === 'security-scan-commit' || args[0] === 'security-scan-history') {
    if (args.length !== 2 || !/^[a-f0-9]{40,64}$/i.test(args[1])) { output.error(usage); return 2; }
    try { const result = args[0] === 'security-scan-history' ? await scanCommitHistory({ cwd, base: args[1] }) : await scanCommittedChanges({ cwd, base: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.complete && result.findings.length === 0 ? 0 : 1; }
    catch { output.error('Unable to complete the committed-change scan. Check the base commit, repository and scan limits.'); return 1; }
  }
  if (args[0] === 'commit-preview') {
    if (args.length !== 1) { output.error(usage); return 2; }
    try { const result = await previewCommit({ cwd }); output.log(JSON.stringify(result, null, 2)); return result.stable ? 0 : 1; }
    catch { output.error('Unable to inspect Git changes. Check the repository and size limits.'); return 1; }
  }
  if (args[0] === 'security-scan') {
    if (args.length !== 1) { output.error(usage); return 2; }
    try { const result = await scanChangedFiles({ cwd }); output.log(JSON.stringify(result, null, 2)); return result.complete && result.findings.length === 0 ? 0 : 1; }
    catch { output.error('Unable to complete the local security scan. Check the repository and scan limits.'); return 1; }
  }
  if (args[0] === 'gitlab-webhook-claim' || args[0] === 'bitbucket-webhook-claim') {
    const provider = args[0] === 'gitlab-webhook-claim' ? 'gitlab' : 'bitbucket-cloud';
    if (args.length !== 5 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    const secret = provider === 'gitlab' ? env.GITLAB_WEBHOOK_SIGNING_TOKEN : env.BITBUCKET_WEBHOOK_SECRET;
    if (!secret) { output.error(provider === 'gitlab' ? 'Set GITLAB_WEBHOOK_SIGNING_TOKEN in the environment.' : 'Set BITBUCKET_WEBHOOK_SECRET in the environment.'); return 2; }
    try {
      const policy = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const headers = JSON.parse((await readLimitedFile(args[2], 16384)).toString('utf8'));
      const body = await readLimitedFile(args[3], 1024 * 1024);
      const providerPolicy = provider === 'gitlab' ? (policy.gitlab ?? policy) : (policy.bitbucket ?? policy);
      const result = await claimExternalWebhook({ provider, body, headers, policy: providerPolicy, secret, directory: args[4] });
      output.log(JSON.stringify(result, null, 2)); return result.claimed ? 0 : 1;
    } catch { output.error('Unable to claim webhook. Check policy, signature and store.'); return 1; }
  }
  if (args[0] === 'bitbucket-webhook-inspect') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    if (!env.BITBUCKET_WEBHOOK_SECRET) { output.error('Set BITBUCKET_WEBHOOK_SECRET in the environment.'); return 2; }
    try {
      const policy = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const headers = JSON.parse((await readLimitedFile(args[2], 16384)).toString('utf8'));
      const body = await readLimitedFile(args[3], 1024 * 1024);
      const selected = policy.bitbucket ?? policy;
      const result = inspectBitbucketWebhook({ body, secret: env.BITBUCKET_WEBHOOK_SECRET, signature: headers.signature, event: headers.event, allowedRepositories: selected.allowedRepositories, allowedActors: selected.allowedActors });
      output.log(JSON.stringify(result, null, 2)); return result.accepted ? 0 : 1;
    } catch { output.error('Unable to inspect Bitbucket webhook. Check policy, signature and body.'); return 1; }
  }
  if (args[0] === 'gitlab-webhook-inspect') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    if (!env.GITLAB_WEBHOOK_SIGNING_TOKEN) { output.error('Set GITLAB_WEBHOOK_SIGNING_TOKEN in the environment.'); return 2; }
    try {
      const policy = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const headers = JSON.parse((await readLimitedFile(args[2], 16384)).toString('utf8'));
      const body = await readLimitedFile(args[3], 1024 * 1024);
      const selected = policy.gitlab ?? policy;
      const result = inspectGitLabWebhook({ body, signingToken: env.GITLAB_WEBHOOK_SIGNING_TOKEN, id: headers.id, timestamp: headers.timestamp, signature: headers.signature, event: headers.event, allowedProjects: selected.allowedProjects, allowedActors: selected.allowedActors });
      output.log(JSON.stringify(result, null, 2)); return result.accepted ? 0 : 1;
    } catch { output.error('Unable to inspect GitLab webhook. Check policy, signature headers and body.'); return 1; }
  }
  if (args[0] === 'ado-webhook-claim' || args[0] === 'ado-webhook-listen') {
    const listening = args[0].endsWith('-listen');
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim()) || (listening && (!/^[1-9][0-9]*$/.test(args[3]) || Number(args[3]) < 1024 || Number(args[3]) > 65535))) { output.error(usage); return 2; }
    if (!env.ADO_WEBHOOK_USERNAME || !env.ADO_WEBHOOK_PASSWORD || (!listening && !env.ADO_WEBHOOK_AUTHORIZATION)) { output.error('Set Azure webhook credentials in the environment.'); return 2; }
    try {
      const configured = JSON.parse((await readLimitedFile(args[1], 65536)).toString('utf8')), policy = configured.ado ?? configured;
      if (listening) { const server = await startAdoWebhookListener({ port: Number(args[3]), username: env.ADO_WEBHOOK_USERNAME, password: env.ADO_WEBHOOK_PASSWORD, policy, directory: args[2] }); server.on('error', () => output.error('Azure webhook listener encountered an error.')); output.log(JSON.stringify({ provider: 'ado', listening: '127.0.0.1', port: Number(args[3]), path: '/webhook', scope: 'Separate local claims only; no queue, execution or public deployment.' })); return 0; }
      const body = await readLimitedFile(args[2], 1024 * 1024), result = await claimAdoWebhook({ body, authorization: env.ADO_WEBHOOK_AUTHORIZATION, username: env.ADO_WEBHOOK_USERNAME, password: env.ADO_WEBHOOK_PASSWORD, policy, directory: args[3] }); output.log(JSON.stringify(result, null, 2)); return result.claimed ? 0 : 1;
    } catch { output.error('Unable to claim or receive Azure event. Check policy, credentials, store and port.'); return 1; }
  }
  if (args[0] === 'ado-webhook-inspect') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    if (!env.ADO_WEBHOOK_USERNAME || !env.ADO_WEBHOOK_PASSWORD || !env.ADO_WEBHOOK_AUTHORIZATION) { output.error('Set ADO_WEBHOOK_USERNAME, ADO_WEBHOOK_PASSWORD and ADO_WEBHOOK_AUTHORIZATION in the environment.'); return 2; }
    try { const policy = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')), body = await readLimitedFile(args[2], 1024 * 1024); const result = inspectAdoWebhook({ body, authorization: env.ADO_WEBHOOK_AUTHORIZATION, username: env.ADO_WEBHOOK_USERNAME, password: env.ADO_WEBHOOK_PASSWORD, allowedRepositories: policy.allowedRepositories, allowedAuthors: policy.allowedAuthors }); output.log(JSON.stringify(result, null, 2)); return result.accepted ? 0 : 1; }
    catch { output.error('Unable to inspect the Azure webhook. Check the policy and payload.'); return 1; }
  }
  if (args[0] === 'automation-batch-plan' || args[0] === 'automation-batch-run') {
    const running = args[0].endsWith('-run');
    if (args.length !== (running ? 6 : 5) || args.slice(1, 5).some(value => !value?.trim()) || (running && !/^[a-f0-9]{64}$/.test(args[5]))) { output.error(usage); return 2; }
    try { const claimDigests = JSON.parse((await readLimitedFile(args[2], 262144)).toString('utf8')), command = JSON.parse((await readLimitedFile(args[3], 262144)).toString('utf8')); const result = await processAutomationBatch({ target: args[1], claimDigests, command, store: args[4], bitbucketToken: env.BITBUCKET_TOKEN, adoToken: env.ADO_PAT, ...(running ? { expectedDigest: args[5] } : {}) }); output.log(JSON.stringify(result, null, 2)); return running ? (result.completed ? 0 : 1) : (result.complete ? 0 : 1); }
    catch { output.error('Unable to prepare or run the automation batch. Inspect the job records and any partial results before retrying.'); return 1; }
  }
  if (args[0] === 'slack-notification-plan' || args[0] === 'slack-notification-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 4 : 3) || !args[1]?.trim() || !args[2]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[3]))) { output.error(usage); return 2; }
    if (!env.SLACK_WEBHOOK_URL) { output.error('Set SLACK_WEBHOOK_URL in the environment.'); return 2; }
    try { const result = await processSlackNotification({ destination: args[1], bodyPath: args[2], webhook: env.SLACK_WEBHOOK_URL, ...(sending ? { expectedDigest: args[3] } : {}) }); output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0; }
    catch { output.error(sending ? 'Unable to send notification or response was unclear. Inspect the channel before retrying; it may have been posted.' : 'Unable to preview the notification. Check the message, destination label and webhook.'); return 1; }
  }
  if (args[0] === 'automation-queue-status') {
    if (![3, 5].includes(args.length) || !args[1]?.trim() || !args[2]?.trim() || (args.length === 5 && (args[3] !== '--offset' || !/^(?:0|[1-9][0-9]{0,4})$/.test(args[4]) || Number(args[4]) > 10000))) { output.error(usage); return 2; }
    try { const result = await inspectAutomationQueueStatus({ target: args[1], store: args[2], offset: args.length === 5 ? Number(args[4]) : 0 }); output.log(JSON.stringify(result, null, 2)); return result.queueComplete && result.pageReadable ? 0 : 1; }
    catch { output.error('Unable to inspect the queue and execution store. Check project, policy and store.'); return 1; }
  }
  if (args[0] === 'automation-execution-status') {
    if (args.length !== 4 || !args[1]?.trim() || !/^[a-f0-9]{64}$/.test(args[2]) || !args[3]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectAutomationExecution({ target: args[1], claimDigest: args[2], store: args[3] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect the execution record. Check the target, claim and external store.'); return 1; }
  }
  if (args[0] === 'automation-job-plan' || args[0] === 'automation-job-run') {
    const running = args[0].endsWith('-run');
    if (args.length !== (running ? 6 : 5) || !args[1]?.trim() || !/^[a-f0-9]{64}$/.test(args[2]) || !args[3]?.trim() || !args[4]?.trim() || (running && !/^[a-f0-9]{64}$/.test(args[5]))) { output.error(usage); return 2; }
    try { const command = JSON.parse((await readLimitedFile(args[3], 262144)).toString('utf8')); const result = await processAutomationJob({ target: args[1], claimDigest: args[2], command, store: args[4], bitbucketToken: env.BITBUCKET_TOKEN, adoToken: env.ADO_PAT, ...(running ? { expectedDigest: args[5] } : {}) }); output.log(JSON.stringify(result, null, 2)); return running && (!result.started || result.status !== 'process-succeeded') ? 1 : 0; }
    catch { output.error('Unable to prepare or run the local job. Check the event, command, origin, clean state and execution record before retrying.'); return 1; }
  }
  if (args[0] === 'automation-context-export-batch') {
    if (args.length !== 5 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const digests = JSON.parse((await readLimitedFile(args[2], 262144)).toString('utf8')), config = JSON.parse((await readLimitedFile(args[3], 262144)).toString('utf8')); const result = await exportAutomationJobContextBatch({ target: args[1], digests, config, directory: args[4], env }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch { output.error('Unable to export the selected contexts. Check jobs, provider configuration and output directory.'); return 1; }
  }
  if (args[0] === 'automation-context-export') {
    if (args.length !== 5 || !args[1]?.trim() || !/^[a-f0-9]{64}$/.test(args[2]) || !args[3]?.trim() || !args[4]?.trim()) { output.error(usage); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[3], 262144)).toString('utf8')); output.log(JSON.stringify(await exportAutomationJobContext({ target: args[1], digest: args[2], config, outputPath: args[4], env }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Output already exists; it was not overwritten.' : 'Unable to export context. Inspect the local job, provider access and output path before retrying.'); return 1; }
  }
  if (args[0] === 'automation-context-batch') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const digests = JSON.parse((await readLimitedFile(args[2], 262144)).toString('utf8')), config = JSON.parse((await readLimitedFile(args[3], 262144)).toString('utf8')); const result = await readAutomationJobContextBatch({ target: args[1], digests, config, env }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch { output.error('Unable to collect batch context. Check the selected jobs and provider configuration.'); return 1; }
  }
  if (args[0] === 'automation-job-context') {
    if (args.length !== 4 || !args[1]?.trim() || !/^[a-f0-9]{64}$/.test(args[2]) || !args[3]?.trim()) { output.error(usage); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[3], 262144)).toString('utf8')); const result = await readAutomationJobContext({ target: args[1], digest: args[2], config, env }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to collect job context. Check the queue, policy, provider identity and access.'); return 1; }
  }
  if (args[0] === 'automation-enqueue-batch-plan' || args[0] === 'automation-enqueue-batch-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 4 : 3) || !args[1]?.trim() || !args[2]?.trim() || (applying && !/^[a-f0-9]{64}$/.test(args[3]))) { output.error(usage); return 2; }
    try { const digests = JSON.parse((await readLimitedFile(args[2], 262144)).toString('utf8')); const result = await processAutomationEnqueueBatch({ target: args[1], digests, ...(applying ? { expectedDigest: args[3] } : {}) }); output.log(JSON.stringify(result, null, 2)); return (applying ? result.completed : result.complete) ? 0 : 1; }
    catch { output.error('Unable to preview or enqueue claims. Inspect local claims and queue before retrying.'); return 1; }
  }
  if (args[0] === 'automation-enqueue' || args[0] === 'automation-jobs') {
    const enqueue = args[0] === 'automation-enqueue';
    if (args.length !== (enqueue ? 3 : 2) || !args[1]?.trim() || (enqueue && !/^[a-f0-9]{64}$/.test(args[2]))) { output.error(usage); return 2; }
    try { const result = enqueue ? await enqueueAutomationClaim({ target: args[1], digest: args[2] }) : await listAutomationJobs({ target: args[1] }); output.log(JSON.stringify(result, null, 2)); return enqueue || result.complete ? 0 : 1; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Job already exists; it was not overwritten.' : 'Unable to queue or inspect automation jobs. Check local policy and claim records.'); return 1; }
  }
  if (args[0] === 'automation-doctor') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await diagnoseLocalAutomation({ target: args[1], env }); output.log(JSON.stringify(result, null, 2)); return result.needsInspection ? 1 : 0; }
    catch { output.error('Unable to diagnose local automation. Check the project path and local files.'); return 1; }
  }
  if (args[0] === 'automation-init' || args[0] === 'automation-status') {
    const initializing = args[0] === 'automation-init';
    if (args.length !== (initializing ? 3 : 2) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const result = initializing ? await initializeLocalAutomation({ target: args[2], config: JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')) }) : await inspectLocalAutomation({ target: args[1], env });
      output.log(JSON.stringify(result, null, 2)); return initializing || (result.configured && !['incomplete', 'unavailable'].includes(result.claims.status)) ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Automation policy already exists; it was not overwritten.' : 'Unable to inspect or initialize local automation. Check policy and target paths.'); return 1; }
  }
  if (args[0] === 'project-doctor') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      output.log(JSON.stringify(inspectProviderConfiguration({ config, env }), null, 2));
      return 0;
    } catch { output.error('Unable to inspect provider configuration. Check supported fields and file format.'); return 1; }
  }
  if (args[0] === 'project-conventions') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await inspectProjectConventions({ path: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.limited || result.skipped.length ? 1 : 0; }
    catch { output.error('Unable to inspect project conventions. Check the Git project and scan limits.'); return 1; }
  }
  if (args[0] === 'project-profile') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await inspectProjectProfile({ path: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.scanLimited || result.warnings.length ? 1 : 0; }
    catch { output.error('Unable to inspect project profile. Check the directory and local files.'); return 1; }
  }
  if (args[0] === 'project-inspect') {
    if (args.length !== 1) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectProject({ cwd }), null, 2)); return 0; }
    catch { output.error('Unable to inspect the project.'); return 1; }
  }
  if (args[0] === 'ticket-file-search') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await searchTicketFiles({ cwd, inputPath: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.untrackedComplete === false ? 1 : 0; }
    catch { output.error('Unable to search ticket terms. Check the Git repository and selected terms.'); return 1; }
  }
  if (['github-issue-comment-plan', 'github-issue-comment-send', 'github-review-reply-plan', 'github-review-reply-send'].includes(args[0])) {
    const review = args[0].startsWith('github-review-'), sending = args[0].endsWith('-send'), base = review ? 5 : 4;
    if (args.length !== base + (sending ? 1 : 0) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || (review && (!/^[1-9][0-9]*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3])))) || !args[review ? 4 : 3]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[base]))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitHubComment({ kind: review ? 'review-reply' : 'issue-comment', number: Number(args[2]), ...(review ? { commentId: Number(args[3]) } : {}), bodyPath: args[review ? 4 : 3], config: review ? config.scm : config.tracker, token: env.GITHUB_TOKEN, ...(sending ? { expectedDigest: args[base] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send comment or response was unclear. Inspect GitHub before retrying; it may have been sent.' : 'Unable to preview comment. Check the provider, target, message and access.'); return 1; }
  }
  if (args[0] === 'ci-diagnosis-save' || args[0] === 'ci-diagnosis-check') {
    const checking = args[0].endsWith('-check');
    if (args.length !== (checking ? 3 : 4) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')), provider = config.ci?.provider;
      const credentials = { 'github-actions': env.GITHUB_TOKEN, 'gitlab-ci': env.GITLAB_TOKEN, 'ado-pipelines': env.ADO_PAT, 'bitbucket-pipelines': env.BITBUCKET_TOKEN };
      if (!Object.hasOwn(credentials, provider) || !credentials[provider]) throw new Error('Supported provider and credentials required');
      const bitbucket = provider === 'bitbucket-pipelines';
      if (!checking && (bitbucket ? !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(args[2]) : !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])))) throw new Error('Invalid run ID');
      const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN, gitlabToken: env.GITLAB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN });
      const result = checking ? await checkCiDiagnosis({ ci, config: config.ci, inputPath: args[2] }) : await saveCiDiagnosis({ ci, config: config.ci, id: bitbucket ? args[2] : Number(args[2]), outputPath: args[3] });
      output.log(JSON.stringify(result, null, 2)); return checking && !result.matches ? 1 : 0;
    } catch { output.error('Unable to save or compare CI diagnosis. Check provider, run, evidence and access.'); return 1; }
  }
  if (args[0] === 'ci-cancel-plan' || args[0] === 'ci-cancel-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 4 : 3) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || (applying && !/^[a-f0-9]{64}$/.test(args[3]))) { output.error(usage); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const token = config.ci?.provider === 'github-actions' ? env.GITHUB_TOKEN : config.ci?.provider === 'gitlab-ci' ? env.GITLAB_TOKEN : null; if (!token) throw new Error('Supported provider and token required'); const result = await processCiCancel({ config: config.ci, id: Number(args[2]), token, ...(applying ? { expectedDigest: args[3] } : {}) }); output.log(JSON.stringify(result, null, 2)); return applying && !result.accepted ? 1 : 0; }
    catch { output.error(applying ? 'Unable to request cancellation or response was unclear. Inspect the provider before retrying; it may have been requested.' : 'Unable to preview cancellation. Check provider, active run and access.'); return 1; }
  }
  if (args[0] === 'ci-retry-plan' || args[0] === 'ci-retry-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 4 : 3) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || (applying && !/^[a-f0-9]{64}$/.test(args[3]))) { output.error(usage); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const token = config.ci?.provider === 'github-actions' ? env.GITHUB_TOKEN : config.ci?.provider === 'gitlab-ci' ? env.GITLAB_TOKEN : null; if (!token) throw new Error('Supported provider and token required'); const result = await processCiRetry({ config: config.ci, id: Number(args[2]), token, ...(applying ? { expectedDigest: args[3] } : {}) }); output.log(JSON.stringify(result, null, 2)); return applying && !result.accepted ? 1 : 0; }
    catch { output.error(applying ? 'Unable to request retry or response was unclear. Inspect the provider before retrying; it may have started.' : 'Unable to preview CI retry. Check provider, failed jobs and access.'); return 1; }
  }
  if (args[0] === 'ci-run-diagnose') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')), provider = config.ci?.provider;
      const credentials = { 'github-actions': env.GITHUB_TOKEN, 'gitlab-ci': env.GITLAB_TOKEN, 'ado-pipelines': env.ADO_PAT, 'bitbucket-pipelines': env.BITBUCKET_TOKEN };
      if (!Object.hasOwn(credentials, provider) || !credentials[provider]) throw new Error('Supported provider and credentials required');
      const bitbucket = provider === 'bitbucket-pipelines';
      if (bitbucket ? !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(args[2]) : !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) throw new Error('Invalid run ID');
      const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN, gitlabToken: env.GITLAB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN });
      const result = await diagnoseCiRun({ ci, id: bitbucket ? args[2] : Number(args[2]) }); output.log(JSON.stringify(result, null, 2)); return result.complete === false ? 1 : 0;
    } catch { output.error('Unable to inspect CI run. Check provider, ID and access.'); return 1; }
  }
  if (args[0] === 'skill-restore-plan' || args[0] === 'skill-restore-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 6 : 5) || !['codex', 'claude', 'copilot'].includes(args[1]) || args.slice(2, 5).some(value => !value?.trim()) || (applying && !/^[a-f0-9]{64}$/.test(args[5]))) { output.error(usage); return 2; }
    try { const result = await processSkillRestore({ client: args[1], target: args[2], name: args[3], backupPath: args[4], ...(applying ? { expectedDigest: args[5] } : {}) }); output.log(JSON.stringify(result, null, 2)); return applying && !result.restored ? 1 : 0; }
    catch { output.error('Unable to preview or restore the skill backup. Inspect the target and backups before retrying.'); return 1; }
  }
  if (args[0] === 'skill-sync-plan' || args[0] === 'skill-sync-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 5 : 4) || !['codex', 'claude', 'copilot'].includes(args[1]) || !args[2]?.trim() || !args[3]?.trim() || (applying && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    try { const targets = JSON.parse((await readLimitedFile(args[3], 262144)).toString('utf8')); const result = await processSkillSync({ client: args[1], name: args[2], targets, ...(applying ? { expectedDigest: args[4] } : {}) }); output.log(JSON.stringify(result, null, 2)); return applying ? (result.updated ? 0 : 1) : (result.complete ? 0 : 1); }
    catch { output.error('Unable to prepare or apply skill sync. Check targets and inspect partial results before retrying.'); return 1; }
  }
  if (args[0] === 'bitbucket-step-log-plan' || args[0] === 'bitbucket-step-log-save') {
    const saving = args[0].endsWith('-save'), uuid = value => /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(value);
    if (args.length !== (saving ? 6 : 4) || !args[1]?.trim() || !uuid(args[2]) || !uuid(args[3]) || (saving && (!args[4]?.trim() || !/^[a-f0-9]{64}$/.test(args[5])))) { output.error(usage); return 2; }
    if (!env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const result = await processBitbucketStepLog({ config: config.ci, pipelineId: args[2], stepId: args[3], token: env.BITBUCKET_TOKEN, ...(saving ? { outputPath: args[4], expectedDigest: args[5] } : {}) }); output.log(JSON.stringify(result, null, 2)); return saving && !result.saved ? 1 : 0; }
    catch { output.error('Unable to preview or save Bitbucket step log. Check pipeline, step, host, access, size and output collision.'); return 1; }
  }
  if (args[0] === 'github-job-log-plan' || args[0] === 'github-job-log-save') {
    const saving = args[0].endsWith('-save');
    if (args.length !== (saving ? 6 : 4) || !args[1]?.trim() || args.slice(2, 4).some(value => !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) || (saving && (!args[4]?.trim() || !/^[a-f0-9]{64}$/.test(args[5])))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const result = await processGitHubJobLog({ config: config.ci, runId: Number(args[2]), jobId: Number(args[3]), token: env.GITHUB_TOKEN, ...(saving ? { outputPath: args[4], expectedDigest: args[5] } : {}) }); output.log(JSON.stringify(result, null, 2)); return saving && !result.saved ? 1 : 0; }
    catch { output.error('Unable to preview or save GitHub job log. Check run, job, destination host, access, size and output collision.'); return 1; }
  }
  if (args[0] === 'ci-log-compare') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await compareCiLogCandidates({ beforePath: args[1], afterPath: args[2] }), null, 2)); return 0; }
    catch { output.error('Unable to compare local CI logs. Check their size and text encoding.'); return 1; }
  }
  if (args[0] === 'ci-log-candidates') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectCiLogCandidates({ path: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect the local CI log. Check its size and text encoding.'); return 1; }
  }
  if (args[0] === 'readiness-init') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const input = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); output.log(JSON.stringify(await initializeReadiness({ cwd, input }), null, 2)); return 0; }
    catch { output.error('Unable to initialize readiness settings. Check input and existing configuration.'); return 1; }
  }
  if (args[0] === 'project-provider-propose') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await proposeProjectProviders({ target: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect project provider candidates. Check the project directory.'); return 1; }
  }
  if (args[0] === 'skill-upgrade-plan' || args[0] === 'skill-upgrade-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 5 : 4) || !['codex', 'claude', 'copilot'].includes(args[1]) || !args[2]?.trim() || !args[3]?.trim() || (applying && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    try { const result = await processSkillUpgrade({ client: args[1], target: args[2], name: args[3], ...(applying ? { expectedDigest: args[4] } : {}) }); output.log(JSON.stringify(result, null, 2)); return applying && !result.updated ? 1 : 0; }
    catch { output.error('Unable to prepare or apply the skill upgrade. Inspect the target and any staged or backup directories before retrying.'); return 1; }
  }
  if (args[0] === 'skill-audit') {
    if (args.length !== 3 || !['codex', 'claude', 'copilot'].includes(args[1]) || !args[2]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await auditInstalledSkills({ client: args[1], target: args[2] }), null, 2)); return 0; }
    catch { output.error('Unable to audit installed skills. Check project, client and directory limits.'); return 1; }
  }
  if (args[0] === 'project-workflow-doctor') {
    if (args.length !== 3 || !args[1]?.trim() || !['codex', 'claude', 'copilot'].includes(args[2])) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectWorkflowSetup({ target: args[1], client: args[2], env }), null, 2)); return 0; }
    catch { output.error('Unable to inspect local workflow setup. Check project path and client.'); return 1; }
  }
  if (args[0] === 'ado-build-log') {
    if (args.length !== 5 || !args[1]?.trim() || args.slice(2, 4).some(value => !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) || !args[4]?.trim()) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== 'ado-pipelines') throw new Error('CI provider mismatch'); const ci = makeCi(config.ci, { adoToken: env.ADO_PAT }); const result = await saveAzureBuildLog({ ci, buildId: Number(args[2]), logId: Number(args[3]), outputPath: args[4] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to save Azure build log. Check build, log, access, size and output collision.'); return 1; }
  }
  if (args[0] === 'gitlab-job-log') {
    if (args.length !== 5 || !args[1]?.trim() || args.slice(2, 4).some(value => !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) || !args[4]?.trim()) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== 'gitlab-ci') throw new Error('CI provider mismatch'); const ci = makeCi(config.ci, { gitlabToken: env.GITLAB_TOKEN }); const result = await saveGitLabJobLog({ ci, pipelineId: Number(args[2]), jobId: Number(args[3]), outputPath: args[4] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to save GitLab job log. Check pipeline, job, access, size and output collision.'); return 1; }
  }
  if (args[0] === 'bitbucket-pipeline-steps') {
    if (args.length !== 3 || !args[1]?.trim() || !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(args[2])) { output.error(usage); return 2; }
    if (!env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== 'bitbucket-pipelines') throw new Error('CI provider mismatch'); const ci = makeCi(config.ci, { bitbucketToken: env.BITBUCKET_TOKEN }); const result = await readBitbucketPipelineSteps({ ci, pipelineId: args[2] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to inspect Bitbucket pipeline steps. Check the pipeline, provider and access.'); return 1; }
  }
  if (args[0] === 'ado-build-timeline') {
    if (args.length !== 3 || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== 'ado-pipelines') throw new Error('CI provider mismatch'); const ci = makeCi(config.ci, { adoToken: env.ADO_PAT }); const result = await readAzureBuildTimeline({ ci, buildId: Number(args[2]) }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to inspect Azure build timeline. Check the build, provider and access.'); return 1; }
  }
  if (args[0] === 'gitlab-pipeline-jobs') {
    if (args.length !== 3 || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== 'gitlab-ci') throw new Error('CI provider mismatch'); const ci = makeCi(config.ci, { gitlabToken: env.GITLAB_TOKEN }); const result = await readGitLabPipelineJobs({ ci, pipelineId: Number(args[2]) }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch { output.error('Unable to inspect GitLab pipeline jobs. Check the pipeline, provider and access.'); return 1; }
  }
  if (args[0] === 'github-run-jobs') {
    if (args.length !== 3 || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== 'github-actions') throw new Error('CI provider mismatch'); const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN }); const result = await readGitHubRunJobs({ ci, runId: Number(args[2]) }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch { output.error('Unable to inspect GitHub Actions jobs. Check the run, provider and access.'); return 1; }
  }
  if (args[0] === 'ado-inline-plan' || args[0] === 'ado-inline-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 9 : 8) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !/^[a-f0-9]{40,64}$/i.test(args[3]) || !args[4]?.trim() || !['LEFT', 'RIGHT'].includes(args[5]) || !/^[1-9][0-9]*$/.test(args[6]) || !Number.isSafeInteger(Number(args[6])) || !args[7]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[8]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const result = await processAzureInline({ config: config.scm, number: Number(args[2]), reviewedSha: args[3], path: args[4], side: args[5], line: Number(args[6]), bodyPath: args[7], token: env.ADO_PAT, ...(sending ? { expectedDigest: args[8] } : {}) }); output.log(JSON.stringify(result, null, 2)); return sending && (!result.sent || !result.positionVerified) ? 1 : 0; }
    catch { output.error(sending ? 'Unable to send inline thread or response was unclear. Inspect Azure before retrying; it may have been sent.' : 'Unable to preview inline thread. Check PR, reviewed revision, file, iteration and access.'); return 1; }
  }
  if (args[0] === 'ado-pr-iterations' || args[0] === 'ado-pr-latest-changes') {
    const changes = args[0] === 'ado-pr-latest-changes';
    if (args.length !== (changes ? 4 : 3) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || (changes && !/^[a-f0-9]{40,64}$/i.test(args[3]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.scm?.provider !== 'ado') throw new Error('SCM provider mismatch'); const scm = makeScm(config.scm, { adoToken: env.ADO_PAT }); const result = changes ? await readAzureLatestIterationChanges({ scm, number: Number(args[2]), reviewedSha: args[3] }) : await readAzurePrIterations({ scm, number: Number(args[2]) }); output.log(JSON.stringify(result, null, 2)); return changes && !result.paginationComplete ? 1 : 0; }
    catch { output.error('Unable to inspect Azure PR iterations. Check the PR, reviewed revision and access.'); return 1; }
  }
  if (args[0] === 'bitbucket-inline-plan' || args[0] === 'bitbucket-inline-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 8 : 7) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !args[3]?.trim() || !['LEFT', 'RIGHT'].includes(args[4]) || !/^[1-9][0-9]*$/.test(args[5]) || !Number.isSafeInteger(Number(args[5])) || !args[6]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[7]))) { output.error(usage); return 2; }
    if (!env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const result = await processBitbucketInline({ config: config.scm, number: Number(args[2]), path: args[3], side: args[4], line: Number(args[5]), bodyPath: args[6], token: env.BITBUCKET_TOKEN, ...(sending ? { expectedDigest: args[7] } : {}) }); output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0; }
    catch { output.error(sending ? 'Unable to send inline comment or response was unclear. Inspect Bitbucket before retrying; it may have been sent.' : 'Unable to preview inline comment. Check PR, diff, path, line and access.'); return 1; }
  }
  if (args[0] === 'bitbucket-approval-plan' || args[0] === 'bitbucket-approval-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 5 : 4) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !/^[a-f0-9]{40,64}$/i.test(args[3]) || (applying && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    if (!env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processBitbucketApproval({ config: config.scm, number: Number(args[2]), reviewedSha: args[3], token: env.BITBUCKET_TOKEN, ...(applying ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return applying && (!result.accepted || result.revisionMatches !== true) ? 1 : 0;
    } catch { output.error(applying ? 'Unable to request approval or response was unclear. Inspect Bitbucket before retrying; it may have been approved.' : 'Unable to preview approval. Check PR, reviewed SHA and access.'); return 1; }
  }
  if (args[0] === 'gitlab-approval-plan' || args[0] === 'gitlab-approval-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 5 : 4) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !/^[a-f0-9]{40,64}$/i.test(args[3]) || (applying && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitLabApproval({ config: config.scm, number: Number(args[2]), reviewedSha: args[3], token: env.GITLAB_TOKEN, ...(applying ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return applying && (!result.accepted || !result.userHasApproved) ? 1 : 0;
    } catch { output.error(applying ? 'Unable to request approval or response was unclear. Inspect GitLab before retrying; it may have been approved.' : 'Unable to preview approval. Check MR, reviewed SHA, eligibility and access.'); return 1; }
  }
  if (args[0] === 'gitlab-inline-plan' || args[0] === 'gitlab-inline-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 8 : 7) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !args[3]?.trim() || !['LEFT', 'RIGHT'].includes(args[4]) || !/^[1-9][0-9]*$/.test(args[5]) || !Number.isSafeInteger(Number(args[5])) || !args[6]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[7]))) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitLabInline({ config: config.scm, number: Number(args[2]), path: args[3], side: args[4], line: Number(args[5]), bodyPath: args[6], token: env.GITLAB_TOKEN, ...(sending ? { expectedDigest: args[7] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send inline discussion or response was unclear. Inspect GitLab before retrying; it may have been sent.' : 'Unable to preview inline discussion. Check MR, path, returned diff, line and access.'); return 1; }
  }
  if (args[0] === 'github-inline-plan' || args[0] === 'github-inline-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 8 : 7) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !args[3]?.trim() || !['LEFT', 'RIGHT'].includes(args[4]) || !/^[1-9][0-9]*$/.test(args[5]) || !Number.isSafeInteger(Number(args[5])) || !args[6]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[7]))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitHubInline({ config: config.scm, number: Number(args[2]), path: args[3], side: args[4], line: Number(args[5]), bodyPath: args[6], token: env.GITHUB_TOKEN, ...(sending ? { expectedDigest: args[7] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send inline comment or response was unclear. Inspect GitHub before retrying; it may have been sent.' : 'Unable to preview inline comment. Check PR, file list, returned patch, line and access.'); return 1; }
  }
  if (args[0] === 'scm-comment-plan' || args[0] === 'scm-comment-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 5 : 4) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !args[3]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const tokens = { github: env.GITHUB_TOKEN, gitlab: env.GITLAB_TOKEN, 'bitbucket-cloud': env.BITBUCKET_TOKEN, ado: env.ADO_PAT };
      const token = tokens[config.scm?.provider]; if (!token) throw new Error('Supported SCM provider and token required');
      const result = await processScmComment({ config: config.scm, number: Number(args[2]), bodyPath: args[3], token, ...(sending ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send comment or response was unclear. Inspect the provider before retrying; it may have been sent.' : 'Unable to preview comment. Check provider, pull request, message and access.'); return 1; }
  }
  if (args[0] === 'github-review-plan' || args[0] === 'github-review-submit') {
    const submitting = args[0].endsWith('-submit');
    if (args.length !== (submitting ? 6 : 5) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(args[3]) || !args[4]?.trim() || (submitting && !/^[a-f0-9]{64}$/.test(args[5]))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitHubReview({ config: config.scm, number: Number(args[2]), event: args[3], bodyPath: args[4], token: env.GITHUB_TOKEN, ...(submitting ? { expectedDigest: args[5] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return submitting && !result.submitted ? 1 : 0;
    } catch { output.error(submitting ? 'Unable to submit review or response was unclear. Inspect GitHub before retrying; it may have been submitted.' : 'Unable to preview review. Check provider, pull request, body and access.'); return 1; }
  }
  if (args[0] === 'aem-screenshot-compare') {
    if (!(args.length === 4 || (args.length === 6 && args[4] === '--threshold' && /^(?:0|[1-9][0-9]{0,2})$/.test(args[5]) && Number(args[5]) <= 255)) || args.slice(1, 4).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await compareAemScreenshots({ project: args[1], beforePath: args[2], afterPath: args[3], ...(args.length === 6 ? { threshold: Number(args[5]) } : {}) }); output.log(JSON.stringify(result, null, 2)); return result.comparable ? 0 : 1; }
    catch { output.error('Unable to compare screenshots. Check Playwright and the input images.'); return 1; }
  }
  if (args[0] === 'aem-screenshot') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[2], 262144)).toString('utf8')); const auth = env.AEM_TOKEN ? { token: env.AEM_TOKEN } : env.AEM_USERNAME && env.AEM_PASSWORD ? { username: env.AEM_USERNAME, password: env.AEM_PASSWORD } : undefined; output.log(JSON.stringify(await captureAemScreenshot({ project: args[1], config, outputPath: args[3], auth }), null, 2)); return 0; }
    catch { output.error('Unable to capture the page. Check Playwright, URL, settings, access and output collision.'); return 1; }
  }
  if (args[0] === 'aem-live-node-compare') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await compareAemLiveNodes({ beforePath: args[1], afterPath: args[2] }), null, 2)); return 0; }
    catch { output.error('Unable to compare AEM node snapshots. Check their scope and contents.'); return 1; }
  }
  if (args[0] === 'aem-live-node' || args[0] === 'aem-live-node-snapshot') {
    const save = args[0].endsWith('-snapshot');
    if (args.length !== (save ? 5 : 4) || !args[1]?.trim() || !args[2]?.trim() || !/^[0-2]$/.test(args[3]) || (save && !args[4]?.trim())) { output.error(usage); return 2; }
    const auth = env.AEM_TOKEN ? { token: env.AEM_TOKEN } : env.AEM_USERNAME && env.AEM_PASSWORD ? { username: env.AEM_USERNAME, password: env.AEM_PASSWORD } : null;
    if (!auth) { output.error('Set AEM_TOKEN or AEM_USERNAME and AEM_PASSWORD in the environment.'); return 2; }
    try {
      const result = await readLiveAemNode({ authorUrl: args[1], path: args[2], depth: Number(args[3]), ...auth });
      if (save) { await writeFile(args[4], `${JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), ...result }, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); output.log(JSON.stringify({ path: args[4], scope: result.scope }, null, 2)); }
      else output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch { output.error('Unable to read or save the AEM node. Check target, access and output collision.'); return 1; }
  }
  if (args[0] === 'aem-live-usage-many') {
    if (args.length < 4 || args.length > 13 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    const auth = env.AEM_TOKEN ? { token: env.AEM_TOKEN } : env.AEM_USERNAME && env.AEM_PASSWORD ? { username: env.AEM_USERNAME, password: env.AEM_PASSWORD } : null;
    if (!auth) { output.error('Set AEM_TOKEN or AEM_USERNAME and AEM_PASSWORD in the environment.'); return 2; }
    try { const result = await searchLiveAemUsageMany({ authorUrl: args[1], resourceType: args[2], roots: args.slice(3), ...auth }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch { output.error('Unable to search the selected AEM roots. Check the origin, paths, resource type and access.'); return 1; }
  }
  if (args[0] === 'aem-live-snapshot' || args[0] === 'aem-live-snapshot-compare') {
    const compare = args[0].endsWith('-compare');
    if (args.length !== (compare ? 3 : 6) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    const auth = env.AEM_TOKEN ? { token: env.AEM_TOKEN } : env.AEM_USERNAME && env.AEM_PASSWORD ? { username: env.AEM_USERNAME, password: env.AEM_PASSWORD } : null;
    if (!compare && !auth) { output.error('Set AEM_TOKEN or AEM_USERNAME and AEM_PASSWORD in the environment.'); return 2; }
    try {
      const result = compare ? await compareAemLiveSnapshots({ beforePath: args[1], afterPath: args[2] }) : await saveAemLiveSnapshot({ authorUrl: args[1], root: args[2], resourceType: args[3], dialogPath: args[4], outputPath: args[5], ...auth });
      output.log(JSON.stringify(result, null, 2)); return 0;
    } catch { output.error(compare ? 'Unable to compare AEM snapshots. Check their scope and contents.' : 'Unable to save AEM snapshot. Check the target, local dialog, access and output collision.'); return 1; }
  }
  if (args[0] === 'aem-live-usage') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    const auth = env.AEM_TOKEN ? { token: env.AEM_TOKEN } : env.AEM_USERNAME && env.AEM_PASSWORD ? { username: env.AEM_USERNAME, password: env.AEM_PASSWORD } : null;
    if (!auth) { output.error('Set AEM_TOKEN or AEM_USERNAME and AEM_PASSWORD in the environment.'); return 2; }
    try {
      const result = await searchLiveAemUsage({ authorUrl: args[1], root: args[2], resourceType: args[3], ...auth });
      output.log(JSON.stringify(result, null, 2)); return 0;
    } catch { output.error('Unable to search AEM. Check the explicit author origin, content root, resource type and access.'); return 1; }
  }
  if (args[0] === 'ado-work-item-comment-plan' || args[0] === 'ado-work-item-comment-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 5 : 4) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !args[3]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processAdoComment({ config: config.tracker, id: Number(args[2]), bodyPath: args[3], token: env.ADO_PAT, ...(sending ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send comment or response was unclear. Inspect Azure before retrying; it may have been sent.' : 'Unable to preview Azure comment. Check provider, item, message and access.'); return 1; }
  }
  if (args[0] === 'jira-comment-plan' || args[0] === 'jira-comment-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 5 : 4) || !args[1]?.trim() || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(args[2]) || !args[3]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processJiraComment({ config: config.tracker, key: args[2], bodyPath: args[3], email: env.JIRA_EMAIL, token: env.JIRA_API_TOKEN, ...(sending ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send comment or response was unclear. Inspect Jira before retrying; it may have been sent.' : 'Unable to preview Jira comment. Check provider, issue, ADF document and access.'); return 1; }
  }
  if (['ado-work-item-states', 'ado-work-item-state-plan', 'ado-work-item-state-apply'].includes(args[0])) {
    const list = args[0] === 'ado-work-item-states', applying = args[0].endsWith('-apply');
    if (args.length !== (list ? 3 : applying ? 5 : 4) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || (!list && !args[3]?.trim()) || (applying && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const input = { config: config.tracker, id: Number(args[2]), token: env.ADO_PAT };
      const result = list ? await listAdoStates(input) : await processAdoState({ ...input, state: args[3], ...(applying ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return applying && !result.updated ? 1 : 0;
    } catch { output.error(applying ? 'Unable to update work item or response was unclear. Inspect Azure before retrying; it may have changed.' : 'Unable to inspect work item states. Check provider, item and access.'); return 1; }
  }
  if (['jira-transitions', 'jira-transition-plan', 'jira-transition-apply'].includes(args[0])) {
    const list = args[0] === 'jira-transitions', applying = args[0].endsWith('-apply');
    if (args.length !== (list ? 3 : applying ? 5 : 4) || !args[1]?.trim() || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(args[2]) || (!list && !/^[1-9][0-9]{0,19}$/.test(args[3])) || (applying && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const input = { config: config.tracker, key: args[2], email: env.JIRA_EMAIL, token: env.JIRA_API_TOKEN };
      const result = list ? await listJiraTransitions(input) : await processJiraTransition({ ...input, transitionId: args[3], ...(applying ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return applying && !result.accepted ? 1 : 0;
    } catch { output.error(applying ? 'Unable to transition issue or response was unclear. Inspect Jira before retrying; it may have changed.' : 'Unable to inspect Jira transitions. Check provider, issue and access.'); return 1; }
  }
  if (args[0] === 'issue-state-plan' || args[0] === 'issue-state-apply') {
    const applying = args[0].endsWith('-apply');
    if (args.length !== (applying ? 5 : 4) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !['open', 'closed'].includes(args[3]) || (applying && !/^[a-f0-9]{64}$/.test(args[4]))) { output.error(usage); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const token = config.tracker?.provider === 'github' ? env.GITHUB_TOKEN : config.tracker?.provider === 'gitlab' ? env.GITLAB_TOKEN : null;
      if (!token) throw new Error('Supported provider and token required');
      const result = await processIssueState({ config: config.tracker, number: Number(args[2]), state: args[3], token, ...(applying ? { expectedDigest: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return applying && !result.updated ? 1 : 0;
    } catch { output.error(applying ? 'Unable to update issue or response was unclear. Inspect the provider before retrying; it may have changed.' : 'Unable to preview issue state. Check provider, target and access.'); return 1; }
  }
  if (args[0] === 'ado-review-reply-plan' || args[0] === 'ado-review-reply-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 7 : 6) || !args[1]?.trim() || args.slice(2, 5).some(value => !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) || !args[5]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[6]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processAdoReply({ number: Number(args[2]), threadId: Number(args[3]), commentId: Number(args[4]), bodyPath: args[5], config: config.scm, token: env.ADO_PAT, ...(sending ? { expectedDigest: args[6] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send reply or response was unclear. Inspect Azure DevOps before retrying; it may have been sent.' : 'Unable to preview reply. Check the provider, target, message and access.'); return 1; }
  }
  if (args[0] === 'bitbucket-review-reply-plan' || args[0] === 'bitbucket-review-reply-send') {
    const sending = args[0].endsWith('-send');
    if (args.length !== (sending ? 6 : 5) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !/^[1-9][0-9]*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3])) || !args[4]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[5]))) { output.error(usage); return 2; }
    if (!env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processBitbucketReply({ number: Number(args[2]), commentId: Number(args[3]), bodyPath: args[4], config: config.scm, token: env.BITBUCKET_TOKEN, ...(sending ? { expectedDigest: args[5] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send reply or response was unclear. Inspect Bitbucket before retrying; it may have been sent.' : 'Unable to preview reply. Check the provider, target, message and access.'); return 1; }
  }
  if (args[0] === 'gitlab-mr-discussions') {
    if (args.length !== 3 || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); const result = await readGitLabDiscussions({ config: config.scm, number: Number(args[2]), token: env.GITLAB_TOKEN }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to read GitLab discussions. Check the provider, merge request and access.'); return 1; }
  }
  if (['gitlab-issue-comment-plan', 'gitlab-issue-comment-send', 'gitlab-review-reply-plan', 'gitlab-review-reply-send'].includes(args[0])) {
    const review = args[0].startsWith('gitlab-review-'), sending = args[0].endsWith('-send'), base = review ? 5 : 4;
    if (args.length !== base + (sending ? 1 : 0) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || (review && !/^[A-Za-z0-9_-]{1,128}$/.test(args[3])) || !args[review ? 4 : 3]?.trim() || (sending && !/^[a-f0-9]{64}$/.test(args[base]))) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitLabComment({ kind: review ? 'review-reply' : 'issue-comment', number: Number(args[2]), ...(review ? { discussionId: args[3] } : {}), bodyPath: args[review ? 4 : 3], config: review ? config.scm : config.tracker, token: env.GITLAB_TOKEN, ...(sending ? { expectedDigest: args[base] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return sending && !result.sent ? 1 : 0;
    } catch { output.error(sending ? 'Unable to send comment or response was unclear. Inspect GitLab before retrying; it may have been sent.' : 'Unable to preview comment. Check the provider, target, message and access.'); return 1; }
  }
  if (args[0] === 'gitlab-subtask-plan' || args[0] === 'gitlab-subtask-create') {
    const creating = args[0] === 'gitlab-subtask-create';
    if (args.length !== (creating ? 7 : 6) || !args[1]?.trim() || !args[2]?.trim() || !args[3]?.trim() || !/^[1-9][0-9]*$/.test(args[4]) || !Number.isSafeInteger(Number(args[4])) || !/^gid:\/\/gitlab\/WorkItems::Type\/[1-9][0-9]*$/.test(args[5]) || (creating && !/^[a-f0-9]{64}$/.test(args[6]))) { output.error(usage); return 2; }
    if (!env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitLabSubtask({ spec: args[2], recordPath: args[3], index: Number(args[4]), workItemTypeId: args[5], config: config.tracker, token: env.GITLAB_TOKEN, ...(creating ? { expectedDigest: args[6] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return creating && (!result.created || !result.linked) ? 1 : 0;
    } catch { output.error(creating ? 'Unable to create task or response was unclear. Inspect GitLab before retrying; it may have succeeded.' : 'Unable to preview GitLab task. Check the plan, parent, type ID and access.'); return 1; }
  }
  if (args[0] === 'github-subtask-plan' || args[0] === 'github-subtask-create') {
    const creating = args[0] === 'github-subtask-create';
    if (args.length !== (creating ? 6 : 5) || !args[1]?.trim() || !args[2]?.trim() || !args[3]?.trim() || !/^[1-9][0-9]*$/.test(args[4]) || !Number.isSafeInteger(Number(args[4])) || (creating && !/^[a-f0-9]{64}$/.test(args[5]))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processGitHubSubtask({ spec: args[2], recordPath: args[3], index: Number(args[4]), config: config.tracker, token: env.GITHUB_TOKEN, ...(creating ? { expectedDigest: args[5] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return creating && (!result.created || !result.linked) ? 1 : 0;
    } catch { output.error(creating ? 'Unable to create issue or response was unclear. Inspect GitHub before retrying; it may have succeeded.' : 'Unable to preview GitHub sub-issue. Check the plan, source identity, parent and access.'); return 1; }
  }
  if (args[0] === 'ado-subtask-plan' || args[0] === 'ado-subtask-create') {
    const creating = args[0] === 'ado-subtask-create';
    if (args.length !== (creating ? 7 : 6) || !args[1]?.trim() || !args[2]?.trim() || !args[3]?.trim() || !/^[1-9][0-9]*$/.test(args[4]) || !Number.isSafeInteger(Number(args[4])) || !args[5]?.trim() || (creating && !/^[a-f0-9]{64}$/.test(args[6]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processAdoSubtask({ spec: args[2], recordPath: args[3], index: Number(args[4]), workItemType: args[5], config: config.tracker, token: env.ADO_PAT, ...(creating ? { expectedDigest: args[6] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return creating && !result.created ? 1 : 0;
    } catch { output.error(creating ? 'Unable to create task or response was unclear. Inspect Azure before retrying; the request may have succeeded.' : 'Unable to preview Azure task. Check the plan, source identity, parent and access.'); return 1; }
  }
  if (args[0] === 'jira-subtask-plan' || args[0] === 'jira-subtask-create') {
    const creating = args[0] === 'jira-subtask-create';
    if (args.length !== (creating ? 7 : 6) || !args[1]?.trim() || !args[2]?.trim() || !args[3]?.trim() || !/^[1-9][0-9]*$/.test(args[4]) || !Number.isSafeInteger(Number(args[4])) || !/^[1-9][0-9]{0,19}$/.test(args[5]) || (creating && !/^[a-f0-9]{64}$/.test(args[6]))) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      const result = await processJiraSubtask({ spec: args[2], recordPath: args[3], index: Number(args[4]), issueTypeId: args[5], config: config.tracker, email: env.JIRA_EMAIL, token: env.JIRA_API_TOKEN, ...(creating ? { expectedDigest: args[6] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return creating && !result.created ? 1 : 0;
    } catch { output.error(creating ? 'Unable to create subtask or response was unclear. Inspect Jira before retrying; the request may have succeeded.' : 'Unable to preview Jira subtask. Check the plan, source identity, parent and access.'); return 1; }
  }
  if (args[0] === 'task-plan-estimate') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { const result = await summarizeTaskEstimates({ path: args[1], recordPath: args[2] }); output.log(JSON.stringify(result, null, 2)); return result.stable ? 0 : 1; }
    catch { output.error('Unable to summarize estimates. Check the task plan and requirements context.'); return 1; }
  }
  if (args[0] === 'task-plan-create' || args[0] === 'task-plan-check') {
    const saving = args[0] === 'task-plan-create';
    if (args.length !== (saving ? 4 : 3) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = saving ? await saveTaskPlan({ path: args[1], inputPath: args[2], outputPath: args[3] }) : await checkTaskPlan({ path: args[1], recordPath: args[2] }); output.log(JSON.stringify(result, null, 2)); return (saving || result.matches) ? 0 : 1; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Task plan already exists; it was not overwritten.' : 'Unable to save or check task plan. Check the source, tasks and paths.'); return 1; }
  }
  if (args[0] === 'requirements-import-check') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { const result = await checkLocalRequirements({ path: args[1] }); output.log(JSON.stringify(result, null, 2)); return result.matches ? 0 : 1; }
    catch { output.error('Unable to check local requirements. Inspect the source and identity.'); return 1; }
  }
  if (args[0] === 'requirements-import') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { const result = await importLocalRequirements({ cwd, slug: args[1], sourcePath: args[2] }); output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Local requirements directory already exists; it was not changed.' : 'Unable to import local requirements. Check the source, slug and target directory.'); return 1; }
  }
  if (args[0] === 'project-init') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      output.log(JSON.stringify(await initializeProject({ cwd, config }), null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Provider configuration already exists; it was not overwritten.' : 'Unable to initialize the project. Check provider fields and existing directories.');
      return 1;
    }
  }
  if (args[0] === 'workflow-snapshot' || args[0] === 'workflow-snapshot-compare') {
    const withRepo = args.length === 5 && args[3] === '--repo' && !!args[4]?.trim();
    if ((args.length !== 3 && !withRepo) || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try {
      const saving = args[0] === 'workflow-snapshot';
      const result = saving ? await saveWorkflowSnapshot({ path: args[1], outputPath: args[2], ...(withRepo ? { repo: args[4] } : {}) }) : await compareWorkflowSnapshot({ path: args[1], snapshotPath: args[2], ...(withRepo ? { repo: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return (saving ? result.complete : result.consistent) ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Workflow snapshot already exists; it was not overwritten.' : 'Unable to capture or compare workflow state. Check the paths and snapshot.'); return 1; }
  }
  if (args[0] === 'workflow-evidence-audit') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { const result = await auditWorkflowEvidence({ path: args[1], indexPath: args[2] }); output.log(JSON.stringify(result, null, 2)); return result.consistent ? 0 : 1; }
    catch { output.error('Unable to audit workflow evidence. Check the plan and evidence index.'); return 1; }
  }
  if (args[0] === 'workflow-step-evidence-check') {
    if (args.length !== 4 || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !args[3]?.trim()) { output.error(usage); return 2; }
    try { const result = await checkWorkflowStepEvidence({ path: args[1], step: Number(args[2]), evidencePath: args[3] }); output.log(JSON.stringify(result, null, 2)); return result.consistent ? 0 : 1; }
    catch { output.error('Unable to check workflow step evidence. Check the plan and record.'); return 1; }
  }
  if (args[0] === 'workflow-step-finish') {
    if (args.length !== 7 || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !['done', 'blocked'].includes(args[3]) || !args[4]?.trim() || !args[5]?.trim() || !/^[a-f0-9]{64}$/.test(args[6])) { output.error(usage); return 2; }
    try {
      const result = await finishWorkflowStep({ path: args[1], step: Number(args[2]), outcome: args[3], inputPath: args[4], outputPath: args[5], expectedDigest: args[6] });
      output.log(JSON.stringify(result, null, 2)); return result.transitioned && (args[3] === 'blocked' || result.evidenceCurrent === true) ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Step evidence already exists; it was not overwritten.' : 'Unable to record or finish the workflow step. Check the plan, evidence and paths.'); return 1; }
  }
  if (args[0] === 'workflow-step-plan' || args[0] === 'workflow-step-start') {
    const starting = args[0] === 'workflow-step-start';
    if (args.length !== (starting ? 4 : 3) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || (starting && !/^[a-f0-9]{64}$/.test(args[3]))) { output.error(usage); return 2; }
    try {
      const result = starting ? await startWorkflowStep({ path: args[1], step: Number(args[2]), expectedDigest: args[3] }) : await previewWorkflowStep({ path: args[1], step: Number(args[2]) });
      output.log(JSON.stringify(result, null, 2)); return (starting ? result.started && result.evidenceCurrent : result.allowed) ? 0 : 1;
    } catch { output.error('Unable to start or preview the workflow step. Check the plan, review and paths.'); return 1; }
  }
  if (args[0] === 'workflow-status') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectWorkflowStatus({ path: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect the ticket workflow. Check the spec directory.'); return 1; }
  }
  if (args[0] === 'ticket-status') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectTicketDirectory(args[1]), null, 2)); return 0; }
    catch { output.error('Unable to inspect the ticket directory.'); return 1; }
  }
  if (args[0] === 'list-skills') {
    if (args.length !== 1) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await listSkills(), null, 2)); return 0; }
    catch { output.error('Unable to inspect the skill catalog.'); return 1; }
  }
  if (args[0] === 'verification-check') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const result = await checkTestEvidence({ cwd, configPath: args[1], planPath: args[2], evidencePath: args[3] });
      output.log(JSON.stringify(result, null, 2));
      return result.consistent ? 0 : 1;
    } catch { output.error('Unable to check test evidence. Check the evidence, plan, configuration and Git state.'); return 1; }
  }
  if (args[0] === 'verification-run') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const result = await saveTestEvidence({ cwd, configPath: args[1], planPath: args[2], outputPath: args[3] });
      output.log(JSON.stringify(result, null, 2));
      return result.testPassed ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Evidence file already exists or appeared during testing; it was not overwritten.' : 'Unable to run or record configured test evidence.'); return 1; }
  }
  if (args[0] === 'plan-review-record' || args[0] === 'plan-review-check') {
    const saving = args[0] === 'plan-review-record';
    if (args.length !== (saving ? 4 : 3) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const result = saving ? await savePlanReview({ planPath: args[1], inputPath: args[2], outputPath: args[3] }) : await checkPlanReview({ planPath: args[1], reportPath: args[2] });
      output.log(JSON.stringify(result, null, 2)); return saving || (result.planMatches && result.contextMatches === true && result.identityMatches === true) ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Plan review already exists; it was not overwritten.' : 'Unable to record or check the plan review. Check the plan, review and paths.'); return 1; }
  }
  if (args[0] === 'plan-transition') {
    if (args.length !== 6 || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !/^[a-f0-9]{64}$/.test(args[5])) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await transitionPlanFile({ path: args[1], step: Number(args[2]), from: args[3], to: args[4], expectedDigest: args[5] }), null, 2)); return 0; }
    catch { output.error('Unable to update plan. Check its digest, status, format and lock.'); return 1; }
  }
  if (args[0] === 'plan-status') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try {
      output.log(JSON.stringify(await readPlanStatus(args[1]), null, 2));
      return 0;
    } catch {
      output.error('Unable to inspect plan. Check the path and supported plan format.');
      return 1;
    }
  }
  if (args[0] === 'ado-ci-commit') {
    if (args.length !== 4 || !args[2]?.trim() || !/^[a-f0-9]{40}$/i.test(args[3])) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.ci?.provider !== 'ado-pipelines') throw new Error('Azure Pipelines configuration required');
      const ci = makeCi(config.ci, { adoToken: env.ADO_PAT });
      output.log(JSON.stringify(await readAzureCommitBuilds({ ci, branch: args[2], sha: args[3] }), null, 2));
      return 0;
    } catch { output.error('Unable to inspect Azure commit builds. Check the configuration and connection.'); return 1; }
  }
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
  if (args[0] === 'ci-observations') {
    const withBranch = args.length === 5 && args[3] === '--branch' && !!args[4]?.trim();
    if ((args.length !== 3 && !withBranch) || !/^[a-f0-9]{40}$/i.test(args[2])) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const credentials = { 'github-actions': ['GITHUB_TOKEN', env.GITHUB_TOKEN], 'gitlab-ci': ['GITLAB_TOKEN', env.GITLAB_TOKEN], 'ado-pipelines': ['ADO_PAT', env.ADO_PAT], 'bitbucket-pipelines': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const selected = Object.hasOwn(credentials, config.ci?.provider) ? credentials[config.ci.provider] : null;
      if (!selected) throw new Error('Unsupported CI provider');
      if (!selected[1]) { output.error(`Set ${selected[0]} in the environment.`); return 2; }
      if ((config.ci.provider === 'ado-pipelines') !== withBranch) { output.error('Azure requires --branch; other providers do not accept it.'); return 2; }
      const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      output.log(JSON.stringify(await readCiObservations({ ci, sha: args[2], ...(withBranch ? { branch: args[4] } : {}) }), null, 2)); return 0;
    } catch { output.error('Unable to collect CI observations. Check the configuration, commit and connection.'); return 1; }
  }
  if (args[0] === 'ci-summary') {
    if (args.length !== 3 || !/^[a-f0-9]{7,64}$/i.test(args[2])) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.ci?.provider !== 'github-actions') throw new Error('GitHub Actions configuration required');
      const ci = makeCi(config.ci, { token: env.GITHUB_TOKEN });
      output.log(JSON.stringify(await readGitHubCiSummary(ci, args[2]), null, 2));
      return 0;
    } catch {
      output.error('Unable to summarize GitHub CI. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'ci-status-all') {
    if (args.length !== 3 || !/^[a-f0-9]{7,64}$/i.test(args[2])) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (!['bitbucket-pipelines', 'gitlab-ci'].includes(config.ci?.provider)) throw new Error('Unsupported CI provider');
      if (config.ci.provider === 'bitbucket-pipelines' && !env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
      if (config.ci.provider === 'gitlab-ci' && !env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
      const ci = makeCi(config.ci, { bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      const values = config.ci.provider === 'bitbucket-pipelines' ? await ci.getAllCommitStatuses(args[2]) : await ci.listAllPipelines(args[2]);
      output.log(JSON.stringify({ values }, null, 2));
      return 0;
    } catch {
      output.error('Unable to read complete CI status. Check the configuration, pagination and connection.');
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
  if (args[0] === 'ado-pipeline-dispatch' || args[0] === 'ado-pipeline-status') {
    const dispatch = args[0] === 'ado-pipeline-dispatch', withCommit = dispatch && args.length === 6 && args[4] === '--commit' && /^[a-f0-9]{40,64}$/i.test(args[5]);
    if ((dispatch ? args.length !== 4 && !withCommit : args.length !== 3) || !args[1]?.trim() || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || Number(args[2]) > 2147483647 || (dispatch && !args[3]?.trim())) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== 'ado-pipelines') throw new Error('Azure CI provider required');
      const ci = makeCi(config.ci, { adoToken: env.ADO_PAT });
      const result = dispatch ? await ci.dispatchPipeline({ definition: Number(args[2]), branch: args[3], ...(withCommit ? { commit: args[5] } : {}) }) : await readPipelineStatus({ ci, id: Number(args[2]) });
      output.log(JSON.stringify(result, null, 2)); return 0;
    } catch { output.error(dispatch ? 'Build request failed or response was unclear. Inspect the provider before retrying; it may have been accepted.' : 'Unable to read build status. Check provider, ID and access.'); return 1; }
  }
  if (args[0] === 'gitlab-pipeline-status' || args[0] === 'bitbucket-pipeline-status') {
    const gitlab = args[0] === 'gitlab-pipeline-status';
    if (args.length !== 3 || !args[1]?.trim() || (gitlab ? !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) : !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(args[2]))) { output.error(usage); return 2; }
    const token = gitlab ? env.GITLAB_TOKEN : env.BITBUCKET_TOKEN;
    if (!token) { output.error(gitlab ? 'Set GITLAB_TOKEN in the environment.' : 'Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8')); if (config.ci?.provider !== (gitlab ? 'gitlab-ci' : 'bitbucket-pipelines')) throw new Error('Provider mismatch'); const ci = makeCi(config.ci, { gitlabToken: env.GITLAB_TOKEN, bitbucketToken: env.BITBUCKET_TOKEN }); const result = await readPipelineStatus({ ci, id: gitlab ? Number(args[2]) : args[2] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch { output.error('Unable to read pipeline status. Check the provider, ID and access.'); return 1; }
  }
  if (args[0] === 'gitlab-pipeline-dispatch' || args[0] === 'bitbucket-pipeline-dispatch') {
    const gitlab = args[0] === 'gitlab-pipeline-dispatch';
    if (args.length !== (gitlab ? 3 : 4) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    const token = gitlab ? env.GITLAB_TOKEN : env.BITBUCKET_TOKEN;
    if (!token) { output.error(gitlab ? 'Set GITLAB_TOKEN in the environment.' : 'Set BITBUCKET_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse((await readLimitedFile(args[1], 262144)).toString('utf8'));
      if (config.ci?.provider !== (gitlab ? 'gitlab-ci' : 'bitbucket-pipelines')) throw new Error('CI provider mismatch');
      const ci = makeCi(config.ci, { gitlabToken: env.GITLAB_TOKEN, bitbucketToken: env.BITBUCKET_TOKEN });
      const result = await ci.dispatchPipeline({ branch: args[2], ...(gitlab ? {} : { pipeline: args[3] }) });
      output.log(JSON.stringify({ ...result, scope: 'Request accepted only; completion, branch revision and deployment effects are not verified.' }, null, 2)); return 0;
    } catch { output.error('Pipeline request failed or response was unclear. Inspect the provider before retrying; the request may have been accepted.'); return 1; }
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
  if (args[0] === 'skill-compare') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await compareInstalledSkill({ client: args[1], target: args[2], name: args[3] }); output.log(JSON.stringify(result, null, 2)); return result.status === 'matches' ? 0 : 1; }
    catch { output.error('Unable to compare skill. Check the source, client and target files.'); return 1; }
  }
  if (args[0] === 'install-skills-plan') {
    if (args.length < 4 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { const result = await planSkillInstallation({ client: args[1], target: args[2], names: args.slice(3) }); output.log(JSON.stringify(result, null, 2)); return result.available ? 0 : 1; }
    catch { output.error('Unable to preview skill installation. Check the client, target and requested skills.'); return 1; }
  }
  if (args[0] === 'install-skills') {
    if (args.length < 4 || args.slice(1).some(value => typeof value !== 'string' || !value.trim())) { output.error(usage); return 2; }
    try {
      const result = await installSkills({ client: args[1], target: args[2], names: args.slice(3) });
      output.log(JSON.stringify(result, null, 2));
      return result.complete ? 0 : 1;
    } catch { output.error('Unable to install selected skills. Check sources and destination conflicts.'); return 1; }
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
  if (args[0] === 'webhook-claims') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await listWebhookClaims({ directory: args[1] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect webhook claims. Check the local store.'); return 1; }
  }
  if (args[0] === 'gitlab-webhook-listen' || args[0] === 'bitbucket-webhook-listen') {
    if (args.length !== 4 || !args[1]?.trim() || !args[2]?.trim() || !/^[1-9][0-9]*$/.test(args[3]) || Number(args[3]) < 1024 || Number(args[3]) > 65535) { output.error(usage); return 2; }
    const provider = args[0] === 'gitlab-webhook-listen' ? 'gitlab' : 'bitbucket-cloud';
    const secret = provider === 'gitlab' ? env.GITLAB_WEBHOOK_SIGNING_TOKEN : env.BITBUCKET_WEBHOOK_SECRET;
    if (!secret) { output.error(provider === 'gitlab' ? 'Set GITLAB_WEBHOOK_SIGNING_TOKEN in the environment.' : 'Set BITBUCKET_WEBHOOK_SECRET in the environment.'); return 2; }
    try {
      const policy = JSON.parse((await readLimitedFile(args[1], 65536)).toString('utf8'));
      const server = await startExternalWebhookListener({ provider, port: Number(args[3]), secret, policy, directory: args[2] });
      server.on('error', () => output.error('Webhook listener encountered an error.'));
      output.log(JSON.stringify({ provider, listening: '127.0.0.1', port: Number(args[3]), path: '/webhook', scope: 'Local claims only; no task execution or public deployment.' })); return 0;
    } catch { output.error('Unable to start local webhook listener. Check policy, store and port.'); return 1; }
  }
  if (args[0] === 'webhook-listen') {
    if (args.length !== 4 || !args[1]?.trim() || !args[2]?.trim() || !/^[1-9][0-9]*$/.test(args[3]) || Number(args[3]) < 1024 || Number(args[3]) > 65535) { output.error(usage); return 2; }
    if (!env.GITHUB_WEBHOOK_SECRET) { output.error('Set GITHUB_WEBHOOK_SECRET in the environment.'); return 2; }
    try {
      const policy = JSON.parse((await readLimitedFile(args[1], 65536)).toString('utf8'));
      const server = await startWebhook({ port: Number(args[3]), secret: env.GITHUB_WEBHOOK_SECRET, policy, directory: args[2] });
      server.on('error', () => output.error('Webhook listener encountered an error.'));
      output.log(JSON.stringify({ listening: '127.0.0.1', port: Number(args[3]), path: '/webhook', scope: 'Local claims only; no task execution.' }));
      return 0;
    } catch { output.error('Unable to start the local webhook listener. Check the policy, store and port.'); return 1; }
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
  if (args[0] === 'pr-reviews-report') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveReviewReports({ inputPath: args[1], outputPath: args[2] }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Review bundle already exists; it was not overwritten.' : 'Unable to create review bundle. Check supplied reviews and paths.'); return 1; }
  }
  if (args[0] === 'pr-review-report') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveReviewReport({ inputPath: args[1], outputPath: args[2] }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Report already exists; it was not overwritten.' : 'Unable to create the review report. Check the supplied evidence and output path.'); return 1; }
  }
  if (args[0] === 'pr-response-draft') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveResponseDraft({ inputPath: args[1], outputPath: args[2] }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Draft already exists; it was not overwritten.' : 'Unable to create a PR response workspace. Check the saved context and output path.'); return 1; }
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
  if (args[0] === 'jira-attachment-manifest') {
    if (args.length < 4 || !args[1]?.trim() || !args[2]?.trim() || args.slice(3).some(id => !/^[1-9][0-9]{0,30}$/.test(id))) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await saveAttachmentManifest({ directory: args[1], outputPath: args[2], ids: args.slice(3) }), null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Manifest already exists; it was not overwritten.' : 'Unable to create attachment manifest. Check files and IDs.'); return 1; }
  }
  if (args[0] === 'jira-attachment-check') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = await checkAttachmentManifest({ directory: args[1], manifestPath: args[2] }); output.log(JSON.stringify(result, null, 2)); return result.consistent ? 0 : 1; }
    catch { output.error('Unable to check attachment manifest. Check the directory and manifest.'); return 1; }
  }
  if (args[0] === 'jira-ticket-evidence') {
    if (args.length < 6 || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(args[2]) || !args[3]?.trim() || !args[4]?.trim() || args.slice(5).some(id => !/^[1-9][0-9]{0,30}$/.test(id))) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.tracker?.provider !== 'jira') throw new Error('Jira tracker required');
      const tracker = makeTracker(config.tracker, { jiraEmail: env.JIRA_EMAIL, jiraToken: env.JIRA_API_TOKEN });
      const result = await saveJiraTicketEvidence({ tracker, baseUrl: config.tracker.baseUrl, key: args[2], directory: args[3], outputPath: args[4], ids: args.slice(5) });
      output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'A destination exists; nothing was downloaded.' : 'Unable to prepare Jira attachment evidence. Check issue, IDs, destinations and configuration.'); return 1; }
  }
  if (args[0] === 'jira-attachment-plan') {
    if (args.length < 5 || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(args[2]) || !args[3]?.trim() || args.slice(4).some(id => !/^[1-9][0-9]{0,30}$/.test(id))) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.tracker?.provider !== 'jira') throw new Error('Jira tracker required');
      const tracker = makeTracker(config.tracker, { jiraEmail: env.JIRA_EMAIL, jiraToken: env.JIRA_API_TOKEN });
      const result = await previewJiraTicketAttachments({ tracker, key: args[2], directory: args[3], ids: args.slice(4) });
      output.log(JSON.stringify(result, null, 2)); return result.ready ? 0 : 1;
    } catch { output.error('Unable to preview Jira attachments. Check the issue, IDs, destination and configuration.'); return 1; }
  }
  if (args[0] === 'jira-ticket-attachments') {
    if (args.length < 5 || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(args[2]) || !args[3]?.trim() || args.slice(4).some(id => !/^[1-9][0-9]{0,30}$/.test(id))) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.tracker?.provider !== 'jira') throw new Error('Jira tracker required');
      const tracker = makeTracker(config.tracker, { jiraEmail: env.JIRA_EMAIL, jiraToken: env.JIRA_API_TOKEN });
      const result = await saveJiraTicketAttachments({ tracker, key: args[2], directory: args[3], ids: args.slice(4) });
      output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'An attachment destination exists; nothing was downloaded.' : 'Unable to prepare issue attachments. Check the issue, IDs, destination and configuration.'); return 1; }
  }
  if (args[0] === 'jira-attachments') {
    if (args.length < 4 || !args[2]?.trim() || args.slice(3).some(id => !/^[1-9][0-9]{0,30}$/.test(id))) { output.error(usage); return 2; }
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.tracker?.provider !== 'jira') throw new Error('Jira tracker required');
      const tracker = makeTracker(config.tracker, { jiraEmail: env.JIRA_EMAIL, jiraToken: env.JIRA_API_TOKEN });
      const result = await saveJiraAttachments({ tracker, directory: args[2], ids: args.slice(3) });
      output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'An attachment destination exists; nothing was downloaded.' : 'Unable to prepare Jira attachment downloads. Check IDs, destination and configuration.'); return 1; }
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
  if (args[0] === 'confluence-export-check-many') {
    if (args.length < 4 || !args[1]?.trim() || !args[2]?.trim() || args.slice(3).some(id => !/^[1-9][0-9]{0,30}$/.test(id))) { output.error(usage); return 2; }
    if (!env.CONFLUENCE_EMAIL || !env.CONFLUENCE_API_TOKEN) { output.error('Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const provider = makeDocumentation(config.documentation, { confluenceEmail: env.CONFLUENCE_EMAIL, confluenceToken: env.CONFLUENCE_API_TOKEN });
      const result = await checkConfluencePages({ provider, directory: args[2], ids: args.slice(3) });
      output.log(JSON.stringify(result, null, 2)); return result.consistent ? 0 : 1;
    } catch { output.error('Unable to check Confluence exports. Check configuration, IDs and destination.'); return 1; }
  }
  if (args[0] === 'confluence-export-many') {
    if (args.length < 4 || !args[1]?.trim() || !args[2]?.trim() || args.slice(3).some(id => !/^[1-9][0-9]{0,30}$/.test(id))) { output.error(usage); return 2; }
    if (!env.CONFLUENCE_EMAIL || !env.CONFLUENCE_API_TOKEN) { output.error('Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const provider = makeDocumentation(config.documentation, { confluenceEmail: env.CONFLUENCE_EMAIL, confluenceToken: env.CONFLUENCE_API_TOKEN });
      const result = await saveConfluencePages({ provider, directory: args[2], ids: args.slice(3) });
      output.log(JSON.stringify(result, null, 2)); return result.complete ? 0 : 1;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'An output file already exists; nothing was exported.' : 'Unable to prepare Confluence exports. Check configuration, IDs and destination.'); return 1; }
  }
  if (args[0] === 'confluence-export-check') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) { output.error(usage); return 2; }
    if (!env.CONFLUENCE_EMAIL || !env.CONFLUENCE_API_TOKEN) { output.error('Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const provider = makeDocumentation(config.documentation, { confluenceEmail: env.CONFLUENCE_EMAIL, confluenceToken: env.CONFLUENCE_API_TOKEN });
      const result = await checkConfluencePage({ provider, path: args[2] });
      output.log(JSON.stringify(result, null, 2)); return result.consistent ? 0 : 1;
    } catch { output.error('Unable to check Confluence export. Check the file, configuration and access.'); return 1; }
  }
  if (args[0] === 'confluence-search' || args[0] === 'confluence-search-all' || args[0] === 'confluence-export') {
    const search = args[0] !== 'confluence-export';
    if ((search ? args.length !== 3 || !args[2]?.trim() : args.length !== 4 || !/^[1-9][0-9]{0,30}$/.test(args[2]) || !args[3]?.trim())) { output.error(usage); return 2; }
    if (!env.CONFLUENCE_EMAIL || !env.CONFLUENCE_API_TOKEN) { output.error('Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const provider = makeDocumentation(config.documentation, { confluenceEmail: env.CONFLUENCE_EMAIL, confluenceToken: env.CONFLUENCE_API_TOKEN });
      const result = search ? (args[0] === 'confluence-search-all' ? await provider.searchAllPages(args[2]) : await provider.searchPages(args[2])) : await saveConfluencePage({ provider, id: args[2], outputPath: args[3] });
      output.log(JSON.stringify(result, null, 2)); return args[0] === 'confluence-search-all' && !result.paginationComplete ? 1 : 0;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to search or export Confluence content. Check configuration and access.'); return 1; }
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
  if (args[0] === 'axe-run') {
    if (args.length !== 4 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const config = JSON.parse((await readLimitedFile(args[2], 65536)).toString('utf8')); const result = await runAxeAccessibility({ project: args[1], config, outputPath: args[3] }); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Axe output already exists; it was not overwritten.' : 'Unable to run axe. Check the page, project dependencies, browser and configuration.'); return 1; }
  }
  if (['axe-summary', 'axe-report', 'axe-compare'].includes(args[0])) {
    const summary = args[0] === 'axe-summary';
    if (args.length !== (summary ? 2 : 3) || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { const result = summary ? await readAxeResult(args[1]) : args[0] === 'axe-report' ? await saveAxeReport({ inputPath: args[1], outputPath: args[2] }) : compareAxeResults(await readAxeResult(args[1]), await readAxeResult(args[2])); output.log(JSON.stringify(result, null, 2)); return 0; }
    catch (error) { output.error(error?.code === 'EEXIST' ? 'Accessibility report already exists; it was not overwritten.' : 'Unable to inspect axe output. Check the input, format and size limits.'); return 1; }
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
  if (args[0] === 'aem-supertype') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await inspectLocalSupertype({ componentPath: args[1], jcrRoot: args[2] }), null, 2)); return 0; }
    catch { output.error('Unable to inspect local supertype candidates. Check component, JCR root and supertype path.'); return 1; }
  }
  if (args[0] === 'aem-dialog-audit') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try { output.log(JSON.stringify(await auditAemDialog(args[1]), null, 2)); return 0; }
    catch { output.error('Unable to audit the local dialog. Check the XML file and size limit.'); return 1; }
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
  if (args[0] === 'scm-review-evidence-check') {
    if (args.length !== 3 || args.slice(1).some(value => !value?.trim())) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const credentials = { github: ['GITHUB_TOKEN', env.GITHUB_TOKEN], gitlab: ['GITLAB_TOKEN', env.GITLAB_TOKEN], ado: ['ADO_PAT', env.ADO_PAT], 'bitbucket-cloud': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const selected = Object.hasOwn(credentials, config.scm?.provider) ? credentials[config.scm.provider] : null;
      if (!selected) throw new Error('Unsupported SCM');
      if (!selected[1]) { output.error(`Set ${selected[0]} in the environment.`); return 2; }
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      const result = await checkReviewEvidence({ path: args[2], config, scm });
      output.log(JSON.stringify(result, null, 2)); return result.consistent ? 0 : 1;
    } catch { output.error('Unable to check PR evidence. Check its format, configuration and provider access.'); return 1; }
  }
  if (args[0] === 'scm-review-ci' || args[0] === 'scm-review-evidence') {
    const saving = args[0] === 'scm-review-evidence';
    const baseArgs = saving ? 5 : 4;
    const withBranch = args.length === baseArgs + 2 && args[baseArgs] === '--branch' && !!args[baseArgs + 1]?.trim();
    if ((args.length !== baseArgs && !withBranch) || (saving && !args[4]?.trim()) || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || !/^[a-f0-9]{40}$/i.test(args[3])) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const scmCreds = { github: ['GITHUB_TOKEN', env.GITHUB_TOKEN], gitlab: ['GITLAB_TOKEN', env.GITLAB_TOKEN], ado: ['ADO_PAT', env.ADO_PAT], 'bitbucket-cloud': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const ciCreds = { 'github-actions': ['GITHUB_TOKEN', env.GITHUB_TOKEN], 'gitlab-ci': ['GITLAB_TOKEN', env.GITLAB_TOKEN], 'ado-pipelines': ['ADO_PAT', env.ADO_PAT], 'bitbucket-pipelines': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const scmCredential = Object.hasOwn(scmCreds, config.scm?.provider) ? scmCreds[config.scm.provider] : null;
      const ciCredential = Object.hasOwn(ciCreds, config.ci?.provider) ? ciCreds[config.ci.provider] : null;
      if (!scmCredential || !ciCredential) throw new Error('Unsupported provider');
      for (const credential of [scmCredential, ciCredential]) if (!credential[1]) { output.error(`Set ${credential[0]} in the environment.`); return 2; }
      if ((config.ci.provider === 'ado-pipelines') !== withBranch) { output.error('Azure CI requires --branch; other CI providers do not accept it.'); return 2; }
      const opts = { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN };
      const scm = makeScm(config.scm, opts), ci = makeCi(config.ci, opts);
      const reviewCi = scm.provider === 'github' ? makeCi({ provider: 'github-actions', owner: config.scm.owner, repository: config.scm.repository }, { token: env.GITHUB_TOKEN }) : undefined;
      const input = { scm, ci, reviewCi, sources: describeProviderSources(config), number: Number(args[2]), sha: args[3], ...(withBranch ? { branch: args[baseArgs + 1] } : {}) };
      const result = saving ? await saveReviewEvidence({ ...input, outputPath: args[4] }) : await readReviewCiContext(input);
      output.log(JSON.stringify(result, null, 2)); return 0;
    } catch (error) { output.error(error?.code === 'EEXIST' ? 'Evidence file already exists; it was not overwritten.' : 'Unable to collect PR and CI evidence. Check provider configuration, commit and permissions.'); return 1; }
  }
  if (args[0] === 'scm-pr-list') {
    if (args.length !== 2 || !args[1]?.trim()) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const credentials = { github: ['GITHUB_TOKEN', env.GITHUB_TOKEN], gitlab: ['GITLAB_TOKEN', env.GITLAB_TOKEN], ado: ['ADO_PAT', env.ADO_PAT], 'bitbucket-cloud': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const selected = Object.hasOwn(credentials, config.scm?.provider) ? credentials[config.scm.provider] : null;
      if (!selected) throw new Error('Unsupported SCM');
      if (!selected[1]) { output.error(`Set ${selected[0]} in the environment.`); return 2; }
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      output.log(JSON.stringify(await listScmPullRequests({ scm }), null, 2)); return 0;
    } catch { output.error('Unable to list pull requests. Check the provider, configuration and permissions.'); return 1; }
  }
  if (args[0] === 'scm-review-batch') {
    if (args.length < 3 || args.length > 12 || !args[1]?.trim() || args.slice(2).some(value => !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) || new Set(args.slice(2)).size !== args.length - 2) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const credentials = { github: ['GITHUB_TOKEN', env.GITHUB_TOKEN], gitlab: ['GITLAB_TOKEN', env.GITLAB_TOKEN], ado: ['ADO_PAT', env.ADO_PAT], 'bitbucket-cloud': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const selected = Object.hasOwn(credentials, config.scm?.provider) ? credentials[config.scm.provider] : null;
      if (!selected) throw new Error('Unsupported SCM');
      if (!selected[1]) { output.error(`Set ${selected[0]} in the environment.`); return 2; }
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      const ci = scm.provider === 'github' ? makeCi({ provider: 'github-actions', owner: config.scm.owner, repository: config.scm.repository }, { token: env.GITHUB_TOKEN }) : undefined;
      const result = await readScmReviewBatch({ scm, ci, numbers: args.slice(2).map(Number) });
      output.log(JSON.stringify(result, null, 2)); return result.retrievedAll ? 0 : 1;
    } catch { output.error('Unable to collect selected PR contexts. Check the provider configuration and permissions.'); return 1; }
  }
  if (args[0] === 'scm-review-context') {
    const withIteration = args.length === 5 && args[3] === '--iteration' && /^[1-9][0-9]*$/.test(args[4]) && Number.isSafeInteger(Number(args[4])) && Number(args[4]) <= 2147483647;
    if ((args.length !== 3 && !withIteration) || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const credentials = { github: ['GITHUB_TOKEN', env.GITHUB_TOKEN], gitlab: ['GITLAB_TOKEN', env.GITLAB_TOKEN], ado: ['ADO_PAT', env.ADO_PAT], 'bitbucket-cloud': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const selected = Object.hasOwn(credentials, config.scm?.provider) ? credentials[config.scm.provider] : null;
      if (!selected) throw new Error('Unsupported SCM');
      if (!selected[1]) { output.error(`Set ${selected[0]} in the environment.`); return 2; }
      if (withIteration && config.scm.provider !== 'ado') { output.error('Iteration is supported only for Azure.'); return 2; }
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      const ci = scm.provider === 'github' ? makeCi({ provider: 'github-actions', owner: config.scm.owner, repository: config.scm.repository }, { token: env.GITHUB_TOKEN }) : undefined;
      output.log(JSON.stringify(await readScmReviewContext({ scm, ci, number: Number(args[2]), ...(withIteration ? { iteration: Number(args[4]) } : {}) }), null, 2)); return 0;
    } catch { output.error('Unable to collect SCM review context. Check the provider, permissions and whether the PR changed.'); return 1; }
  }
  if (args[0] === 'github-review-context') {
    if (args.length !== 3 || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.scm?.provider !== 'github') throw new Error('GitHub SCM configuration required');
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN });
      const ci = makeCi({ provider: 'github-actions', owner: config.scm.owner, repository: config.scm.repository }, { token: env.GITHUB_TOKEN });
      output.log(JSON.stringify(await readGitHubReviewContext({ scm, ci, number: Number(args[2]) }), null, 2));
      return 0;
    } catch {
      output.error('Unable to collect GitHub review context. Check the configuration, permissions and whether the PR changed.');
      return 1;
    }
  }
  if (args[0] === 'ado-pr-changes') {
    if (args.length !== 4 || args.slice(2).some(value => !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647)) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.scm?.provider !== 'ado') throw new Error('Azure SCM configuration required');
      const scm = makeScm(config.scm, { adoToken: env.ADO_PAT });
      const result = await scm.getIterationChanges(Number(args[2]), Number(args[3]));
      output.log(JSON.stringify({ provider: 'ado', pullRequest: Number(args[2]), iteration: Number(args[3]), ...result, scope: 'Selected iteration change metadata only; not a full diff or proof that the iteration is current.' }, null, 2));
      return 0;
    } catch {
      output.error('Unable to read Azure iteration changes. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'scm-pr-commits') {
    const continued = args.length === 5 && args[3] === '--continuation' && !!args[4]?.trim();
    if ((args.length !== 3 && !continued) || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      const credentials = { github: ['GITHUB_TOKEN', env.GITHUB_TOKEN], gitlab: ['GITLAB_TOKEN', env.GITLAB_TOKEN], ado: ['ADO_PAT', env.ADO_PAT], 'bitbucket-cloud': ['BITBUCKET_TOKEN', env.BITBUCKET_TOKEN] };
      const selected = Object.hasOwn(credentials, config.scm?.provider) ? credentials[config.scm.provider] : null;
      if (!selected) throw new Error('Unsupported SCM');
      if (!selected[1]) { output.error(`Set ${selected[0]} in the environment.`); return 2; }
      if (continued && config.scm.provider !== 'ado') { output.error('Continuation is supported only for Azure.'); return 2; }
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      output.log(JSON.stringify(await readScmPrCommits({ scm, number: Number(args[2]), ...(continued ? { continuationToken: args[4] } : {}) }), null, 2)); return 0;
    } catch { output.error('Unable to read PR commits. Check the configuration, provider and connection.'); return 1; }
  }
  if (args[0] === 'ado-pr-commits') {
    const continued = args.length === 5 && args[3] === '--continuation' && !!args[4]?.trim();
    if ((args.length !== 3 && !continued) || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    if (!env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.scm?.provider !== 'ado') throw new Error('Azure SCM required');
      const scm = makeScm(config.scm, { adoToken: env.ADO_PAT });
      const result = await readAzurePrCommitPage({ scm, number: Number(args[2]), ...(continued ? { continuationToken: args[4] } : {}) });
      output.log(JSON.stringify(result, null, 2)); return 0;
    } catch { output.error('Unable to read Azure PR commits. Check the configuration, continuation and connection.'); return 1; }
  }
  if (args[0] === 'scm-pr' || args[0] === 'scm-pr-context' || args[0] === 'github-pr-files' || args[0] === 'github-pr-commits' || args[0] === 'gitlab-mr-diffs' || args[0] === 'gitlab-mr-commits' || args[0] === 'bitbucket-pr-statuses' || args[0] === 'bitbucket-pr-commits' || args[0] === 'bitbucket-pr-diffstat') {
    if (args.length !== 3 || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.scm?.provider === 'github' && !env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment.'); return 2; }
      if (config.scm?.provider === 'ado' && !env.ADO_PAT) { output.error('Set ADO_PAT in the environment.'); return 2; }
      if (config.scm?.provider === 'gitlab' && !env.GITLAB_TOKEN) { output.error('Set GITLAB_TOKEN in the environment.'); return 2; }
      if (config.scm?.provider === 'bitbucket-cloud' && !env.BITBUCKET_TOKEN) { output.error('Set BITBUCKET_TOKEN in the environment.'); return 2; }
      const scm = makeScm(config.scm, { token: env.GITHUB_TOKEN, adoToken: env.ADO_PAT, bitbucketToken: env.BITBUCKET_TOKEN, gitlabToken: env.GITLAB_TOKEN });
      const result = args[0] === 'scm-pr-context' ? await readPullRequestContext({ scm, number: Number(args[2]) }) : args[0] === 'github-pr-files' ? await readGitHubPullRequestFiles({ scm, number: Number(args[2]) }) : args[0] === 'github-pr-commits' ? await readGitHubPullRequestCommits({ scm, number: Number(args[2]) }) : args[0] === 'gitlab-mr-diffs' ? await readGitLabMergeRequestDiffs({ scm, number: Number(args[2]) }) : args[0] === 'gitlab-mr-commits' ? await readGitLabMergeRequestCommits({ scm, number: Number(args[2]) }) : args[0] === 'bitbucket-pr-statuses' ? await readBitbucketPrStatuses(scm, Number(args[2])) : args[0] === 'bitbucket-pr-commits' ? await readBitbucketPrCommits({ scm, number: Number(args[2]) }) : args[0] === 'bitbucket-pr-diffstat' ? await readBitbucketPrDiffstat({ scm, number: Number(args[2]) }) : await scm.getPullRequest(Number(args[2]));
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch {
      output.error('Unable to read pull request. Check the configuration and connection.');
      return 1;
    }
  }
  if (['tracker-ticket', 'tracker-export', 'ticket-init', 'ticket-source-compare', 'ticket-source-stage'].includes(args[0])) {
    const exporting = args[0] === 'tracker-export', comparing = args[0] === 'ticket-source-compare', staging = args[0] === 'ticket-source-stage';
    if (args.length !== (staging ? 5 : exporting || comparing ? 4 : 3) || typeof args[2] !== 'string' || !args[2].trim() || ((exporting || comparing || staging) && !args[3]?.trim()) || (staging && !args[4]?.trim())) { output.error(usage); return 2; }
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
      const result = exporting ? await saveTrackerStory(ticket, args[3]) : args[0] === 'ticket-init' ? await initializeTicket({ cwd, config: config.tracker, ticket }) : (comparing || staging) ? await compareTicketSource({ path: args[3], config: config.tracker, ticket, ...(staging ? { outputPath: args[4] } : {}) }) : ticket;
      output.log(JSON.stringify(result, null, 2));
      return comparing && !result.matches ? 1 : 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to read or initialize tracker ticket. Check the configuration, source identity, existing files and connection.');
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
