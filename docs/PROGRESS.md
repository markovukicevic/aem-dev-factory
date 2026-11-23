# Progress

## 2026-11-23

- Added an explicit non-overwriting local GitHub webhook policy setup and read-only status summary, plus initial automation setup and status skills. No agents or cloud infrastructure are deployed and runtime health is unknown.

- Added a read-only preview for selected skill installations, including source availability and destination collisions; no files are created.

- Extended ticket file search to optionally inspect bounded untracked, non-ignored text files and report skipped files. Results remain candidates, not proof of impact.

- Extended explicit skill installation to bounded supporting files, rejecting symlinks and preserving existing destinations; client discovery and behavior remain unverified.

- Added a provider-independent commit preview and an initial commit workflow. It preserves existing staging and does not create commits, push, create PRs or verify tests as a side effect of previewing. Client behavior remains unverified.

- Added local requirements import into a new source-labelled spec directory and an initial requirements-import workflow. Completeness scoring and actual client behavior require human review.

- Added comparison of local imported source bytes with the editable import hash; workflow status now flags changes for inspection, without asserting authenticity.

- Added identity-bound tracker source comparison and optional staging of a new fetched export without replacing local work; non-GitHub providers remain unverified live.

- Added local source-bound task proposals and freshness checks with an initial task-breakdown skill. Remote task creation, closing and live tracker validation are not implemented.

- Added bounded read-only context collection for explicitly selected PRs across the configured SCM provider, retaining partial failures. It does not list, review, post or prove complete diffs; non-GitHub providers remain unverified live.

- Added a bounded one-page active PR listing for GitHub, GitLab, Bitbucket Cloud and Azure Repos as a batch-review selection aid; simulated responses only, and listing is not complete.

- Added a local multi-PR review report bundler and initial reporting skill. It formats supplied evidence without running reviews or publishing externally.

- Added bounded literal search of tracked source paths for ticket investigation and an initial analysis workflow; it does not inspect untracked or external files or prove impact.

- Workflow evidence audit compares explicitly indexed step records and reports completed or blocked steps without an indexed record. This does not authenticate work or establish readiness.

- Bound new step evidence records to plan content and plan review fingerprints and added a local consistency check; older records and actual observations require manual inspection.

- Added explicit per-step evidence recording and digest-checked completion or blocking. Supplied results are editable and not independently verified; partial failures are retained.

- Added a review-aware plan step preview and digest-checked start with post-transition evidence recheck. Editable records do not prove review; races remain possible.

- Bound new structured plan reviews to source identity file presence and content; older records require inspection and matching bytes do not establish authenticity.

- Bound structured plan review records to available local requirements and research artifacts; missing or changed context requires inspection or a fresh review. Records remain editable and do not prove correctness.

- Added editable structured plan review records, content consistency checks and review-aware workflow suggestions. Status-only transitions do not stale a review; actual review and correctness are not verified.

- Added separate local AEM knowledge staging with byte comparison; it does not update target files or validate source contents.

- Added optional branch, commit and clean-worktree metadata to workflow snapshots; dirty contents and Git state without an explicit matching repository remain unverified.

- Added non-overwriting local ticket artifact snapshots and change comparison; snapshots do not capture Git state or verify tests or readiness.

- Added a local ticket workflow phase suggestion and initial requirements-to-implementation coordination skills. Artifact presence and plan statuses do not verify readiness or checks.

## 2026-11-22

- Connected explicitly configured AEM component roots to bounded local component discovery; live AEM and inherited behavior remain unverified.

- Added non-overwriting reports for configured AEM content searches, retaining partial-root results and user-supplied mapping limitations.

- Added explicit JCR content mappings to AEM settings and configured searches. Mapping correctness and live usage remain unverified.

- Added read-only status and literal location search across known local AEM project knowledge files; freshness and contents are not verified.

- Added read-only byte comparison and non-overwriting reports for local AEM project knowledge; existing files remain unchanged and source contents are not reviewed.

- Added local AEM project knowledge import preview and non-overwriting import; remote sources, updates of existing files and content validation remain unimplemented.

- Connected explicit AEM content-root settings to bounded local resource-type search; JCR mapping and live AEM usage are not inferred.

