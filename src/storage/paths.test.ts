import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findRoot, resolvePaths } from './paths'

describe('findRoot', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-root-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function initBacklog(at: string, dirName = '.suivre'): Promise<void> {
    await mkdir(join(at, dirName), { recursive: true })
    await writeFile(join(at, dirName, 'config.yml'), 'name: P\ncolumns: []\n')
  }

  it('finds the backlog from a nested subdirectory', async () => {
    await initBacklog(root)
    const nested = join(root, 'packages', 'app', 'src')
    await mkdir(nested, { recursive: true })
    expect(findRoot(nested)).toBe(root)
  })

  it('returns the start directory when the backlog is there', async () => {
    await initBacklog(root)
    expect(findRoot(root)).toBe(root)
  })

  it('returns null when no backlog exists up to the filesystem root', async () => {
    const nested = join(root, 'a', 'b')
    await mkdir(nested, { recursive: true })
    expect(findRoot(nested)).toBeNull()
  })

  it('ignores a directory without config.yml', async () => {
    await mkdir(join(root, '.suivre', 'tasks'), { recursive: true })
    expect(findRoot(root)).toBeNull()
  })

  it('stops at the nearest backlog', async () => {
    await initBacklog(root)
    const inner = join(root, 'sub')
    await initBacklog(inner)
    expect(findRoot(join(inner, 'deeper'))).toBe(inner)
  })

  it('honours a custom directory name', async () => {
    await initBacklog(root, '.backlog')
    expect(findRoot(root)).toBeNull()
    expect(findRoot(root, '.backlog')).toBe(root)
  })

  it('resolvePaths derives every location from the root', () => {
    const paths = resolvePaths(root)
    expect(paths.configFile).toBe(join(root, '.suivre', 'config.yml'))
    expect(paths.tasksDir).toBe(join(root, '.suivre', 'tasks'))
  })
})
