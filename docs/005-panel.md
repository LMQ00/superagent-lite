# 005 Panel

Open **项目任务** in the DeepSeek Harness Web sidebar to supervise the router, its workers and their branches. Tasks come first and Git delivery follows. The panel builds on [001 Domain model](001-domain.md) through [004 Configuration and prompts](004-config-prompts.md).

## Three questions

Opening the panel answers three questions, in this order:

1. Which tasks exist, and in which of the five status categories is each?
2. Which task needs a person now?
3. Which worker branch can be merged or published, and what blocks the ones that cannot?

## Status ownership

The task list is the only place that classifies a task. Its five categories are **失败 / Failed**, **进行中 / In progress**, **已合并 / Merged**, **待审查 / Needs review** and **仅回答 / Answer only**. They are mutually exclusive and cover every task:

| Category | Task status | Extra rule |
| --- | --- | --- |
| 失败 / Failed | `failed`, `delivery-blocked`, `merge-conflict`, `interrupted`, `cancelled` | |
| 进行中 / In progress | `starting`, `running`, `resuming`, `merging`, `publishing`, `awaiting-ci`, `merge-queued`, `unconfirmed`, and any status not named in another category | |
| 已合并 / Merged | `merged` | |
| 待审查 / Needs review | `review-required`, `awaiting-merge`, `ready`, `completed` | A report-only task at `completed` belongs to the next category |
| 仅回答 / Answer only | `completed` | The task's `mode` is `report` |

The row still shows the exact stage from [003 Lifecycle](003-lifecycle.md), such as 等待 CI / Waiting for CI or 等待合并 / Waiting for merge. The category filter and group heading are the only classification; no other block repeats it.

Git delivery does **not** have a second state system: it has no Open / Merged / Closed tabs, no per-state counts and no search. A Pull request's state is represented only by the task category above, so the two lists cannot contradict each other.

## Blocks

The panel has no tabs. Blocks appear in this order.

| Block | Shows |
| --- | --- |
| Header | The panel title, a one-line explanation of status ownership, and a refresh button |
| Filters | Status chips for All plus the five categories with counts, built from the loaded tasks; team and project selects narrow the same set |
| Task groups | One heading per non-empty category with its count, followed by the tasks in that category; the list is grouped in the order 失败, 进行中, 已合并, 待审查, 仅回答 |
| Git delivery | One row per worker branch under the same task filters, showing author, update time, branch and base branch; expanding a row shows repository, review, unmerged commits, comments, checks, commits, changed files and the merge and publish buttons with their reasons |
| Alerts | Load failure, session-open failure, and the error or completion returned by a Git action |

Loading, an empty list and an empty filter result have their own status text. The refresh button aborts an in-flight load, clears old errors and loads again.

## Reading one record

### Task row

| Part | Behavior |
| --- | --- |
| Stage | The exact stage from [003 Lifecycle](003-lifecycle.md), with a status dot or spinner. `未确认` / `Not confirmed` means the record is still in flight but its worker Session is gone |
| Title | The title, or the ID when no title exists |
| Team and project | The Team name and the project root |
| Update time | The stored `updatedAt`, or `createdAt` when that is absent, in local time |
| ID | The 16-hex task ID |
| Router session | Opens the router Session by ID |
| Worker session | Opens the worker Session with its parent and child IDs |
| Pull request | Opens the Pull request in a new tab; only `https://github.com/<owner>/<repo>/pull/<number>` links are rendered |

A session button that cannot open shows the open-failed alert. A task without a worker Session shows no worker button. When no session opener is available, the label is shown as text instead of a button.

### Git delivery row

The Git delivery list appears only for tasks with `git.branch` and follows the current status filter. A task without a Pull request still has a branch row.

| Part | Behavior |
| --- | --- |
| Title and number | The task title and the Pull request number `#<n>` when the URL parses, otherwise the task ID |
| Meta | Author, update time and `branch → base branch` |
| Detail | Expanding a row loads its `base..head` commits and changed files from `GET /superagent-lite/git?taskId=` and shows branch, base branch, repository, review state, unmerged commits, comment and check facts and the Pull request link |
| Review state | `审查已通过` / `Review approved`, `审查未通过` / `Review not approved`, or `审查记录已过期` / `Review record is stale` when the head moved after approval |
| Merge button | `合并到 <base branch>` / `Merge into <base branch>`; disabled unless the review approved the current head, the router Session runs with full access and the branch is not already merged. On GitHub it reuses or opens the Pull request for that head and merges it; without a GitHub origin the local merge path applies |
| Publish button | `发送 PR` / `Send pull request`; disabled unless the review approved the current head, the Project has a GitHub origin, the router Session runs with full access and the branch is not already merged |

Merged branches keep their delivery row and detail but show no action buttons. A disabled button carries its exact reason in the `title` tooltip, and the expanded row repeats the reason as a hint. While an action runs, the row shows `处理中…` / `Working…` and both buttons stay disabled. A successful action reloads the list and shows the host's completion message; a failure shows the host's error text, or the generic `Git 操作失败。` / `The Git action failed.` when the response has no message.

## Settings

The panel has no settings group. The bundle composition and prompt text live in `cordis.patch.yml` and the source files named in [004 Configuration and prompts](004-config-prompts.md).

## Principles

1. **One state system.** Task categories own status. Git delivery owns branches, commits and actions, and never derives or displays a second state.
2. **Answer the three questions or leave it out.** Every block maps to one of them; a number or row that changes no decision is removed.
3. **Read-only supervision.** Loading uses one GET; the only writes are the merge and publish buttons, and each is the user's explicit action.
4. **One action per row, with its reason.** A disabled button states what is missing; the user does not have to open a document to learn why.
5. **Honest state.** A missing worker Session shows `未确认`; the category and the exact stage agree; no row claims progress that the stored state does not support.
6. **Link, do not duplicate.** Conversations live in their Sessions and reviews live in GitHub, so the panel links to them instead of copying their content.
7. **Safe destinations.** Only same-origin panel requests and GitHub Pull request URLs are followed; other schemes are not rendered.
8. **Explicit refresh.** The panel loads on open and on refresh, with no polling and no hidden background fetch.
9. **Owner only.** A request that is not from the installation owner gets no task data.