- Added bounded AEM directory-marker inspection and explicit non-secret AEM settings initialization and local status inspection. Original YAML, client rules and live AEM setup remain unimplemented.

- Added explicitly mapped JCR page candidates and non-overwriting reports for local resource-type references in declared cq:Page roots; live page use remains unverified.

- Added bounded exact resource-type search in local AEM serialized content and an initial page-search skill. Live pages and references remain unverified.

- Added a bounded combined local AEM client library overview and non-overwriting report; generated assets and AEM runtime remain unverified.

- Added bounded local AEM client library manifest path inspection; generated assets, runtime aggregation and rendered behavior remain unverified.

- Added bounded local AEM client library inspection and an initial frontend verification skill; asset resolution and live rendering remain unverified.

- Added a non-overwriting local AEM dialog field reference and initial editorial-guide skill; live authoring and inheritance remain unverified.

- Added local AEM QA handoff status summaries and ticket artifact recognition; declared checks and their evidence are not independently verified.

- Added an AEM QA handoff formatter and initial verification/QA skills; supplied evidence is not independently verified and live AEM behavior remains untested.

- Added a combined local AEM component overview and non-overwriting report for definitions, dialog audit and optional supertype candidates; runtime and effective inheritance remain unverified.

- Added batch freshness checks for selected ID-named Confluence exports, including missing, mismatched and unavailable results; live Confluence remains unverified.

- Added explicit batch Confluence page export with collision preflight and partial-result reporting. Live Confluence behavior remains unverified.

- Reduced automated test frequency: GitHub Actions runs on pull requests or explicit manual dispatch, rather than every push.

- Added Confluence export site identity and a read-only comparison against current page content and version. Exports are editable and live Confluence behavior remains unverified.

- Added bounded Confluence search pagination with same-site URL and query checks; live Confluence behavior remains unverified.

- Added read-only Confluence Cloud search and non-overwriting page export. Search is limited to the first response; live Confluence behavior remains unverified.

- Added a read-only preview of selected Jira issue attachments, reported sizes and current destination collisions. Live Jira behavior remains unverified.

- Reject Jira attachment responses with mismatched unencoded content length and cover the complete issue-to-manifest path with simulated HTTP. Live Jira remains unverified.

- Bound issue attachment manifests to the SHA-256 of downloaded bytes, detecting a local change before manifest creation; later changes and source authenticity remain outside this check.

- Added an issue-bound Jira attachment download and source-labelled local hash manifest workflow; partial files are retained and labels do not authenticate provenance.

- Added non-overwriting local attachment hash manifests and integrity comparisons; manifests do not prove Jira origin or content safety.

- Added issue-bound Jira attachment selection that checks reported membership before batch download; live Jira behavior remains unverified.

- Added explicitly selected Jira attachment batch downloads with collision preflight, ID-only filenames and partial failure reporting; live Jira behavior remains unverified.

- Added a read-only saved review evidence check against configured identities and current PR revisions; CI freshness and record authenticity remain unverified.

- Added whitelisted configured SCM and CI source identifiers to PR/CI evidence; matching fields are not proof of repository identity.

- Added non-overwriting local PR and CI evidence records; records contain untrusted potentially private provider data and do not establish review or readiness.

- Added explicit SHA-bound PR and independently configured CI observations, with PR revision rechecks where available and unknown Azure head identity. CI and SCM repository identity remains unverified.

- Added independently configured cross-provider CI observations for exact commits, with provider-specific attribution and completeness limits and no new aggregate verdict.

- Added optional, explicitly selected Azure iteration change metadata to the shared review context; the chosen iteration is not verified as current.

- Extended SCM review context with GitLab diff entries and Bitbucket diffstat matched against PR revisions; complete diffs are not established.

- Added provider-selected review context combining discussion and commit evidence. GitLab and Bitbucket revisions are compared; Azure revision consistency and pagination remain unknown.

- Added a provider-selected PR commit command for GitHub, GitLab, Bitbucket Cloud and Azure DevOps, preserving each provider’s completeness and revision limits.

- Added explicit Azure DevOps PR commit page reading with continuation tokens; completeness and current branch heads are not verified. Simulated tests only.

- Added paginated Bitbucket Cloud PR commit reads with revision checks and scoped page links; live behavior is unverified.

