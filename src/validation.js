const MODES = ['change', 'report', 'answer']

export function validateDispatchArguments(args) {
  const mode = args?.mode
  if (!MODES.includes(mode)) throw new TypeError('mode must be change, report, or answer')
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
  if (mode === 'report' && land) throw new TypeError('report-only tasks cannot be authorized to land')
  return { delegate: true, title, teamId: args.teamId, task, mode, land }
}

export function validateLandFlag(value) {
  if (value !== undefined && typeof value !== 'boolean') throw new TypeError('land must be true or false')
  return value === true
}

export function validTeamId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)
}
