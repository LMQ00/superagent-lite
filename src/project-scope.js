import { resolve, sep } from 'node:path'

// A Router Session works in one directory and every Task records the project
// root it was dispatched from. A Router-facing task read is scoped to both the
// Session and that directory, so a session moved to another project cannot read
// the tasks of the project it left.
export function routerDirectory(ctx, agent) {
  try {
    const directory = ctx?.workingDirectory?.get?.(agent?.session)
    if (typeof directory === 'string' && directory) return directory
  } catch {
    // Fall through to the Session header when no working-directory service is mounted.
  }
  const header = agent?.session?.header?.cwd
  return typeof header === 'string' && header ? header : undefined
}

export function belongsToProject(task, directory) {
  if (typeof directory !== 'string' || !directory) return true
  const projectRoot = task?.projectRoot
  if (typeof projectRoot !== 'string' || !projectRoot) return false
  const root = resolve(projectRoot)
  const current = resolve(directory)
  return current === root || current.startsWith(`${root}${sep}`)
}
