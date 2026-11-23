import { spawnSync } from 'node:child_process'

function commandLabel(command, args) {
  let index = 0
  while (args[index] === '-c' && index + 1 < args.length) index += 2
  return args[index] ? `${command} ${args[index]}` : command
}

function processEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && key !== 'GH_DEBUG'))
  return Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GH_PROMPT_DISABLED: '1' })
}

export async function runProcess(ctx, command, args, cwd, signal, maxBytes = 65536) {
  const env = processEnv()
  const executable = await ctx.subprocess.resolveExecutable(command, env, signal)
  const child = ctx.subprocess.spawn({
    argv: [executable, ...args], cwd, env,
    stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes } },
    graceMs: 5000, signal,
  })
  const outcome = await child.done
  signal?.throwIfAborted()
  const stdout = child.collected.stdout?.readFrom(0)
  if (outcome.exitCode !== 0) {
    const stderr = child.collected.stderr?.readFrom(0)?.text?.trim()
    const detail = stderr?.split(/\r?\n/).filter(Boolean).at(-1)
    const suffix = detail ? `: ${detail.length > 500 ? `${detail.slice(0, 500)}…` : detail}` : ''
    const error = new Error(`${command} ${args[0]} exited with status ${outcome.exitCode ?? outcome.signal}${suffix}`)
    error.exitCode = outcome.exitCode
    throw error
  }
  if (stdout?.lossy) throw new Error(`${commandLabel(command, args)} output exceeded ${maxBytes} bytes`)
  return stdout?.text.trimEnd() ?? ''
}

export function runCommand(ctx, args, cwd, signal, maxBytes = 65536) {
  return runProcess(ctx, 'git', [
    '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
    '-c', 'core.fsmonitor=false', ...args,
  ], cwd, signal, maxBytes)
}

// Synchronous git is limited to the worker tool guard, which must decide a
// shell command before the host starts it and therefore cannot await.
export function runCommandSync(args, cwd, maxBytes = 65536) {
  const result = spawnSync('git', [
    '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
    '-c', 'core.fsmonitor=false', ...args,
  ], { cwd, env: processEnv(), encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: maxBytes })
  if (result.error || result.status !== 0) return undefined
  return result.stdout.trim()
}
