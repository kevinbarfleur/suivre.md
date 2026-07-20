# suivre.md — Brief designer : vues supplémentaires

> **À qui / comment.** Document à transmettre au designer. Il décrit **quelles
> informations chaque nouvelle vue affiche, quelles actions, quels états** — pas
> le style. L'atmosphère, la mise en page, la densité, le motion restent du
> ressort du designer. Ces vues **réutilisent le langage terminal déjà établi**
> (projet Claude Design « Suivre » : `Suivre Design System.dc.html` +
> `Suivre Dashboard.dc.html`) : mêmes tokens, mêmes composants. On n'invente pas
> un nouveau langage, on assemble l'existant. Quand une distinction doit être
> *perceptible*, c'est noté comme **exigence d'information**, jamais comme une
> consigne de couleur/forme.

---

## 0. Contexte (rappel court)

**suivre.md** = gestionnaire de backlog markdown-native, board kanban terminal déjà
livré (Bilan + toolbar filtres + board + fiche). On ajoute **7 vues** et **une
navigation** entre elles.

Deux familles :
- **Vues sur les tâches** (donnée existante, aucune migration) : Overview, Liste,
  Dépendances — s'ajoutent au board déjà livré.
- **Ressources markdown** (nouveaux concepts, chacun = un dossier de `.md`) :
  Milestones, Docs, Drafts, Décisions.

**Contrat de données d'une tâche** (inchangé) :

| Champ | Sens | Valeurs |
|---|---|---|
| `id` | Identifiant | `task-001` |
| `title` | Intitulé | texte |
| `status` | Colonne | `backlog`·`todo`·`doing`·`test`·`done` |
| `priority` | Priorité | `low`·`medium`·`high`·`urgent` (ou absente) |
| `labels` | Étiquettes | liste (dont `dette`) |
| `assignee` | Responsable | `@kevin`, `@claude`… (souvent absent) |
| `parent` | Tâche parente | `id` (→ sous-tâche) |
| `depends` | Bloqueurs | liste d'`id` |
| `milestone` | Jalon de rattachement | `id` de milestone (nouveau, optionnel) |
| `created` / `updated` | Horodatage | ISO 8601 |
| Acceptance Criteria | Cases à cocher **dans le corps markdown** | `- [ ]` / `- [x]` |

---

## 1. Navigation entre vues

Aujourd'hui le dashboard empile : ligne d'invite → **Bilan** → **toolbar filtres** →
**board**. Avec 8 vues au total (`board` + les 7 nouvelles), **le segmenté ne suffit
plus** — c'est le point de design principal de la navigation.

Regroupement proposé (le designer choisit le traitement : rail vertical terminal,
invite `$ view ▾` avec sous-menu, onglets groupés… — l'exigence est : 8 vues
accessibles, groupées, vue courante lisible, **mémorisée**) :

- **Tâches** — `board` · `liste` · `overview` · `deps`
- **Ressources** — `milestones` · `docs` · `drafts` · `décisions`

Décisions d'information :
- La **ligne d'invite** reste en tête partout (identité constante).
- Le **Bilan compact** et la **toolbar** (recherche `grep` + filtres
  `--priority`/`--label`/`--assignee`) concernent les **tâches** : présents sur
  `board`/`liste`/`deps`, masqués sur `overview` (agrégats propres) et sur les
  **ressources** (chacune a son propre filtre : statut, recherche…).
- Le compteur de résultats reste cohérent d'une vue à l'autre.

---

## 2. Vue « Overview » (synthèse développée, lecture seule)

**Objet.** L'état du projet en profondeur — la version développée du Bilan compact.
Aucune édition.

**Informations à afficher :**
- **Compteurs globaux** : total, terminées, % d'avancement (barre).
- **Répartition par colonne** : chaque statut avec son compte et sa proportion (barre).
- **Répartition par priorité** : urgent / high / medium / low / sans, comptes.
- **Répartition par label** : principaux labels avec comptes (barres), `dette` distingué.
- **Répartition par responsable** : comptes par `@assignee` (avec les avatars du DS).
- **Répartition par milestone** : avancement par jalon (voir §5).
- **Indicateurs saillants** : à tester, prioritaires (high+urgent), dette, **bloquées**
  (≥1 `depends` non terminé), **orphelines** (statut hors colonnes).
- **Progression des critères (AC)** agrégée : total done/total sur l'ensemble (barre).
- **Fraîcheur** : plus anciennes non terminées (`created`), dernières modifiées (`updated`).

**Action** : un agrégat est un **point d'entrée** — cliquer un label / une priorité /
un assignee / un jalon applique le filtre correspondant et bascule vers la **liste**
ou le **board**. *(Exigence d'information ; l'affordance est au designer.)*

**États** : projet vide (aucune tâche), chargement.

**Composants DS** : blocs stat/compteur (« feedback · stat/compteur »), barres ASCII
(meters « range · wip »), chips (à_tester/prio/dette du Dashboard), avatars
(« data · statut & avatars »), labels.

---

## 3. Vue « Liste » (table dense, triable, filtrable)

**Objet.** Toutes les tâches en une table — la vue « tout voir / retrouver ».

