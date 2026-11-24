import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

const VERSION = 1

export const MAX_FIELD_LENGTH = 4_000
export const MAX_SKILL_DESCRIPTION = 500
export const MAX_KNOWLEDGE_TEXT = 2_000
export const MAX_KNOWLEDGE_ENTRIES = 200
export const KNOWLEDGE_QUERY_LIMIT = 20

export const GLOBAL_FIELDS = Object.freeze(['userProfile'])
export const PROJECT_FIELDS = Object.freeze(['responsibilities', 'positioning'])
export const SKILL_FIELDS = Object.freeze([
  'sharedSkillDescription', 'sharedSkillContent',
  'projectSkillDescription', 'projectSkillContent',
])
export const MEMORY_FIELDS = Object.freeze([...GLOBAL_FIELDS, ...PROJECT_FIELDS, ...SKILL_FIELDS])

export const SKILL_NAMES = Object.freeze({
  global: 'superagent-shared-memory',
  project: 'superagent-project-memory',
})

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const KNOWLEDGE_ID = /^[a-z0-9-]{1,64}$/
const writes = new Map()

function serialize(key, operation) {
  const previous = writes.get(key) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(operation)
  writes.set(key, current)
  return current.finally(() => {
    if (writes.get(key) === current) writes.delete(key)
  })
}

function emptyGlobal() {
  return Object.fromEntries(GLOBAL_FIELDS.map(field => [field, '']))
}

function emptyProject(projectRoot) {
  return { projectRoot, ...Object.fromEntries(PROJECT_FIELDS.map(field => [field, ''])) }
}

function fieldValue(value, field, limit = MAX_FIELD_LENGTH) {
  if (value === undefined) return ''
  if (typeof value !== 'string') throw new TypeError(`Memory field "${field}" must be a string`)
  const text = value.trim()
  if (text.length > limit) {
    throw new TypeError(`Memory field "${field}" must contain at most ${limit} characters`)
  }
  return text
}

function projectRootOf(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || !isAbsolute(value)) {
    throw new TypeError('Project memory requires an absolute project root')
  }
  return resolve(value)
}

function documentFrom(doc, fields, label) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.version !== VERSION) {
    throw new Error(`Invalid or unsupported ${label} memory`)
  }
  return Object.fromEntries(fields.map(field => [field, fieldValue(doc[field], field)]))
}

async function readDocument(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) throw new Error('Invalid memory storage JSON')
    throw error
  }
}

async function writeDocument(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  await handle.close()
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function writeTextAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  await handle.close()
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function knowledgeText(value) {
  if (typeof value !== 'string') throw new TypeError('Knowledge text must be a string')
  const text = value.trim().replaceAll(/\s+/g, ' ')
  if (!text) throw new TypeError('Knowledge text cannot be empty')
  if (text.length > MAX_KNOWLEDGE_TEXT) {
    throw new TypeError(`Knowledge text must contain at most ${MAX_KNOWLEDGE_TEXT} characters`)
  }
  return text
}

function knowledgeId(value) {
  if (typeof value !== 'string' || !KNOWLEDGE_ID.test(value)) {
    throw new TypeError('Knowledge entry requires a valid id')
  }
  return value
}

function knowledgeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('Invalid knowledge entry')
  }
  return {
    id: knowledgeId(entry.id),
    text: knowledgeText(entry.text),
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString(),
  }
}

function knowledgeFrom(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.version !== VERSION) {
    throw new Error('Invalid or unsupported knowledge base')
  }
  if (!Array.isArray(doc.entries)) throw new Error('Invalid knowledge base entries')
  return doc.entries.map(knowledgeEntry)
}

const KNOWLEDGE_SNIPPET_CONTEXT = 120

