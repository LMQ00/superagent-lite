import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const root = await mkdtemp(join(tmp, 'memory-store-'))
const agentsHome = join(root, 'agents')
const store = (await import('../src/memory-store.js')).createMemoryStore(join(root, 'data'), { agentsHome })

after(async () => {
  await rm(root, { recursive: true, force: true })
})

test('global and project memory start empty and round-trip their fields', async () => {
  const project = join(root, 'project-a')
  assert.deepEqual(await store.readGlobal(), { userProfile: '' })
  assert.deepEqual(await store.readProject(project), {
    projectRoot: project, responsibilities: '', positioning: '',
  })
  await store.writeGlobal({ userProfile: 'Prefers concise reports.' })
  await store.writeProject(project, {
    responsibilities: 'Keep notes accurate.', positioning: 'A note-taking project.',
  })
  const saved = await store.readMemory(project)
  assert.equal(saved.global.userProfile, 'Prefers concise reports.')
  assert.equal(saved.project.responsibilities, 'Keep notes accurate.')
  assert.equal(saved.project.positioning, 'A note-taking project.')
  assert.equal((await store.readProject(join(root, 'project-b'))).responsibilities, '')
})

test('memory updates reject unknown fields, relative roots and invalid documents', async () => {
  const project = join(root, 'project-validation')
  await assert.rejects(store.writeGlobal({ sharedSkill: 'x' }), /Unknown global memory field/)
  await assert.rejects(store.writeProject('relative', { responsibilities: 'x' }), /absolute project root/)
  await assert.rejects(store.writeProject(project, { responsibilities: 1 }), /must be a string/)
  await assert.rejects(store.writeProject(project, { responsibilities: 'x'.repeat(4_001) }), /at most 4000/)
  await mkdir(join(root, 'data', 'memory'), { recursive: true })
  await writeFile(join(root, 'data', 'memory', 'global.json'), '{bad json')
  await assert.rejects(store.readGlobal(), /Invalid memory storage JSON/)
  await writeFile(join(root, 'data', 'memory', 'global.json'), JSON.stringify({ version: 99, userProfile: 'x' }))
  await assert.rejects(store.readGlobal(), /Invalid or unsupported global memory/)
})

test('the global knowledge base deduplicates, snippets matches, corrects and deletes', async () => {
  assert.deepEqual(await store.readKnowledge(), [])
  const first = await store.addKnowledge('  The   test command is npm test. ')
  assert.equal(first.duplicate, false)
  assert.equal(first.entry.id, '1')
  assert.equal(first.entry.text, 'The test command is npm test.')
  const again = await store.addKnowledge('The test command is npm test.')
  assert.equal(again.duplicate, true)
  assert.equal(again.entry.id, first.entry.id)
  const second = await store.addKnowledge('Merge conflicts are resolved in the worktree.')
  assert.equal(second.entry.id, '2')
  assert.equal((await store.searchKnowledge('NPM')).length, 1)
  assert.equal((await store.searchKnowledge('')).length, 2)
  const context = 'A long preamble. '.repeat(12)
  const third = await store.addKnowledge(`${context}The needle appears in the middle. ${'A long tail. '.repeat(12)}`)
  const matches = await store.searchKnowledge('needle')
  assert.equal(matches.length, 1)
  assert.equal(matches[0].id, third.entry.id)
  assert.match(matches[0].snippet, /^…/)
  assert.match(matches[0].snippet, /A long preamble\. The needle appears in the middle\./)
  assert.match(matches[0].snippet, /…$/)
  assert.ok(matches[0].snippet.length < third.entry.text.length)
  assert.deepEqual((await store.getKnowledge([second.entry.id])).map(result => [result.id, result.entry.text]), [
    ['2', 'Merge conflicts are resolved in the worktree.'],
  ])
  const missing = await store.getKnowledge([first.entry.id, '999'])
  assert.equal(missing[0].entry.text, 'The test command is npm test.')
  assert.equal(missing[1].entry, undefined)
  await assert.rejects(store.addKnowledge('   '), /cannot be empty/)
  await assert.rejects(store.searchKnowledge('', 0), /limit must be an integer/)
  await assert.rejects(store.searchKnowledge('x'.repeat(501)), /at most 500/)
  await assert.rejects(store.getKnowledge([]), /ids are required/)
  await assert.rejects(store.getKnowledge(['bad id']), /valid id/)
  await assert.rejects(store.updateKnowledge('missing', 'x'), /was not found/)
  await assert.rejects(store.updateKnowledge(second.entry.id, first.entry.text), /identical/)
  const corrected = await store.updateKnowledge(second.entry.id, 'Resolve merge conflicts inside the worktree.')
  assert.equal(corrected.text, 'Resolve merge conflicts inside the worktree.')
  assert.equal((await store.searchKnowledge('resolve')).length, 1)
  await store.deleteKnowledge(first.entry.id)
  assert.equal((await store.readKnowledge()).length, 2)
  await assert.rejects(store.deleteKnowledge(first.entry.id), /was not found/)
  const saved = JSON.parse(await readFile(join(root, 'data', 'memory', 'knowledge.json'), 'utf8'))
  assert.equal(saved.version, 1)
  assert.equal(saved.entries.length, 2)
})

