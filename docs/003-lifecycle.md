# 003 Lifecycle

This document follows one accepted Task from dispatch to its end. It builds on [001 Domain model](001-domain.md) and [002 Rules and permissions](002-rules.md).

## Stages

The Task record stores one lifecycle status. The panel does not display that value directly; it derives one of the six panel statuses below from the stored status, the worker branch, the review record and the Pull request. The derived status answers what a person can do with the Task now.

| Panel status | Condition, read from top to bottom |
| --- | --- |
| `running` / 运行中 | The stored status is `starting`, `running`, `resuming`, `publishing` or `merging` |
| `completed` / 已完成 | The stored status is `merged`, or the worker head is an ancestor of the base branch tip, or an exact Pull request for the reviewed head is `MERGED` |
| `failed` / 失败 | The stored status is `cancelled`, `interrupted` or `merge-conflict`, or an exact Pull request for the head is `CLOSED` |
| `unmerged` / 未合并 | The current worker head has an approved review and is not merged. A review recorded for the same commit by another Task of the same Project counts; the panel then writes that review onto this Task |
| `completed` / 已完成 | The worker turn ended `completed` and its branch has no commits after the base commit, so there is nothing to review |
| `unreviewed` / 未审查 | The worker branch has commits and the current head has no approved review |
| `failed` / 失败 | Any other stored failure value (`failed`, `delivery-blocked`) |
| `answer` / 仅回答 | The Task is report-only and stored `completed`; report-only tasks otherwise show `running` or `failed` |

A stored `review-required`, `delivery-blocked` or `failed` Task whose current head has an approved review is healed to `awaiting-merge` when the panel reads it. A stored `review-required` Task whose head is merged is healed to `merged`.

Read the stored stage table from top to bottom; the first row whose condition holds is the recorded stage. An exact merged Pull request can override a stored delivery state, and the panel computes `unconfirmed` at read time.

| Stage | Condition | Panel text |
| --- | --- | --- |
| `unconfirmed` | The stored status is `starting`, `running` or `resuming`, and no live worker agent has the Task's worker Session ID | 未确认 / Not confirmed |
| `merged` | The stored status is `merged`, or the exact Pull request for the reviewed head is `MERGED` | 已合并 / Merged |
| `delivery-blocked` | The stored status is `delivery-blocked` | 交付受阻 / Delivery blocked |
| `merging` | The stored status is `merging` | 正在合并 / Merging |
| `publishing` | The stored status is `publishing` | 正在发布拉取请求 / Publishing pull request |
| `awaiting-ci` | The stored status is `awaiting-ci` | 等待 CI / Waiting for CI |
| `merge-queued` | The stored status is `merge-queued` | 已进入合并队列 / Merge queued |
| `awaiting-merge` | The stored status is `awaiting-merge` | 等待合并 / Waiting for merge |
| `review-required` | The stored status is `review-required` | 需要审查 / Review required |
| `completed` | The stored status is `completed` | 已完成 / Completed |
| `failed` | The stored status is `failed` | 失败 / Failed |
| `resuming` | The stored status is `resuming` and a live worker agent exists | 正在恢复 / Resuming |
| `running` | The stored status is `running` and a live worker agent exists | 进行中 / In progress |
| `starting` | The stored status is `starting` and a live worker agent exists | 启动中 / Starting |

## Execution

### Worker Session

`dispatch_worker` creates the Task with status `starting`, then starts one Worker Session through `ctx.subagents.startActivation`.

| Property | Value |
| --- | --- |
| Session ID | A random UUID, recorded before activation |
| Agent name | `sl-<taskId>` |
| Label | `<teamId>: <title>` |
| Working directory | The Project root |
| Preset | `superagent-lite-worker` |
| Delivery | `parent`, so the router receives the worker report |
| Depth | `ctx.subagents.resolveMaxDepth()` |
| First message | The generated task message from `buildWorkerPrompt` |

The dispatch prompt carries an `agent-message` source when the Host patch in [HOST-PATCH](HOST-PATCH.md) is applied, so it renders as the task card labelled 收到任务消息 / Task message received; without the patch the Host stores it with a user source and it renders as an ordinary user row. A follow-up delivered to an idle worker opens a new turn and renders as the same card; the card body starts with the Host prefix `Agent <name> sent a message: `.

Earlier follow-ups stay in the worker Session history. A resumed message repeats the original requirements and the current follow-up, not every past update.

When the Host creates the worker agent, `agent/created` binds the Task to it. A Task in `starting` or `resuming` becomes `running`. The worker then calls `create_worktree`, which creates the Worktree on branch `sl-<team-slug>-<taskId>` from the recorded base commit and stores `path`, `branch`, `baseCommit`, `repositoryRoot` and `sourceBranch` on the Task. If the Worktree already exists, the tool re-enters it without creating another.

The worker is frozen when its subagent ends. A frozen worker keeps no tool access.

### Reviewer

