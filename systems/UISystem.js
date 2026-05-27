// UISystem.js — Skin selector + Emote picker UI overlay
//
// Skin mode  (skin button or keyboard):
//   • Hides other buttons; shows ‹ › side arrows
//   • Touch: tap centre to confirm
//   • Keyboard: A/← D/→ cycle skins; E or Space confirm
//
// Emote (touch: emote button; keyboard: E key):
//   • Quick tap / quick E press  → fire current emote
//   • Hold (320 ms)              → open picker
//   • Picker open, touch         → tap option to select
//   • Picker open, keyboard      → W/↑ D/→ next  S/↓ A/← prev  then release E or Space
//
// Movement is blocked while skin mode or emote picker is active.
// (see TouchInputSystem and InputSystem)

// ── Helper ─────────────────────────────────────────────────────────────────────
const el = (tag, attrs = {}, html = '') => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  node.innerHTML = html;
  return node;
};

// ── Game data ──────────────────────────────────────────────────────────────────

const SKINS = [
  { id: 'skin1', label: 'Skin 1', front: 'assets/player_01_front.png', back: 'assets/player_01_back.png' },
  { id: 'skin2', label: 'Skin 2', front: 'assets/player_02_front.png', back: 'assets/player_02_back.png' },
];

const EMOTES = [
  { id: 'emote_1', label: 'Bunny',   src: 'assets/emote_01.png' },
  { id: 'emote_2', label: 'Bunny 2', src: 'assets/emote_02.png' },
];

// ── Shared state ───────────────────────────────────────────────────────────────

const uiState = {
  skinPreview:      false,  // CameraSystem zooms to full-body when true
  selectedSkin:     0,
  selectedEmote:    0,
  buttonFade:       1,      // 0 = visible, 1 = hidden; driven by CameraSystem
  emotePickerOpen:  false,  // true while picker is showing (blocks movement)
};

// ── Button opacity fade ────────────────────────────────────────────────────────

let _lastFadeOpacity = -1;

const updateUI = () => {
  const opacity = Math.max(0, Math.min(1, 1 - (uiState.buttonFade || 0)));
  if (Math.abs(opacity - _lastFadeOpacity) < 0.005) return;
  _lastFadeOpacity = opacity;
  for (const id of ['pg-skin-btn', 'pg-emote-btn']) {
    const btn = document.getElementById(id);
    if (btn) btn.style.opacity = opacity;
  }
};

// ── Keyboard handler (called by InputSystem every frame) ──────────────────────
// All UI key logic lives here so InputSystem stays clean.

let _ui         = null;   // set by setupUI once DOM is ready
let _eHeldTime  = 0;      // seconds E has been held this press
let _ePickerOpen = false; // true = picker was opened via keyboard hold

const handleUIKeys = (keys, keysPressed, dt) => {
  if (!_ui) return;

  // ── Skin select ─────────────────────────────────────────────────────────────
  if (uiState.skinPreview) {
    if (keysPressed['a'] || keysPressed['arrowleft'])  _ui.cycleSkin(-1);
    if (keysPressed['d'] || keysPressed['arrowright']) _ui.cycleSkin(+1);
    if (keysPressed['e'] || keysPressed[' '] || keysPressed['enter']) {
      _ui.closeSkin();
      // Clear space and enter so InputSystem can't consume them as jump/action
      keysPressed[' ']     = false;
      keysPressed['enter'] = false;
      keysPressed['e']     = false;
    }
    return;
  }

  // ── E key: tap = fire emote, hold = open picker ──────────────────────────────
  if (keys['e']) {
    _eHeldTime += dt;
    if (_eHeldTime >= 0.32 && !_ePickerOpen) {
      _ePickerOpen = true;
      _ui.openPicker();          // also sets uiState.emotePickerOpen = true
    }
  } else if (_eHeldTime > 0) {
    // E just released — fire emote and tidy up
    _ui.closePicker();           // also sets uiState.emotePickerOpen = false
    _ePickerOpen = false;
    _eHeldTime   = 0;
    _ui.fireEmote();
    return;                      // skip movement on the release frame
  }

  // ── Picker navigation (while picker is open) ──────────────────────────────
  if (uiState.emotePickerOpen) {
    if (keysPressed['w'] || keysPressed['arrowup']    || keysPressed['d'] || keysPressed['arrowright'])
      _ui.cycleEmote(+1);
    if (keysPressed['s'] || keysPressed['arrowdown']  || keysPressed['a'] || keysPressed['arrowleft'])
      _ui.cycleEmote(-1);

    // Space or Enter confirms while picker is open
    if (keysPressed[' '] || keysPressed['enter']) {
      _ui.closePicker();
      _ePickerOpen = false;
      _eHeldTime   = 0;
      _ui.fireEmote();
      keysPressed[' ']     = false;   // don't also jump
      keysPressed['enter'] = false;
    }
  }
};

