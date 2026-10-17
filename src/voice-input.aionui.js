/* open-cowork-voice-input v4 — saisie vocale (transcription Gemini) pour AionUi
 * Ajoute un bouton micro ancré DANS la barre de saisie du chat (il suit donc le
 * redimensionnement et le déplacement de la fenêtre) : enregistre votre voix,
 * l'envoie à l'API Gemini pour transcription, puis insère le texte dans le champ de saisie.
 * Aucune dépendance, aucun paquet à installer. La clé API reste en local (localStorage).
 *
 * v4 : le bouton "Tester la clé Gemini" fonctionne réellement (validation de la clé
 *      ET du modèle, message d'erreur dans le panneau) ; l'absence de clé est
 *      expliquée dans le panneau au lieu d'être masquée par lui ; arrêt
 *      d'enregistrement plus robuste (état immédiat, anti double-démarrage,
 *      anti double-transcription) ; délai maximal sur les appels Gemini ;
 *      panneau de réglages toujours visible (fenêtres basses) ;
 *      micro légèrement séparé de la flèche d'envoi.
 * v3 : correctif du gel du renderer AionUi — le bouton micro n'est plus jamais
 *      confondu avec la flèche d'envoi (isOwnNode), le re-ancrage est débouncé
 *      (macrotask) et les mutations provoquées par le module sont ignorées ;
 *      les textarea fantômes (hauteur 0) sont écartés.
 * v2 : bouton ancré dans le conteneur du champ de saisie (au lieu de position:fixed) ;
 *      modèle par défaut mis à jour (gemini-3.5-flash-lite) ;
 *      réinsertion automatique via MutationObserver après réaffichage React ;
 *      repli sur position:fixed si le conteneur n'est pas trouvé.
 */
