import { resolve, sep } from 'node:path'

// The reviewer reads the change itself, so the prompt carries no patch. This
// module defines that change as the worktree plus base..head. The reviewer may
// inspect anything and run any command, with one exception: git commands that
// move branches or history are refused. It also remembers which calls actually
// covered the change, because a verdict without evidence is rejected.

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'pwsh', 'powershell'])
const WRAPPERS = new Set([
  'sudo', 'env', 'command', 'exec', 'nohup', 'nice', 'time', 'timeout', 'stdbuf',
  'eval', 'xargs', 'watch', 'setsid', 'parallel', 'find',
])
const GIT_OPTION_VALUES = new Set(['-c', '-C', '--namespace', '--exec-path', '--config-env', '--git-dir', '--work-tree'])
const BLOCKED_GIT_SUBCOMMANDS = new Set([
  'am', 'branch', 'checkout', 'cherry-pick', 'commit', 'commit-tree', 'fetch',
  'filter-branch', 'init', 'merge', 'pull', 'push', 'rebase', 'replace', 'reset',
  'revert', 'stash', 'switch', 'symbolic-ref', 'tag', 'update-ref', 'worktree',
])
const PATCH_FLAGS = new Set(['-p', '-u', '--patch', '--patch-with-stat', '--raw'])

function splitSegments(command) {
  const segments = []
  let current = ''
  let quote
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (quote) {
      current += character
      if (character === quote && command[index - 1] !== '\\') quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '\n' || character === ';' || character === '&' || character === '|') {
      if ((character === '&' || character === '|') && command[index + 1] === character) index += 1
      segments.push(current)
      current = ''
      continue
    }
    current += character
  }
  segments.push(current)
  return segments.filter(segment => segment.trim().length > 0)
}

function tokenize(segment) {
  const tokens = []
  let current = ''
  let quote
  let active = false
  for (const character of segment) {
    if (quote) {
      if (character === quote) quote = undefined
      else current += character
      active = true
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      active = true
      continue
    }
    if (/\s/.test(character)) {
      if (active) {
        tokens.push(current)
        current = ''
        active = false
      }
      continue
    }
    current += character
    active = true
  }
  if (active) tokens.push(current)
  return tokens
}

function stripAssignments(tokens) {
  let index = 0
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1
  return tokens.slice(index)
}

function commandName(token) {
  const base = token.split(/[\\/]/).pop() ?? token
  return base.replace(/^[^A-Za-z0-9._-]+/, '').replace(/\.exe$/i, '').toLowerCase()
}

function isShellScriptFlag(token) {
  return token === '/c' || /^-[a-z]*c$/i.test(token) || token.toLowerCase() === '-command'
}

// Skips git's global options so `git -C path --no-pager commit` is still seen.
function gitSubcommand(tokens, start) {
  let index = start + 1
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === '--') {
      index += 1
      break
    }
    if (GIT_OPTION_VALUES.has(token)) {
      index += 2
      continue
    }
    if (token.startsWith('--') && token.includes('=')) {
      index += 1
      continue
    }
    if (token.startsWith('-')) {
      index += 1
      continue
    }
    break
  }
  return { subcommand: tokens[index]?.toLowerCase(), args: tokens.slice(index + 1) }
}

function gitDenial(tokens, start) {
  const { subcommand } = gitSubcommand(tokens, start)
  if (subcommand && BLOCKED_GIT_SUBCOMMANDS.has(subcommand)) {
    return `Review scope: the reviewer may not create or change git branches, history, or repository state; "git ${subcommand}" is refused.`
  }
  return undefined
}

function inspectSegment(segment) {
  const tokens = stripAssignments(tokenize(segment))
  if (tokens.length === 0) return undefined
  const name = commandName(tokens[0])
  if (SHELLS.has(name)) {
    const flagIndex = tokens.findIndex((token, index) => index > 0 && isShellScriptFlag(token))
    if (flagIndex > 0) return inspectCommand(tokens.slice(flagIndex + 1).join(' '))
    return undefined
  }
  if (WRAPPERS.has(name)) {
    if (name === 'eval') return inspectCommand(tokens.slice(1).join(' '))
    const gitIndex = tokens.findIndex((token, index) => index > 0 && commandName(token) === 'git')
    return gitIndex > 0 ? gitDenial(tokens, gitIndex) : undefined
  }
  if (name === 'git') return gitDenial(tokens, 0)
  return undefined
}

