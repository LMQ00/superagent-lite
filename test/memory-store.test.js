import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const root = await mkdtemp(join(tmp, 'memory-store-'))
const agentsHome = join(root, 'agents')
const storeModule = await import('../src/memory-store.js')
const store = storeModule.createMemoryStore(join(root, 'data'), { agentsHome })
const { MAX_PROJECT_SKILLS } = storeModule

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

test('the knowledge base matches multi-word and Chinese queries by keyword score', async () => {
  const scoped = storeModule.createMemoryStore(join(root, 'data-search'), { agentsHome })
  const desktop = await scoped.addKnowledge(
    'DSH 桌面版 Windows Electron 安装布局：client-ui-chat 补丁放在 resources/app.asar。',
  )
  const landing = await scoped.addKnowledge(
    'The landing guard records pushes before the pull request is opened.',
  )
  const guard = await scoped.addKnowledge('The landing guard blocks pushes.')
  const compound = await scoped.addKnowledge('The ctx.subagents runtime exposes targetSessionId to workers.')
  const multi = await scoped.searchKnowledge('DSH 桌面版 Windows Electron 安装布局 client-ui-chat 补丁')
  assert.deepEqual(multi.map(entry => entry.id), [desktop.entry.id])
  assert.match(multi[0].snippet, /client-ui-chat/)
  assert.deepEqual((await scoped.searchKnowledge('安装 补丁')).map(entry => entry.id), [desktop.entry.id])
  assert.deepEqual(
    (await scoped.searchKnowledge('landing guard pull request')).map(entry => entry.id),
    [landing.entry.id, guard.entry.id],
    'entries matching more query keywords rank first',
  )
  assert.deepEqual(
    (await scoped.searchKnowledge('worktree 的 布局')).map(entry => entry.id),
    [desktop.entry.id],
    'single Chinese characters do not turn into wildcard matches',
  )
  assert.deepEqual((await scoped.searchKnowledge('subagent')).map(entry => entry.id), [compound.entry.id])
  assert.deepEqual((await scoped.searchKnowledge('session')).map(entry => entry.id), [compound.entry.id])
  assert.deepEqual(await scoped.searchKnowledge('不存在 的 词'), [])
})

test('the knowledge file is global and rejects malformed documents', async () => {
  const path = join(root, 'data', 'memory', 'knowledge.json')
  await writeFile(path, JSON.stringify({ version: 99, entries: [] }))
  await assert.rejects(store.readKnowledge(), /Invalid or unsupported knowledge base/)
  await writeFile(path, JSON.stringify({ version: 1, entries: 'nope' }))
  await assert.rejects(store.readKnowledge(), /Invalid knowledge base entries/)
})