**Colonnes (information) :**

| Colonne | Contenu |
|---|---|
| `id` | `task-001` |
| statut | pill de statut (« data · statut ») |
| priorité | badge (URGENT plein / HIGH contour / low discret) |
| titre | tronqué sur une ligne |
| labels | `#label` + chip `#dette` |
| assignee | avatar / `@nom` (vide si absent) |
| critères | `done/total` + mini-barre (si AC dans le corps) |
| bloqué | indice `⤳` si `depends` non résolu |
| updated | date courte |

**Comportements :**
- **Tri** par n'importe quelle colonne (statut, priorité, `updated`, `id`, titre),
  ascendant/descendant. L'en-tête de colonne triée est marquée.
- **Filtres** : la toolbar existante s'applique (recherche + priority/label/assignee) ;
  **plus** un filtre par **statut** (puisqu'il n'y a plus de colonnes visuelles).
- **Densité** : lignes **de hauteur constante** (même slot pour toutes — exigence
  sibling : mêmes hauteurs, mêmes rails, même troncature).
- **Sélection** : clic sur une ligne → ouvre la **fiche** existante (même modale).

**États** : 0 résultat (aucun match — explicite), projet vide, chargement,
**orphelines remontées** (jamais masquées).

**Composants DS** : lignes façon « foundations · typographie » (rangées alignées),
badges priorité, pills statut, avatars, meters, chips.

---

## 4. Vue « Dépendances / bloqués » (ordre d'exécution)

**Objet.** Rendre lisible ce qui bloque quoi — pour décider **quoi débloquer en
premier** (utile en pilotage humain *et* agent).

**Informations à afficher :**
- **Tâches bloquées** : chaque tâche non terminée ayant ≥1 `depends`, avec ses
  **bloqueurs** (id + statut de chacun). Distinguer un bloqueur **résolu** (`done`,
  donc levé) d'un bloqueur **non résolu**.
- **Bloqueurs à fort impact** : tâches non terminées **dont dépendent** d'autres,
  triées par **nombre de dépendants** (les traiter libère le plus).
- **Sous-tâches** : regroupement `parent → enfants` avec progression du parent.
- Le designer choisit la **forme** (liste hiérarchique vs petit arbre/graphe) ;
  l'exigence est : la relation **bloque → bloqué** se lit sans effort.

**Exigences d'information :**
- Bloqueur **résolu vs non résolu** : distinction perceptible.
- **Cycle** éventuel (A dépend de B qui dépend de A) : **signalé** (honnêteté), jamais
  masqué ni bouclé silencieusement.

**Actions** : clic sur une tâche → fiche ; clic sur un bloqueur → naviguer vers lui.

**États** : **aucune dépendance déclarée** → état vide explicite
(« aucune dépendance — rien à ordonner »), chargement.

**Composants DS** : indice `⤳ bloqué par` (« kanban · carte »), pills statut, meters.

---

## 5. Vue « Milestones » (jalons)

**Objet.** Regrouper les efforts en jalons et suivre leur avancement.

**Nouveau modèle** (une milestone = 1 fichier `.md` dans `backlog/milestones/`) :

| Champ | Sens | Valeurs |
|---|---|---|
| `id` | Identifiant | `milestone-001` |
| `title` | Nom du jalon | texte |
| `status` | État | `planned` · `active` · `completed` |
| `due` | Date cible | ISO 8601 (optionnel) |
| corps | Description / portée | markdown libre |

Rattachement : une tâche porte un champ optionnel `milestone` (voir contrat §0).

**Vue :**
- **Liste** des milestones : titre, statut, **progression** (tâches terminées / total
  du jalon + barre), date cible.
- **Détail** : la milestone + **ses tâches groupées par statut** (mini-board ou liste).

**Actions** : créer / renommer / supprimer un jalon ; rattacher une tâche à un jalon.
*(À la suppression, comportement à préciser côté produit : détacher vs réassigner les
tâches — pas un sujet designer.)*

**Exigences d'information :**
- **Progression** lisible d'un coup d'œil.
- Milestone **en retard** (`due` dépassée et non `completed`) : signalée.

**États** : aucun jalon (vide explicite), chargement.

**Composants DS** : meters (progression), pills statut, blocs stat/compteur.

---

## 6. Vue « Docs » (documentation projet)

**Objet.** Documentation markdown vivant dans le repo (notes de conception,
références) — surtout de la **lecture**.

**Nouveau modèle** (un doc = 1 fichier `.md` dans `backlog/docs/`) :

| Champ | Sens | Valeurs |
|---|---|---|
| `id` | Identifiant | `doc-001` |
| `title` | Titre | texte |
| `updated` | Dernière modif | ISO 8601 |
| corps | Contenu | **markdown rendu** (titres, listes, code, liens, cases) |

**Vue :**
- **Index** des docs : titre, date de mise à jour ; recherche dans les docs.
- **Lecture** d'un doc : **markdown rendu** (c'est la différence clé avec les autres
  vues — ici on affiche du contenu long formaté, pas des champs).

**Actions** : créer / éditer / supprimer un doc.

