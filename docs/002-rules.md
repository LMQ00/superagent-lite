# 002 Rules and permissions

This document lists who may start work, what each actor may touch, and what a Git action requires. It builds on [001 Domain model](001-domain.md).

## Two paths

New work and existing work start differently, and neither path takes over the other.

### New work

A user input gets one `dispatch_worker` call from the router. The call records the input's routing decision before the router answers.

- `delegate=false` answers without a worker. It needs a reason of 1–2,000 characters and starts no Task.
- `delegate=true` starts one Task and one Worker Session. The router passes the user's request and stated acceptance criteria without rewriting or paraphrasing it; it does not omit or compress information and adds no plan.
- `mode=report` marks a read-only task. The mode defaults to `change` when omitted.
- The target checkout must have a branch checked out and a clean working tree. The only allowed dirty line is `?? .agents/worktrees/.gitignore`.
- The Task ID is the first 16 hex characters of the SHA-256 of the router agent ID and the tool call ID. A repeated call for the same pair returns the existing Task unless that Task is `starting` or `failed`; those two states refuse a retry and ask for the task board.
- A Task from another Router Session cannot be reused; the call fails with `Task id is already owned by another Session`.
- One Team owns one Project. The first Task fixes the pair; a later Task that would reassign either one fails with `The project and team must retain their existing one-to-one assignment`.

### Existing work

`continue_worker` sends a follow-up to a Task that already exists and is not published.

- The Task must belong to the calling Router Session, and the follow-up must add to or correct the same deliverable and goal. A different business goal is new work. A second prompt-wording change continues the task; changing how dispatch messages are shaped is a new task.
- The task text is 1–20,000 characters and the ID is 16 lowercase hex characters.
- When the worker agent is running, the follow-up is a short requirement update inside the current turn. It asks the worker to judge whether the follow-up belongs and to report an unapplied one.
- When the worker is idle, the follow-up is the full task message plus a `Resume` section. A settled Task with a Worktree in `awaiting-merge`, `review-required` or `failed` is marked `resuming` and its old Review record is cleared first.
- The follow-up is written to `task.followUps` before it is sent. A failed delivery removes that entry. A failed delivery to a settled Task marks it `failed`; a failed delivery to a running Task leaves it `running`.
- A published Task is not continued. The next input after publication is new work.

### No crossing

- `dispatch_worker` never resumes an existing Task and never steers a running worker.
- `continue_worker` never creates a Task or a Worktree.
- Overlapping files are no reason to fold work together. The new goal gets its own worker, its own Worktree and its own branch; the merge path refuses conflicts.

## Authorization levels

| Level | Granted by | What it allows | Default |
| --- | --- | --- | --- |
| Observe | Being the Router Session | Read the input, call `dispatch_worker`, `continue_worker` and `superagent_memory` | Every input |
| Delegate | `dispatch_worker` with `delegate=true` | Create one Task and start one Worker Session | No; needs a decision |
| Edit | `create_worktree` during an active change task | Work from the Task's Worktree; project tools are blocked until the worker is there | No; the worker is blocked from other tools until it creates or enters the Worktree |
| Review | `review_worker_commit` after a commit | Read the committed diff and start one read-only reviewer | No; needs a clean committed Worktree |
| Report | `report_task` during a report-only task | End the Task with a conclusion | No; report tasks only |
| Merge | A direct user instruction, the user's panel merge action or `/merge-worker <task ID>` | Merge the reviewed commit into a local branch after explicit user authorization, without a GitHub account | No; needs explicit user authorization and a reviewed local branch |
| Publish | The user's panel action | Push the reviewed head to the chosen GitHub remote and open or adopt the Pull request for it | No; needs a `gh` account, a GitHub remote and a reviewed branch |

## Admission by mode

| Mode | Selected by | Worktree | Edits project files | Commits | Requests Review | Ends with |
| --- | --- | --- | --- | --- | --- | --- |
| `change` | `dispatch_worker` with mode omitted or `mode=change` | Required | Yes, inside the Worktree | Yes | Yes, until approved | `review_worker_commit`, then the worker report |
| `report` | `dispatch_worker` with `mode=report` | None | No | No | No | `report_task` |

## Router rules

The Router Session runs the `superagent-lite` preset. The turn guard applies to that preset only.