test('project knowledge is keyed by project root and queries merge both scopes', async () => {
  const { createHash } = await import('node:crypto')
  const own = storeModule.createMemoryStore(join(root, 'data-scoped'), { agentsHome })
  const projectA = join(root, 'knowledge-project-a')
  const projectB = join(root, 'knowledge-project-b')
  assert.deepEqual(await own.readProjectKnowledge(projectA), [])

  const global = await own.addKnowledge('Every project runs npm test.')
  const first = await own.addKnowledge('Project A uses the alpha layout.', {
    scope: 'project', projectRoot: projectA,
  })
  assert.equal(first.entry.id, '1')
  await own.addKnowledge('Project B uses the beta layout.', {
    scope: 'project', projectRoot: projectB,
  })
  assert.deepEqual((await own.readProjectKnowledge(projectA)).map(entry => entry.text), [
    'Project A uses the alpha layout.',
  ])
  assert.equal((await own.readProjectKnowledge(projectB)).map(entry => entry.text).join(), 'Project B uses the beta layout.')

  const merged = await own.searchKnowledge('', 10, { projectRoot: projectA })
  assert.deepEqual(new Set(merged.map(entry => `${entry.scope}:${entry.id}`)), new Set([
    `global:${global.entry.id}`, `project:${first.entry.id}`,
  ]))
  assert.deepEqual((await own.searchKnowledge('alpha', 10, { projectRoot: projectA }))
    .map(entry => entry.scope), ['project'])
  assert.deepEqual(await own.searchKnowledge('alpha', 10, { projectRoot: projectB }), [])
  assert.deepEqual((await own.searchKnowledge('alpha', 10)).map(entry => entry.scope), [])

  const results = await own.getKnowledge(
    [`project:${first.entry.id}`, `global:${global.entry.id}`, 'project:999'],
    { projectRoot: projectA },
  )
  assert.deepEqual(results.map(result => [result.scope, result.entry?.text]), [
    ['project', 'Project A uses the alpha layout.'],
    ['global', 'Every project runs npm test.'],
    ['project', undefined],
  ])
  assert.deepEqual((await own.getKnowledge(['project:1'], { projectRoot: projectA }))[0].scope, 'project')
  assert.equal((await own.getKnowledge(['project:1'], { projectRoot: projectB }))[0].entry.text,
    'Project B uses the beta layout.')
  assert.equal((await own.getKnowledge(['project:999'], { projectRoot: projectB }))[0].entry, undefined)

  const duplicate = await own.addKnowledge('Project A uses the alpha layout.', {
    scope: 'project', projectRoot: projectA,
  })
  assert.equal(duplicate.duplicate, true)
  assert.equal((await own.addKnowledge('Project A uses the alpha layout.', {
    scope: 'project', projectRoot: projectB,
  })).duplicate, false)

  const corrected = await own.updateKnowledge(`project:${first.entry.id}`, 'Project A uses the alpha layout v2.', {
    scope: 'project', projectRoot: projectA,
  })
  assert.equal(corrected.text, 'Project A uses the alpha layout v2.')
  await own.deleteKnowledge(first.entry.id, { scope: 'project', projectRoot: projectA })
  assert.deepEqual(await own.readProjectKnowledge(projectA), [])

  const path = join(root, 'data-scoped', 'memory', 'knowledge',
    `${createHash('sha256').update(projectB).digest('hex')}.json`)
  const saved = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(saved.projectRoot, projectB)
  assert.equal(saved.entries.some(entry => entry.text === 'Project B uses the beta layout.'), true)

  await writeFile(path, JSON.stringify({ version: 1, projectRoot: projectA, entries: [] }))
  await assert.rejects(own.readProjectKnowledge(projectB), /different project root/)
  await writeFile(path, JSON.stringify({ version: 99, projectRoot: projectB, entries: [] }))
  await assert.rejects(own.readProjectKnowledge(projectB), /Invalid or unsupported knowledge base/)
  await assert.rejects(own.readProjectKnowledge('relative'), /absolute project root/)
  await assert.rejects(own.addKnowledge('x', { scope: 'other', projectRoot: projectA }), /scope/)
  await assert.rejects(own.addKnowledge('x', { scope: 'project' }), /absolute project root/)
  await assert.rejects(own.deleteKnowledge('1', { scope: 'project' }), /absolute project root/)
  await assert.rejects(own.deleteKnowledge('global:1', { scope: 'project', projectRoot: projectA }),
    /belongs to the global knowledge base/)
})

