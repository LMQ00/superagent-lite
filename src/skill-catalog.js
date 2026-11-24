export const WORKER_PRESET = 'superagent-lite-worker'

// A live worker or reviewer keeps the skill catalog it published when its
// session started. Memory-owned skills are written while the reporting worker
// is still finishing, and a replacement catalog at that point makes an already
// delivered session act again; later tasks read the new description when they
// are created. Skills memory writes carry `author: memory` in their
// frontmatter. The callback reads those authors from the skill files, so this
// guard never relies on a separate name list. A skill without an author keeps
// normal catalog behavior.
function changedSkillNames(before, after) {
  const previous = new Map(before.map(entry => [entry.name, entry.description]))
  const next = new Map(after.map(entry => [entry.name, entry.description]))
  const names = new Set([...previous.keys(), ...next.keys()])
  return [...names].filter(name => previous.get(name) !== next.get(name))
}

function removedSkillNames(before, after) {
  const names = new Set(after.map(entry => entry.name))
  return new Set(before.map(entry => entry.name).filter(name => !names.has(name)))
}

export function createWorkerSkillCatalogGuard(ctx, { authoredSkills = async () => new Set() } = {}) {
  const baselines = new Map()
  const authored = new Map()

  async function preStep({ agent }, next) {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if (ctx.agentPresets?.composedPreset(agent.ctx) !== WORKER_PRESET) return decision
    const catalog = decision.messages.find(message => message.source?.kind === 'skill-catalog')
    if (catalog === undefined) return decision
    const entries = catalog.source.entries
    if (catalog.source.update !== true) {
      baselines.set(agent.id, entries)
      authored.set(agent.id, await authoredSkills(agent))
      return decision
    }
    const baseline = baselines.get(agent.id)
    if (baseline === undefined) {
      return { ...decision, messages: decision.messages.filter(message => message !== catalog) }
    }
    const changed = changedSkillNames(baseline, entries)
    if (changed.length > 0) {
      const current = await authoredSkills(agent)
      const previous = authored.get(agent.id) ?? new Set()
      const removed = removedSkillNames(baseline, entries)
      // A file that was deleted has no frontmatter left to read, so a removed
      // name counts as memory-authored when the last observation saw its
      // author. Added and modified skills use the current author.
      const owned = name => current.has(name) || (removed.has(name) && previous.has(name))
      authored.set(agent.id, new Set([...previous, ...current]))
      if (changed.every(name => owned(name))) {
        return { ...decision, messages: decision.messages.filter(message => message !== catalog) }
      }
    }
    baselines.set(agent.id, entries)
    return decision
  }

  function forget(agentId) {
    baselines.delete(agentId)
    authored.delete(agentId)
  }

  return { preStep, forget }
}
