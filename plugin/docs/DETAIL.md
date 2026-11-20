# Superagent lite

Start a new Session and select **Superagent lite**. Ask a question to get a direct reply, or request executable work in a named team’s Git project. The target checkout must have a branch and a clean working tree. Each worker starts in a separate branch and worktree. Worker instructions enter only the dispatched session, and the independent reviewer sees only the committed patch and task requirements.

The **Project tasks** panel shows task IDs, state, and links to the router, worker, and any GitHub pull request. Refresh the panel to retrieve the latest status. The router can send a follow-up to an unpublished task’s existing worker; a published change is a separate task.

- **Local-only repository:** To authorize a reviewed merge, run `/merge-worker <task ID>` in the original router Session. The target branch must still be checked out and clean; conflicting merges are refused. No push is made.
- **GitHub repository:** With a recognized `origin`, authenticated `gh`, DSH full-access permission and enforced required CI checks, the Host publishes the reviewed commit and requests squash auto-merge only after required checks pass. The request is pinned to the reviewed SHA. GitHub branch protection and review rules still apply. Missing or failed checks block delivery. Interrupted runs do not automatically retry GitHub writes.

The worktree service retains worker branches and checkouts for recovery. Worktrees separate working files, not OS accounts or credentials. This bundle targets DSH `0.2.2-rc.3` and should not be enabled alongside another bundle that mounts the same `worktrees` service.