test('memory writes named skills to their own directories with the memory author', async () => {
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
  await store.writeSkill('project', project, {
    name: 'superagent-lite-test-conventions',
    description: 'How tests are written here.',
    content: 'Prefer node --test.',
  })
  assert.deepEqual(await store.readSkill('global', project), {
    description: 'Reusable inspection guidance across projects.',
    content: 'Inspect the repository before changing it.',
    author: 'memory',
  })
  assert.deepEqual(await store.readSkill('project', project), {
    description: 'How to work on this project.',
    content: 'Run npm test before reporting.',
    author: 'memory',
  })
  const globalFile = join(agentsHome, 'skills', 'superagent-shared-memory', 'SKILL.md')
  const projectFile = join(project, '.dsh', 'skills', 'superagent-project-memory', 'SKILL.md')
  const secondFile = join(project, '.dsh', 'skills', 'superagent-lite-test-conventions', 'SKILL.md')
  assert.match(await readFile(globalFile, 'utf8'), /^---\nname: superagent-shared-memory\nauthor: memory\ndescription: "Reusable inspection guidance across projects\."\n---/)
  assert.match(await readFile(projectFile, 'utf8'), /Run npm test before reporting\./)
  assert.match(await readFile(secondFile, 'utf8'), /name: superagent-lite-test-conventions\nauthor: memory/)
  assert.deepEqual(await store.readSkills(project), {
    global: [{
      name: 'superagent-shared-memory',
      description: 'Reusable inspection guidance across projects.',
      content: 'Inspect the repository before changing it.',
      author: 'memory',
    }],
    project: [
      {
        name: 'superagent-lite-test-conventions',
        description: 'How tests are written here.',
        content: 'Prefer node --test.',
        author: 'memory',
      },
      {
        name: 'superagent-project-memory',
        description: 'How to work on this project.',
        content: 'Run npm test before reporting.',
        author: 'memory',
      },
    ],
  })
  assert.equal(await store.projectSkillCount(project), 2)
  await assert.rejects(store.writeSkill('project', project, { description: 'x'.repeat(501), content: 'x' }), /at most 500/)
})

test('a same-name conflict does not overwrite a skill memory does not manage', async () => {
  const project = join(root, 'project-skill-conflict')
  await mkdir(join(project, '.dsh', 'skills', 'manual-skill'), { recursive: true })
  const manualFile = join(project, '.dsh', 'skills', 'manual-skill', 'SKILL.md')
  const manual = '---\nname: manual-skill\nauthor: someone-else\ndescription: "Manual."\n---\n\nManual body.\n'
  await writeFile(manualFile, manual)
  await assert.rejects(store.writeSkill('project', project, {
    name: 'manual-skill', description: 'Memory copy.', content: 'New body.',
  }), /not managed by memory/)
  assert.equal(await readFile(manualFile, 'utf8'), manual)
  await mkdir(join(project, '.dsh', 'skills', 'authorless-skill'), { recursive: true })
  const authorlessFile = join(project, '.dsh', 'skills', 'authorless-skill', 'SKILL.md')
  const authorless = '---\nname: authorless-skill\ndescription: "No author."\n---\n\nBody.\n'
  await writeFile(authorlessFile, authorless)
  await assert.rejects(store.writeSkill('project', project, {
    name: 'authorless-skill', description: 'Memory copy.', content: 'New body.',
  }), /not managed by memory/)
  assert.equal(await readFile(authorlessFile, 'utf8'), authorless)
  // The usage count includes directories memory does not manage, because the
  // project skill limit counts every project skill.
  assert.equal(await store.projectSkillCount(project), 2)
})

test('memory-authored skills are identified by their author field', async () => {
  const project = join(root, 'project-authored-skills')
  const other = join(root, 'project-authored-skills-other')
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
    '---\nname: manual-skill\nauthor: someone-else\ndescription: "Not memory-owned."\n---\n\nBody.\n')
  await mkdir(join(project, '.dsh', 'skills', 'authorless-skill'), { recursive: true })
  await writeFile(join(project, '.dsh', 'skills', 'authorless-skill', 'SKILL.md'),
    '---\nname: authorless-skill\ndescription: "No author."\n---\n\nBody.\n')
  assert.deepEqual([...(await store.memoryAuthoredSkillNames(project))].sort(), [
    'superagent-lite-test-conventions', 'superagent-project-memory', 'superagent-shared-memory',
  ])
  assert.equal((await store.memoryAuthoredSkillNames(project)).has('manual-skill'), false)
  assert.equal((await store.memoryAuthoredSkillNames(project)).has('authorless-skill'), false)
  assert.deepEqual([...(await store.memoryAuthoredSkillNames(other))].sort(), [
    'superagent-shared-memory',
  ])
  assert.deepEqual([...(await store.memoryAuthoredSkillNames())].sort(), [
    'superagent-shared-memory',
  ])
  assert.deepEqual(await store.readSkillAuthors(project), {
    global: [{ name: 'superagent-shared-memory', author: 'memory' }],
    project: [
      { name: 'authorless-skill', author: 'none' },
      { name: 'manual-skill', author: 'none' },
      { name: 'superagent-lite-test-conventions', author: 'memory' },
      { name: 'superagent-project-memory', author: 'memory' },
    ],
  })
  assert.equal(await store.deleteSkill('project', project, 'superagent-lite-test-conventions'), true)
  assert.equal(await store.readSkill('project', project, 'superagent-lite-test-conventions'), undefined)
  assert.equal((await store.memoryAuthoredSkillNames(project)).has('superagent-lite-test-conventions'), false)
  await assert.rejects(store.deleteSkill('project', project, 'manual-skill'), /not managed by memory/)
})