test('the knowledge file is global and rejects malformed documents', async () => {
  const path = join(root, 'data', 'memory', 'knowledge.json')
  await writeFile(path, JSON.stringify({ version: 99, entries: [] }))
  await assert.rejects(store.readKnowledge(), /Invalid or unsupported knowledge base/)
  await writeFile(path, JSON.stringify({ version: 1, entries: 'nope' }))
  await assert.rejects(store.readKnowledge(), /Invalid knowledge base entries/)
})

test('global and project skills use their own files and only the description is read for the catalog', async () => {
  const project = join(root, 'project-skill')
  assert.equal(await store.readSkill('global', project), undefined)
  assert.equal(await store.readSkill('project', project), undefined)
  await store.writeSkill('global', project, {
    description: 'Reusable inspection guidance across projects.',
    content: 'Inspect the repository before changing it.',
  })
  await store.writeSkill('project', project, {
    description: 'How to work on this project.',
    content: 'Run npm test before reporting.',
  })
  assert.deepEqual(await store.readSkill('global', project), {
    description: 'Reusable inspection guidance across projects.',
    content: 'Inspect the repository before changing it.',
  })
  assert.deepEqual(await store.readSkill('project', project), {
    description: 'How to work on this project.',
    content: 'Run npm test before reporting.',
  })
  const globalFile = join(agentsHome, 'skills', 'superagent-shared-memory', 'SKILL.md')
  const projectFile = join(project, '.dsh', 'skills', 'superagent-project-memory', 'SKILL.md')
  assert.match(await readFile(globalFile, 'utf8'), /^---\nname: superagent-shared-memory\ndescription: "Reusable inspection guidance across projects\."\n---/)
  assert.match(await readFile(projectFile, 'utf8'), /Run npm test before reporting\./)
  assert.deepEqual(await store.readSkills(project), {
    global: { description: 'Reusable inspection guidance across projects.', content: 'Inspect the repository before changing it.' },
    project: { description: 'How to work on this project.', content: 'Run npm test before reporting.' },
  })
  await assert.rejects(store.writeSkill('project', project, { description: 'x'.repeat(501), content: 'x' }), /at most 500/)
})

test('memory records the skills it writes and reports them as owned', async () => {
  const project = join(root, 'project-owned-skills')
  const other = join(root, 'project-owned-skills-other')
  await store.writeSkill('global', project, {
    description: 'Shared inspection skill.', content: 'Inspect first.',
  })
  await store.writeSkill('project', project, {
    description: 'Project skill.', content: 'Run the tests.',
  })
  await store.writeSkill('project', project, {
    name: 'superagent-lite-test-conventions',
    description: 'Test conventions.', content: 'Run the suite.',
  })
  await mkdir(join(project, '.dsh', 'skills', 'manual-skill'), { recursive: true })
  await writeFile(join(project, '.dsh', 'skills', 'manual-skill', 'SKILL.md'),
    '---\nname: manual-skill\ndescription: "Not memory-owned."\n---\n\nBody.\n')
  assert.deepEqual([...(await store.ownedSkillNames(project))].sort(), [
    'superagent-lite-test-conventions', 'superagent-project-memory', 'superagent-shared-memory',
  ])
  assert.equal((await store.ownedSkillNames(project)).has('manual-skill'), false)
  assert.deepEqual([...(await store.ownedSkillNames(other))].sort(), [
    'superagent-project-memory', 'superagent-shared-memory',
  ])
  assert.deepEqual([...(await store.ownedSkillNames())].sort(), [
    'superagent-shared-memory',
  ])
  assert.deepEqual(await store.readSkill('project', project, 'superagent-lite-test-conventions'), {
    description: 'Test conventions.', content: 'Run the suite.',
  })
})

