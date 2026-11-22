# 005 Panel

Open **项目任务** in the DeepSeek Harness Web sidebar to supervise the router, its workers and their branches, and to read or edit saved memory. Tasks come first, and the memory block comes last. The memory block follows [003 memory system](diagrams/003-memory-system.md). The panel builds on [001 Domain model](001-domain.md) through [004 Configuration and prompts](004-config-prompts.md).

## Four questions

Opening the panel answers four questions, in this order:

1. Which tasks exist, and in which of the six statuses is each?
2. Which task needs a person now — a review, a merge or a Pull request?
3. Which reviewed branch can be merged or published, and what blocks the ones that cannot?
4. Which memory records exist, and which can the owner edit or delete?

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
| Header | The panel title, a one-line explanation of status ownership, and a refresh button |
| Filters | Status chips for All plus the six statuses with counts, built from the loaded tasks; team and project selects narrow the same set |
| Task groups | One heading per non-empty status with its count, in the order above |
| Memory | A usage line for the four categories with counts and read mode, the injected profile count, category chips, and a search field; each record shows its category, id, update time, content or credential reference, and for team records its Team and Project; every record has edit and delete actions |
| Alerts | Load failure, session-open failure, the error, notice or review verdict returned by an action, and the memory load or edit error |
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

### Memory row

The memory block appears after the task list and loads from `GET /superagent-lite/memory`. It is independent of the task team and project filters.

| Part | Behavior |
| --- | --- |
| Usage line | **私有**: on demand, keep minimal; **公共知识库**: on demand, conclusions only; **用户画像与环境**: injected into every router and worker chat; **团队知识库**: readable by same-team workers only. Each shows its record count |
| Profile injection | `GET /superagent-lite/memory` returns the profile injection metadata: the injected record IDs, the limit 6 and the 500-character cut. The panel shows `每轮注入 N/6` plus the newest-facts and 500-character note |
| Category chips | All plus **私有 / Private**, **公共 / Public**, **用户画像与环境 / Profile**, **团队 / Team**, each with its count; one chip narrows the list |
| Search | Filters the visible records by content, credential reference, id, Team, Project or category label |
| Injection tag | A profile record currently in the injected set carries **当前注入 / Injected now** |
| Content | The saved fact. A private record shows `凭据引用 / Credential reference: <name>` instead of content |
| Team and project | Shown only for team records; the same pair scopes the edit and delete request |
| ID and time | The record UUID and its `updatedAt` |
| Edit | Replaces the row with a textarea and **保存 / Save** and **取消 / Cancel**. Public, profile and team records edit the content; private records edit the credential reference name. The save posts `update` with the category, id, content or credential reference, and the team pair for team memory |
| Delete | The first click shows **确认删除 / Confirm delete** and **取消 / Cancel**; confirming posts `delete`. A failed request leaves the row in place and shows the host error |
| Limits | Content is 1–16,000 characters; a private credential reference is 1–128 characters and follows the reference-name shape |

The block shows its own loading, empty and no-match text. A successful edit or delete shows a short notice and updates the row without reloading the task list. The panel never edits memory on load; only the owner's edit or delete click writes.

## Settings

The panel has no settings group. The bundle composition and prompt text live in `cordis.patch.yml` and the source files named in [004 Configuration and prompts](004-config-prompts.md).

## Principles

1. **One status system.** The six task statuses own classification; no second Git tab or state list repeats them. Git actions belong to the row and its dialog.
2. **Answer the four questions or leave it out.** Every block maps to one of them; a number or row that changes no decision is removed.
3. **Supervision, not silent delivery.** Loading uses one GET per refresh and may heal a stale task status or adopt a matching review record. It never touches project files; merge, publish and branch-delete writes happen only in the actions the user explicitly confirms, and memory edits only on the owner's click.
4. **One action per row, with its reason.** A disabled button states what is missing; the user does not have to open a document to learn why.
5. **Honest state.** A missing worker Session shows `未确认`; a merged branch shows 已完成; a reviewed branch shows 未合并; a missing review shows 未审查.
6. **Link, do not duplicate.** Conversations live in their Sessions and reviews live in GitHub, so the panel links to them instead of copying their content.
7. **Safe destinations.** Only same-origin panel requests and GitHub Pull request URLs are followed; other schemes are not rendered.
8. **Explicit refresh.** The panel loads on open and on refresh, with no polling and no hidden background fetch.
9. **Owner only.** A request that is not from the installation owner gets no task data.