test('a legacy skill without an author is managed until memory rewrites it', async () => {
  const project = join(root, 'project-legacy-skill')
  const file = join(project, '.dsh', 'skills', 'superagent-project-memory', 'SKILL.md')
  await mkdir(join(project, '.dsh', 'skills', 'superagent-project-memory'), { recursive: true })
  await writeFile(file, '---\nname: superagent-project-memory\ndescription: "Legacy skill."\n---\n\nOld body.\n')
  assert.deepEqual(await store.readSkills(project).then(value => value.project.map(skill => skill.name)), [
    'superagent-project-memory',
  ])
  // The legacy fixed name is still managed by memory, so the prompt listing
  // marks it reusable even before the first rewrite adds the author.
  assert.deepEqual(await store.readSkillAuthors(project), {
    global: [{ name: 'superagent-shared-memory', author: 'memory' }],
    project: [{ name: 'superagent-project-memory', author: 'memory' }],
  })
  assert.deepEqual([...(await store.memoryAuthoredSkillNames(project))], ['superagent-shared-memory'])
  await store.writeSkill('project', project, { description: 'Legacy skill.', content: 'New body.' })
  assert.match(await readFile(file, 'utf8'), /author: memory/)
  assert.deepEqual([...(await store.memoryAuthoredSkillNames(project))].sort(), [
    'superagent-project-memory', 'superagent-shared-memory',
  ])
})

test('a project skill is kept out of the project checkout status through .git/info/exclude', async () => {
  const project = join(root, 'project-skill-exclude')
  await mkdir(join(project, '.git'), { recursive: true })
  await store.writeSkill('project', project, { description: 'Excluded project skill.', content: 'Body.' })
  await store.writeSkill('project', project, { description: 'Excluded project skill.', content: 'Body.' })
  const exclude = await readFile(join(project, '.git', 'info', 'exclude'), 'utf8')
  assert.equal(exclude, '.dsh/skills/superagent-project-memory/\n')
})

test('a project keeps at most ten skills while updates and global skills still write', async () => {
  assert.equal(MAX_PROJECT_SKILLS, 10)
  const project = join(root, 'project-skill-limit')
  for (let index = 1; index <= MAX_PROJECT_SKILLS; index += 1) {
    await store.writeSkill('project', project, {
      name: `capped-skill-${index}`,
      description: `Capped skill ${index}.`,
      content: `Body ${index}.`,
    })
  }
  assert.equal(await store.projectSkillCount(project), MAX_PROJECT_SKILLS)
  await assert.rejects(store.writeSkill('project', project, {
    name: 'capped-skill-eleven', description: 'Over the cap.', content: 'Body.',
  }), /limited to 10/)
  assert.equal(await store.projectSkillCount(project), MAX_PROJECT_SKILLS)
  assert.equal(await store.readSkill('project', project, 'capped-skill-eleven'), undefined)
  await store.writeSkill('project', project, {
    name: 'capped-skill-1', description: 'Updated capped skill.', content: 'Updated body.',
  })
  assert.equal((await store.readSkill('project', project, 'capped-skill-1')).description, 'Updated capped skill.')
  await store.writeSkill('global', project, {
    name: 'shared-skill-at-project-cap', description: 'Global skills stay uncapped.', content: 'Body.',
  })
  assert.equal(await store.readSkill('global', project, 'shared-skill-at-project-cap') !== undefined, true)
})