(function () {
  'use strict';
  if (window.__ocVoice) return;
  window.__ocVoice = { version: 4 };

  var LS = {
    key: 'ocVoice.geminiKey',
    model: 'ocVoice.model',
    lang: 'ocVoice.lang',
    pos: 'ocVoice.pos',
    auto: 'ocVoice.autoInsert',
    // Envoi automatique par mot-cle : si la transcription se termine par un
    // mot-cle ("envoie", "envoyer"...), le message est envoye tout seul.
    // DESACTIVE par defaut ('0') => comportement d'origine inchange.
    sendKw: 'ocVoice.sendKeyword'
  };
  // Mots-cles de fin (FRANCAIS uniquement) : s'ils sont le dernier mot de la
  // transcription, on les retire du texte. Le declenchement de l'envoi ne
  // depend PLUS du mot-cle : la case "envoi automatique" decide a elle seule.
  // Le mot-cle sert seulement a nettoyer le texte quand on l'a prononce.
  // Comparaison insensible casse/accents/ponctuation.
  var SEND_KEYWORDS = [
    'envoie', 'envoies', 'envoyer', 'envoi', 'enver', 'envoit', 'envoyez'
  ];
  // Expression reguliere des homophones du mot-cle, y compris la forme
  // DECOUPEE "en voie" (le modele separe parfois le mot en deux) : on la
  // recolle avant comparaison.
  var SPLIT_KEYWORD_RE = /\ben[-\s]+voi(?:e|es|er|t)?\b/gi;
  var DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  // Modeles Gemini retires/indisponibles pour les nouveaux comptes : s'ils sont
  // stockes dans localStorage (anciens reglages), on les migre automatiquement
  // vers le modele par defaut actuel.
  var DEAD_MODELS = [
    'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite',
    'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-pro',
    'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'
  ];
  var MAX_MS = 180000; // 3 minutes maximum
  var LANGS = [
    ['auto', 'Détection automatique'],
    ['fr', 'Français'],
    ['en', 'Anglais'],
    ['es', 'Espagnol'],
    ['de', 'Allemand'],
    ['it', 'Italien'],
    ['pt', 'Portugais'],
    ['nl', 'Néerlandais'],
    ['ar', 'Arabe'],
    ['zh', 'Chinois'],
    ['ru', 'Russe']
  ];
  var LANG_NAMES = {};
  LANGS.forEach(function (l) { LANG_NAMES[l[0]] = l[1].toLowerCase(); });

  var st = {
    recording: false,
    busy: false,
    recorder: null,
    chunks: [],
    startedAt: 0,
    tick: null,
    stream: null,
    ui: null,
    anchored: false,     // true si le bouton est inséré dans la barre de saisie
    overlayParent: null, // parent utilisé pour le repli (position:fixed)
    observer: null,
    anchoring: false,    // garde de réentrance (MutationObserver -> mountAnchored)
    scheduled: false,    // re-ancrage déjà planifié (debounce)
    anchorLogged: false, // n'écrire le résultat de l'ancrage qu'une fois
    starting: false,     // getUserMedia en cours (évite deux enregistreurs)
    finishing: false     // finishRecording déjà lancé (évite une double transcription)
  };

  // Journalisation double : console du renderer + fichier de logs de l'application
  // (via electronAPI.logs.write) afin de pouvoir diagnostiquer ce qui se passe.
  var LOG_PREFIX = '[Saisie vocale]';
  function toStr(v) {
    if (v instanceof Error) return v.name + ': ' + v.message + (v.stack ? ' | ' + v.stack.split('\n')[1] : '');
    if (typeof v === 'object' && v !== null) { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    return String(v);
  }
  var LOG_BUFFER_KEY = 'ocVoice.log';
  function flog(level) {
    var args = [].slice.call(arguments, 1);
    var text = args.map(toStr).join(' ');
    var line = new Date().toISOString().substr(11, 8) + ' [' + level + '] ' + text;
    try { console.log.apply(console, [LOG_PREFIX].concat(args)); } catch (e) {}
    // 1) fichier de logs de l'application (si le canal IPC est disponible)
    try {
      var api = window.electronAPI;
      if (api && api.logs && typeof api.logs.write === 'function') {
        var lvl = (level === 'error' || level === 'warn') ? level : 'info';
        // ATTENTION : le handler main fait `console[level](...args)` : le 2e
        // parametre doit etre un TABLEAU de messages (pas une chaine), sinon
        // il est "spread" caractere par caractere.
        api.logs.write(lvl, [LOG_PREFIX + ' ' + text]);
      }
    } catch (e) {}
    // 2) tampon localStorage (lisible depuis l'exterieur, meme si l'IPC echoue)
    try {
      var buf = localStorage.getItem(LOG_BUFFER_KEY) || '';
      var lines = buf ? buf.split('\n') : [];
      lines.push(line);
      if (lines.length > 120) lines = lines.slice(lines.length - 120);
      localStorage.setItem(LOG_BUFFER_KEY, lines.join('\n'));
    } catch (e) {}
  }
  function log() { flog.apply(null, ['info'].concat([].slice.call(arguments))); }
  function logWarn() { flog.apply(null, ['warn'].concat([].slice.call(arguments))); }
  function logErr() { flog.apply(null, ['error'].concat([].slice.call(arguments))); }
  function ls(key, def) {
    try { var v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; }
  }
  function setLs(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // Lit le modele enregistre et migre automatiquement les modeles retires.
  function resolveModel() {
    var m = (ls(LS.model, '') || '').trim();
    var lower = m.toLowerCase();
    var dead = DEAD_MODELS.some(function (d) { return lower.indexOf(d) === 0; });
    if (!m || dead) {
      if (dead) log('modele "' + m + '" retire -> migration vers ' + DEFAULT_MODEL);
      else log('aucun modele enregistre -> utilisation de ' + DEFAULT_MODEL);
      setLs(LS.model, DEFAULT_MODEL); // corriger le stockage pour de bon
      return DEFAULT_MODEL;
    }
    return m;
  }

  /* ---------- styles ---------- */
  function injectStyles() {
    if (document.getElementById('ocVoiceStyles')) return;
    var css = '' +
      '#ocVoiceRoot{position:fixed;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:inherit}' +
      '#ocVoiceRoot *{box-sizing:border-box}' +
      // bouton ancre dans la barre de saisie, JUSTE A DROITE de la fleche d'envoi.
      // Il respecte le flex du groupe (align-items:center) et reste separe de la
      // fleche par une marge visible (le parent a deja un gap de 6 px).
      '#ocVoiceAnchor{display:inline-flex;align-items:center;justify-content:center;margin:0 0 0 8px;flex:0 0 auto}' +
      '#ocVoiceAnchor .ocv-btn{width:32px;height:32px}' +
      '#ocVoiceAnchor .ocv-btn svg{width:16px;height:16px}' +
      '.ocv-btn{width:44px;height:44px;border-radius:9999px;border:1px solid var(--color-border, #34302a);' +
      'background:var(--color-surface, #22201d);color:var(--color-text-primary, #f1ece4);display:flex;align-items:center;' +
      'justify-content:center;cursor:pointer;box-shadow:var(--shadow-elevated, 0 8px 24px rgba(0,0,0,.34));' +
      'transition:background .15s,border-color .15s,transform .15s;padding:0;touch-action:none}' +
      '.ocv-btn:hover{background:var(--color-surface-hover, #2a2723)}' +
      '.ocv-btn:active{transform:scale(.96)}' +
      '.ocv-btn[data-rec="1"]{background:var(--color-error, #ef4444);border-color:var(--color-error, #ef4444);color:#fff;' +
      'animation:ocvPulse 1.4s ease-in-out infinite}' +
      '.ocv-btn[data-busy="1"]{opacity:.7;cursor:progress}' +
      '.ocv-btn svg{width:20px;height:20px;display:block}' +
      '.ocv-gear{width:26px;height:26px;border-radius:9999px;border:1px solid var(--color-border-subtle, rgba(255,245,232,.07));' +
      'background:var(--color-surface, #22201d);color:var(--color-text-muted, #8c8378);display:flex;align-items:center;' +
      'justify-content:center;cursor:pointer;box-shadow:var(--shadow-soft, 0 1px 4px rgba(0,0,0,.24));padding:0}' +
      '.ocv-gear:hover{color:var(--color-text-primary, #f1ece4);background:var(--color-surface-hover, #2a2723)}' +
      '.ocv-gear svg{width:13px;height:13px}' +
      '.ocv-bubble{max-width:320px;padding:7px 11px;border-radius:12px;font-size:12px;line-height:1.45;' +
      'background:var(--color-surface, #22201d);color:var(--color-text-secondary, #b6ada2);' +
      'border:1px solid var(--color-border-muted, #2a2722);box-shadow:var(--shadow-elevated, 0 8px 24px rgba(0,0,0,.34));' +
      'white-space:pre-wrap;word-break:break-word;display:none}' +
      '.ocv-bubble[data-kind="error"]{border-color:var(--color-error, #ef4444);color:var(--color-error, #ef4444)}' +
      '.ocv-bubble[data-kind="ok"]{border-color:var(--color-success, #22c55e);color:var(--color-success, #22c55e)}' +
      '.ocv-spin{width:13px;height:13px;border-radius:9999px;border:2px solid currentColor;border-top-color:transparent;' +
      'display:inline-block;vertical-align:-2px;animation:ocvSpin .7s linear infinite;margin-right:6px}' +
      '@keyframes ocvSpin{to{transform:rotate(360deg)}}' +
      '@keyframes ocvPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}50%{box-shadow:0 0 0 10px rgba(239,68,68,0)}}' +
      '.ocv-panel{width:326px;padding:14px;border-radius:16px;background:var(--color-background-secondary, #1d1b18);' +
      'border:1px solid var(--color-border, #34302a);box-shadow:var(--shadow-elevated, 0 8px 24px rgba(0,0,0,.34));display:none;' +
      'max-height:calc(100vh - 24px);overflow-y:auto}' +
      '.ocv-panel h4{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--color-text-primary, #f1ece4)}' +
      '.ocv-panel label{display:block;font-size:11px;color:var(--color-text-muted, #8c8378);margin:9px 0 4px}' +
      '.ocv-panel input[type=text],.ocv-panel input[type=password],.ocv-panel select{width:100%;padding:7px 9px;font-size:12px;' +
      'border-radius:9px;border:1px solid var(--color-border, #34302a);background:var(--color-surface, #22201d);' +
      'color:var(--color-text-primary, #f1ece4);outline:none}' +
      '.ocv-panel input:focus,.ocv-panel select:focus{border-color:var(--color-accent, #d67a52)}' +
      '.ocv-panel .ocv-row{display:flex;gap:8px;align-items:center;margin-top:10px}' +
      '.ocv-panel .ocv-hint{font-size:11px;color:var(--color-text-muted, #8c8378);margin-top:6px;line-height:1.45}' +
      '.ocv-panel .ocv-hint a{color:var(--color-accent, #d67a52);cursor:pointer;text-decoration:underline}' +
      '.ocv-primary{flex:1;padding:7px 10px;border-radius:9px;border:1px solid var(--color-accent, #d67a52);' +
      'background:var(--color-accent, #d67a52);color:#fff;font-size:12px;cursor:pointer}' +
      '.ocv-secondary{padding:7px 10px;border-radius:9px;border:1px solid var(--color-border, #34302a);' +
      'background:transparent;color:var(--color-text-secondary, #b6ada2);font-size:12px;cursor:pointer}' +
      '.ocv-check{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--color-text-secondary, #b6ada2);margin-top:10px}' +
      '.ocv-status{font-size:11px;margin-top:9px;line-height:1.45;color:var(--color-text-muted, #8c8378);min-height:14px}' +
      '.ocv-status[data-kind="ok"]{color:var(--color-success, #22c55e)}' +
      '.ocv-status[data-kind="error"]{color:var(--color-error, #ef4444)}' +
      '.ocv-wide{flex:1}';
    var el = document.createElement('style');
    el.id = 'ocVoiceStyles';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  var ICONS = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15H4.4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4.6V4.4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1z"/></svg>'
  };

  /* ---------- interface ---------- */
  function panelHtml() {
    var opts = LANGS.map(function (l) {
      return '<option value="' + l[0] + '">' + l[1] + '</option>';
    }).join('');
    return '' +
      '<h4>Saisie vocale</h4>' +
      '<label>Clé API Gemini</label>' +
      '<input type="password" id="ocvKey" placeholder="AIza..." autocomplete="off" spellcheck="false">' +
      '<div class="ocv-hint">AionUi ne détecte pas automatiquement de clé Gemini : collez la vôtre ci-dessus.<br>' +
      'Clé gratuite sur <a id="ocvKeyLink">aistudio.google.com/apikey</a> — stockée uniquement sur cet ordinateur.</div>' +
      '<label>Modèle de transcription</label>' +
      '<input type="text" id="ocvModel" placeholder="' + DEFAULT_MODEL + '" spellcheck="false">' +
      '<label>Langue parlée</label>' +
      '<select id="ocvLang">' + opts + '</select>' +
      '<label class="ocv-check"><input type="checkbox" id="ocvAuto"> Insérer le texte dans le champ de saisie</label>' +
      '<label class="ocv-check"><input type="checkbox" id="ocvSendKw"> Envoi automatique <span style="opacity:.7">(le message part dès l\'arrêt de l\'enregistrement ; « envoie » en fin de phrase est retiré)</span></label>' +
      '<div class="ocv-row">' +
      '<button type="button" class="ocv-primary" id="ocvSave">Enregistrer</button>' +
      '<button type="button" class="ocv-secondary" id="ocvClose">Fermer</button>' +
      '</div>' +
      '<div class="ocv-row">' +
      '<button type="button" class="ocv-secondary ocv-wide" id="ocvTest">Tester la clé Gemini</button>' +
      '</div>' +
      '<div class="ocv-status" id="ocvStatus"></div>';
  }

  function ensureUi() {
    if (st.ui) return st.ui;
    injectStyles();

    // --- conteneur flottant (bulles + panneau de réglages) : reste en position:fixed ---
    var root = document.createElement('div');
    root.id = 'ocVoiceRoot';
    var bubble = document.createElement('div');
    bubble.className = 'ocv-bubble';
    var panel = document.createElement('div');
    panel.className = 'ocv-panel';
    panel.innerHTML = panelHtml();
    var gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'ocv-gear';
    gear.title = 'Réglages de la saisie vocale';
    gear.innerHTML = ICONS.gear;
    // La roue est masquee : les reglages s'ouvrent desormais par clic DROIT sur le
    // micro. On la garde dans le DOM (compatibilite) mais elle n'est plus visible.
    gear.style.display = 'none';
    root.appendChild(bubble);
    root.appendChild(panel);
    root.appendChild(gear);
    document.body.appendChild(root);
    positionOverlay(root);

    // --- bouton micro (sera ancré dans la barre de saisie) ---
    var anchor = document.createElement('span');
    anchor.id = 'ocVoiceAnchor';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ocv-btn';
    btn.title = 'Saisie vocale — clic : enregistrer, clic droit : réglages';
    btn.innerHTML = ICONS.mic;
    anchor.appendChild(btn);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleRecording();
    });
    // Clic DROIT sur le micro : ouvre le panneau de configuration (remplace la roue).
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });

    st.ui = { root: root, bubble: bubble, panel: panel, gear: gear, btn: btn, anchor: anchor };
    log('ensureUi: interface creee (controleur flottant + bouton micro)');

    // ancrage dès que possible, puis surveillance des réaffichages React
    mountAnchored();
    if (!st.observer && document.body) {
      var obsRetries = 0;
      st.observer = new MutationObserver(function () {
        // Jamais de modification du DOM ici : on planifie un re-ancrage
        // (macrotask debouncee). Une boucle synchrone observer -> DOM ->
        // observer gelait le renderer d'AionUi.
        if (st.anchoring || st.scheduled) return;
        // sortir seulement si notre ancre est REELLEMENT connectee au DOM
        // ET toujours placee juste apres la fleche d'envoi.
        var el = document.getElementById('ocVoiceAnchor');
        var submit = findSubmitButton();
        var wellPlaced = !!(el && el.isConnected && submit && submit.nextElementSibling === el);
        if (st.anchored && wellPlaced) return;
        // si pas de barre de saisie ET bouton deja masque : rien a faire
        if (!submit && el && el.style.display === 'none') return;
        obsRetries++;
        // ne pas inonder les logs : 1 message tous les 20 declenchements
        if (obsRetries === 1 || obsRetries % 20 === 0) {
          log('MutationObserver: reancrage (declenchement n°' + obsRetries + ', ancre connectee=' + !!(el && el.isConnected) + ')');
        }
        st.scheduled = true;
        setTimeout(function () {
          st.scheduled = false;
          mountAnchored();
        }, 80);
      });
      st.observer.observe(document.body, { childList: true, subtree: true });
      log('MutationObserver actif (surveillance des re-rendus React)');
    }

    // Roue masquee : plus d'ecouteur de clic (les reglages s'ouvrent par clic droit sur le micro).
    panel.querySelector('#ocvSave').addEventListener('click', saveSettings);
    panel.querySelector('#ocvTest').addEventListener('click', testGeminiKey);
    panel.querySelector('#ocvClose').addEventListener('click', function () {
      panel.style.display = 'none';
      positionOverlay(st.ui.root);
    });
    panel.querySelector('#ocvKeyLink').addEventListener('click', function () {
      try {
        if (window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal('https://aistudio.google.com/apikey');
          return;
        }
        window.open('https://aistudio.google.com/apikey', '_blank');
      } catch (e) {}
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.style.display === 'block') {
        panel.style.display = 'none';
        positionOverlay(st.ui.root);
      }
    });
    window.addEventListener('resize', function () { positionOverlay(root); });
    // Si la barre de saisie bouge (scroll interne du chat), le panneau doit suivre.
    window.addEventListener('scroll', function () { positionOverlay(root); }, true);
    return st.ui;
  }

  /** Place le conteneur flottant (bulles/panneau) près du bouton micro, sinon coin bas-droit. */
  function positionOverlay(root) {
    try {
      var btn = st.ui && st.ui.btn;
      // 1) Bouton ancre DANS la barre de saisie : on se cale sur le bouton.
      if (st.anchored && btn && btn.offsetParent !== null) {
        var r = btn.getBoundingClientRect();
        var right = Math.max(8, window.innerWidth - r.right);
        root.style.right = right + 'px';
        root.style.left = 'auto';
        root.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px';
        root.style.top = 'auto';
        ensurePanelVisible(root);
        return;
      }
      // 2) Bouton flottant : NE PAS se caler sur le bouton (il est lui-meme dans le
      //    conteneur fixe -> calcul circulaire, il "part en cacahuete" au resize).
      //    On se cale sur le CHAMP DE SAISIE, qui lui suit la mise en page.
      var area = findInput();
      if (area) {
        var ar = area.getBoundingClientRect();
        root.style.right = Math.max(8, window.innerWidth - ar.right) + 'px';
        root.style.left = 'auto';
        root.style.bottom = Math.max(8, window.innerHeight - ar.top + 10) + 'px';
        root.style.top = 'auto';
        ensurePanelVisible(root);
        return;
      }
    } catch (e) {}
    root.style.right = '18px';
    root.style.left = 'auto';
    root.style.bottom = '112px';
    root.style.top = 'auto';
    ensurePanelVisible(root);
  }

  // ---------------------------------------------------------------------------
  //  Ancrage : le micro est place JUSTE A DROITE de la fleche d'envoi, dans la
  //  barre de saisie (meme groupe flex). Ancrage par structure DOM, donc il suit
  //  naturellement la barre et le redimensionnement de la fenetre.
  // ---------------------------------------------------------------------------

  // Nos propres elements ne doivent JAMAIS etre pris pour la fleche d'envoi :
  // sinon findSubmitButton renvoyait notre propre micro, l'ancre etait retiree
  // puis reinseree a chaque mutation -> boucle infinie, renderer gele.
  function isOwnNode(el) {
    return !!(el && el.closest && el.closest('#ocVoiceAnchor, #ocVoiceRoot'));
  }

  // Note un bouton : fleche d'envoi = submit, ou bouton primaire circulaire,
  // ou libelle "send/envoyer/...". Le dernier bouton visible de la barre
  // (ancienne heuristique) pouvait etre le notre.
  function buttonScore(btn) {
    var score = 0;
    var cls = typeof btn.className === 'string' ? btn.className : '';
    var label = String(btn.getAttribute('aria-label') || '') + ' ' + String(btn.getAttribute('title') || '');
    if (btn.getAttribute('type') === 'submit') score += 4;
    if (/primary/i.test(cls)) score += 3;
    if (/send|envoy|submit|发送|送信|enviar/i.test(label)) score += 2;
    if (/circle|round/i.test(cls)) score += 1;
    if (btn.querySelector('svg')) score += 1;
    return score;
  }

  // Trouve le bouton d'envoi (fleche) de la barre de saisie.
  // 1) cas standard : button[type=submit] dans le <form> qui contient le textarea.
  // 2) cas AionUi / React sans <form> : on note les boutons de la barre de saisie
  //    (recherche en remontant depuis le textarea, profondeur max 5) et on prend
  //    le meilleur candidat, en excluant toujours notre propre micro.
  function findSubmitButton() {
    var area = findInput();
    if (!area) return null;
    var form = area.closest && area.closest('form');
    if (form) {
      var b = form.querySelector('button[type="submit"]');
      if (b && !isOwnNode(b)) return b;
    }
    var scope = area.parentElement;
    for (var d = 0; d < 5 && scope; d++, scope = scope.parentElement) {
      var btns = scope.querySelectorAll('button');
      var best = null;
      var bestScore = -1;
      for (var i = btns.length - 1; i >= 0; i--) {
        var btn = btns[i];
        if (isOwnNode(btn)) continue;
        var r = btn.getBoundingClientRect();
        if (r.width <= 8 || r.height <= 8) continue;
        // ne pas exclure les boutons desactives : la fleche d'envoi l'est
        // quand le champ est vide, et c'est quand meme elle qu'on doit suivre.
        var s = buttonScore(btn);
        if (s > bestScore) { best = btn; bestScore = s; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Insère le micro JUSTE A DROITE de la fleche d'envoi ; repli flottant sinon. */
  function mountAnchored() {
    if (!st.ui || st.anchoring) return;
    var anchor = st.ui.anchor;
    // eviter les doublons eventuels
    var dup = document.getElementById('ocVoiceAnchor');
    if (dup && dup !== anchor) dup.remove();

    var submit = findSubmitButton();
    // defense en profondeur : ne jamais s'ancrer sur soi-meme
    if (submit && (submit === st.ui.btn || anchor.contains(submit))) submit = null;
    if (submit && submit.parentElement) {
      var group = submit.parentElement; // le groupe de droite (flex items-center gap-2)
      // deja place juste apres la fleche ? rien a faire.
      if (st.anchored && anchor.parentNode === group && submit.nextElementSibling === anchor) {
        positionOverlay(st.ui.root);
        return;
      }
      st.anchoring = true;
      try {
        try { anchor.remove(); } catch (e) {}
        if (submit.nextSibling) group.insertBefore(anchor, submit.nextSibling);
        else group.appendChild(anchor);
        // ignorer les mutations que l'on vient de provoquer nous-memes
        if (st.observer) { try { st.observer.takeRecords(); } catch (e) {} }
      } catch (e) {
        logErr('mountAnchored: insertion impossible', e);
        st.anchoring = false;
        return;
      }
      st.anchoring = false;
      st.anchored = true;
      hideAnchor(false);
      positionOverlay(st.ui.root);

      // --- placement adaptatif ---------------------------------------------
      // AionUi n'elargit PAS la fenetre quand on ajoute un bouton dans la barre :
      // il prend ~32 px au champ de saisie. Si le champ est etroit, on superpose
      // le micro AU-DESSUS de la fleche (aucun impact sur la mise en page).
      var areaW = findInput();
      var avail = areaW ? areaW.getBoundingClientRect().width : 9999;
      if (avail < 220) {
        anchor.style.position = 'relative';
        anchor.style.width = '0';
        anchor.style.height = '0';
        st.ui.btn.style.position = 'absolute';
        st.ui.btn.style.right = '0';
        st.ui.btn.style.bottom = 'calc(100% + 6px)';
        if (!st.anchorLogged) logWarn('ancrage: champ etroit (' + Math.round(avail) + 'px) -> micro AU-DESSUS de la fleche');
      } else {
        anchor.style.position = '';
        anchor.style.width = '';
        anchor.style.height = '';
        st.ui.btn.style.position = '';
        st.ui.btn.style.right = '';
        st.ui.btn.style.bottom = '';
        if (!st.anchorLogged) logWarn('ancrage REUSSI (juste a droite de la fleche d\'envoi)');
      }
      st.anchorLogged = true;
      return;
    }
    // Pas de barre de saisie (ecran d'accueil, autre vue...) : on MASQUE le micro
    // place au flottant, au lieu d'afficher un bouton orphelin mal positionne.
    if (st.anchored) {
      log('mountAnchored: plus de fleche -> bouton masque (sorti de la barre)');
      try { anchor.remove(); } catch (e) {}
      if (st.observer) { try { st.observer.takeRecords(); } catch (e) {} }
      st.anchored = false;
      st.anchorLogged = false;
    }
    hideAnchor(true);
  }

  /** Cache/affiche l'ancre (et son bouton) sans la detruire. */
  function hideAnchor(hidden) {
    var anchor = st.ui && st.ui.anchor;
    if (!anchor) return;
    try { anchor.style.display = hidden ? 'none' : ''; } catch (e) {}
  }

  function togglePanel() {
    var ui = ensureUi();
    if (ui.panel.style.display === 'block') {
      ui.panel.style.display = 'none';
      positionOverlay(ui.root);
      return;
    }
    showPanel();
  }

  function showPanel() {
    var ui = ensureUi();
    ui.panel.querySelector('#ocvKey').value = ls(LS.key, '');
    ui.panel.querySelector('#ocvModel').value = resolveModel();
    ui.panel.querySelector('#ocvLang').value = ls(LS.lang, 'fr');
    ui.panel.querySelector('#ocvAuto').checked = ls(LS.auto, '1') === '1';
    ui.panel.querySelector('#ocvSendKw').checked = ls(LS.sendKw, '0') === '1';
    var stored = ls(LS.key, '').trim();
    setPanelStatus(
      stored
        ? 'Clé enregistrée (…' + stored.slice(-4) + '). Cliquez sur « Tester la clé Gemini ».'
        : 'Aucune clé enregistrée : la dictée ne peut pas transcrire. Collez votre clé Gemini, puis cliquez sur « Enregistrer ».',
      stored ? 'ok' : 'error'
    );
    // Afficher AVANT de positionner : sinon la hauteur du panneau vaut 0 et
    // il peut sortir par le haut de la fenetre (champ de cle invisible).
    ui.panel.style.display = 'block';
    ui.bubble.style.display = 'none';
    positionOverlay(ui.root);
    ensurePanelVisible(ui.root);
  }

  // Si le panneau ne tient pas au-dessus du micro, le decaler vers le bas pour
  // que le champ de cle soit toujours visible (fenetres basses, 600x600...).
  function ensurePanelVisible(root) {
    var ui = st.ui;
    if (!ui || !ui.panel || ui.panel.style.display !== 'block') return;
    var pr = ui.panel.getBoundingClientRect();
    if (pr.top < 8) {
      var bottom = Math.max(8, window.innerHeight - pr.height - 8);
      root.style.top = 'auto';
      root.style.bottom = bottom + 'px';
    }
  }

  function setPanelStatus(text, kind) {
    var ui = ensureUi();
    var el = ui.panel.querySelector('#ocvStatus');
    if (!el) return;
    el.textContent = text;
    if (kind) el.setAttribute('data-kind', kind);
    else el.removeAttribute('data-kind');
  }

  function testGeminiKey() {
    var ui = ensureUi();
    var typed = ui.panel.querySelector('#ocvKey').value.trim();
    var key = typed || ls(LS.key, '').trim();
    if (!key) {
      setPanelStatus('Aucune clé saisie. Collez votre clé Gemini (AIza…), puis réessayez.', 'error');
      try { ui.panel.querySelector('#ocvKey').focus(); } catch (e) {}
      return;
    }
    var model = ui.panel.querySelector('#ocvModel').value.trim() || resolveModel();
    var btn = ui.panel.querySelector('#ocvTest');
    btn.disabled = true;
    setPanelStatus('Test en cours… (' + model + ')');
    var t0 = Date.now();
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
      ':generateContent?key=' + encodeURIComponent(key);
    fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Réponds uniquement par OK.' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 }
      })
    }, 15000).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok) {
          var detail = json && json.error && json.error.message ? json.error.message : 'HTTP ' + res.status;
          var hint = /not found|not supported|does not exist|unknown model/i.test(detail)
            ? ' — essayez un autre modèle (par exemple gemini-2.5-flash).' : '';
          throw new Error(detail + hint);
        }
        var cand = json && json.candidates && json.candidates[0];
        var parts = (cand && cand.content && cand.content.parts) || [];
        var out = parts.map(function (p) { return p.text || ''; }).join('').trim();
        if (!out) throw new Error('réponse vide du modèle (clé acceptée, mais le modèle n\'a rien renvoyé)');
        setPanelStatus('Clé valide — ' + model + ' répond en ' + (Date.now() - t0) + ' ms : « ' + out.slice(0, 40) + ' »', 'ok');
        log('test cle Gemini OK (' + model + ')');
      });
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      if (err && err.name === 'TypeError') msg = 'connexion à Gemini impossible (réseau ou CORS)';
      setPanelStatus('Échec : ' + msg, 'error');
      logErr('test cle Gemini ECHEC: ' + msg);
    }).then(function () {
      btn.disabled = false;
    });
  }

  function saveSettings() {
    var ui = ensureUi();
    var key = ui.panel.querySelector('#ocvKey').value.trim();
    setLs(LS.key, key);
    var model = ui.panel.querySelector('#ocvModel').value.trim() || DEFAULT_MODEL;
    setLs(LS.model, model);
    setLs(LS.lang, ui.panel.querySelector('#ocvLang').value);
    setLs(LS.auto, ui.panel.querySelector('#ocvAuto').checked ? '1' : '0');
    setLs(LS.sendKw, ui.panel.querySelector('#ocvSendKw').checked ? '1' : '0');
    if (!key) {
      setPanelStatus('Réglages enregistrés, mais aucune clé Gemini : la dictée échouera. Collez une clé puis Enregistrer.', 'error');
      try { ui.panel.querySelector('#ocvKey').focus(); } catch (e) {}
      return;
    }
    ui.panel.style.display = 'none';
    positionOverlay(ui.root);
    showBubble('Réglages enregistrés. Cliquez sur le micro pour dicter.', 'ok', 3000);
  }

  var bubbleTimer = null;
  function showBubble(html, kind, hideAfter) {
    var ui = ensureUi();
    ui.bubble.innerHTML = html;
    ui.bubble.setAttribute('data-kind', kind || 'info');
    ui.bubble.style.display = 'block';
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    if (hideAfter) bubbleTimer = setTimeout(function () { ui.bubble.style.display = 'none'; }, hideAfter);
  }

  function setBtnState() {
    var ui = ensureUi();
    ui.btn.setAttribute('data-rec', st.recording ? '1' : '0');
    ui.btn.setAttribute('data-busy', st.busy ? '1' : '0');
    ui.btn.innerHTML = st.recording ? ICONS.stop : ICONS.mic;
  }

  /* ---------- enregistrement ---------- */
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
  }

  function toggleRecording() {
    if (st.busy || st.starting) return;
    if (st.recording) stopRecording(); else startRecording();
  }

  function startRecording() {
    if (st.starting || st.recording) return;
    st.starting = true;
    var ui = ensureUi();
    ui.panel.style.display = 'none';
    positionOverlay(ui.root);
    log('startRecording: demande acces micro');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      st.starting = false;
      logErr('startRecording: getUserMedia indisponible');
      showBubble("L'enregistrement audio n'est pas disponible dans cette fenêtre.", 'error', 8000);
      return;
    }
    // liberer une eventuelle ressource precedente
    if (st.stream) {
      try { st.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      st.stream = null;
    }
    navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(function (stream) {
      st.starting = false;
      st.stream = stream;
      var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', ''];
      var chosen = '';
      for (var i = 0; i < types.length; i++) {
        if (!types[i]) { chosen = ''; break; }
        if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) {
          chosen = types[i];
          break;
        }
      }
      var rec = chosen ? new MediaRecorder(stream, { mimeType: chosen, audioBitsPerSecond: 64000 }) : new MediaRecorder(stream);
      st.recorder = rec;
      st.chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) st.chunks.push(e.data); };
      rec.onerror = function (e) {
        log('erreur MediaRecorder', e);
        stopRecording();
      };
      rec.onstop = function () { finishRecording(); };
      rec.start(250);
      st.recording = true;
      st.startedAt = Date.now();
      setBtnState();
      st.tick = setInterval(function () {
        var ms = Date.now() - st.startedAt;
        showBubble('<span class="ocv-spin"></span>Enregistrement… ' + fmtTime(ms) +
          '<br>Cliquez sur le bouton pour arrêter et transcrire.', 'info');
        if (ms > MAX_MS) stopRecording();
      }, 500);
      showBubble('Enregistrement… 0 s', 'info');
      log('enregistrement démarré');
    }).catch(function (err) {
      st.starting = false;
      st.stream = null;
      var name = err && err.name ? err.name : '';
      logErr('startRecording ECHEC: ' + name + ' - ' + (err && err.message ? err.message : ''));
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        showBubble('Accès au microphone refusé.<br>Autorisez-le via Windows → Paramètres → Confidentialité et sécurité → ' +
          'Microphone (applications de bureau), puis relancez AionUi.', 'error', 15000);
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        showBubble('Aucun microphone détecté sur cet ordinateur.', 'error', 12000);
      } else {
        showBubble("Impossible d'accéder au microphone : " + (err && err.message ? err.message : name), 'error', 12000);
      }
    });
  }

  function stopRecording() {
    if (st.tick) { clearInterval(st.tick); st.tick = null; }
    // L'etat visuel bascule TOUT DE SUITE : l'utilisateur voit que le clic a ete pris.
    st.recording = false;
    setBtnState();
    var rec = st.recorder;
    if (!rec || rec.state === 'inactive') {
      finishRecording();
      return;
    }
    try {
      rec.stop();
    } catch (e) {
      log('arrêt impossible', e);
      finishRecording();
    }
  }

  /* ---------- transcription ---------- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    return false;
  }

  var keyCache = null;
  function findGeminiKey(cfg) {
    if (!cfg || typeof cfg !== 'object') return '';
    var s = function (v) { return typeof v === 'string' && v.trim() ? v.trim() : ''; };
    var prof = cfg.profiles && cfg.profiles.gemini;
    if (prof && s(prof.apiKey)) return s(prof.apiKey);
    var sets = Array.isArray(cfg.configSets) ? cfg.configSets : [];
    for (var i = 0; i < sets.length; i++) {
      var set = sets[i] || {};
      var p = set.profiles && set.profiles.gemini;
      if (p && s(p.apiKey)) return s(p.apiKey);
      var isGem = set.provider === 'gemini' || /generativelanguage\.googleapis\.com/i.test(String(set.baseUrl || ''));
      if (isGem && s(set.apiKey)) return s(set.apiKey);
    }
    var activeGem = cfg.provider === 'gemini' || /generativelanguage\.googleapis\.com/i.test(String(cfg.baseUrl || ''));
    if (activeGem && s(cfg.apiKey)) return s(cfg.apiKey);
    return '';
  }

  function resolveKey() {
    var local = ls(LS.key, '').trim();
    if (local) return Promise.resolve(local);
    if (keyCache) return Promise.resolve(keyCache);
    var api = window.electronAPI;
    if (!api || !api.config || !api.config.get) return Promise.resolve('');
    return Promise.resolve(api.config.get()).then(function (cfg) {
      var found = findGeminiKey(cfg);
      if (found) {
        keyCache = found;
        log('clé Gemini récupérée depuis la configuration de l\'application');
      }
      return found;
    }).catch(function (e) {
      log('lecture de la configuration impossible', e);
      return '';
    });
  }

  function finishRecording() {
    if (st.finishing) return;
    st.finishing = true;
    st.recording = false;
    setBtnState();
    if (st.stream) {
      try { st.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      st.stream = null;
    }
    var mime = (st.recorder && st.recorder.mimeType) || 'audio/webm';
    var blob = new Blob(st.chunks || [], { type: mime });
    st.chunks = [];
    if (!blob.size) {
      st.finishing = false;
      showBubble('Aucun son enregistré.', 'error', 6000);
      return;
    }
    st.busy = true;
    setBtnState();
    showBubble('<span class="ocv-spin"></span>Transcription en cours…', 'info');
    var t0 = Date.now();
    log('transcription: envoi de ' + blob.size + ' octets (mime=' + mime + ')');
    transcribe(blob).then(function (text) {
      log('transcription OK en ' + (Date.now() - t0) + ' ms: "' + text + '"');
      // "envoiAuto" = case cochee dans le panneau (LS.sendKw '1').
      //  - case cochee : on insere, on retire le mot-cle eventuel, on ENVOIE.
      //  - case decochee : on insere seulement (envoi manuel).
      var autoSend = ls(LS.sendKw, '0') === '1';
      var inserted = ls(LS.auto, '1') === '1' ? insertText(text) : false;
      // On retire le mot-cle de fin (envoie/envoyer/en voie...) s'il est present,
      // uniquement pour nettoyer le texte ; l'envoi ne depend pas de sa presence.
      var kw = stripSendKeyword(text);
      var finalText = kw.hit ? kw.text : text;

      function writeInput(value) {
        var el = findInput();
        if (!el) return;
        try {
          var proto = Object.getPrototypeOf(el);
          var d = Object.getOwnPropertyDescriptor(proto, 'value') ||
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          if (d && d.set) d.set.call(el, value); else el.value = value;
        } catch (e) { el.value = value; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (!inserted) {
        // insertion desactivee dans les reglages : on copie dans le presse-papiers
        copyToClipboard(text);
        showBubble('Texte transcrit (copié dans le presse-papiers) :<br>« ' + escapeHtml(text) + ' »', 'ok', 9000);
      } else if (autoSend) {
        if (!finalText) {
          // rien d'autre que le mot-cle : on vide le champ, on n'envoie pas
          writeInput('');
          showBubble('Mot-cle seul, sans message : rien envoyé.', 'error', 6000);
        } else {
          // reecrire le champ sans le mot-cle de fin, puis envoyer
          writeInput(finalText);
          setTimeout(function () {
            if (submitChat()) showBubble('Message envoyé : « ' + escapeHtml(finalText) + ' »', 'ok', 5000);
            else {
              copyToClipboard(finalText);
              showBubble('Envoi auto impossible (bouton indisponible). Texte copié : « ' + escapeHtml(finalText) + ' »', 'error', 9000);
            }
          }, 300);
        }
      } else {
        // case decochee : envoi manuel
        showBubble('Texte inséré : « ' + escapeHtml(finalText) + ' »', 'ok', 5000);
      }
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      logErr('transcription ECHEC apres ' + (Date.now() - t0) + ' ms: ' + msg);
      if (msg === 'NO_KEY') {
        // Le panneau REMPLACE la bulle : on ecrit donc l'explication dans son statut.
        showPanel();
        setPanelStatus('Aucune clé API Gemini : collez votre clé ci-dessus, puis cliquez sur « Enregistrer ».', 'error');
        var kf = st.ui.panel.querySelector('#ocvKey');
        try { kf.focus(); kf.select(); } catch (e) {}
      } else {
        showBubble('Échec de la transcription : ' + escapeHtml(msg), 'error', 15000);
      }
    }).then(function () {
      st.finishing = false;
      st.busy = false;
      setBtnState();
    });
  }

  /* ---------- audio -> WAV 16 kHz mono ---------- */
  function encodeWav(samples, rate) {
    var len = samples.length;
    var buf = new ArrayBuffer(44 + len * 2);
    var view = new DataView(buf);
    var str = function (off, s) { for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    view.setUint32(4, 36 + len * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, len * 2, true);
    var off = 44;
    for (var i = 0; i < len; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function toWav16k(blob) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx || !Offline) return Promise.reject(new Error('API audio indisponible dans cette fenêtre.'));
    return blob.arrayBuffer().then(function (raw) {
      var ctx = new Ctx();
      return Promise.resolve(ctx.decodeAudioData(raw.slice(0))).then(function (decoded) {
        try { ctx.close(); } catch (e) {}
        var rate = 16000;
        var frames = Math.max(1, Math.ceil(decoded.duration * rate));
        var off = new Offline(1, frames, rate);
        var src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start(0);
        return Promise.resolve(off.startRendering()).then(function (rendered) {
          return encodeWav(rendered.getChannelData(0), 16000);
        });
      });
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result || '');
        resolve(s.slice(s.indexOf(',') + 1));
      };
      fr.onerror = function () { reject(new Error('lecture audio impossible')); };
      fr.readAsDataURL(blob);
    });
  }

  // fetch avec délai maximal : une requête Gemini qui ne répond pas ne doit pas
  // laisser le bouton "busy" indéfiniment (l'utilisateur croit que c'est bloqué).
  function fetchWithTimeout(url, options, timeoutMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      options = options || {};
      options.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs);
    }
    return fetch(url, options).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') throw new Error('délai dépassé (' + Math.round(timeoutMs / 1000) + ' s) — vérifiez la connexion');
      throw err;
    });
  }

  function transcribe(blob) {
    return resolveKey().then(function (key) {
      if (!key) { logErr('transcribe: aucune cle Gemini (localStorage ni config app)'); throw new Error('NO_KEY'); }
      log('transcribe: cle trouvee (longueur ' + key.length + ')');
      return toWav16k(blob).then(function (wav) {
        return blobToBase64(wav).then(function (b64) {
          var model = resolveModel();
          var lang = ls(LS.lang, 'fr');
          log('transcribe: modele=' + model + ', langue=' + lang + ', audio=' + wav.size + ' octets');
          var instruction = lang === 'auto'
            ? 'Transcris mot pour mot cet enregistrement audio, exactement tel qu\'il est prononcé. ' +
              'Ne corrige rien, ne reformule rien, ne répète rien, n\'ajoute aucun commentaire ni ponctuation non prononcée. ' +
              'Ne traduis pas. Réponds uniquement par le texte transcrit.'
            : 'Transcris mot pour mot cet enregistrement audio en ' + (LANG_NAMES[lang] || 'français') + ', exactement tel qu\'il est prononcé. ' +
              'Ne corrige rien, ne reformule rien, ne répète rien, n\'ajoute aucun commentaire. ' +
              'Si un mot est prononcé dans une autre langue (par exemple « send »), écris-le tel quel sans le traduire. ' +
              'Réponds uniquement par le texte transcrit.';
          var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
            ':generateContent?key=' + encodeURIComponent(key);
          var body = {
            contents: [{
              role: 'user',
              parts: [{ text: instruction }, { inline_data: { mime_type: 'audio/wav', data: b64 } }]
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 2048 }
          };
          return fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }, 45000).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (json) {
              if (!res.ok) {
                var detail = json && json.error && json.error.message ? json.error.message : 'HTTP ' + res.status;
                throw new Error(detail);
              }
              var cand = json && json.candidates && json.candidates[0];
              var parts = (cand && cand.content && cand.content.parts) || [];
              var out = parts.map(function (p) { return p.text || ''; }).join('').trim();
              if (!out) throw new Error('aucune parole détectée dans l\'enregistrement');
              return out;
            });
          });
        });
      });
    }).catch(function (err) {
      if (err && err.name === 'TypeError') throw new Error('connexion au service impossible (vérifiez l\'accès à Internet)');
      throw err;
    });
  }

  /* ---------- insertion dans le champ de saisie du chat ---------- */
  function isVisible(el) {
    if (!el || el.disabled || el.readOnly || el.offsetParent === null) return false;
    // Un textarea "fantome" (hauteur 0, hors flux) ne doit pas etre choisi :
    // il faisait perdre l'ancrage a AionUi.
    var r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }

  // Le champ de saisie du chat est un <textarea> situe DANS un <form> qui
  // contient un bouton type="submit" (la fleche d'envoi). Cet ancrage est
  // robuste et INDEPENDANT DE LA LANGUE (contrairement au placeholder).
  function findChatFormArea(areas) {
    for (var i = areas.length - 1; i >= 0; i--) {
      var el = areas[i];
      var form = el.closest && el.closest('form');
      if (form && form.querySelector('button[type="submit"]')) return el;
    }
    return null;
  }

  function findInput() {
    var all = [].slice.call(document.querySelectorAll('textarea'));
    var areas = all.filter(isVisible);
    if (!areas.length) areas = all;
    if (!areas.length) { log('findInput: aucun textarea sur la page'); return null; }
    if (!st._loggedInputs) {
      st._loggedInputs = true;
      log('findInput: ' + all.length + ' textarea (visibles: ' + areas.length + ') -> ' +
        areas.map(function (el) {
          return '[' + (el.placeholder || 'sans-placeholder') + '|rows=' + el.getAttribute('rows') + ']';
        }).join(' '));
    }
    // 1) PRIORITE : textarea dans le <form> de la barre de saisie (bouton submit).
    var inForm = findChatFormArea(areas);
    if (inForm) return inForm;
    // 2) notre ancre deja installee : le textarea juste avant
    var anchor = document.getElementById('ocVoiceAnchor');
    if (anchor && anchor.previousElementSibling && anchor.previousElementSibling.tagName === 'TEXTAREA') {
      return anchor.previousElementSibling;
    }
    // 3) champ du chat : rows=1 + placeholder de type "message" (toutes langues)
    var chat = areas.filter(function (el) {
      return el.getAttribute('rows') === '1' &&
        /message|mensaje|nachricht|消息|écri|ecri|write|ask|type|saisir/i.test(el.placeholder || '');
    });
    if (chat.length) return chat[chat.length - 1];
    // 4) heuristiques progressives
    var byRows = areas.filter(function (el) { return el.getAttribute('rows') === '1'; });
    if (byRows.length) return byRows[byRows.length - 1];
    var byPh = areas.filter(function (el) {
      return /message|mensaje|nachricht|消息|écri|ecri|write|ask|type|saisir/i.test(el.placeholder || '');
    });
    if (byPh.length) return byPh[byPh.length - 1];
    return areas[areas.length - 1];
  }

  function insertText(text) {
    var el = findInput();
    if (!el) return false;
    var prev = el.value || '';
    var next = prev.trim() ? prev.replace(/\s+$/, '') + ' ' + text : text;
    try {
      var proto = Object.getPrototypeOf(el);
      var desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, next); else el.value = next;
    } catch (e) {
      el.value = next;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    try { el.focus(); } catch (e) {}
    return true;
  }

  /* ---------- envoi automatique par mot-cle ---------- */
  // Retire les accents et la ponctuation finale pour comparer au mot-cle.
  // Normalise pour comparaison : recoller "en voie" -> "envoie", retirer la
  // ponctuation finale, minuscules, sans accents.
  function normalizeForKw(s) {
    return String(s)
      .replace(SPLIT_KEYWORD_RE, 'envoie')   // recoller "en voie" -> "envoie"
      .replace(/[.,!?;:…"'’»«()\[\]]+$/g, '')
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // True si le texte se termine par un mot-cle d'envoi. Retourne {hit, text}
  // ou text = le message sans le(s) mot(s)-cle(s) de fin (nettoye).
  // Tolerant aux cas reels observes : "Envoie. Envoie." (double), "en voie"
  // (decoupe), "envoie." (ponctuation), casse/accents.
  function stripSendKeyword(raw) {
    var text = String(raw || '').replace(SPLIT_KEYWORD_RE, 'envoie').trim();
    if (!text) return { hit: false, text: text };
    var punctTail = /[\s.,!?;:…"'’»«()\[\]]+/;
    var words = text.split(/\s+/).map(function (w) {
      return w.replace(SPLIT_KEYWORD_RE, 'envoie').replace(punctTail, '');
    }).filter(function (w) { return w.length > 0; });
    if (!words.length) return { hit: false, text: text };
    function isKw(w) {
      return SEND_KEYWORDS.indexOf(
        w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) !== -1;
    }
    // On retire UNIQUEMENT des mots-cles en fin de texte (repete autant que
    // necessaire) : "Envoie. Envoie." -> vide, "phrase send" -> "phrase".
    // Aucun mot de contenu n'est jamais retire (securite).
    var n = words.length;
    var end = n;
    while (end > 0 && isKw(words[end - 1])) end--;
    if (end === n) return { hit: false, text: text }; // pas de mot-cle en fin
    return { hit: true, text: words.slice(0, end).join(' ').trim() };
  }

  // Clique le bouton d'envoi (fleche) du chat, si disponible et actif.
  function submitChat() {
    var btn = findSubmitButton();
    if (!btn || btn.disabled) { log('submitChat: bouton envoi indisponible/desactive'); return false; }
    try {
      btn.click();
      return true;
    } catch (e) { log('submitChat: clic impossible', e); return false; }
  }

  /* ---------- démarrage ---------- */
  var tries = 0;
  var VERSION = 4;
  function init() {
    tries++;
    var hasBody = !!document.body;
    var hasRoot = !!document.getElementById('root');
    var hasArea = !!document.querySelector('textarea');
    if (!hasBody || (!hasRoot && !hasArea)) {
      if (tries === 1 || tries % 25 === 0) {
        log('init: attente du DOM (essai ' + tries + ', body=' + hasBody + ', root=' + hasRoot + ', textarea=' + hasArea + ')');
      }
      if (tries < 300) setTimeout(init, 400);
      else logErr('init: DOM jamais pret apres ' + tries + ' essais, abandon');
      return;
    }
    try {
      log('init: DOM pret (essai ' + tries + '), installation de l interface');
      ensureUi();
      setBtnState();
      mountAnchored();
      // recaler une fois le layout React completement stabilise
      [200, 600, 1200].forEach(function (t) {
        setTimeout(function () { if (st.anchored) mountAnchored(); }, t);
      });
      setLs('ocVoice.installed', new Date().toISOString());
      log('module de saisie vocale pret (v' + VERSION + ', ancre=' + st.anchored + ')');
    } catch (e) {
      logErr('init: initialisation impossible', e);
    }
  }

  // signaler la presence du module des que possible (WARN = persiste dans le fichier de logs)
  logWarn('module charge (v' + VERSION + '), electronAPI.logs.write=' +
      !!(window.electronAPI && window.electronAPI.logs && window.electronAPI.logs.write) +
      ', readyState=' + document.readyState);
  // s'assurer que les logs developpeur (niveaux INFO) sont actives pour le diagnostic
  try {
    var lapi = window.electronAPI && window.electronAPI.logs;
    if (lapi && lapi.isEnabled && lapi.setEnabled) {
      Promise.resolve(lapi.isEnabled()).then(function (res) {
        var on = (res && typeof res === 'object') ? res.enabled : res;
        if (!on) {
          return Promise.resolve(lapi.setEnabled(true)).then(function () {
            log('logs developpeur actives par le module vocal (INFO visible desormais)');
          });
        }
      }).catch(function () {});
    }
  } catch (e) {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