**Exigences d'information :**
- La **lisibilité du markdown rendu** prime (hiérarchie de titres, blocs de code,
  listes/cases, liens) — dans le langage terminal, mais lisible en lecture longue.

**États** : aucun doc (vide explicite), chargement.

**Composants DS** : « foundations · typographie » (échelle h1/h2/body), le rendu de
code/cases s'appuie sur les tokens existants.

---

## 7. Vue « Drafts » (brouillons)

**Objet.** File d'idées **non encore promues** en tâches — capturer sans polluer le
board.

**Modèle** : un brouillon = 1 fichier `.md` dans `backlog/drafts/` (même schéma qu'une
tâche mais **sans `status`/`order`** obligatoires — il n'est dans aucune colonne).

**Vue :**
- **Liste** des brouillons : id, titre, notes courtes.
- Un brouillon est **visuellement distinct** d'une tâche active (il n'apparaît pas dans
  le board tant qu'il n'est pas promu).

**Actions :**
- **Promote** un brouillon → devient une vraie tâche (attribue `status` + rang, sort de
  `drafts/`).
- **Demote** une tâche → redevient brouillon.
- Créer / éditer / supprimer un brouillon.

**Exigences d'information :**
- L'état **brouillon vs tâche active** doit être immédiatement lisible.
- L'action **promote** est claire (c'est le geste principal de cette vue).

**États** : aucun brouillon (vide explicite), chargement.

**Composants DS** : cartes/lignes (variante « atténuée » du langage carte), fiche modale.

---

## 8. Vue « Décisions » (registre ADR)

**Objet.** Un registre de décisions d'architecture / produit, versionné en markdown
comme les tâches (dogfood direct des « décisions verrouillées » de Relay).

**Nouveau modèle** (une décision = 1 fichier `.md` dans `backlog/decisions/`) :

| Champ | Sens | Valeurs |
|---|---|---|
| `id` | Identifiant | `decision-001` |
| `title` | Intitulé de la décision | texte |
| `status` | État | `proposed` · `accepted` · `rejected` · `superseded` |
| `date` | Date de la décision | ISO 8601 |
| `supersedes` / `superseded_by` | Lien décision remplacée/remplaçante | `id` (optionnel) |
| corps | Sections ADR | **Contexte / Décision / Conséquences** |

**Vue :**
- **Liste** des décisions triées par date décroissante : `id`, statut (badge), titre, date.
- **Filtre par statut**.
- **Détail** = fiche (Contexte / Décision / Conséquences) + lien de supersession s'il existe.

**Actions** : créer, éditer, **changer le statut** (proposed → accepted / rejected),
lier une décision qui en supersède une autre.

**Exigences d'information :**
- Le **statut ressort** : `accepted` vs `proposed` vs `rejected`/`superseded` distincts.
- Une décision **superseded** pointe clairement vers celle qui la remplace.

**États** : aucune décision (vide explicite), chargement.

**Composants DS** : badges statut, lignes de liste, fiche modale (« overlay · fiche »).

---

## 9. Exigences d'information transverses

Distinctions qui doivent être **perceptibles** (le *comment* est au designer) :
1. **Priorité** : `high`/`urgent` ressortent, `low` discret, `medium`/absence neutre.
2. **Statuts** (colonnes, milestone, décision) : lecture rapide, les états terminaux
   (`terminé`/`completed`/`accepted`) portent du sens.
3. **Dette** (label) : repérable comme catégorie transverse.
4. **Bloqué résolu vs non résolu** (deps), **brouillon vs actif**, **en retard** (due) :
   distinctions lisibles.
5. **États système** : chargement, erreur, vide (global + par vue), 0 résultat,
   orphelines — rendu clair et honnête, jamais d'écran muet.
6. **Chiffres** qui s'alignent (comptes, done/total, dates) : lisibles, tabulaires.
7. **Siblings** (lignes de liste, rangées d'overview, cartes) : mêmes hauteurs, rails,
   troncatures — pas de dérive d'un élément à l'autre.

---

## 10. Répartition des responsabilités & portée technique

- **Ce document** : quelles données, quelles infos, quelles actions, quels états.
  → maître : produit (Kevin + agent).
- **Atmosphère / forme** (mise en page, densité, motion, traitement des distinctions,
  **la navigation à 8 vues**) : → **designer**, dans le langage terminal validé.
- **Contrat de données** (`CONTRACT.md`) et **architecture** (`ARCHITECTURE.md`) : le
  design ne les touche pas.

**Portée technique (pour information) :**
- **Overview**, **Liste**, **Dépendances** = **pur front** sur le contrat existant
  (nouvelles vues branchées sur le registre + le filter store ; aucune migration).
- **Milestones**, **Docs**, **Drafts**, **Décisions** = **nouveaux domaines backend**
  (un store `.md` par concept, endpoints, outils MCP), **en parallèle** du domaine
  `task`. Milestones ajoute aussi un champ optionnel `milestone` sur la tâche.

---

## 11. Hors périmètre (pour plus tard)

Timeline / frise d'activité, group-by (regrouper le board par label/assignee/priorité),
corps de tâche structuré (Description/Plan/Notes édités comme sections séparées).
