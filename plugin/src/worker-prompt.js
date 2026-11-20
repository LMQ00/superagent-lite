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
    '3. After implementation, start a separate read-only subagent to review the diff for bugs, regressions, and missing tests. Fix every finding and ask the reviewer to check again; do not report ready while actionable findings remain.',
    '4. Commit the finished work on the worktree branch.',
    '5. Stop after the reviewed commit and report its branch. Do not push or merge this change yourself.',
    '',
    'Do not perform work outside this project or claim tests, review, CI, or merge succeeded unless you observed the result.',
  ].join('\n')
}
