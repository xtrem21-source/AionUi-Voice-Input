# Rapport d'incident — gel du renderer d'AionUi

> **Date** : 2026-10-17 · **Version corrigée** : 2.1.4 (script interne v4) · **Cible** : AionUi 2.2.2, Windows
> **Statut** : corrigé, patché sur la machine, vérifié · **Fichier de référence** : `src/voice-input.aionui.js`

Ce rapport garde la trace de ce qui a été modifié, des deux défauts trouvés, de la méthode de
diagnostic et des contrôles qui prouvent la correction. Il sert de point de départ si le
problème revient ou s'il faut porter le correctif sur une autre application.

---

## 1. Symptôme observé

| Observation | Détail |
|---|---|
| Gel de la fenêtre | AionUi devient inutilisable peu après le lancement ; il faut tuer le processus depuis le gestionnaire de tâches. |
| Repatch inutile | `REAPPLIQUER-MIC-AIONUI.bat` (donc `-Force`) réapplique le même script fautif : aucun effet. |
| Journal AionUi | `[2026-10-17 21:05:39] [warn] [AionUi] Renderer became unresponsive`, puis des `render-process-gone: reason 'killed', exitCode: 1` à répétition. |
| Journal du module | Absent du fichier AionUi : `window.electronAPI.logs` n'existe pas dans ce build. Les traces du module sont donc dans `localStorage['ocVoice.log']`. |

Le gel n'était **pas** causé par l'audio, Gemini, le réseau ou le repack : il se produisait sans
cliquer sur le micro.

---

## 2. Cause racine

### 2.1 La boucle d'ancrage (cause du gel)

AionUi n'utilise pas de `<form>` autour du composeur. `findSubmitButton()` basculait donc sur
l'heuristique « **dernier bouton visible** de la barre de saisie ». Une fois le micro inséré
juste après la flèche d'envoi, ce dernier bouton était… **le micro lui-même**.

Déroulé de la boucle :

```
insertion du micro après la flèche
        ↓
mutation DOM observée par MutationObserver
        ↓
findSubmitButton() renvoie le micro (dernier bouton)
        ↓
l'ancre n'est plus "bien placée" → mountAnchored()
        ↓
anchor.remove() puis réinsertion
        ↓
nouvelle mutation → retour au début
```

Le tout en microtâches : le renderer ne rend plus la main. Preuve lue dans le tampon
`localStorage['ocVoice.log']` de la session fautive :

```
19:27:25 [info] MutationObserver: reancrage (declenchement n°35420, ancre connectee=false)   [UTC du module ; 21:27 local]
19:27:25 [info] MutationObserver: reancrage (declenchement n°35440, ancre connectee=false)
19:27:25 [info] MutationObserver: reancrage (declenchement n°35460, ancre connectee=false)
```

**~35 460 déclenchements en quelques secondes**, avec deux `mountAnchored` par cycle.

### 2.2 `app.asar.unpacked` avalé par le repack (défaut secondaire)

`@electron/asar extract` matérialise dans le dossier temporaire les fichiers marqués
*unpacked*. Le `pack` suivant, sans motif `--unpack`, les réintègre dans `app.asar` :

| État | Taille |
|---|---|
| Archive d'origine | 313 278 785 octets |
| Archive après repack fautif | 363 188 450 octets (**+48,7 Mo**) |
| Archive après correctif | 302 649 437 octets |

Les 214 fichiers déballés (modules natifs `better-sqlite3`, `@napi-rs/canvas`,
`web-tree-sitter`, scripts `builtin-mcp-*`) doivent rester **hors** de l'archive.

---

## 3. Méthode de diagnostic — comment la solution a été trouvée

| Étape | Geste | Ce que ça a donné |
|---|---|---|
| 1 | Lire les journaux de patch (`logs/patch-AionUi-*.log`) | Le patch « réussit » mais l'archive grossit de 48,7 Mo. |
| 2 | Lire le journal AionUi (`%APPDATA%\AionUi\logs\2026\10\17\2026-10-17.log`) | `Renderer became unresponsive` + `render-process-gone` ; aucune trace `[Saisie vocale]` (API logs absente). |
| 3 | Restaurer `app.asar.bak` et lancer l'app avec `--remote-debugging-port=9222` | L'app propre répond à `Runtime.evaluate`. Point de comparaison sain. |
| 4 | Relancer l'app patchée et refaire `Runtime.evaluate` | **Timeout de 8 s** : le renderer est bien figé, pas seulement lent. |
| 5 | Lire `localStorage['ocVoice.log']` de la session fautive | Les 35 460 déclenchements du `MutationObserver` : la boucle est prouvée. |
| 6 | Inspecter le DOM réel via CDP | 2 `<textarea>` dont 1 fantôme (hauteur 0) ; pas de `<form>` ; bouton d'envoi = `button.arco-btn-primary.send-button-custom`. |
| 7 | Rejouer mentalement `findSubmitButton()` après insertion | Le dernier bouton est le micro → boucle. |
| 8 | Injecter le script corrigé dans l'app propre via CDP | 1 seule ancre, aucun log de réancrage, renderer réactif. |
| 9 | Repatcher pour de vrai, puis relancer et vérifier | Voir §5. |

