function commandLabel(command, args) {
  let index = 0
  while (args[index] === '-c' && index + 1 < args.length) index += 2
  return args[index] ? `${command} ${args[index]}` : command
}

export async function runProcess(ctx, command, args, cwd, signal, maxBytes = 65536) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && key !== 'GH_DEBUG'))
  Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GH_PROMPT_DISABLED: '1' })
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
    const error = new Error(`${command} ${args[0]} exited with status ${outcome.exitCode ?? outcome.signal}`)
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
