import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Tolerant read: `null` if the file does not exist / is unreadable. */
export async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export interface MarkdownFile {
  fileName: string
  raw: string
}

/** A file that could not be parsed — surfaced to the caller, never silently dropped. */
export interface InvalidMarkdownFile {
  fileName: string
  message: string
}

/** `true` if anything exists at `path`. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Case-insensitive filesystems (APFS, NTFS) map `Fix-Bug.md` and `fix-bug.md`
 * to the same file: a title-case edit is a rename to the *same* path, and
 * deleting the "previous" name would delete the freshly written content.
 */
export function isSameFileName(a: string, b: string): boolean {
  return a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase()
}

/**
 * Lists a directory's `.md` files (non-recursive) with their content.
 * Tolerant: missing directory → empty list; unreadable file → skipped. Shared
 * base for tasks, decisions, docs and their `archive/` folders.
 */
export async function readMarkdownDir(dir: string): Promise<MarkdownFile[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const files: MarkdownFile[] = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const raw = await readFileSafe(join(dir, name))
    if (raw === null) continue
    files.push({ fileName: name, raw })
  }
  return files
}

/**
 * ATOMIC write: writes a temp file then `rename` (atomic on the same volume).
 * A board has concurrent writers (web + CLI + MCP) — never a half-written
 * file. This is the hardening question-inbox lacked.
 */
export async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // The temp name must be unique per call: pid+timestamp collides between two
  // writes to the same path in the same millisecond, which splices their bytes.
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

/**
 * Delete that tolerates an already-missing file. Any other failure propagates:
 * callers report "Deleted." to the user, which must not be a lie.
 */
export async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