function knowledgeSnippet(text, needle) {
  const limit = KNOWLEDGE_SNIPPET_CONTEXT * 2
  if (!needle) return text.length > limit ? `${text.slice(0, limit)}…` : text
  const index = text.toLowerCase().indexOf(needle)
  if (index < 0) return text
  const start = Math.max(0, index - KNOWLEDGE_SNIPPET_CONTEXT)
  const end = Math.min(text.length, index + needle.length + KNOWLEDGE_SNIPPET_CONTEXT)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

function nextKnowledgeId(entries) {
  const highest = entries.reduce((max, entry) => {
    const numeric = /^\d+$/.test(entry.id) ? Number(entry.id) : 0
    return Math.max(max, numeric)
  }, 0)
  return String(highest + 1)
}

function skillNameOf(scope) {
  if (scope !== 'global' && scope !== 'project') throw new TypeError('Skill scope is required')
  return SKILL_NAMES[scope]
}

function parseSkillDocument(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return undefined
  const line = /^description:\s*(.*)$/m.exec(match[1])
  if (!line) return undefined
  let description = line[1].trim()
  if (description.startsWith('"') && description.endsWith('"')) {
    try {
      description = JSON.parse(description)
    } catch {
      return undefined
    }
  }
  if (typeof description !== 'string' || !description) return undefined
  return { description, content: match[2].trim() }
}

function skillDocument(name, description, content) {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${content.trim()}\n`
}

const PROJECT_SKILL_EXCLUDE = `.dsh/skills/${SKILL_NAMES.project}/`

// The project skill lives in the project checkout so later workers can read
// it, but it is host-maintained data and must not dirty the checkout that
// report tasks and local merges require to stay clean. Git's local exclude
// list is the place for that; `.gitignore` itself would be a tracked change.
async function excludeProjectSkill(projectRoot) {
  const gitDirectory = join(projectRoot, '.git')
  let gitDirectoryInfo
  try {
    gitDirectoryInfo = await stat(gitDirectory)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  if (!gitDirectoryInfo.isDirectory()) return
  const exclude = join(gitDirectory, 'info', 'exclude')
  let current
  try {
    current = await readFile(exclude, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    current = ''
  }
  if (current.split(/\r?\n/).includes(PROJECT_SKILL_EXCLUDE)) return
  await mkdir(dirname(exclude), { recursive: true, mode: 0o700 })
  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  await appendFile(exclude, `${prefix}${PROJECT_SKILL_EXCLUDE}\n`, 'utf8')
}

function archivePath(root, source) {
  if (!source || typeof source.sessionId !== 'string' || !source.sessionId ||
      !Number.isSafeInteger(source.seq) || source.seq < 0) {
    throw new TypeError('Raw memory archive requires a Session id and a non-negative event sequence')
  }
  const key = createHash('sha256').update(`${source.sessionId}\0${source.seq}`).digest('hex')
  return join(root, 'task', 'archive', `${key}.json`)
}

export function createMemoryStore(directory = join(homedir(), '.dsh', 'superagent-lite'), options = {}) {
  const root = resolve(directory)
  const memoryRoot = join(root, 'memory')
  const agentsHome = options.agentsHome ?? (process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'))
  const globalSkillRoot = options.globalSkillRoot ?? join(agentsHome, 'skills')

  function projectPath(projectRoot) {
    return join(memoryRoot, 'projects', `${createHash('sha256').update(projectRoot).digest('hex')}.json`)
  }

  function knowledgePath() {
    return join(memoryRoot, 'knowledge.json')
  }

  function skillPath(scope, projectRoot) {
    const name = skillNameOf(scope)
    if (!SKILL_NAME.test(name)) throw new Error('Invalid memory skill name')
    return scope === 'global'
      ? join(globalSkillRoot, name, 'SKILL.md')
      : join(projectRootOf(projectRoot), '.dsh', 'skills', name, 'SKILL.md')
  }

  async function readGlobal() {
    const doc = await readDocument(join(memoryRoot, 'global.json'))
    return doc === undefined ? emptyGlobal() : documentFrom(doc, GLOBAL_FIELDS, 'global')
  }

  async function readProject(projectRoot) {
    const resolved = projectRootOf(projectRoot)
    const doc = await readDocument(projectPath(resolved))
    if (doc === undefined) return emptyProject(resolved)
    if (doc.projectRoot !== undefined && doc.projectRoot !== resolved) {
      throw new Error('Stored project memory belongs to a different project root')
    }
    return { projectRoot: resolved, ...documentFrom(doc, PROJECT_FIELDS, 'project') }
  }

  async function readMemory(projectRoot) {
    return { global: await readGlobal(), project: await readProject(projectRoot) }
  }

  function changesOf(changes, fields, label) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw new TypeError(`A ${label} memory update is required`)
    }
    const update = {}
    for (const [field, value] of Object.entries(changes)) {
      if (!fields.includes(field)) throw new TypeError(`Unknown ${label} memory field "${field}"`)
      update[field] = fieldValue(value, field)
    }
    return update
  }

  function differs(current, update, fields) {
    return fields.some(field => Object.hasOwn(update, field) && update[field] !== current[field])
  }

  async function writeGlobal(changes) {
    const update = changesOf(changes, GLOBAL_FIELDS, 'global')
    return serialize(join(memoryRoot, 'global.json'), async () => {
      const current = await readGlobal()
      if (!differs(current, update, GLOBAL_FIELDS)) return current
      const next = { ...current, ...update }
      await writeDocument(join(memoryRoot, 'global.json'), { version: VERSION, ...next })
      return next
    })
  }

  async function writeProject(projectRoot, changes) {
    const resolved = projectRootOf(projectRoot)
    const update = changesOf(changes, PROJECT_FIELDS, 'project')
    return serialize(projectPath(resolved), async () => {
      const current = await readProject(resolved)
      if (!differs(current, update, PROJECT_FIELDS)) return current
      const next = { ...current, ...update }
      await writeDocument(projectPath(resolved), { version: VERSION, ...next })
      return next
    })
  }

  async function writeMemory(projectRoot, { global: globalChanges = {}, project: projectChanges = {} }) {
    return {
      global: await writeGlobal(globalChanges),
      project: await writeProject(projectRoot, projectChanges),
    }
  }

  async function readKnowledge() {
    const doc = await readDocument(knowledgePath())
    return doc === undefined ? [] : knowledgeFrom(doc)
  }

  async function mutateKnowledge(change) {
    const path = knowledgePath()
    return serialize(path, async () => {
      const doc = await readDocument(path)
      const entries = doc === undefined ? [] : knowledgeFrom(doc)
      const result = change(entries)
      if (result.changed) await writeDocument(path, { version: VERSION, entries: result.entries })
      return result.value
    })
  }

  async function addKnowledge(value) {
    const text = knowledgeText(value)
    return mutateKnowledge(entries => {
      const existing = entries.find(entry => entry.text === text)
      if (existing) return { changed: false, entries, value: { entry: existing, duplicate: true } }
      if (entries.length >= MAX_KNOWLEDGE_ENTRIES) {
        throw new RangeError(`Knowledge base is limited to ${MAX_KNOWLEDGE_ENTRIES} entries`)
      }
      const now = new Date().toISOString()
      const entry = { id: nextKnowledgeId(entries), text, createdAt: now, updatedAt: now }
      return { changed: true, entries: [entry, ...entries], value: { entry, duplicate: false } }
    })
  }

  async function updateKnowledge(id, value) {
    const entryId = knowledgeId(id)
    const text = knowledgeText(value)
    return mutateKnowledge(entries => {
      const index = entries.findIndex(entry => entry.id === entryId)
      if (index < 0) throw new Error(`Knowledge entry "${entryId}" was not found`)
      if (entries.some(entry => entry.id !== entryId && entry.text === text)) {
        throw new Error('An identical knowledge entry already exists')
      }
      if (entries[index].text === text) return { changed: false, entries, value: entries[index] }
      const entry = { ...entries[index], text, updatedAt: new Date().toISOString() }
      const next = [...entries]
      next[index] = entry
      return { changed: true, entries: next, value: entry }
    })
  }

  async function deleteKnowledge(id) {
    const entryId = knowledgeId(id)
    return mutateKnowledge(entries => {
      const index = entries.findIndex(entry => entry.id === entryId)
      if (index < 0) throw new Error(`Knowledge entry "${entryId}" was not found`)
      const entry = entries[index]
      return { changed: true, entries: entries.filter(candidate => candidate.id !== entryId), value: entry }
    })
  }

  async function searchKnowledge(query = '', limit = 10) {
    if (typeof query !== 'string') throw new TypeError('Knowledge query must be a string')
    if (query.length > 500) throw new TypeError('Knowledge query must contain at most 500 characters')
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > KNOWLEDGE_QUERY_LIMIT) {
      throw new TypeError(`Knowledge query limit must be an integer from 1 to ${KNOWLEDGE_QUERY_LIMIT}`)
    }
    const needle = query.trim().toLowerCase()
    const entries = await readKnowledge()
    return entries
      .filter(entry => !needle || entry.text.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(entry => ({ ...entry, snippet: knowledgeSnippet(entry.text, needle) }))
  }

  async function getKnowledge(ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new TypeError('Knowledge entry ids are required')
    const entryIds = ids.map(knowledgeId)
    const entries = new Map((await readKnowledge()).map(entry => [entry.id, entry]))
    return entryIds.map(id => ({ id, entry: entries.get(id) }))
  }

  async function readSkill(scope, projectRoot) {
    const path = skillPath(scope, projectRoot)
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
    return parseSkillDocument(text)
  }

  async function readSkills(projectRoot) {
    return {
      global: await readSkill('global', projectRoot),
      project: await readSkill('project', projectRoot),
    }
  }

  async function writeSkill(scope, projectRoot, changes) {
    const description = fieldValue(changes?.description, 'skillDescription', MAX_SKILL_DESCRIPTION)
    const content = fieldValue(changes?.content, 'skillContent')
    if (!description) return undefined
    const resolved = scope === 'project' ? projectRootOf(projectRoot) : undefined
    const path = skillPath(scope, resolved)
    return serialize(path, async () => {
      const current = await readSkill(scope, resolved)
      if (current && current.description === description && current.content === content) return current
      await writeTextAtomic(path, skillDocument(skillNameOf(scope), description, content))
      if (scope === 'project') await excludeProjectSkill(resolved)
      return { description, content }
    })
  }

  async function writeArchive(source, value) {
    const path = archivePath(root, source)
    await writeDocument(path, { version: VERSION, source, value })
  }

  async function readArchive(source) {
    const doc = await readDocument(archivePath(root, source))
    if (doc === undefined) return undefined
    if (doc.version !== VERSION || doc.source?.sessionId !== source.sessionId || doc.source?.seq !== source.seq) {
      throw new Error('Invalid or unsupported raw memory archive record')
    }
    return doc.value
  }

  return {
    root,
    memoryRoot,
    readGlobal,
    readProject,
    readMemory,
    writeGlobal,
    writeProject,
    writeMemory,
    readKnowledge,
    addKnowledge,
    updateKnowledge,
    deleteKnowledge,
    searchKnowledge,
    getKnowledge,
    readSkill,
    readSkills,
    writeSkill,
    archive: Object.freeze({ write: writeArchive, read: readArchive }),
  }
}

