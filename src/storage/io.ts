import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
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
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

/** Tolerant delete (no-op if already gone). */
export async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    /* already deleted */
  }
}
