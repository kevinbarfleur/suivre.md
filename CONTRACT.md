# Contrat de données — suivre.md

La webapp, le CLI et le MCP sont une **UI fine sur le système de fichiers**. Pas de
base de données. Ce fichier est la seule source de vérité du format sur disque, pour
que les trois surfaces s'accordent.

## Arborescence

```
.suivre/
  config.yml              # config du board (colonnes, préfixe d'id)
  preferences.json        # préférences projet (vue par défaut)
  tasks/
    task-001-<slug>.md    # une tâche = un fichier
    archive/              # tâches archivées par emplacement
  sprints/
    sprint-001-<slug>.md  # checklist ordonnée d'ids de tâches
  decisions/
    decision-001-<slug>.md
  docs/
    doc-001-<slug>.md
    archive/
```

Le dossier `.suivre/` vit à la racine du repo cible (`suivre init` le crée).

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

### Commentaires

L'historique de conversation d'une tâche vit **en fin de corps**, sous une section
`## Comments` (créée au premier commentaire par `suivre comment` / `task_comment`) :

```markdown
## Comments

### 2026-08-08T10:00:00Z — claude

Premier retour.
```

Une entrée = `### <ISO 8601>[ — <auteur>]` + le texte. Append-only par convention.

### Fermeture et archivage

`suivre done` déplace la tâche dans la **dernière colonne** du board. Avec
`--archive`, le fichier part ensuite dans `tasks/archive/` : hors du board actif,
mais versionné et visible dans la vue archive.

## Garanties

- **Écriture atomique** (temp + `rename`) : jamais de fichier à moitié écrit,
  même avec web + CLI + MCP concurrents.
- **Sérialisation déterministe** : ordre de champ fixe, optionnels/vides omis →
  diffs git propres.
- **Statut orphelin** (colonne inconnue) : la tâche est remontée, jamais cachée.