test('a project skill is kept out of the project checkout status through .git/info/exclude', async () => {
  const project = join(root, 'project-skill-exclude')
  await mkdir(join(project, '.git'), { recursive: true })
  await store.writeSkill('project', project, { description: 'Excluded project skill.', content: 'Body.' })
  await store.writeSkill('project', project, { description: 'Excluded project skill.', content: 'Body.' })
  const exclude = await readFile(join(project, '.git', 'info', 'exclude'), 'utf8')
  assert.equal(exclude, '.dsh/skills/superagent-project-memory/\n')
})

test('worker turns archive under task/archive with their source key', async () => {
  const source = { sessionId: 'session-archive', seq: 7 }
  assert.equal(await store.archive.read(source), undefined)
  await store.archive.write(source, { turn: 2, events: [{ seq: 7, type: 'turn/end' }] })
  assert.deepEqual(await store.archive.read(source), { turn: 2, events: [{ seq: 7, type: 'turn/end' }] })
  const hash = (await import('node:crypto')).createHash('sha256')
    .update('session-archive\0' + 7).digest('hex')
  const record = JSON.parse(await readFile(join(root, 'data', 'task', 'archive', `${hash}.json`), 'utf8'))
  assert.equal(record.version, 1)
  assert.equal(record.value.turn, 2)
  await assert.rejects(store.archive.write({ sessionId: '', seq: 1 }, {}), /Session id/)
  await assert.rejects(store.archive.write({ sessionId: 'x', seq: -1 }, {}), /non-negative/)
})

test('deleting memory fields clears them and deleting a skill removes its file and ownership record', async () => {
  const { createMemoryStore } = await import('../src/memory-store.js')
  const directory = join(root, 'delete-store')
  const agentsHome = join(root, 'delete-agents')
  const own = createMemoryStore(directory, { agentsHome })
  const project = join(root, 'project-delete-memory')

  await own.writeMemory(project, {
    global: { userProfile: 'Delete this profile.' },
    project: { responsibilities: 'Delete this responsibility.', positioning: 'Keep this positioning.' },
  })
  assert.equal((await own.deleteMemoryField('global', project, 'userProfile')).userProfile, '')
  assert.equal((await own.deleteMemoryField('project', project, 'responsibilities')).responsibilities, '')
  assert.deepEqual(await own.readProject(project), {
    projectRoot: project, responsibilities: '', positioning: 'Keep this positioning.',
  })
  assert.equal((await own.readGlobal()).userProfile, '')
  await assert.rejects(own.deleteMemoryField('other', project, 'userProfile'), /scope/)
  await assert.rejects(own.deleteMemoryField('global', project, 'responsibilities'), /Unknown global memory field/)

  await own.writeSkill('global', project, { description: 'Shared skill.', content: 'Body.' })
  await own.writeSkill('project', project, { description: 'Project skill.', content: 'Body.' })
  assert.equal(await own.deleteSkill('global', project), true)
  assert.equal(await own.deleteSkill('project', project), true)
  assert.equal(await own.readSkill('global', project), undefined)
  assert.equal(await own.readSkill('project', project), undefined)
  assert.equal(await own.deleteSkill('global', project), false)
  const registry = JSON.parse(await readFile(join(directory, 'memory', 'skills.json'), 'utf8'))
  assert.deepEqual(registry, { version: 1, global: [], projects: {} })
})