**Leçon transposable** : tout module qui s'insère dans un conteneur doit **s'exclure lui-même**
de ses propres sélecteurs, et un `MutationObserver` ne doit **jamais** modifier le DOM de façon
synchrone dans son callback.

---

## 4. Correctifs appliqués

| Fichier | Modification |
|---|---|
| `src/voice-input.aionui.js` | **v3** : `isOwnNode()` exclut `#ocVoiceAnchor` et `#ocVoiceRoot` de toute recherche de bouton ; score des candidats (`submit > primary > send > circle > SVG`) au lieu du « dernier bouton » ; re-ancrage **débouncé à 80 ms** (macrotâche) ; `observer.takeRecords()` après nos propres mutations ; garde de réentrance `st.anchoring` ; textareas de hauteur 0 ignorés ; logs d'ancrage une seule fois. |
| `scripts/apply-patch.ps1` | Préserve `app.asar.unpacked` (`--unpack-dir` pour les paquets `node_modules`, `--unpack` pour les fichiers isolés) ; vérifie que **chaque** fichier déballé existe dans le nouveau `.unpacked` ; refuse une archive qui grossit anormalement ; détection « déjà patché » en lisant seulement l'en-tête (plus de chargement de 300 Mo en mémoire) ; delta de taille affiché avec son signe. |
| `CHANGELOG.md`, `package.json` | Version **2.1.3**, description des deux correctifs. |
| `README.md`, `README.fr.md`, `docs/SUPPORTED-APPS.md` | AionUi passe de « ancrage à valider » à **« testé sous Windows (2.2.2) »** ; sélecteur et structure Arco documentés. |
| `docs/HOW-IT-WORKS.md`, `METHODOLOGY.md` | Règles « ne jamais s'ancrer sur soi-même » et « ne jamais replier `app.asar.unpacked` dans l'archive », avec les symptômes exacts. |

Le correctif ne change **ni** l'enregistrement audio, **ni** l'appel Gemini, **ni** le mode
d'envoi : uniquement l'ancrage DOM et le conditionnement de l'archive.

---

## 5. Vérifications lues (pas supposées)

| Contrôle | Résultat |
|---|---|
| `node --check src/voice-input.aionui.js` | code 0 |
| Parseur PowerShell + zéro octet non-ASCII sur `apply-patch.ps1` | `PARSE OK - ASCII OK`, code 0 |
| `git diff --check` dans le dépôt | code 0 |
| Patch complet, puis **repatch `-Force`** (chemin du `.bat`) | 3 exécutions successives, même taille finale 302 649 437 octets |
| En-têtes `.bak` vs patché | 0 fichier manquant ; seul ajout `out/renderer/voice-input.js` ; 214 entrées *unpacked* de chaque côté ; 0 différence de drapeau |
| SHA-256 des 214 fichiers `app.asar.unpacked` avant/après | 214/214 identiques |
| SHA-256 du script **dans le asar** vs source | identiques : `84BAAF89…C9D6` |
| `node --check` sur le script extrait du asar | code 0 |
| `index.html` dans le asar | ligne 52 : `<script src="./voice-input.js"></script>` |
| Application réelle via CDP | `window.__ocVoice.version = 3` ; 1 micro ; `previousElementSibling` = bouton `send-button-custom` ; répond après 20–30 s |
| Journal AionUi après patch | **0** `Renderer became unresponsive`, **0** `render-process-gone` |
| Clic droit sur le micro | panneau ouvert, modèle `gemini-3.5-flash-lite`, langue `fr`, insertion activée, envoi auto désactivé |
| Processus / restes | 0 AionUi, 0 aioncore, fichiers temporaires supprimés |

---

## 6. Points de retour

| Quoi | Comment revenir |
|---|---|
| Application installée | `resources\app.asar.bak` (original propre, 313 278 785 octets) ou `.\scripts\apply-patch.ps1 -Preset AionUi -Rollback` |
| Dépôt | Les 9 fichiers sont modifiés mais **non commités** : `git -C <repo> checkout -- .` |
| Journaux de patch | `logs/patch-AionUi-20261017-*.log` (un par tentative) |

---

## 7. Limites et points ouverts