test('a project skill batch over the cap writes none of its skills', async () => {
  const project = join(root, 'project-skill-batch-limit')
  for (let index = 1; index <= MAX_PROJECT_SKILLS - 1; index += 1) {
    await store.writeSkill('project', project, {
      name: `batch-skill-${index}`,
      description: `Batch skill ${index}.`,
      content: `Body ${index}.`,
    })
  }
  await assert.rejects(store.writeSkills('project', project, [{
    name: 'batch-skill-new-one', description: 'New skill one.', content: 'Body one.',
  }, {
    name: 'batch-skill-new-two', description: 'New skill two.', content: 'Body two.',
  }]), /limited to 10/)
  assert.equal(await store.projectSkillCount(project), MAX_PROJECT_SKILLS - 1)
  assert.equal(await store.readSkill('project', project, 'batch-skill-new-one'), undefined)
  assert.equal(await store.readSkill('project', project, 'batch-skill-new-two'), undefined)
  const { written } = await store.writeSkills('project', project, [{
    name: 'batch-skill-1', description: 'Changed batch skill.', content: 'Changed body.',
  }])
  assert.deepEqual(written, ['batch-skill-1'])
  assert.deepEqual(await store.writeSkills('project', project, [{
    name: 'batch-skill-new-one', description: 'New skill one.', content: 'Body one.',
  }]), { written: ['batch-skill-new-one'] })
  assert.equal(await store.projectSkillCount(project), MAX_PROJECT_SKILLS)
})

test('a project already over the cap can update existing skills but not add one', async () => {
  const project = join(root, 'project-skill-over-cap')
  for (let index = 1; index <= MAX_PROJECT_SKILLS + 1; index += 1) {
    await mkdir(join(project, '.dsh', 'skills', `over-skill-${index}`), { recursive: true })
    await writeFile(join(project, '.dsh', 'skills', `over-skill-${index}`, 'SKILL.md'),
      `---\nname: over-skill-${index}\nauthor: memory\ndescription: "Over ${index}."\n---\n\nBody.\n`)
  }
  assert.equal(await store.projectSkillCount(project), MAX_PROJECT_SKILLS + 1)
  await store.writeSkill('project', project, {
    name: 'over-skill-1', description: 'Updated over the cap.', content: 'Updated body.',
  })
  assert.equal((await store.readSkill('project', project, 'over-skill-1')).description, 'Updated over the cap.')
  await assert.rejects(store.writeSkill('project', project, {
    name: 'over-skill-new', description: 'New over the cap.', content: 'Body.',
  }), /limited to 10/)
  assert.equal(await store.readSkill('project', project, 'over-skill-new'), undefined)
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

test('a worker session record is written to a readable path under task/archive', async () => {
  const path = await store.writeSessionRecord('session-record', '# Worker session record\n\n[user] Read me.\n')
  assert.equal(path, join(root, 'data', 'task', 'archive', 'sessions',
    `${(await import('node:crypto')).createHash('sha256').update('session-record').digest('hex')}.md`))
  assert.equal(await readFile(path, 'utf8'), '# Worker session record\n\n[user] Read me.\n')
  await assert.rejects(store.writeSessionRecord('', 'Body.'), /Session id/)
  await assert.rejects(store.writeSessionRecord('session-record', '  '), /conversation text/)
})

test('deleting memory fields clears them and deleting a skill removes its file', async () => {
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
  assert.equal(await own.deleteSkill('global', project, 'superagent-shared-memory'), true)
  assert.equal(await own.deleteSkill('project', project, 'superagent-project-memory'), true)
  assert.equal(await own.readSkill('global', project, 'superagent-shared-memory'), undefined)
  assert.equal(await own.readSkill('project', project, 'superagent-project-memory'), undefined)
  assert.equal(await own.deleteSkill('global', project, 'superagent-shared-memory'), false)
  assert.deepEqual(await own.readSkills(project), { global: [], project: [] })
  await assert.rejects(readFile(join(directory, 'memory', 'skills.json'), 'utf8'), /ENOENT/)
})