- Every user input needs one successful `dispatch_worker` or `continue_worker` result in its turn. A failed tool call does not count. A `delegate=false` result does count.
- A completed turn without a decision gets the reminder once the agent is idle. The reminder is a user-role message with source kind `superagent-lite-reminder`, so it is not a new input. At most 2 reminders are sent for one input; a new user input resets the budget.
- The reminder text tells the agent to call `dispatch_worker`, with `delegate=true` for project work or `delegate=false` plus a reason, or `continue_worker` for an unpublished task.
- The router decides from the input. It does not inspect files, run commands or load skills for project work; a worker does that.
- The router calls another tool only when the user asks to save or read memory, names a saved fact it needs to route, or asks for a skill.
- Worker instructions enter only the dispatched worker Session. The router's turn holds the decision and the short reply.
- Dispatch arguments are validated before any file is touched: `title` 1–120 characters, `task` 1–20,000 characters, `teamId` 1–64 characters matching `[a-zA-Z0-9][a-zA-Z0-9._-]*`, and `reason` 1–2,000 characters when `delegate=false`.

## Worker rules

- The worker must call `create_worktree` once before any other tool. Every other tool is blocked until the working directory is the assigned Worktree.
- The Worktree name is `sl-<team-slug>-<taskId>`. The team slug is the Team name lowercased, with runs of non-alphanumeric characters replaced by `-`, trimmed and cut to 32 characters.
- The worker is frozen when its subagent ends. It can then use no tool, including memory and message tools.
- `review_worker_commit`, Memory and `message_router` are available only while the worker is active and inside its Worktree. `report_task` is available only for an active report-only task. A report-only worker instead sees inspection tools in the project checkout.
- A report-only task may use `read`, `glob`, `grep`, `read_image`, `bash` or `todo_write` in the project checkout, and `report_task`. Every other tool is denied. `report_task` refuses a changed HEAD or any checkout change other than `?? .agents/worktrees/.gitignore`.
- The `message_router` report is 1–4,000 characters; the worker sends one at the end of the work. The worker sends no routine progress. A `COMPLETED` report needs a reviewed implementation with relevant checks passed, and it is not sent while a job whose result the report needs runs.
- A follow-up that does not belong to the Task is left unapplied and named in the final report. A running Task that stays complete reports `COMPLETED` with the unapplied follow-up; a resumed Task whose follow-up does not belong reports `BLOCKED`.

## Review rules

- `review_worker_commit` requires an active Task in `running`, a Worktree, a clean working tree, at least one commit after the base commit, and a non-empty net diff between the base commit and HEAD.
- The reviewer records its verdict with the `submit_review` tool: content `通过` approves, any other content is recorded as the findings. The tool records the reviewed head only after that verdict exists, the reviewer inspected the change, and the head did not move during the review. A reviewer that never calls `submit_review` has no usable verdict.
- The reviewer is a separate subagent. It receives the stored requirements, recorded follow-up texts, the base and head commits and the Worktree path. It reads the `base..head` diff and the changed files itself; the diff is not sent to it. It judges the committed diff, treats follow-ups as context, and blocks only on concrete correctness, regression or missing-test problems.
- The reviewer runs read-only and is confined to `base..head` and the Worktree; out-of-scope reads and git commands are refused. It may use `submit_review`, `structured_output`, `read`, `read_image`, `glob`, `grep`, and `bash`/`pwsh` limited to scoped git inspection. Only a claimed reviewer may use `submit_review`.
- A verdict returned without inspecting the change is rejected and records no `review`.
- `bash` and `pwsh` are admitted only when the mounted shell confines file writes, the helper session resolves to the read-only sandbox mode, and the call requests no wider sandbox permissions. File writes, mutating tools and control tools are denied. Network and process effects are outside the sandbox vocabulary.
- A review that blocks does not change the Task status by itself. The worker fixes the findings, commits again and requests another review. The Task settles as `review-required` if the worker ends without an approved review.
- The panel's `review` action runs the same review for an `unreviewed` Task while its worker Session is alive. An approval moves the Task to `awaiting-merge`; a finding moves it to `review-required`.
- An approved review belongs to its commit. A Task of the same Project whose current head is that commit may adopt it when the panel reads the Task.

## Git action rules

