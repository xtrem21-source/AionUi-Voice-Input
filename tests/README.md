# Non-regression tests / Tests de non-régression

## English

The test checks the three assertions that would have caught the 2026-10-17 freeze:

1. **one mic**: exactly one `#ocVoiceAnchor` in the DOM;
2. **stable position**: the anchor moves by at most 2 px over 60 seconds;
3. **zero re-anchor**: no new `MutationObserver: reancrage` entry after a 2-second settle.

It is **read-only**: it does not click, record or send.

### Prerequisites

- a patched AionUi installation;
- the app running with CDP;
- Node.js **22+** (global `WebSocket`).

### Run

```powershell
# terminal 1 - launch AionUi with CDP
& "$env:LOCALAPPDATA\Programs\AionUi\AionUi.exe" --remote-debugging-port=9222

# terminal 2 - 60-second test
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\non-regression.ps1 -Port 9222
```

Or let the wrapper launch the app:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\non-regression.ps1 -Launch
```

With npm:

```powershell
npm run test:regression
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | all three assertions pass |
| 1 | at least one assertion failed |
| 2 | CDP/WebSocket/setup error |

Run it on an **idle window**. A resize during the 60 seconds can legitimately change the
anchor position and make the position assertion fail.

## Français

Le test vérifie les trois assertions qui auraient attrapé le gel du 2026-10-17 :

1. **un seul micro** : exactement un `#ocVoiceAnchor` dans le DOM ;
2. **position stable** : l'ancre bouge de 2 px maximum sur 60 secondes ;
3. **zéro ré-ancrage** : aucune nouvelle entrée `MutationObserver: reancrage` après 2 secondes
   de stabilisation.

Il est **en lecture seule** : aucun clic, aucun enregistrement, aucun envoi.

### Prérequis

- AionUi patché ;
- l'application lancée avec CDP ;
- Node.js **22+** (`WebSocket` global).

### Lancer

```powershell
# terminal 1 - lancer AionUi avec CDP
& "$env:LOCALAPPDATA\Programs\AionUi\AionUi.exe" --remote-debugging-port=9222

# terminal 2 - test de 60 secondes
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\non-regression.ps1 -Port 9222
```

Ou laisser le wrapper lancer l'application :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\non-regression.ps1 -Launch
```

Avec npm :

```powershell
npm run test:regression
```

### Codes de sortie

| Code | Signification |
|---|---|
| 0 | les trois assertions passent |
| 1 | au moins une assertion échoue |
| 2 | erreur CDP/WebSocket/configuration |

Lance-le sur une **fenêtre idle**. Un redimensionnement pendant les 60 secondes peut changer
légitimement la position de l'ancre et faire échouer l'assertion de stabilité.
