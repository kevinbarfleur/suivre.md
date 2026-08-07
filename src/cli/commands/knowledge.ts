import type { CAC } from 'cac'
import { decisionStatusSchema } from '../../domain'
import { decisionJson, docJson, printJson, run, service, toArray } from '../context'

/**
 * Commandes de connaissance : docs (specs, notes) et décisions (ADR). C'est là
 * qu'un workflow type /grill-with-docs ou /to-spec dépose ce qu'il produit —
 * visible dans le dashboard, révélable dans l'overlay.
 */
export function registerKnowledgeCommands(cli: CAC): void {
  // --- Docs ---

  cli
    .command('doc create <title>', 'Create a doc (spec, note, reference)')
    .option('--tag <tag>', 'Tag (repeatable)')
    .option('--body <markdown>', 'Doc body (use a shell heredoc for multi-line)')
    .option('--json', 'JSON output')
    .action(
      run(async (title: string, options) => {
        const doc = await service().createDoc({
          title,
          tags: toArray(options.tag),
          body: options.body,
        })
        if (options.json) printJson(docJson(doc))
        else console.log(`${doc.frontmatter.id}  ${doc.frontmatter.title}`)
      }),
    )

  cli
    .command('doc list', 'List docs')
    .option('--json', 'JSON output')
    .action(
      run(async (options) => {
        const docs = await service().listDocs()
        if (options.json) {
          printJson(docs.map(docJson))
          return
        }
        if (docs.length === 0) {
          console.log('No docs.')
          return
        }
        for (const doc of docs) {
          const tags = doc.frontmatter.tags.map((t) => `#${t}`).join(' ')
          console.log(`${doc.frontmatter.id}  ${doc.frontmatter.title}${tags ? `  ${tags}` : ''}`)
        }
      }),
    )

  cli
    .command('doc get <id>', 'Show a doc, including its body')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const doc = await service().getDoc(id)
        if (!doc) throw new Error(`Doc not found: ${id}`)
        if (options.json) printJson(docJson(doc))
        else {
          console.log(`${doc.frontmatter.id}  ${doc.frontmatter.title}`)
          if (doc.body.trim()) console.log(`\n${doc.body.trim()}`)
        }
      }),
    )

  // --- Décisions (ADR) ---

  cli
    .command('decision create <title>', 'Record a decision (ADR)')
    .option('--status <status>', 'proposed | accepted | rejected | superseded (default: proposed)')
    .option('--supersedes <id>', 'Decision this one replaces')
    .option('--label <label>', 'Label (repeatable)')
    .option('--body <markdown>', 'Context / Decision / Consequences')
    .option('--json', 'JSON output')
    .action(
      run(async (title: string, options) => {
        const decision = await service().createDecision({
          title,
          status: options.status ? decisionStatusSchema.parse(options.status) : undefined,
          supersedes: options.supersedes,
          labels: toArray(options.label),
          body: options.body,
        })
        if (options.json) printJson(decisionJson(decision))
        else console.log(`${decision.frontmatter.id}  ${decision.frontmatter.title}`)
      }),
    )

  cli
    .command('decision list', 'List decisions')
    .option('--json', 'JSON output')
    .action(
      run(async (options) => {
        const decisions = await service().listDecisions()
        if (options.json) {
          printJson(decisions.map(decisionJson))
          return
        }
        if (decisions.length === 0) {
          console.log('No decisions.')
          return
        }
        for (const d of decisions) {
          console.log(`${d.frontmatter.id}  [${d.frontmatter.status}]  ${d.frontmatter.title}`)
        }
      }),
    )

  cli
    .command('decision get <id>', 'Show a decision, including its body')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const decision = await service().getDecision(id)
        if (!decision) throw new Error(`Decision not found: ${id}`)
        if (options.json) printJson(decisionJson(decision))
        else {
          const fm = decision.frontmatter
          console.log(`${fm.id}  [${fm.status}]  ${fm.title}`)
          if (decision.body.trim()) console.log(`\n${decision.body.trim()}`)
        }
      }),
    )
}