A merge runs only after the user explicitly authorizes it from a direct instruction, the Git panel merge action, or the `/merge-worker <task ID>` command. With that authorization, the router or worker may merge the reviewed commit; without it, neither merges and the worker stops after the reviewed commit without pushing or merging. Publish still requires the user's panel action.

| Action | Required Task state | Additional conditions |
| --- | --- | --- |
| `merge` | not `merged`, review approved for the current head | A running Router Session with `danger-full-access`; the worker branch still at the reviewed head; a local target branch other than the worker branch; the project checkout clean and on a branch; `merge-tree` reports no conflict. It switches to the target, runs `git merge --no-ff`, and switches back. No `gh` account or remote is involved |
| `publish` | not `merged`, review approved for the current head | The user picks a configured remote whose fetch and push URLs name the same GitHub repository; `gh auth status --hostname github.com` succeeds; a running Router Session with `danger-full-access`; the worker branch still at the reviewed head. An existing Pull request for the same head is adopted |
| `review` | not `merged`, an `unreviewed` committed head | The worker Session is still live; the Worktree is clean and on its branch. It runs the independent reviewer and records the verdict |
| `delete-branch` | `merged` | The Worktree has no uncommitted changes. It removes the Worktree, then deletes the branch. A merged Pull request whose commit is not an ancestor of the local base branch still qualifies |

- The panel posts the action to `POST /superagent-lite/git` with a 16-hex task ID, the action and, for `merge`, the `target` branch or, for `publish`, the `remote` name. The body limit is 4 KB and the action timeout is 15 minutes.
- `GET /superagent-lite/git?taskId=` returns the local branches, the configured remotes with their GitHub repository when one exists, and the `gh` account status used by the merge and Pull request dialogs.
- `/merge-worker` accepts one 16-hex task ID, must be run from the Task's Router Session, requires the same full-access policy, and merges into the recorded base branch.
- A merge marks the Task `merging`, runs `git merge --no-ff`, and marks it `merged` with `mergeTarget`. A merge that does not report success marks it `delivery-blocked`.
- Merges, publishes, reviews and deletions for one Task are serialized. Actions on different Tasks are not queued together.
- The publish path pushes the reviewed head to `refs/heads/<worker branch>` of the chosen remote and opens a Pull request against the base branch; an existing Pull request for the same head is adopted and the Task settles as `awaiting-ci`. Required checks and branch protection still apply.
- A Pull request whose head, head branch, base branch or cross-repository flag does not match the Task is not used. A merged exact Pull request sets `merged`; an exact closed Pull request sets `delivery-blocked`.
- GitHub writes are not retried after an interrupted run. Deleting a branch is local and permanent after the merge.

## Memory rules

| Category | Router Session | Worker Session | Rules |
| --- | --- | --- | --- |
| `public` | Read and write | Read and write | Local to this installation |
| `profile` | Read and write | Read only | Included as runtime context in both presets; only the router may change it |
| `private` | Read and write | No access | Credential reference names only; never a secret value |
| `team` | No access | Read and write | Scoped by Team and Project; only a worker with both may read or write |

- Memory tool callers are resolved from the Host Session, never from model arguments. A Session outside the allowed role fails with `Memory is not available to this Session`.
- A memory tool is used for a saved fact the task needs or when the user asks to save one. The router writes a profile fact when the user asks or when routing needs it.
- Content is 1–16,000 characters. A secret-shaped string is rejected; private records accept only an identifier such as `DEEPSEEK_API_KEY`.
- A list returns at most 8 records and a 240-character preview. A team-memory extraction accepts 1–5,000 characters of findings and saves a conclusion of at most 500 characters.
- Memory entries are data. They never grant permission and never override a code rule.
- The user profile injected as runtime context holds the 6 most recently updated facts, each cut to 500 characters.

## Versioning

A Task fixes its own terms at creation and review time: the stored requirements, the parent Session, the Team, the Project, the base commit and the reviewed head. A change to the prompts or rules does not rewrite a running Task; later turns and new dispatches use the new text.

A Git action re-checks the Task and the checkout when it runs, so a moved head, a changed branch, a dirty target or a new commit stops the action instead of applying stale approval.

## Unfinished work

A Task that cannot complete records `failed`, `review-required` or `delivery-blocked`; the panel shows that state and the user chooses the next action. A worker that cannot proceed reports `BLOCKED` with the concrete blocker, what it tried, and the one decision or resource a person must provide.
