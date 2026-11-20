# Superagent 轻量版

Start a new Session and select **Superagent 轻量版**. To install the bundle in DSH Web, open **Plugins → Add plugin** and select the repository’s root directory. Ask a question to get a direct reply, or request executable work in a named team’s Git project. The target checkout must have a branch and a clean working tree. Each worker starts in a separate branch and worktree. Worker instructions enter only the dispatched session, and the independent reviewer sees only the committed patch and task requirements.

The **Project tasks** panel shows task IDs, state, and links to the router, worker, and any GitHub pull request. Refresh the panel to retrieve the latest status. The router can send a follow-up to an unpublished task’s existing worker; a published change is a separate task.

- **Local-only repository:** To authorize a reviewed merge, run `/merge-worker <task ID>` in the original router Session. The target branch must still be checked out and clean; conflicting merges are refused. No push is made.
- **GitHub repository:** With a recognized `origin`, authenticated `gh`, DSH full-access permission and enforced required CI checks, the Host publishes the reviewed commit and requests squash auto-merge only after required checks pass. The request is pinned to the reviewed SHA. GitHub branch protection and review rules still apply. Missing or failed checks block delivery. Interrupted runs do not automatically retry GitHub writes.

The worktree service retains worker branches and checkouts for recovery. Worktrees separate working files, not OS accounts or credentials. This bundle targets DSH `0.2.2-rc.3` and should not be enabled alongside another bundle that mounts the same `worktrees` service.

## Local memory

Plugin task records live under `~/.dsh/superagent-lite/tasks/`. Memories and archived worker turns live under `~/.dsh/superagent-lite/memory/`. Archives contain the raw Session events of completed turns and may include sensitive conversation material. They are not searchable through the plugin’s model tools.

The router and active workers can use `superagent_memory` on demand. Public knowledge is local to this installation, not published on the internet. The router can save short user-profile facts, which are included only in Superagent 轻量版会话, or record private credential **reference names**, never credential values. Team memory is accessible to workers of the matching team and project. A worker can call `extract_team_memory` to send selected non-secret findings to a separate read-only memory agent; the full archive is not sent. Worktree and memory-tool boundaries are not a separate OS security sandbox.
