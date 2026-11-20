export function buildWorkerPrompt({ title, teamId, task, baseBranch }) {
  return [
    `Project team: ${teamId}`,
    `Base branch: ${baseBranch}`,
    `Task: ${title}`,
    '',
    'Task requirements:',
    task,
    '',
    'Work procedure:',
    '1. Before editing project files, call create_worktree once and do all work in that checkout. If it fails, do not edit the source checkout; report the failure.',
    '2. Inspect the project, implement the requested change, and run relevant tests.',
    '3. Commit your changes on the assigned worktree branch, then call review_worker_commit. That action opens a separate read-only subagent to review the exact commit.',
    '4. Fix any actionable findings, commit again and repeat the independent review.',
    '5. Do not push or merge this change yourself; stop after the reviewed commit.',
    '6. Before ending the turn, call message_router with the final conclusion: task id, branch, reviewed commit, tests run, and remaining risk. Use message_router earlier too if a requirement change blocks progress.',
    '',
    'Do not perform work outside this project or claim tests, review, CI, or merge succeeded unless you observed the result.',
  ].join('\n')
}
