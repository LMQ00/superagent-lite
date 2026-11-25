import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

// DSH content blocks carry durable image references, never raw bytes or URLs.
// A tool argument can only name local files, so this module turns the paths a
// model supplies into attachment references the Host can deliver to another
// Session. The receiving model must declare image input; the Host enforces it.
const MAX_IMAGES = 20
const MAX_PATH_LENGTH = 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

function matchesBytes(data, offset, expected) {
  if (data.byteLength < offset + expected.length) return false
  return expected.every((byte, index) => data[offset + index] === byte)
}

function matchesAscii(data, offset, value) {
  return matchesBytes(data, offset, [...value].map(character => character.charCodeAt(0)))
}

export function imageMediaType(data) {
  if (matchesBytes(data, 0, PNG_SIGNATURE)) return 'image/png'
  if (matchesBytes(data, 0, JPEG_SIGNATURE)) return 'image/jpeg'
  if (matchesAscii(data, 0, 'GIF87a') || matchesAscii(data, 0, 'GIF89a')) return 'image/gif'
  if (matchesAscii(data, 0, 'RIFF') && matchesAscii(data, 8, 'WEBP')) return 'image/webp'
  return undefined
}

export const imagesParameter = {
  type: 'array',
  items: { type: 'string' },
  description: 'Optional local PNG/JPEG/WebP/GIF file paths to attach to this message. Each path resolves against the current directory. The receiving model must declare image input; URLs and GUI uploads are not accepted here.',
}

export function validateImagePaths(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError('images must be an array of local file paths')
  if (value.length > MAX_IMAGES) throw new RangeError(`images must list at most ${MAX_IMAGES} paths`)
  return value.map(path => {
    const trimmed = typeof path === 'string' ? path.trim() : ''
    if (!trimmed) throw new TypeError('each image path must be a non-empty string')
    if (trimmed.length > MAX_PATH_LENGTH) throw new RangeError(`each image path must be at most ${MAX_PATH_LENGTH} characters`)
    return trimmed
  })
}

function attachmentFailure(requested, error) {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`Image "${requested}" could not be attached: ${detail}`)
}

export async function imageBlocks(ctx, images, cwd, signal) {
  const paths = validateImagePaths(images)
  if (paths.length === 0) return []
  const attachments = ctx.get?.('attachments') ?? ctx.attachments
  if (!attachments?.saveImage) throw new Error('Image messages need the Host attachment store, which is not mounted')
  const limits = attachments.imageLimits
  if (typeof limits?.maxImagesPerMessage === 'number' && paths.length > limits.maxImagesPerMessage) {
    throw new Error(`This Host accepts at most ${limits.maxImagesPerMessage} images in one message`)
  }
  const blocks = []
  let total = 0
  for (const requested of paths) {
    signal?.throwIfAborted()
    const path = resolve(cwd ?? process.cwd(), requested)
    let data
    try {
      data = new Uint8Array(await readFile(path))
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Image "${requested}" was not found`)
      throw new Error(`Image "${requested}" could not be read: ${error instanceof Error ? error.message : String(error)}`)
    }
    total += data.byteLength
    if (typeof limits?.maxMessageImageBytes === 'number' && total > limits.maxMessageImageBytes) {
      throw new Error(`The attached images exceed this Host's ${limits.maxMessageImageBytes}-byte message limit`)
    }
    const mediaType = imageMediaType(data)
    if (!mediaType) throw new Error(`Image "${requested}" is not a PNG, JPEG, WebP, or GIF file`)
    let attachment
    try {
      attachment = await attachments.saveImage({ data, mediaType, name: basename(path) })
    } catch (error) {
      throw attachmentFailure(requested, error)
    }
    blocks.push({ type: 'image', attachment })
  }
  return blocks
}

export function imageBlocksFromReferences(references) {
  return (Array.isArray(references) ? references : [])
    .filter(attachment => attachment && typeof attachment === 'object')
    .map(attachment => ({ type: 'image', attachment }))
}
