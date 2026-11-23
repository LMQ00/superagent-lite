const MODES = ['change', 'report', 'answer', 'merge']
const BRANCH_NAME = /^[A-Za-z0-9._/-]{1,200}$/
const TASK_ID = /^[a-f0-9]{16}$/
const MAX_MERGE_TARGETS = 20
const WORKTREE_NAME = /^[a-z]+(?:-[a-z0-9]+){0,3}$/

function validateWorktreeName(value, mode) {
  if (mode !== 'change' && mode !== 'merge') {
    if (value !== undefined) throw new TypeError('worktreeName is only accepted for change and merge tasks')
    return undefined
  }
  if (typeof value !== 'string') throw new TypeError('worktreeName is required')
  const name = value.trim()
  if (name.length > 32 || !WORKTREE_NAME.test(name)) {
    throw new RangeError('worktreeName must be 1-4 lowercase English kebab-case words, at most 32 characters')
  }
  return name
}

function validateMergeTargets(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('branches must list at least one branch or task ID')
  if (value.length > MAX_MERGE_TARGETS) throw new RangeError(`branches must list at most ${MAX_MERGE_TARGETS} targets`)
  const targets = value.map(target => typeof target === 'string' ? target.trim() : '')
  for (const target of targets) {
    if (!TASK_ID.test(target) && (!BRANCH_NAME.test(target) || target.startsWith('-'))) {
      throw new TypeError('each merge target must be a branch name or a 16-character task ID')
    }
  }
  return [...new Set(targets)]
}

export function validateDispatchArguments(args) {
  const mode = args?.mode
  if (!MODES.includes(mode)) throw new TypeError('mode must be change, report, answer, or merge')
  if (mode === 'answer') return { delegate: false, mode }
  if (typeof args.teamId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(args.teamId)) {
    throw new TypeError('teamId must use 1-64 letters, digits, dots, underscores, or hyphens')
  }
  if (typeof args.title !== 'string') throw new TypeError('title is required')
  if (typeof args.task !== 'string') throw new TypeError('task is required')
  const title = args.title.trim()
  const task = args.task.trim()
  if (!title || title.length > 120) throw new RangeError('title must be 1-120 characters')
  if (!task || task.length > 20000) throw new RangeError('task must be 1-20000 characters')
  const land = validateLandFlag(args.land)
  const worktreeName = validateWorktreeName(args.worktreeName, mode)
  if (mode === 'report' && land) throw new TypeError('report-only tasks cannot be authorized to land')
  if (mode === 'merge') {
    if (!land) throw new TypeError('merge tasks require land=true')
    return { delegate: true, title, teamId: args.teamId, task, mode, land, worktreeName, branches: validateMergeTargets(args.branches) }
  }
  if (args.branches !== undefined) throw new TypeError('branches are only accepted for merge tasks')
  return { delegate: true, title, teamId: args.teamId, task, mode, land, ...(worktreeName ? { worktreeName } : {}) }
}

export function validateLandFlag(value) {
  if (value !== undefined && typeof value !== 'boolean') throw new TypeError('land must be true or false')
  return value === true
}

export function validTeamId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)
}