`review_worker_commit` starts a separate subagent with label `Independent code review`, the Worktree as its working directory, delivery `caller` and depth 2. It receives the stored requirements, recorded follow-up texts, the base and head commits and the Worktree path, and reads the `base..head` diff and changed files itself. The helper guard claims it before it is created and installs the read-only boundary, which confines reads and git commands to that range and Worktree.

The reviewer records its verdict with the `submit_review` tool. Content `通过` is an approval; any other content is a finding. The tool records `review.head`, `review.reviewerSessionId` and `review.approved` only when the verdict arrived, the reviewer inspected the change, and the worker head has not moved.

The panel's `review` action runs the same review from the live worker Session. It is available on an `unreviewed` Task while that Session still exists; an approval heals the Task to `awaiting-merge`.

### Memory extractor

`extract_team_memory` starts a separate subagent with label `Distill team memory`, delivery `caller` and depth 2. It receives selected findings, returns one conclusion, and the worker's tool saves that conclusion to team memory. The same helper guard claims it.

## Concurrency

- One Task has exactly one Worker Session. A follow-up reuses that Session instead of taking another slot.
- The plugin has no queue and no task limit. Each dispatch starts a worker immediately; Tasks on one Project can run at once because each has its own Worktree.
- Dispatch nesting is bounded by the Host's maximum subagent depth. The reviewer and the memory extractor are started with depth 2.
- Local merges for one Project root are serialized. A panel Git action is one HTTP request with a 15-minute timeout.
- The worktree service keeps worker branches and checkouts after a worker ends, so a resumed Task and a later delivery can still read them.

## End conditions

A change Task ends its worker turn in one of three ways:

| Condition | Result |
| --- | --- |
| The worker ends with `completed`, has a Worktree, its latest review approved the current head, and the head still matches | `awaiting-merge` |
| The worker ends without an approved review, or the head moved after approval | `review-required` |
| The worker ends without `completed`, without a Worktree, or the head check throws | `failed`, or `delivery-blocked` when the post-review head check throws |

`awaiting-merge` is the end of the worker's work, not of the Task. The Task reaches `merged` only through a merge the user explicitly authorized (a direct instruction, the panel merge action or `/merge-worker`) or an exact merged Pull request. A panel merge is a local `git merge --no-ff` into the local branch the user picked and needs no GitHub account; after it succeeds the user may delete the worker branch and its Worktree. A report-only Task ends at `completed` when `report_task` runs; a report-only turn that ends without it becomes `failed` with `Report-only task ended without report_task`.

An input that needs no worker is not a Task: `dispatch_worker` returns `delegate=false` with a reason and the turn answers.

## Failure and recovery

### Worker turn fails

A turn that does not end as `completed`, or a change Task without a Worktree, settles as `failed`. The Host records `stopReason` and `finishedAt`. The worker is frozen.

A `failed` Task with a Worktree can be resumed with `continue_worker`. A Task that never got a Worktree, including a report-only Task, cannot be resumed; it needs a new dispatch.

### Review does not approve

The review record stays `approved: false` and the Task settles as `review-required`. The worker fixes the findings, commits again and calls the review tool again. `continue_worker` reopens the Task as `resuming`, clears the old review record, and sends the full task message with the follow-up.

### Host restart or plugin reload

Task and Memory records survive in `~/.dsh/superagent-lite/`; Worktrees survive under the project's `.agents/worktrees/`. A Task whose stored status is still in flight and whose worker Session is gone shows `unconfirmed`. `continue_worker` can wake an idle worker; a dispatch whose Task is `starting` or `failed` is refused for the same call and needs a new input.

### GitHub delivery fails

The publish path marks the Task `delivery-blocked` and stores the error in `failure`. A Pull request already created stays linked. An exact Pull request that is `CLOSED` while the Task is `publishing`, `awaiting-ci` or `merge-queued` also settles as `delivery-blocked`. An exact Pull request that is `MERGED` settles as `merged`. GitHub writes are not retried automatically.

A publish that failed before a Pull request existed can be attempted again from `delivery-blocked`. Once `prUrl` is set, another publish adopts the existing Pull request for the same head instead of pushing again.

### Local merge fails

A merge that fails before it starts leaves the Task `awaiting-merge`, so the user can fix the target checkout and retry. A `git merge` that runs and then fails marks the Task `delivery-blocked` and tells the user to inspect the target. The Task is then no longer `awaiting-merge`, so the panel's merge action refuses it until the user resolves the target and starts new work.

### Follow-up delivery fails

A failed delivery to a settled Task marks it `failed` and removes the recorded follow-up. A failed delivery to a running Task leaves it `running` and removes the recorded follow-up.

### Unfinished work

A worker that cannot finish reports `BLOCKED` with the concrete blocker, what it tried, and the one decision or resource a person must provide. A worker that leaves work undone reports `INCOMPLETE` and names what remains. The `message_router` text does not set the Task status; the lifecycle events do.
