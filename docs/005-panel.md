# 005 Panel

Open **项目任务** in the DeepSeek Harness Web sidebar to supervise the router, its workers and their branches. The panel shows tasks first and Git branches second. It builds on [001 Domain model](001-domain.md) through [004 Configuration and prompts](004-config-prompts.md).

## Three questions

Opening the panel answers three questions, in this order:

1. Which tasks exist, and what stage is each in?
2. Which task needs a person now?
3. Which worker branch can be merged or published, and what blocks the ones that cannot?

## Blocks

The panel has no tabs. Blocks appear in this order.

| Block | Shows |
| --- | --- |
| Header | The panel title and a refresh button |
| Filters | Team and project selects, built from the loaded tasks; each starts at all teams or all projects |
| Task list | One row per task: title, team and project chips, update time, 16-hex ID, a status stage, router and worker session buttons, and a Pull request link when one exists |
| Pull requests | A GitHub-style list of the worker branches: Open / Merged / Closed tabs with counts, a search box, and one row per branch with state, title, number, status, author, branch, review and unmerged tags, comment and check badges; expanding a row shows its commits, changed files and the merge and publish buttons with their reasons |
| Alerts | Load failure, session-open failure, and the error returned by a Git action |

Loading, an empty list and an empty filter result have their own status text. The refresh button aborts an in-flight load, clears old errors and loads again.

## Reading one record

### Task row

| Part | Behavior |
| --- | --- |
| Title and ID | The title, or the ID when no title exists, followed by the 16-hex ID |
| Status | The stage from [003 Lifecycle](003-lifecycle.md). `未确认` / `Not confirmed` means the record is still in flight but its worker Session is gone |
| Team and project | The Team name and the project root |
| Update time | The stored `updatedAt`, or `createdAt` when that is absent, in local time |
| Router session | Opens the router Session by ID |
| Worker session | Opens the worker Session with its parent and child IDs |
| Pull request | Opens the Pull request in a new tab; only `https://github.com/<owner>/<repo>/pull/<number>` links are rendered |

A session button that cannot open shows the open-failed alert. A task without a worker Session shows no worker button.

### Pull request row

The Pull request list appears only for tasks with `git.branch`. The default tab is Open; each tab shows its count, and a task without a Pull request counts as Open. Search matches title, task ID, team, branch, base branch, repository and author.

| Part | Behavior |
| --- | --- |
| State icon | Open, Draft, Merged or Closed, from the stored Pull request state |
| Title and number | The task title, the Pull request number `#<n>` when the URL parses, otherwise the task ID, and the status label |
| Meta | Author, update time, `branch → base branch`, review state, unmerged commits and the Pull request state tag |
| Review state | `审查已通过` / `Review approved`, `审查未通过` / `Review not approved`, or `审查记录已过期` / `Review record is stale` when the head moved after approval |
| Badges | Comment count and check summary, when the Git view has them |
| Detail | Expanding a row loads its `base..head` commits and changed files from `GET /superagent-lite/git?taskId=` and shows branch, base branch, repository and the Pull request link |
| Merge button | `合并到 <base branch>` / `Merge into <base branch>`; disabled unless the review approved the current head, the router Session runs with full access and the branch is not already merged. On GitHub it reuses or opens the Pull request for that head and merges it; without a GitHub origin the local merge path applies |
| Publish button | `发送 PR` / `Send pull request`; disabled unless the review approved the current head, the Project has a GitHub origin, the router Session runs with full access and the branch is not already merged |

A disabled button carries its exact reason in the `title` tooltip, and the expanded row repeats the reason as a hint. While an action runs, the row shows `处理中…` / `Working…` and both buttons stay disabled. A successful action reloads the list and shows the host's completion message; a failure shows the host's error text, or the generic `Git 操作失败。` / `The Git action failed.` when the response has no message.

## Settings

The panel has no settings group. The bundle composition and prompt text live in `cordis.patch.yml` and the source files named in [004 Configuration and prompts](004-config-prompts.md).

## Principles

1. **Answer the three questions or leave it out.** Every block maps to one of them; a number or row that changes no decision is removed.
2. **Read-only supervision.** Loading uses one GET; the panel's only writes are the merge and publish buttons, and each is the user's explicit action.
3. **One action per row, with its reason.** A disabled button states what is missing; the user does not have to open a document to learn why.
4. **Honest state.** A missing worker Session shows `未确认`; a merged Pull request shows `已合并`; no row claims progress that the stored state does not support.
5. **Link, do not duplicate.** Conversations live in their Sessions and reviews live in GitHub, so the panel links to them instead of copying their content.
6. **Safe destinations.** Only same-origin panel requests and GitHub Pull request URLs are followed; other schemes are not rendered.
7. **Explicit refresh.** The panel loads on open and on refresh, with no polling and no hidden background fetch.
8. **Owner only.** A request that is not from the installation owner gets no task data.
