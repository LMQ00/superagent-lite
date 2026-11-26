/**
 * Build the activation spec for the installed subagent service. DSH 0.2.2-rc.1
 * nests the task under `request`; 0.2.2-rc.2 through 0.2.3-alpha.1 spread it on
 * the spec. `drainChildren` exists only on the rc.1 service, so it selects the
 * shape without reading the installed package.
 */
export function activationSpec(subagents, spec) {
  if (typeof subagents?.drainChildren !== 'function') return spec
  const { provider, label, childId, signal, delivery, ...request } = spec
  return { provider, label, childId, signal, delivery, request }
}

export function startActivation(subagents, spec) {
  return subagents.startActivation(activationSpec(subagents, spec))
}