| Point | État |
|---|---|
| Enregistrement micro + transcription Gemini | **Non exercés** (pas d'audio enregistré, pas de clé consommée). À valider par un clic réel sur le micro. |
| `scripts/apply-patch.sh` (macOS/Linux) | Garde le défaut `unpacked` ; non corrigé faute d'environnement bash testable ici. |
| Archive 10,6 Mo plus petite que l'originale | Marge/padding du packer, pas une perte : tous les fichiers sont présents (comparaison d'en-têtes) et l'app démarre. |
| En-tête d'origine de `better_sqlite3.node` | Annonçait 1 902 080 octets pour un fichier de 1 901 568 ; le repack a corrigé l'en-tête, contenu SHA-256 inchangé. |
| `window.electronAPI.logs` | Absent dans ce build : le module journalise dans `localStorage['ocVoice.log']`, pas dans le fichier AionUi. |

---

## 8. Si ça recommence — checklist courte

```powershell
# 1) Le renderer est-il figé ?
Select-String "$env:APPDATA\AionUi\logs\2026\10\17\2026-10-17.log" -Pattern 'unresponsive|render-process-gone'

# 2) Boucle d'ancrage ? (dans la console DevTools de l'app)
#    localStorage.getItem('ocVoice.log')  ->  chercher "déclenchement n°" qui explose

# 3) L'ancre est-elle au bon endroit ? (DevTools)
#    document.querySelector('#ocVoiceAnchor').previousElementSibling.className
#    -> doit contenir "send-button-custom" / "arco-btn-primary"

# 4) Réappliquer proprement
.\INSTALLER-MIC-AIONUI.bat          # ou :
.\scripts\apply-patch.ps1 -Preset AionUi -ScriptPath .\src\voice-input.aionui.js -Force

# 5) En cas de doute, revenir à l'état sain
.\scripts\apply-patch.ps1 -Preset AionUi -Rollback
```

**Règle d'or** : si le renderer gèle, chercher d'abord une boucle `MutationObserver` dans
`localStorage['ocVoice.log']`, pas dans l'audio ni dans Gemini.

---

## 9. Suivi du 2026-10-17 (2.1.4) — après le premier test utilisateur

### Symptômes rapportés

| Retour | Constat |
|---|---|
| « Je n'arrive pas à me connecter à Gemini, c'est comme si c'était bloqué » | **Aucune clé n'était enregistrée** (`ocVoice.geminiKey` vide) ; le bouton **« Tester la clé Gemini » n'avait aucun écouteur** (il ne faisait rien) ; et le message `NO_KEY` était affiché dans une bulle **immédiatement masquée** par l'ouverture du panneau. |
| « Je peux activer le micro mais je ne peux plus l'arrêter » | L'arrêt fonctionnait (les journaux montrent une transcription après chaque arrêt), mais un **double-clic** pouvait lancer deux enregistreurs, et l'absence de texte (à cause de `NO_KEY`) donnait l'impression que rien ne s'était passé. |
| « Suivant les fenêtres, le micro est sur le bouton envoyer » | Mesuré à 600, 800, 1000 et 1536 px : pas de chevauchement, mais un **écart de seulement 6 px** entre deux cercles sombres (micro 36 px, envoi 32 px), visuellement collés. |
| « Je n'ai pas l'option pour entrer la clé, seulement un lien vers Google » | Dans une fenêtre basse (600×600), le panneau s'ouvrait **hors écran par le haut** (`top: -219 px`) : le champ de clé et son libellé étaient invisibles, seule la partie basse (dont le lien Google) restait à l'écran. |

### Correctifs 2.1.4

- `#ocvTest` exécute désormais un vrai `generateContent` minimal (clé + modèle) et écrit la
  réponse API dans `#ocvStatus` : clé valide, clé invalide, modèle inconnu, ou réseau/CORS.
