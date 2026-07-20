# Contrat de données — suivre.md

La webapp, le CLI et le MCP sont une **UI fine sur le système de fichiers**. Pas de
base de données. Ce fichier est la seule source de vérité du format sur disque, pour
que les trois surfaces s'accordent.

## Arborescence

```
backlog/
  config.yml              # config du board (colonnes, préfixe d'id)
  tasks/
    task-001-<slug>.md    # une tâche = un fichier
    task-002-<slug>.md
  archive/                # tâches archivées (V2)
```

Le dossier `backlog/` vit à la racine du repo cible (`suivre init` le crée).

## `config.yml`

```yaml
name: Relay
taskPrefix: task
columns:
  - { id: backlog, label: Backlog }
  - { id: todo, label: À faire }
  - { id: doing, label: En cours }
  - { id: done, label: Terminé }
```

- `columns[].id` = les statuts possibles. L'ordre du tableau = l'ordre à l'écran.
- `columns[].wipLimit?` : plafond optionnel de cartes en cours.
- `taskPrefix` : préfixe des ids (`task-001`, `task-002`, …).

## Fichier de tâche

Frontmatter YAML + corps markdown.

```markdown
---
id: task-001
title: Corriger la boucle de re-transcription
status: doing
priority: high
labels: [bug, capture]
assignee: kevin
order: a3
depends: [task-000]
created: 2026-07-20T10:00:00Z
updated: 2026-07-20T12:30:00Z
---

## Description

...

## Acceptance Criteria

- [ ] ...

## Notes

...
```

Champs de frontmatter :

| Champ | Requis | Détail |
|---|---|---|
| `id` | oui | `<prefix>-<n>` zéro-paddé |
| `title` | oui | — |
| `status` | oui | doit correspondre à une `column.id` |
| `priority` | non | `low` \| `medium` \| `high` \| `urgent` |
| `labels` | non | liste (omise si vide) |
| `assignee` | non | ex. `kevin`, `claude` |
| `order` | oui | rang lexicographique (fractional index) |
| `parent` | non | id d'une tâche parente (sous-tâche) |
| `depends` | non | ids bloquants (omis si vide) |
| `created` / `updated` | oui | ISO 8601 |

Le corps est du markdown libre ; les sections `## Description`,
`## Acceptance Criteria` (cases à cocher) et `## Notes` sont conventionnelles.

## Garanties

- **Écriture atomique** (temp + `rename`) : jamais de fichier à moitié écrit,
  même avec web + CLI + MCP concurrents.
- **Sérialisation déterministe** : ordre de champ fixe, optionnels/vides omis →
  diffs git propres.
- **Statut orphelin** (colonne inconnue) : la tâche est remontée, jamais cachée.