- Added revision-checked GitLab MR commit response reading; response completeness is unknown and live GitLab behavior is unverified.

- Integrated bounded commit metadata into GitHub review context with matching revision and commit-count checks. The separate commit reader was verified against public cli/cli PR 15117.

- Added bounded GitHub PR commit retrieval with revision checks and explicit 250-commit API limit.

- Added possible-move candidates to local dialog snapshot comparisons for unique field names and matching resource types; field identity is not assumed.

- Added explicit local AEM supertype candidate inspection under one JCR root; actual search order and runtime inheritance remain unverified.

- Added local dialog inspection for exact duplicate-name and missing-label candidates; these are not confirmed defects or accessibility results.

- Added initial bug triage, reproduction, fix and verification workflows with local artifact status inspection. Browser automation, tracker updates and AI-client behavior remain unverified.

- Added initial build and blocked-step diagnosis skills. Automatic plan healing is not implemented; AI-client behavior remains untested.

- Added a read-only consistency check for saved automated test evidence against the current plan, settings and Git state; editable records are not proof tests ran.

- Hardened staged security scanning for filenames resembling Git index-stage selectors; the scan remains limited to documented patterns and scope.

- Bounded test and hub command waiting with a forced direct-child kill after timeout. Descendant processes can still outlive the direct process and require independent management.

- Added read-only hub task preflight using the same target and clean-worktree checks as execution, without printing argument values.

- Added same-named OSGi configuration candidates for matching runmode folder names; installation precedence and runtime behavior are not inferred.

- Bound PR diff checks to stable head and local tracked-base commits and repeated the check before provider writes. The tracked base may still be stale relative to the remote.

- Added non-overwriting local security-evidence records combining changed-file and bounded commit-range scans; these are not a complete security review.

- Added bounded commit-range scanning for supported secret patterns, including values later removed within the range. It does not inspect earlier history or guarantee detection.

- Added bounded scanning of final committed file versions relative to an explicit base SHA, with head-change and skipped-file reporting. Intermediate commit history is not scanned.

## 2026-11-21

- Added a bounded local changed-file scan for selected potential secret patterns without printing matched values. It is not a comprehensive security or history scan.

- Added local categorized PR review reports from explicitly supplied findings, checks and limitations; it does not perform a review, validate claims or publish externally.

- Added non-overwriting local PR response workspaces across supported SCM providers and an initial reply-drafting skill. It does not infer resolution, create replies or post comments. Verified against saved public `cli/cli` PR 15117 context.

- Extended hub status to expose validated local command states, starting commits and exit codes without exposing command arguments or output.

- Added explicit sequential local hub command execution with clean-repository preflight, per-repository state and stop-on-failure behavior. It is not an agent dispatcher, does not validate work and offers no subprocess isolation or automatic recovery.

- Added preflighted batch installation of explicitly selected self-contained skills. It reports partial failure and never rolls back user files; client discovery remains unverified.

- Added non-overwriting automated test-evidence recording tied to observed plan, configuration and Git state. It does not certify review, other checks or final verification.

- Added digest-checked, locked plan-step transitions with provenance invalidation. The command does not verify test evidence and cannot eliminate races with unrelated writers.

- Hardened the final pre-write check against missing test evidence and covered final configuration and published-branch changes in focused tests.

- Rechecked plan, Git state, readiness settings and published commit after duplicate-PR lookup, before provider writes. The final check does not remove all concurrent races.

- Added normalized readiness-config consistency checks around tests and before PR creation across providers. Later races and changes not represented in normalized settings remain possible.

- Bound PR creation to the same implementation-plan digest seen immediately after testing across all four providers. Changes after the final check remain possible.

- Extended test-readiness consistency checks to reject a plan that changes during the test run, even when the changed plan still marks all steps done.

- Hardened PR readiness to bind tests to the same clean branch and commit before and after testing, and require that commit to match the published branch across all four providers. Concurrent changes after checks remain possible.

- Added inspectable local webhook claim metadata and backward-compatible listing of earlier digest-only records. Claims are not a task queue or evidence of execution.

- Added an explicit loopback-only GitHub webhook receiver that verifies and claims deliveries locally without running tasks. It is not a public service, distributed replay protection or a live GitHub integration.

