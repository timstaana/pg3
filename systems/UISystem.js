// UISystem.js — Skin selector + Emote picker UI overlay
//
// Skin button  (top-right)    → opens skin preview camera; left/right cycle skins
// Emote button (bottom-right) → tap = fire current emote; hold = open picker
//
// uiState is a global read by CameraSystem (skinPreview flag) and main.js.

// ── Helper ────────────────────────────────────────────────────────────────────
// Creates a DOM element with attributes and optional innerHTML.
const el = (tag, attrs = {}, html = '') => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  node.innerHTML = html;
  return node;
};

// ── Game data ─────────────────────────────────────────────────────────────────

const SKINS = [
  { id: 'skin1', label: 'Skin 1', front: 'assets/player_01_front.png', back: 'assets/player_01_back.png' },
  { id: 'skin2', label: 'Skin 2', front: 'assets/player_02_front.png', back: 'assets/player_02_back.png' },
];

const EMOTES = [
  { id: 'emote_1', label: 'Bunny',   src: 'assets/emote_01.png' },
  { id: 'emote_2', label: 'Bunny 2', src: 'assets/emote_02.png' },
];

// ── Shared state (read by CameraSystem, NetworkSystem, etc.) ─────────────────

const uiState = {
  skinPreview:   false,  // CameraSystem zooms to full-body when true
  selectedSkin:  0,
  selectedEmote: 0,
};

// ── Setup (call once from main.js setup) ─────────────────────────────────────

const setupUI = (onEmoteFired) => {

  // ── Styles ─────────────────────────────────────────────────────────────────
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
    }
    .pg-btn:active { background: rgba(255,255,255,0.18); }
    #pg-skin-btn  { top: 14px; right: 14px; }
    #pg-emote-btn { bottom: 110px; right: 14px; }

    /* Skin panel — slides up from bottom */
    #pg-skin-panel {
      position: fixed; inset: 0;
      display: flex; align-items: flex-end;
      z-index: 400; pointer-events: none;
    }
    #pg-skin-inner {
      width: 100%;
      padding: 20px 24px 44px;
      background: rgba(8,8,8,0.85);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      border-top: 1px solid rgba(255,255,255,0.1);
      display: flex; align-items: center; justify-content: center; gap: 28px;
      pointer-events: auto;
      touch-action: none;
      transform: translateY(100%);
      transition: transform 0.32s cubic-bezier(0.22,1,0.36,1);
    }
    #pg-skin-panel.open #pg-skin-inner { transform: translateY(0); }

    .pg-arrow {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 50%;
      color: #fff; font-size: 28px;
      width: 52px; height: 52px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: none;
      user-select: none; -webkit-user-select: none;
    }
    .pg-arrow:active { background: rgba(255,255,255,0.25); }

    #pg-skin-label {
      color: #fff;
      font: 600 18px/1 -apple-system, BlinkMacSystemFont, sans-serif;
      letter-spacing: 0.02em;
      min-width: 100px; text-align: center;
    }
    #pg-skin-close {
      position: absolute; top: 14px; right: 18px;
      background: none; border: none;
      color: rgba(255,255,255,0.45); font-size: 20px;
      cursor: pointer; touch-action: none;
    }

    /* Emote picker — column above emote button */
    #pg-emote-picker {
      position: fixed; right: 14px; bottom: 174px;
      display: flex; flex-direction: column-reverse; gap: 8px;
      z-index: 300; pointer-events: none;
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

  // ── Skin button ────────────────────────────────────────────────────────────
  // Show only the first frame of the sprite sheet.
  // background-size:300% 100% spreads the 3-frame sheet across 3× the container
  // width so the leftmost frame fills the button exactly.
  const SKIN_FRAMES = 3;
  const skinBtn    = el('button', { id: 'pg-skin-btn', class: 'pg-btn' });
  const skinBtnImg = el('div', { style: [
    'width:40px', 'height:40px',
    `background-image:url(${SKINS[0].front})`,
    `background-size:${SKIN_FRAMES * 100}% 100%`,
    'background-position:0% 0%',
    'background-repeat:no-repeat',
    'image-rendering:pixelated',
    'pointer-events:none',
  ].join(';') });
  skinBtn.appendChild(skinBtnImg);
  document.body.appendChild(skinBtn);

  // ── Skin panel ─────────────────────────────────────────────────────────────
  const skinPanel = el('div', { id: 'pg-skin-panel' }, `
    <div id="pg-skin-inner">
      <button class="pg-arrow" id="pg-skin-prev">‹</button>
      <span id="pg-skin-label">${SKINS[0].label}</span>
      <button class="pg-arrow" id="pg-skin-next">›</button>
      <button id="pg-skin-close">✕</button>
    </div>
  `);
  document.body.appendChild(skinPanel);

  const skinLabel = document.getElementById('pg-skin-label');

  const openSkin  = () => { uiState.skinPreview = true;  skinPanel.classList.add('open'); };
  const closeSkin = () => { uiState.skinPreview = false; skinPanel.classList.remove('open'); };
  const cycleSkin = (dir) => {
    uiState.selectedSkin = (uiState.selectedSkin + dir + SKINS.length) % SKINS.length;
    const skin = SKINS[uiState.selectedSkin];
    skinLabel.textContent = skin.label;
    skinBtnImg.style.backgroundImage = `url(${skin.front})`;

    // Swap the live player textures so the in-world sprite updates immediately
    loadImage(skin.front, img => { PLAYER_FRONT_TEX = img; });
    loadImage(skin.back,  img => { PLAYER_BACK_TEX  = img; });
  };

  skinBtn.addEventListener('pointerdown', e => { e.preventDefault(); openSkin(); });
  document.getElementById('pg-skin-close').addEventListener('pointerdown', e => { e.preventDefault(); closeSkin(); });
  document.getElementById('pg-skin-prev').addEventListener('pointerdown',  e => { e.preventDefault(); cycleSkin(-1); });
  document.getElementById('pg-skin-next').addEventListener('pointerdown',  e => { e.preventDefault(); cycleSkin(+1); });

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

  // ── Emote button ───────────────────────────────────────────────────────────
  // Must be appended AFTER emotePicker so it sits on top in stacking order.
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
