export const WORKER_PRESET = 'superagent-lite-worker'

// A live worker or reviewer keeps the skill catalog it published when its
// session started. Memory-owned skills are written while the reporting worker
// is still finishing, and a replacement catalog at that point makes an already
// delivered session act again; later tasks read the new description when they
// are created. `ownedSkills` reports the current memory-owned names from the
// ownership record memory keeps when it writes a skill, so this guard never
// guesses from names.
function changedSkillNames(before, after) {
  const previous = new Map(before.map(entry => [entry.name, entry.description]))
  const next = new Map(after.map(entry => [entry.name, entry.description]))
  const names = new Set([...previous.keys(), ...next.keys()])
  return [...names].filter(name => previous.get(name) !== next.get(name))
}

export function createWorkerSkillCatalogGuard(ctx, { ownedSkills = () => new Set() } = {}) {
  const baselines = new Map()

  async function preStep({ agent }, next) {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if (ctx.agentPresets?.composedPreset(agent.ctx) !== WORKER_PRESET) return decision
    const catalog = decision.messages.find(message => message.source?.kind === 'skill-catalog')
    if (catalog === undefined) return decision
    const entries = catalog.source.entries
    if (catalog.source.update !== true) {
      baselines.set(agent.id, entries)
      return decision
    }
    const baseline = baselines.get(agent.id)
    if (baseline === undefined) {
      return { ...decision, messages: decision.messages.filter(message => message !== catalog) }
    }
    const changed = changedSkillNames(baseline, entries)
    if (changed.length > 0) {
      const owned = await ownedSkills(agent)
      if (changed.every(name => owned.has(name))) {
        return { ...decision, messages: decision.messages.filter(message => message !== catalog) }
      }
    }
    baselines.set(agent.id, entries)
    return decision
  }

  function forget(agentId) {
    baselines.delete(agentId)
  }

  return { preStep, forget }
}
