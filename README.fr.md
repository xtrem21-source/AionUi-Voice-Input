# 🎙️ AiTron Voice Input

> **Un bouton de saisie vocale, en un seul fichier, pour n'importe quelle application de chat Electron.**
> Il enregistre votre voix, la transcrit avec Gemini, insère le texte dans la zone de saisie — et peut l'envoyer à votre place.
>
> **Dépôt GitHub :** [xtrem21-source/AionUi-Voice-Input](https://github.com/xtrem21-source/AionUi-Voice-Input) — anciennement AiTron Voice Input.

🇬🇧 English version: [README.md](README.md)

[![Release](https://img.shields.io/github/v/release/xtrem21-source/AionUi-Voice-Input?display_name=tag&sort=semver)](https://github.com/xtrem21-source/AionUi-Voice-Input/releases)

> **Même méthode, autres applications :** [Reasonix Studio](https://github.com/esengine/DeepSeek-Reasonix) ·
> [Cline Desktop](https://github.com/cline/cline) ·
> [Open Cowork](https://github.com/open-cowork/open-cowork) ·
> [AionUi](https://github.com/iOfficeAI/AionUi).

> 🤖 **Envie de le porter sur une autre app ?** Ne lis pas le code — donne
> [`METHODOLOGY.md`](METHODOLOGY.md) à ton agent IA (Claude, Copilot, Cline, AionUi, un modèle
> local…) et dis-lui *« applique ceci à &lt;NomApp&gt; »*. **Ce fichier est le produit** ; le
> script n'est qu'une façon de l'exécuter.

---

## ✨ Pourquoi ce projet existe

Chromium embarque `webkitSpeechRecognition`, **mais ça ne fonctionne pas dans Electron** :
le moteur de reconnaissance vocale de Google n'est pas inclus dans le runtime. Résultat : toutes
les applications de chat Electron sont privées de dictée, alors que la même interface dans un
navigateur l'a.

`voice-input.js` contourne le problème avec une route qui, elle, **fonctionne** :

```
🎙️ clic              MediaRecorder                API Gemini                 votre textarea
 ───────  ───────────────────────────────  ─────────────────────────  ──────────────────
 bouton  →  enregistre l'audio (webm)      →  POST generateContent     →  setter natif
                                              (audio inline, base64)      + événement "input"
                                                                                 ↓
                                                                      React voit un vrai changement
```

Aucun module natif. Aucune compilation. Aucun `npm install`. **Un seul fichier de 45 Ko.**

---

## 🚀 Fonctionnalités

- **Zéro dépendance** — JavaScript pur, chargé par une simple balise `<script>`
- **Compatible React** — insertion via le *setter natif* + événement `input`
- **Deux modes d'envoi** (une case dans les réglages, *pas* un mot-clé magique) :
  - **Automatique** — vous arrêtez de parler, le texte est inséré **et envoyé**
  - **Manuel** — le texte est inséré, **c'est vous** qui cliquez sur la flèche
- **Interface discrète** — un petit micro à côté de la flèche d'envoi ; la roue dentée
  n'apparaît qu'avec un **clic droit**
- **Auto-réparation** — un `MutationObserver` réinjecte le bouton si l'interface se redessine
- **Multilingue** — choix de la langue de dictée
- **Repli de modèle** — si le modèle Gemini configuré est retiré, il bascule automatiquement

---

## 📦 Installation

### 1. Fermer l'application cible

Le correctif réécrit `resources/app.asar`, verrouillé tant que l'application tourne.

### 2. Appliquer le correctif

**Windows**

```powershell
.\scripts\apply-patch.ps1 -Preset AionUi
# ou : -Preset OpenCowork
# ou : -AppDir "C:\Chemin\Vers\App" -HtmlRel "out/renderer/index.html" -JsRel "out/renderer/voice-input.js"
```

**macOS / Linux**

```bash
./scripts/apply-patch.sh "/Applications/MonApp.app/Contents/Resources/app.asar" "dist/index.html" "dist/voice-input.js"
```

Le script sauvegarde l'original en `app.asar.bak` et refuse de s'exécuter si l'application est
ouverte ou déjà patchée.

> 🖱️ **Windows, en un clic :** ferme complètement AionUi, puis double-clique
> **`INSTALLER-MIC-AIONUI.bat`**. Il sauvegarde l'archive, applique le correctif et te demande
> de relancer. Aucune ligne de commande.

### 3. Relancer et configurer

- Un **bouton micro** apparaît à côté de la flèche d'envoi
- **Clic droit** dessus → le panneau de réglages s'ouvre (clé, modèle, langue, envoi auto)
- Collez votre **clé API Gemini**, choisissez le modèle et la langue, activez ou non l'envoi auto
- Cliquez sur **Tester la clé Gemini** pour valider la clé **et** le modèle avant de dicter

> Clé gratuite : [Google AI Studio](https://aistudio.google.com/apikey).

---

## 🧩 Applications prises en charge

| Application | Chemin du script | État |
|---|---|---|
| **Open Cowork** | `dist/voice-input.js` | ✅ testé, fonctionne |
| **AionUi** | `out/renderer/voice-input.js` | ✅ testé sous Windows (AionUi 2.2.2) |
| **Cline Desktop** | à cartographier | 🟡 signalé fonctionnel par l'auteur, non vérifié |
| **Reasonix Studio** | `frontend-next/dist/voice-input.js` | ✅ testé — installateur séparé ([Reasonix-Voice-Input](https://github.com/xtrem21-source/Reasonix-Voice-Input)) |

> **~8 sur 10 — pas 100 %.** Les applications Electron diffèrent par leur zone de saisie et
> leur bouton d'envoi. La *méthode* s'adapte ; le script peut demander **un ajustement de
> sélecteur** (§5 de [`METHODOLOGY.md`](METHODOLOGY.md)). C'est l'attente honnête.
>
> 📦 **Porter vers une autre application ?** Lis
> [`docs/PORTING-NOTES.md`](docs/PORTING-NOTES.md) : ce qui est générique, ce qui a dû être
> adapté pour AionUi (wrapper tooltip des anciens fils, barre étroite, `app.asar.unpacked`,
> source de la clé) et la checklist pour éviter de sur-adapter le patch.

Ajouter une application = généralement **une ligne** dans le script + un ajustement de sélecteur.
Voir [`docs/SUPPORTED-APPS.md`](docs/SUPPORTED-APPS.md).

> **Reasonix Studio est l'exception :** son interface vit dans un dossier non empaqueté
> `resources/frontend-next/dist/`, pas dans `app.asar` ; il garde donc un installateur dédié
> ([Reasonix-Voice-Input](https://github.com/xtrem21-source/Reasonix-Voice-Input)).

---

## 🔐 Sécurité et vie privée

- Votre audio part **directement vers l'API Gemini de Google**, avec **votre propre clé**.
  Aucun serveur intermédiaire, aucune télémétrie.
- La clé API est stockée dans le **`localStorage`** de l'application — *non chiffrée*.
- Le correctif ne modifie que **votre installation locale**. Rien n'est téléversé.
- Ne patchez que des applications que vous êtes autorisé à modifier.

---

## ⚠️ Limites (à lire)

| Limite | Détail |
|---|---|
| **Les mises à jour écrasent le correctif** | Il suffit de relancer le script. |
| **Patcher reste un contournement** | Recompresser une archive est fragile par nature. Un `.bak` est toujours créé. |
| **Ancrage propre à chaque app** | Le bouton cherche un bouton d'envoi ; sinon il devient flottant. |
| **Quota Gemini** | Le palier gratuit a des limites de débit. |

> 🔎 **Rapport d'incident** — gel du renderer AionUi du 2026-10-17 (diagnostic, preuves,
> correctifs, vérifications, retour arrière) :
> [`docs/INCIDENT-2026-10-17-AIONUI-FREEZE.md`](docs/INCIDENT-2026-10-17-AIONUI-FREEZE.md).

---

## 📄 Licence

MIT — voir [LICENSE](LICENSE).

*Projet non affilié à Google, Open Cowork, AionUi, Cline ou Reasonix. « Gemini » est une marque de Google LLC.*

---

## Reasonix Voice Input

La même méthode est désormais packagée pour Reasonix Studio, Cline Desktop et Open Cowork :
[Reasonix Voice Input v0.1.3](https://github.com/xtrem21-source/Reasonix-Voice-Input/releases/tag/v0.1.3).

---

## Non-régression

Le test de 60 secondes vérifie **un seul micro**, une **position stable** et **zéro
ré-ancrage**. Il est en lecture seule ; voir [`tests/README.md`](tests/README.md).

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\non-regression.ps1 -Port 9222
```
