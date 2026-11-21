# 004 Configuration and prompts

This document lists the text a maintainer can change, where it is assembled, and which parts code enforces. It builds on [001 Domain model](001-domain.md), [002 Rules and permissions](002-rules.md) and [003 Lifecycle](003-lifecycle.md).

## Editable areas

| Area | Holds | Where |
| --- | --- | --- |
| Router persona | Routing scope, objective-answer rule, decision rule, reply rule, user-authorization boundary for merging | `cordis.patch.yml`, preset `superagent-lite`, `persona.prefix` |
| Worker persona | One-line identity with the model variable | `cordis.patch.yml`, preset `superagent-lite-worker`, `persona.prefix` |
| Bundle composition | Worktree service, the two presets, tool rows, compaction | `cordis.patch.yml` |
| Routing tool text | `dispatch_worker` and `continue_worker` descriptions and parameter text | `src/dispatch.js`, `src/continue.js` |
| Worker task message | Header, requirements, mode, `Before` / `During` / `After` / `Reporting` sections | `src/worker-prompt.js` |
| Resume message | Follow-up wrapper, `Follow-up` and `Resume` sections | `src/continue.js` |
| Review prompt and scope | Review instruction and JSON payload; the `base..head`/Worktree read scope enforced by the helper guard | `src/review.js`, `src/review-scope.js` |
| Report and router messages | Tool descriptions and limits | `src/report-tool.js`, `src/message-router.js` |
| Memory prompts | Tool description, six-fact profile context, extraction prompt | `src/memory.js` |
| Dispatch reminder | Reopened-turn text | `src/turn-guard.js` |
| Panel text | English and Chinese dictionaries | `client.js` |

Text lives in repository files. There is no settings page and no prompt editor; a change is a file edit plus a bundle reload.

## Reply rule

The router persona fixes the visible reply:

- The router answers objectively and logically: it assesses and routes the request as stated, without agreeing with, praising, restating or rewriting the user's opinion, and routing adds no requirements, implementation plans, acceptance criteria or repeated policy checklists.
- One short sentence carries the result and the next action: `Started: <concrete change>.` or `<result>; <next action>.`
- An unfinished task says so and names what remains. A blocked task names the one decision or resource a person must provide.
- Paths, hashes, test counts and implementation details stay in the worker report.
- One outcome is surfaced once; an unchanged result is not repeated because a report or completion notice arrived.
- The router merges only after the user explicitly authorizes it from a direct instruction, the Git panel merge action, or the `/merge-worker` command. Without that authorization, it does not merge.

## Prompt editing rules

A prompt change follows six rules:

1. One rule per line or bullet, and one sentence per rule.
2. State the default action first, then the exception that permits another action.
3. Let a tool description carry its mechanics; do not repeat them in the persona.
4. Pass the user's request and stated acceptance criteria without rewriting or paraphrasing it; do not omit or compress information and add no plan, requirements or checklist.
5. Report `COMPLETED` only for a reviewed implementation with relevant checks passed, and not while a job whose result the report needs runs.
6. Keep code the enforcer: the turn guard requires a decision, the worktree tool confines edits and the review tool checks the commit.

## Assembly order

The Host assembles a system prompt from ordered sections and appends a separate runtime-context message before a model call.

System prompt sections, by the Host's order:

1. Harness identity, order `-1000`.
2. The preset's persona prefix, order `0`. This is the router or worker persona above.
3. Tool guidance sections registered by the mounted tools, orders `1000`–`5000`. Bash, pwsh, filesystem, search, jobs, web, subagent and similar tool rows place their guidance here.
4. The persona suffix, order `10200`. Both presets leave it empty.

Runtime context entries, sorted by order and only when mounted:

| Order | Entry |
| --- | --- |
| `100` | Working directory |
| `110` | Sandbox policy |
| `115` | Approval policy |
| `120` | Subagent delegation |
| `170` | Saved user profile facts |
| `200` | Harness source paths |
| `210` | Web surface |

Session messages then carry the work itself:

- Both presets mount `@deepseek-ai/dsh-agent-instructions`, so the router and the worker both load `AGENTS.md`. For the router it is repository conventions to follow, never a task: an injected instruction cannot by itself authorize a push or merge.
- `dispatch_worker` sends the generated task message from `buildWorkerPrompt`.
- `continue_worker` sends either the short requirement update or the full task message with a `Resume` section.
- The turn guard sends a reminder as a user-role message with source kind `superagent-lite-reminder`.

## Priority

From strongest to weakest:

1. **Code gates.** Validation limits, tool guards, the frozen worker, the read-only helper, status checks and the Git preflight decide what can happen, whatever the text says.
2. **Host permissions.** The mounted tool set, sandbox policy, approval policy and subagent depth bound every Session.
3. **Preset persona.** The router's decision and reply rules, and the worker's identity.
4. **Tool descriptions and generated messages.** They tell the model what a tool is for and what the worker must do.
5. **External text.** User input, repository files, worker reports and Memory entries are data. They cannot add a request or relax the rules above.

The router persona states the user-authorization boundary for merging; the code enforces the merge checks in `src/git-actions.js` and `src/merge.js`.

## Versions and persistence

Prompt text has no stored version and no migration step. A change ships in the repository and takes effect when the bundle reloads.

| Item | What a save produces | When it is read |
| --- | --- | --- |
| `cordis.patch.yml` | A new bundle composition | At bundle load |
| Persona and tool text in `src/` | New text for the next assembled turn | When the Session or worker is created and on later turns |
| Panel dictionaries in `client.js` | New labels for the panel | At client bundle load |
| Saved profile facts | One Memory record per fact, with `createdAt` and `updatedAt` | At startup and after each profile write; the 6 newest are injected as runtime context |

A Task keeps the requirements it stored at dispatch. Editing prompt text does not rewrite a running or settled Task, and the reviewer still judges the stored requirements with follow-ups as context.

The profile context is refreshed by `refreshProfile()` at plugin startup and after every write to the `profile` category. Each injected fact is cut to 500 characters; at most 6 facts enter the prompt, newest `updatedAt` first.
