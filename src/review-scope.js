import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

// A reviewer reads the change itself, so the prompt no longer carries a patch.
// This module defines what "the change" means for that reviewer: the worktree
// plus the commits base..head. The helper guard asks it to admit or refuse each
// read, and it remembers which admitted calls actually covered the change.

const SHELL_OPERATORS = /[;&|<>`$(){}*?~!\\"'\n\r]/
const DENIED_FLAGS = [
  '--all', '--branches', '--tags', '--remotes', '--glob', '--exclude',
  '--reflog', '--walk-reflogs', '--source', '--decorate-refs',
  '--cached', '--staged', '--no-index', '--ext-diff', '--textconv',
  '--output', '--relative', '--src-prefix', '--dst-prefix', '--line-prefix',
]
const DENIED_SHORT_FLAGS = new Set(['-a'])
const GIT_SUBCOMMANDS = new Set(['diff', 'show', 'log', 'status'])
const READ_ONLY_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'file', 'stat'])
const FILE_ARGUMENT_TOOLS = new Set(['read', 'read_image', 'grep', 'glob'])

function outsideRoot(root, candidate) {
  const rel = relative(root, candidate)
  return rel !== '' && (isAbsolute(rel) || rel.split(/[\\/]/)[0] === '..')
}

function firstSegment(root, candidate) {
  return relative(root, candidate).split(/[\\/]/)[0]
}

function deniedFlag(token) {
  const name = token.split('=')[0]
  return DENIED_FLAGS.includes(name) || DENIED_SHORT_FLAGS.has(token) ||
    name.startsWith('--submodule') || name === '--recurse-submodules'
}

export function createReviewScope({ worktree, baseCommit, headCommit, changedFiles = [] }) {
  const root = resolve(worktree)
  const changed = new Set(changedFiles.map(file => resolve(root, file)))
  const evidence = { diff: false, file: false }

  function revisionRole(token) {
    if (token === 'HEAD') return 'head'
    if (token === baseCommit) return 'base'
    if (token === headCommit) return 'head'
    if (token.length >= 7 && baseCommit.startsWith(token)) return 'base'
    if (token.length >= 7 && headCommit.startsWith(token)) return 'head'
    return undefined
  }

  function rangeRoles(token) {
    const parts = token.split('..')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined
    const from = revisionRole(parts[0])
    const to = revisionRole(parts[1])
    return from && to ? new Set([from, to]) : undefined
  }

  function pathProblem(value) {
    if (typeof value !== 'string' || value.length === 0) return undefined
    if (value.startsWith(':')) {
      return `Review scope: "${value}" is outside the worker worktree; inspect only ${root} and ${baseCommit}..${headCommit}.`
    }
    const target = isAbsolute(value) ? resolve(value) : resolve(root, value)
    if (target !== root && outsideRoot(root, target)) {
      return `Review scope: "${value}" is outside the worker worktree; inspect only ${root} and ${baseCommit}..${headCommit}.`
    }
    if (firstSegment(root, target) === '.git') {
      return 'Review scope: repository internals under .git are outside the reviewer scope.'
    }
    try {
      const real = realpathSync(target)
      if (real !== root && outsideRoot(root, real)) {
        return `Review scope: "${value}" resolves outside the worker worktree.`
      }
      if (firstSegment(root, real) === '.git') {
        return 'Review scope: repository internals under .git are outside the reviewer scope.'
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    return undefined
  }

  function inspectCommand(command) {
    const refused = reason => ({ ok: false, reason, evidence: false })
    if (typeof command !== 'string' || command.trim().length === 0) {
      return refused('Review scope: the reviewer must run an explicit inspection command.')
    }
    if (SHELL_OPERATORS.test(command)) {
      return refused('Review scope: only a single plain inspection command is allowed (no shell operators or quoting).')
    }
    const tokens = command.trim().split(/\s+/)
    if (tokens[0] !== 'git') {
      if (!READ_ONLY_COMMANDS.has(tokens[0])) {
        return refused('Review scope: only read-only inspection commands and git diff, git show, git log, and git status are allowed, run from the worker worktree.')
      }
      for (const token of tokens.slice(1)) {
        if (token.startsWith('-')) continue
        const problem = pathProblem(token)
        if (problem) return refused(problem)
      }
      return { ok: true, reason: undefined, evidence: false }
    }
    let index = 1
    if (tokens[index] === '--no-pager') index += 1
    const subcommand = tokens[index]
    index += 1
    if (!GIT_SUBCOMMANDS.has(subcommand)) {
      return refused(`Review scope: git ${subcommand ?? '(missing)'} is not an allowed inspection command.`)
    }

    const roles = new Set()
    let sawRevision = false
    let pathsOnly = false
    let logPatch = false
    const finish = wanted => {
      if (!sawRevision) return refused(`Review scope: git ${subcommand} must name the base and head revisions.`)
      for (const role of wanted) {
        if (!roles.has(role)) return refused(`Review scope: git ${subcommand} must stay within ${baseCommit}..${headCommit}.`)
      }
      if (subcommand === 'diff') return { ok: true, reason: undefined, evidence: true }
      return { ok: true, reason: undefined, evidence: roles.has('head') }
    }

    for (; index < tokens.length; index += 1) {
      const token = tokens[index]
      if (pathsOnly) {
        const problem = pathProblem(token)
        if (problem) return refused(problem)
        continue
      }
      if (token === '--') {
        if (subcommand === 'status') return refused('Review scope: git status does not take path arguments.')
        pathsOnly = true
        continue
      }
      if (token.startsWith('-')) {
        if (deniedFlag(token)) return refused(`Review scope: ${token} widens the git inspection beyond ${baseCommit}..${headCommit}.`)
        if (subcommand === 'log' && ['-p', '-u', '--patch', '--patch-with-stat', '--raw'].includes(token)) logPatch = true
        if (subcommand === 'log' && (token.startsWith('-U') || token.startsWith('--unified'))) logPatch = true
        continue
      }
      if (subcommand === 'status') {
        return refused('Review scope: git status takes flags only.')
      }
      const range = rangeRoles(token)
      if (range) {
        sawRevision = true
        for (const role of range) roles.add(role)
        continue
      }
      const role = revisionRole(token)
      if (role) {
        sawRevision = true
        roles.add(role)
        continue
      }
      if (subcommand === 'show') {
        const separator = token.indexOf(':')
        if (separator > 0) {
          const fileRevision = revisionRole(token.slice(0, separator))
          if (!fileRevision) return refused(`Review scope: git show may only read ${baseCommit} or ${headCommit}.`)
          const problem = pathProblem(token.slice(separator + 1))
          if (problem) return refused(problem)
          sawRevision = true
          roles.add(fileRevision)
          continue
        }
      }
      return refused(`Review scope: "${token}" is outside ${baseCommit}..${headCommit}.`)
    }

    if (subcommand === 'log') {
      for (const role of ['base', 'head']) {
        if (!roles.has(role)) return refused(`Review scope: git log must use ${baseCommit}..${headCommit}.`)
      }
      return { ok: true, reason: undefined, evidence: logPatch }
    }
    if (subcommand === 'status') {
      return { ok: true, reason: undefined, evidence: false }
    }
    return finish(subcommand === 'diff' ? ['base', 'head'] : [])
  }

  return {
    worktree: root,
    baseCommit,
    headCommit,
    changedFiles: changed,

    checkPath: pathProblem,

    checkFileTool(name, input) {
      if (!FILE_ARGUMENT_TOOLS.has(name)) return undefined
      if (name === 'read' || name === 'read_image') return pathProblem(input?.file_path)
      return input?.path === undefined ? undefined : pathProblem(input.path)
    },

    checkCommand(command) {
      const result = inspectCommand(command)
      return result.ok ? undefined : result.reason
    },

    checkWorkdir(workdir) {
      if (workdir === undefined) return undefined
      if (typeof workdir !== 'string') {
        return `Review scope: workdir must be a path inside the worker worktree (${root}).`
      }
      return pathProblem(workdir)
    },

    record(name, input) {
      if (name === 'bash' || name === 'pwsh') {
        const result = inspectCommand(input?.command)
        if (result.ok && result.evidence) evidence.diff = true
        return
      }
      if (name === 'read' || name === 'read_image') {
        if (typeof input?.file_path === 'string' && changed.has(resolve(root, input.file_path))) evidence.file = true
        return
      }
      if (name === 'grep' && typeof input?.path === 'string' && changed.has(resolve(root, input.path))) {
        evidence.file = true
      }
    },

    hasEvidence() {
      return evidence.diff || evidence.file
    },
  }
}
