# Superagent 轻量版

Start a new Session and select **Superagent 轻量版** to route work, or **Superagent 轻量版 worker** to run a worker session directly. To install the bundle in DSH Web, open **Plugins → Add plugin** and select the repository’s root directory.

Every user input to the router gets its own routing decision before an answer; an earlier turn’s decision does not cover a new input. Executable project work sets `dispatch_worker` `delegate=true` and starts an isolated worker for the named team; an input that needs no worker sets `delegate=false` with a reason. A follow-up on an existing unpublished task calls `continue_worker`, which counts as that input’s decision. An answer that completes without a decision is reopened with a reminder once the agent is idle, at most twice per input.

The router makes that one routing call from the input alone. It does not inspect files, run commands, load skills, or read memory for project work; a worker does that. It replies in one short sentence with the result and the next action, and keeps paths, hashes, test counts, and implementation details in the worker report. The target checkout must have a branch and a clean working tree. Each worker starts in a separate branch and worktree. Worker instructions enter only the dispatched session; after committing, the worker opens a read-only review subagent that receives the committed patch and task requirements and may inspect the worktree with read-only tools and a shell confined to read-only file effects. Permitted tools are `structured_output`, `read`, `read_image`, `glob`, `grep`, `read_page`, `web_fetch`, `web_search`, `x_search`, `job_output`, and `job_list`; `bash` and `pwsh` are admitted only when the mounted shell confines file writes and the helper session resolves to the read-only sandbox mode. File writes and mutating or control tools are denied; network and process effects remain outside the sandbox vocabulary.

Prompt text and its editing rules are in [PROMPTS](PROMPTS.md).

The **Project tasks** panel shows task IDs, state, and links to the router, worker, and any GitHub pull request. Refresh the panel to retrieve the latest status. The router can steer a running worker, or continue an unpublished settled worker, with `continue_worker`. A worker reports progress or its final conclusion to the router with `message_router`; a published change is a separate task.

- **Local-only repository:** To authorize a reviewed merge, run `/merge-worker <task ID>` in the original router Session. The target branch must still be checked out and clean; conflicting merges are refused. No push is made.
- **GitHub repository:** With a recognized `origin`, authenticated `gh`, DSH full-access permission and enforced required CI checks, the Host publishes the reviewed commit and requests squash auto-merge only after required checks pass. The request is pinned to the reviewed SHA. GitHub branch protection and review rules still apply. Missing or failed checks block delivery. Interrupted runs do not automatically retry GitHub writes.

The worktree service retains worker branches and checkouts for recovery. Worktrees separate working files, not OS accounts or credentials. This bundle targets DSH `0.2.2-rc.3` and should not be enabled alongside another bundle that mounts the same `worktrees` service.

## Local memory

Plugin task records live under `~/.dsh/superagent-lite/tasks/`. Memories and archived worker turns live under `~/.dsh/superagent-lite/memory/`. Archives contain the raw Session events of completed turns and may include sensitive conversation material. They are not searchable through the plugin’s model tools.

The router and active workers can use `superagent_memory` when a task needs a saved fact or the user asks to save one. Public knowledge is local to this installation, not published on the internet. The router can save short user-profile facts when asked or when routing needs one, which are included only in Superagent 轻量版会话, or record private credential **reference names**, never credential values. Team memory is accessible to workers of the matching team and project. A worker can call `extract_team_memory` to send selected non-secret findings to a separate read-only memory agent; the full archive is not sent. Worktree and memory-tool boundaries are not a separate OS security sandbox.
