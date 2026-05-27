// UISystem.js — Skin selector + Emote picker UI overlay
//
// Skin mode  (skin button, top-right):
//   • Hides all other buttons
//   • Shows ‹ › arrows pinned to the left / right screen edges (vertically centred)
//   • Tap the centre (anywhere that isn't an arrow) → confirm & return to game
//   • Movement is blocked while skin mode is active (see TouchInputSystem / InputSystem)
//
// Emote button (bottom-right): tap = fire current emote; hold = open picker

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

// ── Shared state (read by CameraSystem, NetworkSystem, etc.) ──────────────────

const uiState = {
  skinPreview:   false,   // CameraSystem zooms to full-body when true
  selectedSkin:  0,
  selectedEmote: 0,
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
      transition: opacity 0.18s;
    }
    .pg-btn:active { background: rgba(255,255,255,0.18); }
    #pg-skin-btn  { top: 14px; right: 14px; }
    #pg-emote-btn { bottom: 110px; right: 14px; }

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
      position: fixed; right: 14px; bottom: 174px;
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
    // width/height are overwritten by setSkinBtnAspect() once the image loads
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

  // Resize the skin-button image div to the frame's true aspect ratio.
  // Called once on startup and again each time the skin is cycled.
  const MAX_BTN_SIZE = 42; // max dimension (px) to fit inside the 54px button
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

  // ── Open / close helpers ───────────────────────────────────────────────────

  const openSkin = () => {
    uiState.skinPreview = true;
    skinBtn.style.display  = 'none';
    emoteBtn.style.display = 'none';
    emotePicker.classList.remove('open');
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

  // ── Skin cycling ───────────────────────────────────────────────────────────

  const cycleSkin = (dir) => {
    uiState.selectedSkin = (uiState.selectedSkin + dir + SKINS.length) % SKINS.length;
    const skin = SKINS[uiState.selectedSkin];
    skinBtnImg.style.backgroundImage = `url(${skin.front})`;
    setSkinBtnAspect(skin.front);

    // Swap live player textures so the in-world sprite updates immediately
    loadImage(skin.front, img => { PLAYER_FRONT_TEX = img; });
    loadImage(skin.back,  img => { PLAYER_BACK_TEX  = img; });
  };

  // ── Event listeners ────────────────────────────────────────────────────────

  skinBtn.addEventListener('pointerdown', e => { e.preventDefault(); openSkin(); });

  // Tap centre → confirm skin.
  // stopPropagation prevents the event reaching the document-level TouchInputSystem
  // listener, which would otherwise queue a jump on the frame after closing.
  skinOverlay.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); closeSkin(); });

  // Arrow buttons — stop propagation so they don't also close the overlay
  prevBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cycleSkin(-1); });
  nextBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cycleSkin(+1); });

  // ── Emote picker ───────────────────────────────────────────────────────────
  const emotePicker = el('div', { id: 'pg-emote-picker' });
  EMOTES.forEach((emote, i) => {
    const btn = el('button', { class: 'pg-emote-opt' + (i === 0 ? ' selected' : '') });
    btn.appendChild(el('img', { src: emote.src, style: 'width:34px;height:34px;object-fit:contain;pointer-events:none' }));
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      uiState.selectedEmote = i;
      emoteBtnImg.src       = emote.src;
      emotePicker.querySelectorAll('.pg-emote-opt').forEach((b, j) =>
        b.classList.toggle('selected', j === i)
      );
      closePicker();
    });
    emotePicker.appendChild(btn);
  });
  document.body.appendChild(emotePicker);

  const openPicker  = () => emotePicker.classList.add('open');
  const closePicker = () => emotePicker.classList.remove('open');

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
};
