import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-message-images-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const { imageBlocks, imageMediaType, validateImagePaths } = await import('../src/message-images.js')
const { createMessageRouterTool } = await import('../src/message-router.js')
const { createReportTool } = await import('../src/report-tool.js')
const { createContinueTool } = await import('../src/continue.js')
const { createTask, listTasks, readTask, removeTask, updateTask } = await import('../src/task-store.js')
const { validateDispatchArguments } = await import('../src/validation.js')

beforeEach(async () => {
  for (const task of await listTasks()) await removeTask(task.id)
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const GIF = new TextEncoder().encode('GIF89a content')
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPmore')])

function attachmentStore() {
  const saved = []
  return {
    saved,
    imageLimits: { maxImagesPerMessage: 20, maxMessageImageBytes: 1_000_000 },
    async saveImage(input) {
      saved.push(input)
      return {
        attachmentId: `sha256:${String(saved.length).padStart(64, '0')}`,
        mediaType: input.mediaType,
        bytes: input.data.byteLength,
        width: 1,
        height: 1,
        ...(input.name === undefined ? {} : { name: input.name }),
      }
    },
  }
}

async function writeImage(directory, name, bytes = PNG) {
  await writeFile(join(directory, name), bytes)
  return join(directory, name)
}

function context({ attachments, cwd, agent, workers = {} } = {}) {
  const sends = []
  return {
    sends,
    attachments,
    workingDirectory: { get: () => cwd },
    agents: { get: id => workers[id] },
    subagents: {
      async sendMessage(sender, targetId, content, options) {
        sends.push({ sender, targetId, content, options })
      },
    },
    get(name) {
      return name === 'attachments' ? attachments : undefined
    },
    logger: { warn() {} },
  }
}

function worker(id) {
  return { id, session: { id } }
}

async function runningTask(id, changes = {}) {
  const agent = worker(changes.workerSessionId ?? 'worker')
  await createTask({
    id,
    title: 'Image task',
    teamId: `team-${id}`,
    task: 'Attach an image.',
    mode: 'change',
    git: false,
    parentSessionId: 'router',
    projectRoot: home,
    workerSessionId: agent.id,
    status: 'running',
    createdAt: new Date().toISOString(),
    ...changes,
  })
  return agent
}

test('imageMediaType recognizes the four Host image formats', () => {
  assert.equal(imageMediaType(PNG), 'image/png')
  assert.equal(imageMediaType(JPEG), 'image/jpeg')
  assert.equal(imageMediaType(GIF), 'image/gif')
  assert.equal(imageMediaType(WEBP), 'image/webp')
  assert.equal(imageMediaType(new TextEncoder().encode('plain text')), undefined)
})

test('imageBlocks resolves paths against the given directory and saves durable references', async () => {
  const directory = join(home, 'images')
  await mkdir(directory)
  await writeImage(directory, 'shot.png')
  const store = attachmentStore()
  const ctx = context({ attachments: store, cwd: directory })

  const blocks = await imageBlocks(ctx, ['shot.png'], directory, new AbortController().signal)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'image')
  assert.equal(blocks[0].attachment.name, 'shot.png')
  assert.equal(blocks[0].attachment.mediaType, 'image/png')
  assert.equal(store.saved.length, 1)
  assert.equal(store.saved[0].name, 'shot.png')
  assert.equal(store.saved[0].mediaType, 'image/png')
})

test('imageBlocks refuses a missing file, unsupported bytes, a missing store, and a save failure', async () => {
  const directory = join(home, 'refusals')
  await mkdir(directory)
  await writeImage(directory, 'notes.txt', new TextEncoder().encode('not an image'))
  await writeImage(directory, 'one.png')
  const store = attachmentStore()
  const ctx = context({ attachments: store, cwd: directory })

  await assert.rejects(imageBlocks(ctx, ['missing.png'], directory), /was not found/)
  await assert.rejects(imageBlocks(ctx, ['notes.txt'], directory), /is not a PNG, JPEG, WebP, or GIF/)
  await assert.rejects(imageBlocks(context({ cwd: directory }), ['one.png'], directory), /attachment store/)
  await assert.rejects(
    imageBlocks(context({ attachments: { saveImage: async () => { throw new Error('disk full') } } }), ['one.png'], directory),
    /could not be attached/,
  )
})

test('imageBlocks enforces the Host per-message image count and byte limits', async () => {
  const directory = join(home, 'limits')
  await mkdir(directory)
  await writeImage(directory, 'one.png')
  await writeImage(directory, 'two.png')
  const store = attachmentStore()
  store.imageLimits = { maxImagesPerMessage: 1, maxMessageImageBytes: 1_000_000 }
  await assert.rejects(
    imageBlocks(context({ attachments: store }), ['one.png', 'two.png'], directory),
    /at most 1 images/,
  )
  const tiny = attachmentStore()
  tiny.imageLimits = { maxImagesPerMessage: 20, maxMessageImageBytes: 4 }
  await assert.rejects(imageBlocks(context({ attachments: tiny }), ['one.png'], directory), /message limit/)
})

test('image path validation rejects non-string, empty, and overlong entries', () => {
  assert.deepEqual(validateImagePaths(undefined), [])
  assert.deepEqual(validateImagePaths([' one.png ', 'two.png']), ['one.png', 'two.png'])
  assert.throws(() => validateImagePaths('one.png'), /array/)
  assert.throws(() => validateImagePaths([1]), /non-empty string/)
  assert.throws(() => validateImagePaths(['']), /non-empty string/)
  assert.throws(() => validateImagePaths(['a'.repeat(1025)]), /at most 1024/)
})

test('dispatch validation accepts image paths and refuses them without a worker message', () => {
  const args = {
    mode: 'change', worktreeName: 'change-notes', teamId: 'team', title: 't', task: 'do it',
  }
  assert.deepEqual(validateDispatchArguments({ ...args, images: ['shot.png'] }).images, ['shot.png'])
  assert.equal('images' in validateDispatchArguments(args), false)
  assert.throws(() => validateDispatchArguments({ mode: 'answer', images: ['shot.png'] }), /mode=answer/)
})

test('message_router delivers the report text followed by its images', async () => {
  const directory = join(home, 'router-report')
  await mkdir(directory)
  await writeImage(directory, 'result.png')
  const agent = await runningTask('2000000000000001')
  const ctx = context({ attachments: attachmentStore(), cwd: directory })
  let reported
  const tool = createMessageRouterTool(ctx, agent, '2000000000000001', text => { reported = text })

  await tool.execute(
    { message: 'COMPLETED with screenshot', images: ['result.png'] },
    { agent, signal: new AbortController().signal },
  )
  assert.equal(reported, 'COMPLETED with screenshot')
  assert.equal(ctx.sends.length, 1)
  assert.equal(ctx.sends[0].targetId, 'router')
  assert.deepEqual(ctx.sends[0].content[0], { type: 'text', text: 'COMPLETED with screenshot' })
  assert.equal(ctx.sends[0].content[1].type, 'image')
  assert.equal(ctx.sends[0].content[1].attachment.name, 'result.png')
})

test('report_task delivers the conclusion followed by its images and completes the task', async () => {
  const directory = join(home, 'report-images')
  await mkdir(directory)
  await writeImage(directory, 'evidence.webp', WEBP)
  const agent = await runningTask('2000000000000002', { mode: 'report' })
  const ctx = context({ attachments: attachmentStore(), cwd: directory })
  const tool = createReportTool(ctx, agent, '2000000000000002', () => true, () => {})

  await tool.execute(
    { report: 'The screenshot shows the failure', images: ['evidence.webp'] },
    { agent, signal: new AbortController().signal },
  )
  assert.equal(ctx.sends[0].content[0].type, 'text')
  assert.match(ctx.sends[0].content[0].text, /^Report-only task 2000000000000002/)
  assert.equal(ctx.sends[0].content[1].type, 'image')
  assert.equal(ctx.sends[0].content[1].attachment.mediaType, 'image/webp')
  assert.equal((await readTask('2000000000000002')).status, 'completed')
})

test('continue_worker attaches images to a running worker follow-up', async () => {
  const directory = join(home, 'continue-running')
  await mkdir(directory)
  await writeImage(directory, 'follow-up.png')
  const agent = await runningTask('2000000000000003')
  const ctx = context({ attachments: attachmentStore(), cwd: directory, workers: { worker: { status: 'running' } } })
  const tool = createContinueTool(ctx)

  await tool.execute(
    { taskId: '2000000000000003', task: 'Use this screenshot', images: ['follow-up.png'] },
    { agent: { id: 'router', session: { id: 'router' } }, signal: new AbortController().signal },
  )
  assert.equal(ctx.sends.length, 1)
  assert.equal(ctx.sends[0].targetId, 'worker')
  assert.match(ctx.sends[0].content[0].text, /Requirements update for the same task/)
  assert.equal(ctx.sends[0].content[1].type, 'image')
})

test('continue_worker attaches images to a resumed worker message', async () => {
  const directory = join(home, 'continue-resumed')
  await mkdir(directory)
  await writeImage(directory, 'resume.png')
  const agent = await runningTask('2000000000000004', { status: 'review-required', worktree: { path: directory, branch: 'sl-test' } })
  const ctx = context({ attachments: attachmentStore(), cwd: directory })
  const tool = createContinueTool(ctx)

  await tool.execute(
    { taskId: '2000000000000004', task: 'Look at the screenshot', images: ['resume.png'] },
    { agent: { id: 'router', session: { id: 'router' } }, signal: new AbortController().signal },
  )
  assert.equal(ctx.sends.length, 1)
  assert.match(ctx.sends[0].content[0].text, /Task ID: 2000000000000004/)
  assert.equal(ctx.sends[0].content[1].type, 'image')
  assert.equal((await updateTask('2000000000000004', {})).status, 'resuming')
  assert.equal(agent.id, 'worker')
})