// ── Setup (call once from main.js setup) ──────────────────────────────────────

const setupUI = (onEmoteFired) => {

  // ── Styles ────────────────────────────────────────────────────────────────
  document.head.appendChild(el('style', {}, `
    .pg-btn {
      position: fixed;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,0.13);
      border-radius: 14px;
      color: #fff; font-size: 24px;
      width: 54px; height: 54px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      touch-action: none;
      user-select: none; -webkit-user-select: none;
      z-index: 200;
      opacity: 0;
      transition: opacity 0.4s ease;
    }
    .pg-btn:active { background: rgba(255,255,255,0.18); }
    #pg-skin-btn  { top: 14px; right: 14px; }
    #pg-emote-btn { bottom: 14px; left: 50%; transform: translateX(-50%); }

    /* Full-screen tap-to-confirm overlay — active only in skin mode */
    #pg-skin-overlay {
      position: fixed; inset: 0;
      z-index: 300;
      display: none;
      touch-action: none;
    }
    #pg-skin-overlay.open { display: block; }

    /* Side arrows — shown only in skin mode */
    .pg-skin-arrow {
      position: fixed;
      top: 50%; transform: translateY(-50%);
      z-index: 400;
      background: rgba(0,0,0,0.50);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 50%;
      color: #fff; font-size: 38px; line-height: 1;
      width: 64px; height: 64px;
      display: none; align-items: center; justify-content: center;
      cursor: pointer; touch-action: none;
      user-select: none; -webkit-user-select: none;
      transition: background 0.12s;
    }
    .pg-skin-arrow:active { background: rgba(255,255,255,0.22); }
    #pg-skin-prev { left:  14px; }
    #pg-skin-next { right: 14px; }

    /* Emote picker — column above emote button */
    #pg-emote-picker {
      position: fixed; left: 50%; transform: translateX(-50%); bottom: 78px;
      display: flex; flex-direction: column-reverse; gap: 8px;
      z-index: 200; pointer-events: none;
      opacity: 0; transform: translateY(10px);
      transition: opacity 0.18s, transform 0.18s;
    }
    #pg-emote-picker.open { opacity: 1; transform: none; pointer-events: auto; }

    .pg-emote-opt {
      background: rgba(0,0,0,0.65);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; font-size: 26px;
      width: 50px; height: 50px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: none;
    }
    .pg-emote-opt.selected { border-color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.1); }
    .pg-emote-opt:active   { transform: scale(0.88); }
  `));

  // ── Skin button (top-right) ────────────────────────────────────────────────
  const SKIN_FRAMES = 3;
  const skinBtn     = el('button', { id: 'pg-skin-btn', class: 'pg-btn' });
  const skinBtnImg  = el('div', { style: [
    'width:36px', 'height:36px',
    `background-image:url(${SKINS[0].front})`,
    `background-size:${SKIN_FRAMES * 100}% 100%`,
    'background-position:0% 0%',
    'background-repeat:no-repeat',
    'image-rendering:pixelated',
    'pointer-events:none',
  ].join(';') });
  skinBtn.appendChild(skinBtnImg);
  document.body.appendChild(skinBtn);

  const MAX_BTN_SIZE = 42;
  const setSkinBtnAspect = (src) => {
    const probe = new Image();
    probe.onload = () => {
      const frameW = probe.naturalWidth / SKIN_FRAMES;
      const frameH = probe.naturalHeight;
      let w, h;
      if (frameW / frameH >= 1) { w = MAX_BTN_SIZE; h = Math.round(MAX_BTN_SIZE * frameH / frameW); }
      else                       { h = MAX_BTN_SIZE; w = Math.round(MAX_BTN_SIZE * frameW / frameH); }
      skinBtnImg.style.width  = `${w}px`;
      skinBtnImg.style.height = `${h}px`;
    };
    probe.src = src;
  };
  setSkinBtnAspect(SKINS[0].front);

  // ── Full-screen tap-to-confirm overlay ────────────────────────────────────
  const skinOverlay = el('div', { id: 'pg-skin-overlay' });
  document.body.appendChild(skinOverlay);

  // ── Side arrow buttons ─────────────────────────────────────────────────────
  const prevBtn = el('button', { id: 'pg-skin-prev', class: 'pg-skin-arrow' }, '‹');
  const nextBtn = el('button', { id: 'pg-skin-next', class: 'pg-skin-arrow' }, '›');
  document.body.appendChild(prevBtn);
  document.body.appendChild(nextBtn);

  // ── Skin open / close / cycle ─────────────────────────────────────────────

  const openSkin = () => {
    // Reset E-hold state so returning from skin mode doesn't fire a stale emote
    _eHeldTime = 0;
    closePicker();   // close emote picker if open

    uiState.skinPreview = true;
    skinBtn.style.display  = 'none';
    emoteBtn.style.display = 'none';
    skinOverlay.classList.add('open');
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';
  };

  const closeSkin = () => {
    uiState.skinPreview = false;
    skinBtn.style.display  = '';
    emoteBtn.style.display = '';
    skinOverlay.classList.remove('open');
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
  };

  const cycleSkin = (dir) => {
    uiState.selectedSkin = (uiState.selectedSkin + dir + SKINS.length) % SKINS.length;
    const skin = SKINS[uiState.selectedSkin];
    skinBtnImg.style.backgroundImage = `url(${skin.front})`;
    setSkinBtnAspect(skin.front);
    loadImage(skin.front, img => { PLAYER_FRONT_TEX = img; });
    loadImage(skin.back,  img => { PLAYER_BACK_TEX  = img; });
  };

  // ── Emote picker ───────────────────────────────────────────────────────────
  const emotePicker = el('div', { id: 'pg-emote-picker' });

  // Shared emote-selection logic used by both touch and keyboard paths
  const setEmote = (i) => {
    uiState.selectedEmote = i;
    emoteBtnImg.src = EMOTES[i].src;
    emotePicker.querySelectorAll('.pg-emote-opt').forEach((b, j) =>
      b.classList.toggle('selected', j === i)
    );
  };

  const cycleEmote = (dir) => {
    setEmote((uiState.selectedEmote + dir + EMOTES.length) % EMOTES.length);
  };

  EMOTES.forEach((emote, i) => {
    const btn = el('button', { class: 'pg-emote-opt' + (i === 0 ? ' selected' : '') });
    btn.appendChild(el('img', { src: emote.src, style: 'width:34px;height:34px;object-fit:contain;pointer-events:none' }));
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      setEmote(i);
      closePicker();
    });
    emotePicker.appendChild(btn);
  });
  document.body.appendChild(emotePicker);

  const openPicker = () => {
    emotePicker.classList.add('open');
    uiState.emotePickerOpen = true;
  };
  const closePicker = () => {
    emotePicker.classList.remove('open');
    uiState.emotePickerOpen = false;
    _ePickerOpen            = false;  // keep keyboard state in sync
  };

  // Close picker on outside tap
  document.addEventListener('pointerdown', e => {
    if (emotePicker.classList.contains('open') &&
        !emotePicker.contains(e.target) && e.target !== emoteBtn) {
      closePicker();
    }
  }, true);

  // ── Emote button (appended after picker so it sits on top) ────────────────
  const emoteBtn    = el('button', { id: 'pg-emote-btn', class: 'pg-btn' });
  const emoteBtnImg = el('img', { src: EMOTES[0].src, style: 'width:38px;height:38px;object-fit:contain;pointer-events:none' });
  emoteBtn.appendChild(emoteBtnImg);
  document.body.appendChild(emoteBtn);

  let holdTimer = null;
  let held      = false;

  emoteBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    held      = false;
    holdTimer = setTimeout(() => { held = true; openPicker(); }, 320);
  });
  emoteBtn.addEventListener('pointerup', e => {
    e.preventDefault();
    clearTimeout(holdTimer);
    if (!held && onEmoteFired) onEmoteFired(EMOTES[uiState.selectedEmote].id);
  });
  emoteBtn.addEventListener('pointercancel', () => clearTimeout(holdTimer));

  // ── Touch listeners for skin arrows / overlay ─────────────────────────────
  skinBtn.addEventListener('pointerdown', e => { e.preventDefault(); openSkin(); });
  skinOverlay.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); closeSkin(); });
  prevBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cycleSkin(-1); });
  nextBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cycleSkin(+1); });

  // ── Expose refs for handleUIKeys ──────────────────────────────────────────
  _ui = {
    cycleSkin,
    closeSkin,
    openPicker,
    closePicker,
    cycleEmote,
    fireEmote: () => { if (onEmoteFired) onEmoteFired(EMOTES[uiState.selectedEmote].id); },
  };
};
