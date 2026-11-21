export async function runProcess(ctx, command, args, cwd, signal) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && key !== 'GH_DEBUG'))
  Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GH_PROMPT_DISABLED: '1' })
  const executable = await ctx.subprocess.resolveExecutable(command, env, signal)
  const child = ctx.subprocess.spawn({
    argv: [executable, ...args], cwd, env,
    stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } },
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
  if (stdout?.lossy) throw new Error(`${command} output exceeded the plugin limit`)
  return stdout?.text.trimEnd() ?? ''
}

export function runCommand(ctx, args, cwd, signal) {
  return runProcess(ctx, 'git', [
    '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
    '-c', 'core.fsmonitor=false', ...args,
  ], cwd, signal)
}
