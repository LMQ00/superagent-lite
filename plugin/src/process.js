export async function runCommand(ctx, args, cwd, signal) {
  const executable = await ctx.subprocess.resolveExecutable('git', undefined, signal)
  const child = ctx.subprocess.spawn({
    argv: [executable, '-c', 'core.hooksPath=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'), '-c', 'core.fsmonitor=false', ...args],
    cwd,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: 65536 },
      stderr: { maxBytes: 65536 },
    },
    graceMs: 5000,
    signal,
  })
  const outcome = await child.done
  const stdout = child.collected.stdout?.readFrom(0).text ?? ''
  const stderr = child.collected.stderr?.readFrom(0).text ?? ''
  if (outcome.exitCode !== 0) {
    throw new Error(stderr.trim() || `git exited with status ${outcome.exitCode ?? outcome.signal}`)
  }
  return stdout.trim()
}
