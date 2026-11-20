# Superagent lite

Superagent lite routes project work to isolated DSH workers. The router selects a project team when dispatching a task, and the worker must create a Git worktree before using its work tools. The detailed checklist is sent only on dispatch: run relevant tests, ask a separate read-only reviewer to review the change, and commit on the worker branch. This version does not push or merge worker changes.