function nestedCommands(command) {
  const nested = []
  const pattern = /[$(<]?\(([^()]*)\)|`([^`]*)`/g
  let match
  while ((match = pattern.exec(command)) !== null) {
    nested.push(match[1] ?? match[2] ?? '')
  }
  return nested.filter(content => content.trim().length > 0)
}

function inspectCommand(command) {
  for (const nested of nestedCommands(command)) {
    const denial = inspectCommand(nested)
    if (denial) return denial
  }
  for (const segment of splitSegments(command)) {
    const denial = inspectSegment(segment)
    if (denial) return denial
  }
  return undefined
}

export function createReviewScope({ worktree, baseCommit, headCommit, changedFiles = [], workspace = false }) {
  const root = resolve(worktree)
  const changed = new Set(changedFiles.map(file => resolve(root, file)))
  const evidence = { diff: false, file: false }

  function insideRoot(file) {
    if (typeof file !== 'string' || !file) return false
    const path = resolve(root, file)
    return path === root || path.startsWith(`${root}${sep}`)
  }

  function revisionRole(token) {
    if (token === 'HEAD') return 'head'
    if (typeof baseCommit === 'string' &&
        (token === baseCommit || (token.length >= 7 && baseCommit.startsWith(token)))) return 'base'
    if (typeof headCommit === 'string' &&
        (token === headCommit || (token.length >= 7 && headCommit.startsWith(token)))) return 'head'
    return undefined
  }

  function rangeRoles(token) {
    const parts = token.replace('...', '..').split('..')
    if (parts.length < 2 || !parts[0] || !parts[1]) return undefined
    const from = revisionRole(parts[0])
    const to = revisionRole(parts[1])
    return from && to ? new Set([from, to]) : undefined
  }

  function diffEvidence(args) {
    const roles = new Set()
    for (const argument of args) {
      if (argument.startsWith('-')) continue
      const range = rangeRoles(argument)
      if (range) {
        for (const role of range) roles.add(role)
        continue
      }
      const role = revisionRole(argument)
      if (role) roles.add(role)
    }
    return roles.has('base') && roles.has('head')
  }

  function showEvidence(args) {
    return args.some(argument => {
      if (argument.startsWith('-')) return false
      return revisionRole(argument.split(':')[0]) === 'head'
    })
  }

  function logEvidence(args) {
    const patch = args.some(argument => PATCH_FLAGS.has(argument) ||
      argument.startsWith('-U') || argument.startsWith('--unified'))
    if (!patch) return false
    return args.some(argument => {
      const range = rangeRoles(argument)
      return range?.has('base') && range?.has('head')
    })
  }

  function gitEvidence(tokens, start) {
    const { subcommand, args } = gitSubcommand(tokens, start)
    if (subcommand === 'diff') return diffEvidence(args)
    if (subcommand === 'show') return showEvidence(args)
    if (subcommand === 'log') return logEvidence(args)
    return false
  }

  function segmentEvidence(segment) {
    const tokens = stripAssignments(tokenize(segment))
    if (tokens.length === 0) return false
    const name = commandName(tokens[0])
    if (SHELLS.has(name)) {
      const flagIndex = tokens.findIndex((token, index) => index > 0 && isShellScriptFlag(token))
      return flagIndex > 0 ? commandEvidence(tokens.slice(flagIndex + 1).join(' ')) : false
    }
    if (WRAPPERS.has(name)) {
      if (name === 'eval') return commandEvidence(tokens.slice(1).join(' '))
      const gitIndex = tokens.findIndex((token, index) => index > 0 && commandName(token) === 'git')
      return gitIndex > 0 ? gitEvidence(tokens, gitIndex) : false
    }
    if (name === 'git') return gitEvidence(tokens, 0)
    return false
  }

  function commandEvidence(command) {
    if (typeof command !== 'string') return false
    if (nestedCommands(command).some(commandEvidence)) return true
    return splitSegments(command).some(segmentEvidence)
  }

  return {
    worktree: root,
    baseCommit,
    headCommit,
    changedFiles: changed,

    checkCommand(command) {
      if (typeof command !== 'string' || command.trim().length === 0) return undefined
      return inspectCommand(command)
    },

    record(name, input) {
      if (name === 'bash' || name === 'pwsh') {
        if (commandEvidence(input?.command)) evidence.diff = true
        return
      }
      if (name === 'read' || name === 'read_image') {
        const file = input?.file_path
        if (typeof file === 'string' &&
            (workspace ? insideRoot(file) : changed.has(resolve(root, file)))) evidence.file = true
        return
      }
      if (name === 'grep' && typeof input?.path === 'string' &&
          (workspace ? insideRoot(input.path) : changed.has(resolve(root, input.path)))) {
        evidence.file = true
      }
    },

    hasEvidence() {
      return evidence.diff || evidence.file
    },
  }
}