- Added built-in CLI help and an initial `agent-help` skill; refreshed the provider overview, including the removal of Bitbucket Cloud native issue tracking.

- Added non-overwriting local AEM component evidence reports and an initial doc-generation skill. Live AEM pages, authoring guides and screenshots are not implemented.

- Added bounded Azure build lookup by branch and exact commit, with unknown versions and pagination reported. Project-wide results do not establish repository identity or required checks; simulated tests only.

- Added local provider-configuration and credential-presence diagnostics, plus setup-to-ticket workflow coverage. Credential values and live service access are not inspected.

- Added bounded, explicit `repos:` directive resolution as an untrusted proposal against the hub registry. HTML, implicit routing and dispatch remain unsupported.

- Added explicit registry-based hub repository selection and an initial discovery skill. Automated routing from ticket text and multi-repository dispatch remain unimplemented.

- Added explicit hub registry initialization and an initial hub-init skill. No repository discovery, client setup or dispatch is implemented.

- Added read-only hub repository configuration inspection and an initial hub-config skill. Repository identity, config editing and multi-repository dispatch remain unimplemented.

- Added bounded local OSGi JSON syntax inspection without printing values. Unsupported formats, runmode semantics and live services remain unverified.

- Added a local component-only AEM diagnostic and an initial `aem-doctor` skill. Runtime, inheritance, OSGi, dispatcher and complete original diagnostics remain unimplemented.

- Added read-only local project-marker inspection to assist setup. Markers do not establish runtime behavior, provider access or full project type.

- Added explicit non-secret project provider setup and an initial `agent-init` skill. This is not yet the original initialization workflow and does not create its rules, MCP settings or legacy config.

- Added local ticket artifact inspection and an initial Definition of Ready review skill. Artifact presence is not evidence of readiness; AI-client behavior remains untested.

- Added single-fetch ticket initialization with a provider/project identity record and non-overwriting source export. Legacy directories are not adopted automatically; verified initialization in a temporary project against public `cli/cli` issue 15121.

- Added a bundled skill catalog with descriptions and one-file installer compatibility; it does not establish AI-client discovery or behavior.

- Added Bitbucket Cloud PR diffstat reads with validated same-repository redirects, bounded pagination and revision checks. Simulated tests only; this is metadata, not a full diff.

- Added bounded, read-only plan progress inspection and an initial sequential `agent-step-all` workflow. Declared statuses do not prove verification; real AI-client behavior is untested.

- Expanded the GitHub CI summary with observed check names, statuses and conclusions so uncertain or failing results can be inspected.

- Connected GitHub PR discussion, changed-file metadata and CI summary into a single revision-checked read-only review context; full diffs, required checks and potentially fork CI remain outside its coverage. Verified against public `cli/cli` PR 15117.

- Added bounded Bitbucket Cloud PR status retrieval for review. Simulated responses cover pagination and unsafe URLs; live Bitbucket validation remains open.

- Added bounded Azure DevOps PR iteration change-metadata retrieval. Iteration selection is explicit, full diffs are not fetched, and API behavior is simulated-test only.

- Added bounded GitLab.com merge-request diff reading with revision checks and explicit server-limit warnings. Tested with simulated responses; a live GitLab account remains unverified.

- Added paginated GitHub PR changed-file metadata and available patches with revision stability checks and explicit completeness limits; patches alone do not constitute a complete diff. Verified the eight-file list of public `cli/cli` PR 15117.

- Added provider-aware pull request discussion context and an initial review skill. Azure thread completeness is unknown, code diffs are not fetched, and non-GitHub providers have simulated API tests only. The GitHub path retrieved comments, review comments and reviews from public `cli/cli` PR 15117.

- Extended GitHub CI summaries to fetch up to 10 pages of check runs, detect inconsistent pages and report larger results as incomplete; pagination uses simulated responses in tests.

- Added bounded complete pipeline listing for a GitLab commit. Pagination and failure paths are tested with simulated responses, not a live GitLab account.

- Added an initial evidence-based Definition of Done review skill; it does not perform the reference skill’s automatic fixes or tracker updates and has not been tested in a client.

- Added explicit paginated Bitbucket Cloud commit-status retrieval with bounded, validated next links; API behavior has only been tested using simulated responses.