- `showPanel()` centralise l'ouverture du panneau ; en cas de `NO_KEY`, le statut du panneau
  explique quoi faire et le champ de la clé reçoit le focus (la bulle n'est plus masquée).
- `st.starting` empêche un second `getUserMedia` pendant le démarrage ; `stopRecording()`
  bascule l'état visuel immédiatement ; `st.finishing` empêche une double transcription.
- Délai maximal sur les appels Gemini : **45 s** pour la transcription, **15 s** pour le test
  de clé, avec message « délai dépassé » (le bouton ne reste plus bloqué en `busy`).
- Panneau de réglages toujours visible : il est affiché **avant** d'être mesuré, plafonné à
  `calc(100vh - 24px)` avec défilement, et décalé vers le bas (`ensurePanelVisible`) quand il
  sortirait par le haut. À 600×600, le champ de clé est désormais à `top: 73 px`, visible.
- Micro passé à **32×32** avec **14 px d'écart** (au lieu de 36×36 et 6 px).
- Les textes « Open Cowork » résiduels ont été remplacés par « AionUi » ; le panneau ne
  promet plus une clé automatique qui n'existe pas dans ce build.

### Vérifications 2.1.4

| Contrôle | Résultat |
|---|---|
| `node --check` sur la source et sur le script extrait du asar | code 0 |
| Bouton « Tester la clé » avec une fausse clé | `Échec : API key not valid. Please pass a valid API key.` (donc réseau OK, bouton vivant) |
| Enregistrement sans clé, arrêt | `rec=0`, une seule transcription, panneau ouvert avec le statut `Aucune clé API Gemini…` |
| Double-clic de démarrage | **un seul** `startRecording` / `enregistrement démarré` dans le journal |
| Mise en page à 600 / 1000 / 1536 px | écart de 14 px, `elementFromPoint` au centre du micro = micro, aucun chevauchement |
| Panneau dans une fenêtre **600×600** | `panel top = 8 px`, champ de clé `top = 73 px` → **visible** (avant : `top = -219 px`, champ hors écran) |
| Journal AionUi | 0 `Renderer became unresponsive`, 0 `render-process-gone` |

**Ce qui reste à valider par l'utilisateur** : coller une **vraie clé Gemini** dans le panneau,
cliquer sur « Tester la clé Gemini » (le résultat s'affiche dans le panneau), puis dicter.
Le modèle par défaut `gemini-3.5-flash-lite` n'a pas pu être validé sans clé ; si le test
répond « model not found », changer le modèle dans le panneau (par exemple `gemini-2.5-flash`).

---

## 10. Suivi du 2026-10-17 (2.1.5) — ancrage dans les anciens fils

### Symptôme

Dans un **fil de discussion existant**, le micro se superposait presque au bouton d'envoi ;
après l'envoi d'un message, il pouvait se retrouver tout à droite de la fenêtre. Dans un
**chat vierge**, tout était correct.

### Cause

La structure du composeur diffère selon la vue :

| Vue | Parent du bouton d'envoi | Largeur | Conséquence |
|---|---|---|---|
| Chat vierge | `div._actionSubmit` (barre d'actions complète) | ~376 px | insertion correcte à droite de la flèche |
| Ancien fil | `span.sendbox-send-tooltip-anchor` (wrapper tooltip, `overflow:hidden`) | **32 px** | le micro était inséré **dans** ce wrapper, débordait et recouvrait la flèche ; le wrapper ne réservait pas sa place |

### Correctif

`anchorTarget(submit)` remonte les enveloppes de moins de 48 px dont le parent est plus large
et renvoie `{ group, after }` : le micro est inséré **après le wrapper tooltip**, dans
`div.sendbox-actions`. Le test « bien placé » du `MutationObserver` utilise la même cible, donc
le micro ne repart plus dans le wrapper au re-rendu.

Quand la barre d'actions est **trop étroite** (ancien fil en 600 px : 32 px seulement), il n'y a
pas la place à côté. Le micro flotte alors **6 px au-dessus de la flèche** en `position:fixed`,
**déplacé dans `<body>`** pour échapper au contexte d'empilement `z-10` du composeur et à son
`overflow:hidden` (sinon le contenu du chat passait au-dessus et le rendait incliquable).
Il repasse inline dès que la barre a la place ; le redimensionnement est ré-évalué 250 ms
après l'événement pour laisser le layout React se stabiliser.

### Vérifications

| Contexte | Résultat |
|---|---|
| Ancien fil `b97449c5`, 1579×940, composeur desktop | parent du micro = `sendbox-actions`, micro à droite de la flèche, écart 12 px |
| Ancien fil, 1000×800 | même parent, écart 12 px, `elementFromPoint` au centre = micro |
| Ancien fil, 600×600, composeur étroit | micro `position:fixed`, parent `BODY`, boîte `(537–569, 505–537)`, flèche `(537–569, 543–575)` → **6 px au-dessus**, aucun chevauchement, `elementFromPoint` = micro |
| Redimensionnement 600 ↔ 1579 | le micro reste cliquable, au-dessus ou à droite selon la place |
| Bouton d'envoi désactivé puis activé (texte saisi) | le micro reste dans `sendbox-actions`, écart 12 px |
| Passage chat vierge ↔ ancien fil | `_actionSubmit` ↔ `sendbox-actions`, ré-ancrage correct |
| Journal AionUi | 0 `Renderer became unresponsive`, 0 `render-process-gone` |

> Limite de la vérification : je n'ai **pas envoyé** de message réel dans le fil (pour ne pas
> polluer la conversation) ; le changement d'état envoi activé/désactivé et les changements de
> vue couvrent la réorganisation du DOM observée.
