import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWrite, fileExists, isSameFileName, removeFile } from './io'

describe('storage io', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'suivre-io-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('atomicWrite survives concurrent writes to the same path', async () => {
    const path = join(dir, 'task-001-x.md')
    const contents = Array.from({ length: 40 }, (_, i) => `---\nid: task-${i}\n---\n\nbody ${i}\n`)

    await Promise.all(contents.map((content) => atomicWrite(path, content)))

    const written = await readFile(path, 'utf8')
    expect(contents).toContain(written)
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('atomicWrite never leaves a spliced file across repeated rounds', async () => {
    const path = join(dir, 'race.md')
    for (let round = 0; round < 10; round++) {
      const contents = Array.from({ length: 8 }, (_, i) => `round ${round} writer ${i}\n`)
      await Promise.all(contents.map((content) => atomicWrite(path, content)))
      expect(contents).toContain(await readFile(path, 'utf8'))
    }
  })

  it('atomicWrite creates missing parent directories', async () => {
    const path = join(dir, 'deep', 'nested', 'file.md')
    await atomicWrite(path, 'hello\n')
    expect(await readFile(path, 'utf8')).toBe('hello\n')
  })

  it('removeFile ignores a missing file but propagates other failures', async () => {
    await expect(removeFile(join(dir, 'gone.md'))).resolves.toBeUndefined()

    const asDirectory = join(dir, 'blocked')
    await mkdir(asDirectory)
    await expect(removeFile(asDirectory)).rejects.toThrow()
    expect(await fileExists(asDirectory)).toBe(true)
  })

  it('fileExists reports what is on disk', async () => {
    const path = join(dir, 'present.md')
    expect(await fileExists(path)).toBe(false)
    await writeFile(path, 'x')
    expect(await fileExists(path)).toBe(true)
  })

  it('isSameFileName ignores case, not different names', () => {
    expect(isSameFileName('task-001-Fix-Bug.md', 'task-001-fix-bug.md')).toBe(true)
    expect(isSameFileName('task-001-a.md', 'task-001-b.md')).toBe(false)
  })
})
