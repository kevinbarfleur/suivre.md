# suivre.md — Spécification fonctionnelle

> **Périmètre de ce document.** Il décrit **ce que l'outil affiche et ce qu'il fait** :
> les données, les informations présentées, les actions, les états. Il ne décrit
> **aucun** parti pris visuel (couleurs, typographie, mise en page, densité, animations,
> atmosphère) — tout cela est du ressort du designer. Quand une distinction doit être
> *perceptible* (ex. une priorité, une colonne), c'est noté comme **exigence
> d'information**, pas comme une consigne de style : le designer choisit le traitement.

---

## 1. Objet

**suivre.md** est un gestionnaire de backlog / dashboard de suivi de projet :

- **Markdown-native** : une tâche = un fichier `.md` versionné dans le repo. Pas de base
  de données, pas de service à héberger. Git est l'historique.
- **Multi-projets** : on l'initialise dans n'importe quel repo ; il y pose un dossier de
  backlog local. Un même outil sert tous les projets.
- **Triple surface sur la même donnée** : un **dashboard web**, un **CLI**, et un
  **serveur MCP** (pour qu'un agent lise/écrive le backlog directement). Les trois lisent
  et écrivent les mêmes fichiers ; ils restent toujours cohérents.
- **Vivant** : le dashboard reflète en direct toute modification des fichiers, quel que
  soit l'auteur (humain au board, CLI, ou agent via MCP).

Cas d'usage premier : **suivre l'état d'un projet** (ex. l'app iOS) — ce qui est fait, ce
qui est à tester, ce qui reste, la dette — et le piloter à la fois à la main et par agent.

---

## 2. Modèle de données

### 2.1 Board (projet)

Un board = un projet, décrit par une **configuration** :

| Donnée | Sens | Valeurs |
|---|---|---|
| `name` | Nom du projet affiché | texte libre |
| `taskPrefix` | Préfixe des identifiants de tâche | texte (défaut `task`) |
| `columns` | Colonnes = statuts possibles, **dans l'ordre d'affichage** | liste ordonnée (voir 2.2) |

### 2.2 Colonne (statut)

| Donnée | Sens | Valeurs |
|---|---|---|
| `id` | Identifiant du statut (référencé par les tâches) | texte court |
| `label` | Libellé affiché de la colonne | texte |
| `wipLimit` | (optionnel) plafond de tâches « en cours » pour cette colonne | entier |

Les colonnes sont **configurables par projet**. Exemple retenu pour le suivi produit :
`Backlog` · `À faire` · `En cours` · `À tester` · `Terminé`.

### 2.3 Tâche

Chaque tâche est un fichier `.md` = un en-tête structuré (frontmatter) + un corps libre.

**Champs structurés :**

| Champ | Sens | Valeurs / règles | Requis |
|---|---|---|---|
| `id` | Identifiant unique, séquentiel | `<prefix>-<n>` zéro-paddé (`task-001`) | oui |
| `title` | Intitulé de la tâche | texte | oui |
| `status` | Colonne courante | doit correspondre à une `column.id` | oui |
| `priority` | Niveau de priorité | `low` \| `medium` \| `high` \| `urgent` | non |
| `labels` | Étiquettes libres (thème, domaine) | liste de textes (ex. `bug`, `test`, `dette`) | non |
| `assignee` | Responsable | texte (ex. `kevin`, `claude`) | non |
| `order` | Rang dans la colonne (position) | clé de tri ; insertion sans réindexation | oui |
| `parent` | Tâche parente (sous-tâche) | `id` d'une autre tâche | non |
| `depends` | Tâches bloquantes | liste d'`id` | non |
| `created` / `updated` | Horodatage de création / dernière modif | date ISO 8601 | oui |

**Corps (markdown libre).** Sections conventionnelles :
- **Description** — le contexte / l'énoncé.
- **Acceptance Criteria** — critères de complétion sous forme de cases à cocher.
- **Notes** — plan, décisions, observations.

> Le format exact sur disque (arborescence, YAML) est figé dans `CONTRACT.md`.

---

## 3. Surfaces

### 3.1 Dashboard web
La surface visuelle de consultation et d'édition (détail en §4). C'est **cette surface
que le designer va refondre**.

### 3.2 CLI (`suivre`)
Pilotage au terminal. Commandes :
- `init [nom]` — crée le backlog du repo courant (idempotent).
- `add <titre> [--status <col>] [--priority <niveau>]` — crée une tâche.
- `list` — liste les tâches (`id`, statut, titre).
- `move <id> <statut>` — change une tâche de colonne.
- `rm <id>` — supprime une tâche.
- `board [--port <p>]` — lance le dashboard web (un seul process, sert web + données).

### 3.3 MCP (agent)
Un serveur MCP expose les mêmes opérations en outils natifs, pour qu'un agent gère le
backlog sans manipuler de fichiers :
- `backlog_init`, `backlog_list` (renvoie le board complet)
- `task_add`, `task_edit`, `task_move`, `task_remove`

Comme le dashboard est **live**, les écritures de l'agent apparaissent immédiatement à
l'écran si le board est ouvert.

---

## 4. Le dashboard web — informations à afficher

Le dashboard est composé de **blocs indépendants**. Un board donné en affiche plusieurs,
dans un ordre défini. Ci-dessous, **le contenu informationnel de chaque bloc** — pas sa
forme.