- Added an initial plan validation skill covering requirement mapping, scope, dependencies, paths and verification; client behavior has not been tested.

- Added a conservative GitHub CI summary for observed check runs and classic statuses. It signals incomplete results and does not evaluate required branch protection rules. Verified against the two successful GitHub Actions check runs for commit `c73885a`.

- Added a name-by-name reference skill inventory to guide incremental parity work; matching names do not establish equivalent behavior.

- Added an explicit per-project installer for self-contained skills targeting Codex, Claude Code and Copilot directories. It refuses to overwrite and has been tested with temporary projects; client discovery and behavior remain unverified.

- Added an atomic local webhook body-digest claim to suppress duplicate payloads. It does not provide distributed replay protection, bind unsigned headers, run agents, or reconcile crashes automatically.

- Added offline GitHub webhook signature verification and allowlisted event classification plus an initial automation skill. No listener, distributed replay protection, agent execution or deployment is implemented.

- Added a local PR description builder using existing summary, completed plan and supplied verification evidence. It does not verify the evidence or replace existing files.

- Added an explicit GitHub Actions workflow-dispatch command. An accepted response does not imply run completion; no live workflow dispatch was performed.

- Added local AEM dialog field snapshots and comparison without overwrite, plus an initial snapshot skill. This does not inspect live AEM, inherited fields or rendered pages.

- Hardened all four PR/MR flows to reject branches containing commits but no actual file changes relative to the tracked base. Tests use local Git repositories, including an empty commit case.

- Added Jira attachment metadata and explicit bounded downloads without overwriting files or following redirects. Binary content is not decoded or structurally validated; all tests use simulated Jira responses.

- Added an explicit read-only Confluence Cloud page operation with separate credentials and storage-format output. Tested with simulated responses; live verification, search and writes remain open.

- Added read-only multi-repository hub status inspection for the reference status format, with incomplete results reported. An initial hub status skill is structurally validated; dispatch and cleanup are not implemented.

- Added read-only Azure Pipelines build listing by branch and build lookup, including continuation tokens. These calls have simulated API tests only; branch results can include builds from different commits.

- Added local AEM dialog XML field inspection with size and DTD checks, using synthetic fixtures. Inheritance, authored values, live AEM and full AEM workflows remain unverified.

- Added a read-only local AEM component candidate search and CLI. It finds matching source folders and dialog files using synthetic fixtures; it does not inspect a live AEM instance or resolve all external component files.

- Added an initial Claude Code marketplace manifest and structural plugin validation in CI. Claude Code is not installed here, so registration, installation and real skill behavior remain unverified.

- Added initial planning, single-step execution, verification, PR and AEM component-discovery skill instructions. Structurally validated only; client installation and behavioral validation remain open, and the original plugin functionality is not yet reproduced.

- Added an experimental GitLab.com merge request command with readiness, origin, published branch, duplicate and empty-diff checks. Tested with local Git and a simulated API; no live MR created.

- Added GitLab.com issue, merge-request, notes and pipeline read adapters and source export. Only simulated responses have been tested; live GitLab validation and self-managed GitLab remain open.

- Added an experimental guarded Bitbucket Cloud PR creation command with origin, readiness, published branch, duplicate and empty-diff checks. Tested with local Git and simulated API responses only; no live PR created.

- Added read-only Bitbucket Cloud SCM and commit-status adapters with paginated PR comments, plus SCM and CI commands. Bitbucket API responses are simulated in tests; Data Center and complete status pagination remain open.

- Added GitHub Actions workflow-run reading through the independent CI adapter and CLI. An individual run was read from the project repository; pagination and filtering are also covered by simulated tests. Read operations and dispatch are separate; dispatch remains untested against a live account.

- Added unique, non-overwriting ticket-directory setup and an initial `agent-req` requirements workflow using the configured tracker. Skill structure is validated; AI-client installation and behavioral testing remain open.

- Added an experimental Azure Repos PR command with readiness, origin, published branch, duplicate-PR and empty-diff checks. It was tested with local Git repositories and a simulated API; no live Azure PR was created.

- Added an Azure Repos SCM adapter for reading PRs and threads and submitting PR requests, plus an SCM read command. These API calls are simulated-test only; the direct create method is not connected to readiness checks and has not created a real PR.

