# 006 Deployment

Use this document to install, configure, upgrade and troubleshoot the bundle. It builds on [001 Domain model](001-domain.md) through [005 Panel](005-panel.md).

## What runs

The bundle runs inside one DeepSeek Harness Web process. It adds two presets, one worktree service, the router tools, the worker tools, the task record store and the panel. It starts no separate daemon and opens no port of its own.

| Component | Role |
| --- | --- |
| DSH Web host | Runs the plugin, the Sessions and the panel |
| `@local/superagent-lite` bundle | Adds presets, tools, routes and the task store |
| Worktree service | Creates and retains one Worktree per Task |
| GitHub CLI `gh` | Optional; required for the publish path |
| GitHub repository | Optional; needed for publish, not for a local merge |

## Prerequisites

| Requirement | Value |
| --- | --- |
| DeepSeek Harness | `0.2.2-rc.3`, the value in `engines.dsh` |
| Node.js | 24.9.0 or newer, the DSH engine requirement |
| Git | A version where `git merge-tree --write-tree HEAD HEAD` succeeds |
| GitHub CLI | Required for publish; `gh auth status --hostname github.com` must succeed |
| Project checkout | A Git repository with a branch checked out |

Enable this bundle with a worktrees service that no other bundle mounts.

## Install

The repository has no runtime dependencies, so `npm install` is not part of the setup.

```bash
git clone https://github.com/LMQ00/superagent-lite.git
cd superagent-lite
npm test
git merge-tree --write-tree HEAD HEAD >/dev/null && echo "merge-tree ok"
```

`npm test` ends with `fail 0`; `merge-tree ok` confirms the Git capability. Then install the bundle:

1. Open the DSH Web plugin manager.
2. Choose **添加插件** / **Add plugin**.
3. Enter the absolute path of this repository and install it.
4. Enable the bundle when the manager lists it.
5. Start a new Session and select **Superagent 轻量版** or **Superagent 轻量版 worker**.

The install succeeds when both presets appear in the preset picker and the panel **项目任务** appears in the sidebar. The bundle inserts its own worktree service at `.agents/worktrees` with name prefix `sl-` and `retainOnArchive: true`.

## Configuration

The bundle has no settings page. Its configuration is `cordis.patch.yml` and the source files.

| Key | Required | Meaning |
| --- | --- | --- |
| `worktree.directory` | Yes, default `.agents/worktrees` | Where Worktrees are created inside each project |
| `worktree.namePrefix` | Yes, default `sl-` | Prefix for Worktree names |
| `worktree.retainOnArchive` | Yes, default `true` | Keep worker branches and checkouts when their Session is archived |
| `preset.id` for the router | Yes, `superagent-lite` | The router preset ID |
| `preset.id` for the worker | Yes, `superagent-lite-worker` | The worker preset ID |
| `engines.dsh` | Yes, `0.2.2-rc.3` | Host version the bundle targets |

External setup is separate:

| Setting | Required for | How |
| --- | --- | --- |
| Session file policy | Merge and publish | Set the router Session to full access; the action checks `danger-full-access` |
| GitHub `origin` | Publish | `git remote -v` must show `origin` with matching GitHub fetch and push URLs |
| `gh` login | Publish | `gh auth status --hostname github.com` |
| Required CI checks | Publish | Configure at least one required check on the GitHub branch |
| GitHub merge permission | Publish | The `gh` account needs permission to merge under the repository's branch protection |

## Start, stop and status

The plugin has no standalone process and no CLI, so it has no process exit code. Start and stop it with the bundle and the DSH Web process.

| Operation | How |
| --- | --- |
| Start | Enable the bundle and start DSH Web |
| Reload | Disable and enable the bundle, or restart DSH Web |
| Stop | Disable the bundle, or stop DSH Web |
| Task status | Open **项目任务**; each row shows the stage from [003 Lifecycle](003-lifecycle.md) |
| Git action status | The panel's Git area; a failed action shows the host error and the Task stays `delivery-blocked` or `awaiting-merge` |
| Record location | `~/.dsh/superagent-lite/`, split into `tasks/` and `memory/` |

Plugin warnings that are not tied to a Task go to the DSH host log. Dispatch and delivery errors are also stored on the Task in its `failure` field; review and memory errors surface as tool errors.

The panel endpoints answer with HTTP status codes:

| Code | Meaning |
| --- | --- |
| `200` | The list or the Git action succeeded |
| `400` | A task ID, action or JSON body was malformed |
| `401` | The request was not authenticated |
| `403` | The authenticated peer is not the installation owner |
| `405` | The method is not the one the endpoint accepts |
| `409` | The Git action was refused or failed |
| `413` | The request body exceeded 4 KB |
| `415` | The Git action body was not `application/json` |