### 4.1 Bloc « Bilan » (synthèse de l'état du projet)
Objectif : donner l'état d'avancement d'un coup d'œil. Informations :
- **Nom du projet.**
- **Total de tâches.**
- **Avancement** : proportion de tâches terminées (nombre et/ou pourcentage).
- **Répartition par colonne** : le compte de tâches de chaque colonne.
- **Indicateurs saillants** (paramétrables) : nombre de tâches **à tester**, nombre de
  tâches **prioritaires** (high + urgent), nombre de tâches marquées **dette**.
- *(Exigence d'information : ces indicateurs saillants doivent être distinguables entre
  eux ; le traitement est au choix du designer.)*

### 4.2 Bloc « Board » (kanban)
La vue principale : les tâches rangées par colonne.

**Par colonne :**
- Le **libellé** de la colonne.
- Le **nombre** de tâches qu'elle contient.
- La **liste ordonnée** des tâches (selon leur rang).
- Un **état vide** explicite quand la colonne n'a aucune tâche.
- Un **point d'entrée de création rapide** (ajouter une tâche directement dans la colonne).

**Par carte de tâche (vue compacte) :**
- L'**identifiant** (`task-001`).
- Le **titre**.
- La **priorité** si elle est renseignée (et significative — voir exigences §6).
- Les **labels**.
- *(Extensions prévues, cf. §7 : indice de sous-tâches, indice de dépendances/blocage,
  échéance, responsable.)*

**Cartes orphelines** : une tâche dont le `status` ne correspond à aucune colonne ne doit
**jamais être masquée** — elle est remontée explicitement (exigence d'honnêteté des
données), pour être re-triée.

### 4.3 Fiche de tâche (détail / édition)
Ouverte depuis une carte. Affiche et permet d'éditer :
- `title` (texte)
- `status` (choix parmi les colonnes du board)
- `priority` (aucun / low / medium / high / urgent)
- `labels` (liste éditable)
- Le **corps markdown** (Description / Acceptance Criteria / Notes)
- *(À afficher en lecture : `id`, `created`, `updated`. Éditables plus tard si besoin :
  `assignee`, `parent`, `depends`.)*

Actions depuis la fiche : **Enregistrer**, **Supprimer**, **Fermer/Annuler**.

### 4.4 Filtres & recherche (bloc à venir, cf. §7)
Filtrer/chercher les tâches par : **texte** (titre/corps), **label**, **priorité**,
**responsable**. Le board se restreint aux tâches correspondantes ; l'état « aucun
résultat » doit être explicite.

---

## 5. Actions & comportements

| Action | Déclencheur | Effet |
|---|---|---|
| Créer | Création rapide (colonne) / CLI / MCP | Nouvelle tâche en fin de colonne cible, `id` auto-incrémenté |
| Éditer | Fiche de tâche / MCP | Met à jour les champs, bump `updated` |
| Déplacer (colonne) | **Drag-and-drop** entre colonnes / CLI / MCP | Change le `status` ; se place dans la colonne cible |
| Réordonner (dans une colonne) | Drag-and-drop (placement fin) | Change le rang **sans** réindexer les autres |
| Supprimer | Fiche de tâche / CLI / MCP | Retire la tâche |
| Rafraîchir (live) | Toute écriture de fichier | Le board se met à jour automatiquement |

**Concurrence** : plusieurs auteurs simultanés (board, CLI, agent MCP) doivent être
sûrs — aucune tâche corrompue ni à moitié écrite. (Garantie technique : écriture atomique.)

---

## 6. Exigences d'information (à traiter par le designer, sans imposer le style)

Ce sont des **distinctions qui doivent être perceptibles**. Le *comment* (couleur, forme,
poids, icône…) est laissé au designer.

1. **Priorité** : les niveaux `high` et `urgent` doivent ressortir ; `low` est discret ;
   `medium`/absence est neutre. (Autrement dit : la couleur/emphase sert à repérer ce qui
   sort de l'ordinaire, pas à peindre chaque carte.)
2. **Colonnes clés** : « À tester » et « Terminé » portent un sens fort pour le suivi
   produit ; leur lecture rapide compte.
3. **Dette** (label) : repérable comme catégorie transverse.
4. **État d'une carte pendant le drag** et **colonne cible d'un drop** : doivent être
   lisibles pendant le geste.
5. **États système** : chargement, erreur, vide (global et par colonne), orphelins —
   chacun doit avoir un rendu clair et honnête (jamais un écran vide muet).
6. **Compteurs / chiffres** qui s'alignent ou changent : lisibilité des nombres.

---

## 7. Hors périmètre V1 / évolutions (fonctionnel)

À spécifier plus tard, quand le besoin est confirmé :
- **Sous-tâches** (`parent`) et **dépendances** (`depends`) : aujourd'hui stockées, pas
  encore visualisées (indice sur la carte, filtrage « bloqué par »).
- **Échéances** / dates cibles.
- **Réordonnancement fin** intra-colonne au drag (la donnée le permet déjà).
- **Milestones / regroupements**, **vues alternatives** (liste, timeline).
- **Multi-utilisateur, temps réel collaboratif, cloud** : explicitement hors sujet à ce
  stade (outil local, mono-utilisateur).

---

## 8. Répartition claire des responsabilités

- **Ce document (fonctionnel/informationnel)** : quelles données, quelles infos affichées,
  quelles actions, quels états. → maintenu par Kevin + agent.
- **L'atmosphère et la forme** (mise en page, couleurs, typo, densité, motion, ton
  visuel) : **définies avec le designer**, hors de ce document. Le design refait revient
  ensuite en implémentation.
- **Le contrat de données** (`CONTRACT.md`) et **l'architecture technique**
  (`ARCHITECTURE.md`) : inchangés par le design ; la refonte visuelle ne doit pas toucher
  au format des fichiers ni aux endpoints.