- Added a read-only Azure DevOps Services work-item tracker and source export. It preserves fields, relations and paginated comments, uses a PAT, and has only simulated-response tests. Full Azure Repos workflow integration, work-item write-back and attachments remain open.

- Added provider-configured source-story export for Jira and GitHub. Jira ADF is retained as JSON and existing files are not overwritten. Tested with simulated Jira data; attachments and live Jira verification remain open.

## 2026-11-20

- Started a separate project inspired by the local AEM DevFlow reference at commit `7ecd2a0` (version 1.1.0). The original workflows are not yet implemented here.
- Recorded an initial inventory of its four plugins.
- Added a GitHub Cloud client for reading and creating pull requests and reading pages of comments, check runs, and combined commit status. It is not yet connected to the reference workflow or configuration system.
- Added read-only CLI commands for fetching a pull request and its first page of comments and checks. Verified both against a public `cli/cli` pull request. Added a read-only GitHub issue command and verified it on a public issue. PR creation has only been tested with simulated responses.
- Added independently instantiated tracker, SCM, and CI provider interfaces with GitHub implementations and a read-only Jira Cloud tracker. Jira preserves ADF and has only simulated-response tests; attachments and writes are not implemented. A configured tracker-ticket command was verified against a public GitHub issue; ADO, GitLab, and Bitbucket adapters are not implemented.
- Added issue export into a new raw-story Markdown file without overwriting existing content. Tested the export using a public issue; it does not infer requirements or fetch attachments.
- Added an explicit experimental GitHub PR creation CLI requiring a description file and token. The write path is tested with a simulated API only; it has not created a real PR.
- Added duplicate-open-PR and empty-diff checks to the experimental GitHub PR flow. The diff uses the locally tracked base and may be stale.
- Added an experimental GitHub PR creation flow that checks origin identity, readiness and whether the current commit is already published, with simulated GitHub writes and real local Git fixtures. It does not push, generate descriptions, or prevent concurrent changes after the final checks.
- Readiness base-branch resolution now rejects missing local origin tracking references. This does not verify the current remote state.
- Added GitHub issue context retrieval with paginated comments and an explicit incomplete-result failure. Verified against a public issue; attachments and the rest of the agent-req pipeline remain open.
- Added restricted legacy YAML readiness settings using a proper YAML parser and shell-argument parser; complex shell syntax is rejected, not executed.
- Added base-branch resolution from explicit configuration or the local origin default, plus a JSON-configured readiness CLI. The readiness command can also read `scm.base-branch` and a simple `build.test` command from the original `.ai/config.yaml` format.
- Added an optional test-command runner to readiness inspection. It uses an explicit executable and argument list, then re-reads plan and Git state; it does not discover project configuration or create a PR.
- Added a conservative parser for the reference implementation-plan format and connected it to Git readiness inspection. The test command and base branch are still supplied by the caller; unsupported or ambiguous plan formats are rejected.
- Added a `--page` option for paginated PR context, Git branch/worktree inspection, and preliminary PR readiness checks. The checks use caller-supplied plan and test evidence and are not yet a complete PR flow.
- Linked the new project to its GitHub origin and added a test workflow. The first GitHub Actions run passed on Node 20 and 22; action versions were then updated to address a deprecation warning.
- Most recent observed five-hour quota reset: 2026-11-20 21:27 Europe/Berlin. Scheduled sessions must verify the reset and current usage before starting; limits are shared across the account.

## Next

1. Compare the reference project's skills and workflows with this implementation, prioritize missing behavior, and port it incrementally. The current skills are initial instructions, not full feature parity.
2. Validate skill discovery and workflows in the actual supported AI clients; validate installation of skills with supporting files.
3. Exercise provider integrations against disposable test repositories and accounts where available. Confirm permissions, pagination and error handling before treating simulated write tests as live validation.
4. Continue AEM development workflows, including live-instance and rendered-page checks when a suitable test instance is available.
5. Improve CI status coverage and webhook handling; the local listener and claims do not provide a public service, durable distributed replay protection or agent dispatch.
6. Extend plan formats and legacy YAML compatibility where the reference workflow requires them. Preserve existing behavior and document unsupported cases.