## Set up

1. Confirm `node --version` meets the DSH engine requirement and `git merge-tree --write-tree HEAD HEAD` succeeds.
2. Install and enable the bundle, then start a new Session with **Superagent 轻量版**.
3. Open the target repository as the working directory and confirm it has a branch checked out and a clean `git status`.
4. For GitHub publish, set `origin`, run `gh auth status --hostname github.com`, and configure at least one required CI check.
5. Set the router Session to full access if you intend to merge or publish.
6. Ask a read-only question first: the router should answer without starting a worker.
7. Ask for one small file change: the panel should show a Task that reaches `awaiting-merge` with a reviewed branch.

## Upgrade

1. Back up `~/.dsh/superagent-lite/`.
2. Let running workers end.
3. Update the checkout with `git pull --ff-only`.
4. Run `npm test` and confirm `fail 0`.
5. Reload or restart DSH Web.
6. Open **项目任务** and confirm the existing tasks and branches are listed.

The update does not rewrite task or Memory records; they stay in `~/.dsh/superagent-lite/`. A worker that was running during the restart can show `未确认` / `Not confirmed`; its Task can be continued when the worker Session is available, otherwise it needs a new dispatch.

To roll back, stop the bundle, check out the previous commit of this repository, restore the backup if any record was damaged, and reload DSH Web.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Project checkout has uncommitted changes; commit or stash them before dispatching workers` | Commit or stash the project checkout. The only allowed dirty entry is `?? .agents/worktrees/.gitignore` |
| `Create the assigned project worktree before using any other tool.` | The worker tried another tool before `create_worktree`; let it create or enter the Worktree first |
| `This worker is frozen.` | The worker's subagent has ended. Use `continue_worker` on the Task or start a new dispatch |
| `This worker has no matching project task` | The Session is not the worker for that Task; start a new dispatch instead of reusing the Session |
| `Dispatch <id> is already being established; inspect the task board before retrying` | The Task is `starting` or `failed` for the same call. Check **项目任务**, then dispatch with a new input |
| `The router Session is not running` | Keep the router Session open while merging or publishing |
| `Git delivery is unavailable under this Session file policy` | Set the router Session to full access |
| `GitHub projects must merge through a pull request` | Use **发送 PR** for a GitHub project; the local merge is for non-GitHub projects |
| `This project has no GitHub origin` | Add a GitHub `origin`, or use the local merge path |
| `Configure the GitHub repository as origin before automated delivery` | A GitHub remote exists but is not named `origin`; rename it |
| `Origin is not a single matching GitHub fetch/push repository` | Point the fetch and push URLs of `origin` at the same GitHub repository |
| `The review has not approved this branch` | Request `review_worker_commit` and fix the findings before delivery |
| `The worker branch no longer matches its reviewed commit` | New commits landed after the review; review the new head |
| `Merge would conflict; the target was not changed` | Rebase or merge the base branch into the worker branch, then review again. The plugin did not change the target |
| `The target checkout has uncommitted changes` | Clean the target checkout before merging |
| `The target checkout no longer has its original branch checked out` | Check out the Task's base branch again |
| `The target already has an in-progress merge` | Finish or abort the existing merge before retrying |
| `All required CI checks must pass; empty, skipped or failing checks do not qualify` | Configure at least one required check and make it pass; no checks is not a pass |
| `This branch already has a pull request` | A Pull request already exists for the Task; handle it on GitHub instead of publishing again |
| `Only settled, unpublished worktrees can be resumed` | The Task has no resumable Worktree or is not in a resumable state; dispatch new work |
| `This task does not belong to the current router Session.` | Run `/merge-worker` from the router Session that dispatched the Task |
| `Local merge is unavailable under this Session file policy.` | Set the router Session to full access |
| `No reviewed local commit is ready for merge` | The Task is not `awaiting-merge` with an approved review; review it first |
| `Usage: /merge-worker <task ID>` | Pass one 16-hex task ID |
| `This branch is not waiting for merge` | Use the local merge only on a Task in `awaiting-merge` |
| `Report-only tasks must leave the project checkout unchanged` | Revert the checkout change, then call `report_task` again |
| `Only the active worker for this task can message its router` | `message_router` is a worker tool; the router cannot call it |
| `Memory is not available to this Session` | The Session is frozen or outside its Worktree; memory tools need an active worker or the router |
| `The reviewer did not return a usable verdict` | Run `review_worker_commit` again; the review subagent must return `approved` and `findings` |
| `git output exceeded the plugin limit` | The committed diff is larger than the 65,536-byte tool-output cap. Split the change into smaller tasks |
