import { describe, expect, it } from 'vitest'
import { parseAdapter, planAdapterWrite, renderAdapter, upsertBlock } from './reconcile'

const BODY_V1 = '# Issue tracker: suivre.md\n\nContenu v1.\n'
const BODY_V2 = '# Issue tracker: suivre.md\n\nContenu v2, enrichi.\n'

describe('renderAdapter / parseAdapter', () => {
  it('aller-retour marqueur + corps', () => {
    const content = renderAdapter(BODY_V1, 1)
    const marker = parseAdapter(content)
    expect(marker?.version).toBe(1)
    expect(marker?.body).toBe(BODY_V1)
  })
})

describe('planAdapterWrite', () => {
  it('absent → create', () => {
    expect(planAdapterWrite(null, BODY_V1)).toEqual({ action: 'create' })
  })

  it('intact et identique → up-to-date', () => {
    const existing = renderAdapter(BODY_V1, 1)
    expect(planAdapterWrite(existing, BODY_V1)).toEqual({ action: 'up-to-date' })
  })

  it('intact mais template plus récent → update', () => {
    const existing = renderAdapter(BODY_V1, 1)
    expect(planAdapterWrite(existing, BODY_V2)).toEqual({ action: 'update', fromVersion: 1 })
  })

  it('édité par l’utilisateur → diverged (jamais écrasé)', () => {
    const edited = renderAdapter(BODY_V1, 1).replace('Contenu v1.', 'Contenu customisé.')
    expect(planAdapterWrite(edited, BODY_V2)).toEqual({ action: 'diverged', fromVersion: 1 })
  })

  it('sans marqueur (écrit à la main) → diverged', () => {
    expect(planAdapterWrite('# Mon tracker à moi\n', BODY_V2)).toEqual({
      action: 'diverged',
      fromVersion: null,
    })
  })
})

describe('upsertBlock', () => {
  const block = '<!-- s -->\npointer\n<!-- e -->'

  it('fichier absent → juste le bloc', () => {
    expect(upsertBlock(null, block, '<!-- s -->', '<!-- e -->')).toBe(`${block}\n`)
  })

  it('append en fin de fichier existant', () => {
    const out = upsertBlock('# AGENTS\n\nDu texte.\n', block, '<!-- s -->', '<!-- e -->')
    expect(out).toBe(`# AGENTS\n\nDu texte.\n\n${block}\n`)
  })

  it('remplace le bloc existant sans toucher au reste', () => {
    const existing = `# AGENTS\n\n<!-- s -->\nvieux pointer\n<!-- e -->\n\nSuite.\n`
    const out = upsertBlock(existing, block, '<!-- s -->', '<!-- e -->')
    expect(out).toBe(`# AGENTS\n\n${block}\n\nSuite.\n`)
  })
})
