# 005 Panel

Open **项目任务** in the DeepSeek Harness Web sidebar to supervise the router, its workers and their branches. The panel builds on [001 Domain model](001-domain.md) through [004 Configuration and prompts](004-config-prompts.md).

## Three questions

Opening the panel answers three questions, in this order:

1. Which tasks exist, and in which of the six statuses is each?
2. Which task needs a person now — a review, a merge or a Pull request?
3. Which reviewed branch can be merged or published, and what blocks the ones that cannot?

## One status per task

The task list is the only place that classifies a task. Its six statuses are **未合并 / Unmerged**, **运行中 / In progress**, **未审查 / Not reviewed**, **已完成 / Completed**, **失败 / Failed** and **仅回答 / Answer only**. They are mutually exclusive, cover every task, and appear in that order as filters and groups.

| Status | Shown for | Row actions |
| --- | --- | --- |
| 未合并 / Unmerged | The current worker head is reviewed and not merged | 合并 / Merge, 提交 PR / Send pull request |
| 运行中 / In progress | The worker or a delivery action is in flight; an unrecovered record is marked 未确认 / Not confirmed | Session links only |
| 未审查 / Not reviewed | The worker committed a head without an approved review | 审查 / Review |
| 已完成 / Completed | The reviewed head is merged, or the worker finished without commits to deliver | 删除分支 / Delete branch when the merged worker branch still exists |
| 失败 / Failed | The worker turn, a delivery action or the Task failed | Session links; the stored failure text is shown |
| 仅回答 / Answer only | A report-only Task delivered its report | Session links |

[003 Lifecycle](003-lifecycle.md) defines the derivation from the stored record, the worker branch, the review record and the Pull request. The panel heals a stale `review-required`, `delivery-blocked` or `failed` Task to `awaiting-merge` when its current head is reviewed, and adopts an approved review recorded for the same commit by another Task of the same Project.

## Blocks

The panel has no tabs and no separate Git section. Blocks appear in this order.

| Block | Shows |
| --- | --- |
| Header | The panel title, a one-line explanation, and a refresh button |
| Filters | Status chips for All plus the six statuses with counts, built from the loaded tasks; team and project selects narrow the same set |
| Task groups | One heading per non-empty status with its count, in the order above |
| Alerts | Load failure, session-open failure, and the error, notice or review verdict returned by an action |
| Dialog | The merge, Pull request or branch-delete window, one at a time |

Loading, an empty list and an empty filter result have their own status text. The refresh button aborts an in-flight load, clears old alerts and loads again.

## Reading one record

| Part | Behavior |
| --- | --- |
| Status | One of the six statuses, with a status dot or spinner. `未确认` / `Not confirmed` is a warning tag on a running Task whose worker Session is gone, not a seventh status |
| Title | The title, or the ID when no title exists |
| Team and project | The Team name and the project root |
| Update time | The stored `updatedAt`, or `createdAt` when that is absent, in local time |
| Failure | The stored failure text on a failed Task |
| ID | The 16-hex task ID |
| Router session | Opens the router Session by ID |
| Worker session | Opens the worker Session with its parent and child IDs |
| Pull request | Opens `https://github.com/<owner>/<repo>/pull/<number>` in a new tab |

A session button that cannot open shows the open-failed alert. A task without a worker Session shows no worker button. When no session opener is available, the label is shown as text instead of a button.

## Row actions

Buttons are disabled when their precondition is missing and carry the reason in the `title` tooltip. While an action runs, the row shows `处理中…` / `Working…` and its buttons stay disabled. A success closes any dialog, reloads the list and shows the host's message; a failure shows the host's error text.

### 合并 / Merge

Opens a dialog that lists the local branches of the project checkout, excluding the worker branch, and preselects the Task's base branch. Confirming sends the chosen target. The merge is a local `git merge --no-ff` of the reviewed head and needs no `gh` account. The checkout returns to its original branch afterwards.

The button needs an approved review for the current head, no merge yet, and a clean project checkout on a branch. A conflicting target, a dirty checkout or a moved head is refused with its reason.

### 提交 PR / Send pull request

Opens a dialog that first checks the GitHub account. Without a logged-in `gh` it shows `需要 gh 账号` / `A GitHub account is required` and the `gh` error, and cannot submit. With an account it lists the remotes of the checkout and the GitHub repository each one names; the user chooses the repository. Confirming pushes the reviewed head to that remote and opens or adopts the Pull request.

The button is disabled when the current head is not reviewed, the project has no GitHub remote, or the Task is already merged or its Pull request is closed. A Pull request that already exists for the exact head is shown on the row and adopted instead of duplicated.

### 审查 / Review

Starts one independent review of the committed head from the corresponding worker Session and records its verdict. The reviewer fills the `submit_review` content; `通过` approves, any other content is recorded as findings. The button needs an unreviewed head, commits after the base commit, and a live worker Session; without that Session it is disabled with the reason.

### 删除分支 / Delete branch

Appears on a completed Task whose worker branch still exists. It opens a confirmation dialog, removes the worker Worktree when it is registered and clean, then deletes the branch. The button exists only on a `merged` record, including a merged Pull request whose commit is not an ancestor of the local base branch. After deletion the Task stays completed and the button disappears.

## Settings

The panel has no settings group. The bundle composition and prompt text live in `cordis.patch.yml` and the source files named in [004 Configuration and prompts](004-config-prompts.md).

## Principles

1. **One status system.** The six task statuses own classification; no second Git tab or state list repeats them.
2. **Answer the three questions or leave it out.** Every row and dialog maps to one of them.
3. **Supervision, not silent delivery.** Loading uses one GET per refresh and may heal a stale task status or adopt a matching review record. It never touches project files; branch and Pull request writes happen only in the actions the user explicitly confirms.
4. **One action per row, with its reason.** A disabled button states what is missing; the user does not have to open a document to learn why.
5. **Honest state.** A missing worker Session shows `未确认`; a merged branch shows 已完成; a reviewed branch shows 未合并; a missing review shows 未审查.
6. **Link, do not duplicate.** Conversations live in their Sessions and reviews live in GitHub, so the panel links to them instead of copying their content.
7. **Safe destinations.** Only same-origin panel requests and GitHub Pull request URLs are followed; other schemes are not rendered.
8. **Explicit refresh.** The panel loads on open and on refresh, with no polling and no hidden background fetch.
9. **Owner only.** A request that is not from the installation owner gets no task data.
