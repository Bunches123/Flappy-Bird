const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_HEIGHT = 82;
const GROUND_Y = HEIGHT - GROUND_HEIGHT;
const GRAVITY = 0.42;
const FLAP_FORCE = -7.2;
const BASE_PIPE_SPEED = 2.4;
const BASE_PIPE_GAP = 150;
const BASE_PIPE_WIDTH = 70;
const BASE_PIPE_INTERVAL = 1500;
const ECLIPSE_SCORE_INTERVAL = 10;
const ECLIPSE_DURATION = 9000;
const ECLIPSE_RECOVERY_DURATION = 3500;
const ECLIPSE_PACE_MULTIPLIER = 1.45;
const RECOVERY_PACE_MULTIPLIER = 0.86;
const ECLIPSE_BEAT_INTERVAL = 188;
const ECLIPSE_FLASH_DURATION = 320;

let audioCtx = null;

const SKINS = {
  sunbeam: { name: 'Sunbeam', body: '#ffd166', wing: '#f28c38', vibe: 'The original glow' },
  lagoon: { name: 'Lagoon', body: '#46d6e8', wing: '#168db5', vibe: 'Cool as the sea' },
  coral: { name: 'Coral Pop', body: '#ff7895', wing: '#dc456c', vibe: 'Bright and bold' },
  kiwi: { name: 'Kiwi', body: '#a6e65c', wing: '#55ad49', vibe: 'Fresh green energy' },
  lilac: { name: 'Lilac Sky', body: '#c3a0ff', wing: '#8b68db', vibe: 'A little magic' },
  tangerine: { name: 'Tangerine', body: '#ff9b54', wing: '#e46137', vibe: 'Ready to shine' },
  berry: { name: 'Berry', body: '#ed78df', wing: '#ae4cb8', vibe: 'Sweet and fearless' },
  glacier: { name: 'Glacier', body: '#b7edff', wing: '#62a9d5', vibe: 'Light as a cloud' },
};
const STORAGE_KEYS = {
  skin: 'flappySkySkin',
  playerName: 'flappySkyPlayerName',
  leaderboard: 'flappySkyLeaderboard',
};
const playerNameInput = document.getElementById('playerName');
const menu = document.getElementById('menu');
const roundActions = document.getElementById('roundActions');
const menuPages = [...document.querySelectorAll('[data-menu-page]')];
const leaderboardList = document.getElementById('leaderboardList');
const emptyLeaderboard = document.getElementById('emptyLeaderboard');
const storageNotice = document.getElementById('storageNotice');
const skinGrid = document.getElementById('skinGrid');
const skinNote = document.getElementById('skinNote');
const heroBird = document.getElementById('heroBird');
const playerAvatar = document.getElementById('playerAvatar');
let currentMenuPage = 'home';

function readStoredValue(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from local storage.`, error);
    storageNotice.textContent = 'Saving is unavailable in this browser session.';
    return fallback;
  }
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Unable to save ${key} to local storage.`, error);
    storageNotice.textContent = 'Saving is unavailable in this browser session.';
    return false;
  }
}

function loadLeaderboard() {
  const savedLeaderboard = readStoredValue(STORAGE_KEYS.leaderboard, '[]');
  try {
    const entries = JSON.parse(savedLeaderboard);
    if (!Array.isArray(entries)) {
      throw new TypeError('Saved leaderboard data must be an array.');
    }

    return entries
      .filter((entry) => (
        entry
        && typeof entry.name === 'string'
        && Number.isInteger(entry.score)
        && entry.score >= 0
      ))
      .sort((first, second) => second.score - first.score)
      .slice(0, 10);
  } catch (error) {
    console.error('Unable to load the local leaderboard.', error);
    storageNotice.textContent = 'Saved leaderboard data could not be read.';
    return [];
  }
}

const savedSkin = readStoredValue(STORAGE_KEYS.skin, 'sunbeam');
const leaderboard = loadLeaderboard();

const state = {
  mode: 'start',
  score: 0,
  best: leaderboard[0]?.score ?? 0,
  skin: Object.hasOwn(SKINS, savedSkin) ? savedSkin : 'sunbeam',
  elapsed: 0,
  eclipse: false,
  eclipseStrength: 0,
  eclipseFlash: 0,
  eclipseRemaining: 0,
  eclipseRecoveryRemaining: 0,
  nextEclipseScore: ECLIPSE_SCORE_INTERVAL,
  eclipseBeatRemaining: 0,
  eclipseBeatIndex: 0,
  skyphase: 0,
  shake: 0,
  startFlash: 0,
  bird: {
    x: 110,
    y: HEIGHT / 2 - 18,
    radius: 16,
    velocity: 0,
    rotation: 0,
  },
  pipes: [],
  pipeTimer: 0,
  cloudOffset: 0,
  groundOffset: 0,
  sun: { x: WIDTH * 0.5, y: 115, radius: 34 },
  moon: { x: WIDTH * 0.5, y: 115, radius: 28 },
};

function ensureAudio() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioCtx = new AudioCtor();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(frequency, duration, type, volume, sweep = 0) {
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  if (sweep !== 0) {
    osc.frequency.linearRampToValueAtTime(frequency + sweep, audioCtx.currentTime + duration);
  }

  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playFlap() {
  ensureAudio();
  playTone(520, 0.1, 'square', 0.05, -200);
  playTone(700, 0.1, 'triangle', 0.04, 140);
}

function playScore() {
  ensureAudio();
  playTone(900, 0.08, 'triangle', 0.05, 200);
  playTone(1200, 0.12, 'triangle', 0.04, 180);
}

function playCrash() {
  ensureAudio();
  playTone(190, 0.16, 'sawtooth', 0.05, -120);
  playTone(90, 0.25, 'square', 0.04, -60);
}

function playStart() {
  ensureAudio();
  playTone(360, 0.12, 'triangle', 0.04, 60);
  playTone(520, 0.14, 'square', 0.04, 90);
}

function playEclipseBeat() {
  const step = state.eclipseBeatIndex % 8;
  const notes = [392, 330, 440, 349, 392, 330, 523, 440];
  const bassNotes = [65, 73, 82, 73];
  const frequency = notes[step];
  state.eclipseBeatIndex += 1;
  playTone(frequency, 0.14, 'triangle', 0.022, frequency * 0.06);
  playTone(1800, 0.035, 'square', 0.007);

  if (step % 2 === 0) {
    playTone(bassNotes[(step / 2) % bassNotes.length], 0.16, 'sawtooth', 0.018);
  }
  if (step === 0 || step === 4) {
    playTone(92, 0.13, 'sine', 0.055, -48);
  } else if (step === 2 || step === 6) {
    playTone(190, 0.09, 'triangle', 0.022, -70);
  }
}

function startEclipse() {
  state.eclipse = true;
  state.eclipseRemaining = ECLIPSE_DURATION;
  state.eclipseRecoveryRemaining = 0;
  state.eclipseFlash = ECLIPSE_FLASH_DURATION;
  state.eclipseBeatRemaining = 0;
  state.eclipseBeatIndex = 0;
  state.shake = Math.max(state.shake, 2.2);
  state.moon.x = -state.moon.radius;
  state.moon.y = state.sun.y;
  playEclipseBeat();
}

function renderLeaderboard() {
  leaderboardList.replaceChildren();
  for (const [index, entry] of leaderboard.entries()) {
    const item = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const avatar = document.createElement('span');
    avatar.className = 'leaderboard-avatar';
    avatar.textContent = entry.name.charAt(0).toUpperCase() || '?';
    const name = document.createElement('span');
    name.className = 'leaderboard-name';
    name.textContent = entry.name;
    const score = document.createElement('span');
    score.className = 'leaderboard-score';
    score.textContent = `${entry.score} ${entry.score === 1 ? 'pt' : 'pts'}`;
    item.append(rank, avatar, name, score);
    leaderboardList.append(item);
  }
  emptyLeaderboard.hidden = leaderboard.length > 0;
}

function updateSkinPreview() {
  const skin = SKINS[state.skin];
  heroBird.style.setProperty('--bird-body', skin.body);
  heroBird.style.setProperty('--bird-wing', skin.wing);
  skinNote.textContent = `${skin.name} selected · ${skin.vibe}`;
  for (const button of skinGrid.querySelectorAll('[data-skin]')) {
    button.setAttribute('aria-pressed', String(button.dataset.skin === state.skin));
  }
}

function createSkinPicker() {
  for (const [id, skin] of Object.entries(SKINS)) {
    const button = document.createElement('button');
    button.className = 'skin-card';
    button.type = 'button';
    button.dataset.skin = id;
    button.style.setProperty('--skin-color', skin.body);
    button.style.setProperty('--wing-color', skin.wing);
    button.setAttribute('aria-label', `${skin.name}: ${skin.vibe}`);
    const preview = document.createElement('span');
    preview.className = 'skin-preview';
    preview.setAttribute('aria-hidden', 'true');
    const info = document.createElement('span');
    info.className = 'skin-info';
    const name = document.createElement('strong');
    name.textContent = skin.name;
    const vibe = document.createElement('small');
    vibe.textContent = skin.vibe;
    info.append(name, vibe);
    const check = document.createElement('span');
    check.className = 'skin-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    button.append(preview, info, check);
    skinGrid.append(button);
  }
  updateSkinPreview();
}

function showMenuPage(pageName) {
  currentMenuPage = pageName;
  for (const page of menuPages) {
    page.hidden = page.dataset.menuPage !== pageName;
  }
  if (pageName === 'leaderboard') {
    renderLeaderboard();
  }
}

function updatePlayerIdentity() {
  const name = playerNameInput.value.trim().slice(0, 16) || 'Player';
  playerAvatar.textContent = name.charAt(0).toUpperCase();
}

function savePlayerName() {
  const name = playerNameInput.value.trim().slice(0, 16) || 'Player';
  playerNameInput.value = name;
  updatePlayerIdentity();
  writeStoredValue(STORAGE_KEYS.playerName, name);
}

function finishGame() {
  if (state.mode !== 'playing') return;

  state.mode = 'gameover';
  const name = playerNameInput.value.trim().slice(0, 16) || 'Player';
  if (state.score > 0) {
    leaderboard.push({ name, score: state.score });
    leaderboard.sort((first, second) => second.score - first.score);
    leaderboard.splice(10);
    writeStoredValue(STORAGE_KEYS.leaderboard, JSON.stringify(leaderboard));
  }
  state.best = Math.max(state.best, state.score);
  playCrash();
}

function resetGame() {
  state.mode = 'start';
  state.score = 0;
  state.elapsed = 0;
  state.eclipse = false;
  state.eclipseStrength = 0;
  state.eclipseFlash = 0;
  state.eclipseRemaining = 0;
  state.eclipseRecoveryRemaining = 0;
  state.nextEclipseScore = ECLIPSE_SCORE_INTERVAL;
  state.eclipseBeatRemaining = 0;
  state.eclipseBeatIndex = 0;
  state.skyPhase = 0;
  state.pipes = [];
  state.pipeTimer = 0;
  state.bird.y = HEIGHT / 2 - 18;
  state.bird.velocity = 0;
  state.bird.rotation = 0;
  state.groundOffset = 0;
}

function startGame() {
  if (state.mode === 'gameover') {
    state.score = 0;
    state.elapsed = 0;
    state.eclipse = false;
    state.eclipseStrength = 0;
    state.eclipseFlash = 0;
    state.eclipseRemaining = 0;
    state.eclipseRecoveryRemaining = 0;
    state.nextEclipseScore = ECLIPSE_SCORE_INTERVAL;
    state.eclipseBeatRemaining = 0;
    state.eclipseBeatIndex = 0;
    state.pipes = [];
    state.pipeTimer = 0;
  }

  state.mode = 'playing';
  state.bird.y = HEIGHT / 2 - 18;
  state.bird.velocity = FLAP_FORCE;
  state.bird.rotation = -1.2;
  state.startFlash = 1;
  state.shake = Math.max(state.shake, 1.5);
  playStart();
}

function flap() {
  if (state.mode === 'start') {
    startGame();
    return;
  }

  if (state.mode === 'playing') {
    state.bird.velocity = FLAP_FORCE;
    state.bird.rotation = -1.2;
    playFlap();
    return;
  }

  if (state.mode === 'gameover') {
    resetGame();
    startGame();
  }
}

function getDifficultySettings() {
  const scoreFactor = Math.min(18, state.score * 0.55);
  const baseBoost = 1 + scoreFactor * 0.06 + state.elapsed / 100000;
  const eclipseBoost = state.eclipse ? 1.18 : 1;
  const speed = BASE_PIPE_SPEED * baseBoost * eclipseBoost;
  const gap = Math.max(126, BASE_PIPE_GAP - state.score * 1.1 - (state.eclipse ? 18 : 0));
  const interval = Math.max(1080, BASE_PIPE_INTERVAL / baseBoost / (state.eclipse ? 1.08 : 1));
  const gravity = GRAVITY * (1 + state.score * 0.007 + (state.eclipse ? 0.12 : 0));

  return { speed, gap, interval, gravity };
}

function getPaceMultiplier() {
  if (state.eclipse) {
    return ECLIPSE_PACE_MULTIPLIER;
  }
  if (state.eclipseRecoveryRemaining > 0) {
    const recovery = state.eclipseRecoveryRemaining / ECLIPSE_RECOVERY_DURATION;
    return 1 - (1 - RECOVERY_PACE_MULTIPLIER) * recovery;
  }
  return 1;
}

function updateSky(delta) {
  state.elapsed += delta;
  state.skyPhase = (state.elapsed % 24000) / 24000;

  state.sun.x = WIDTH * 0.5;
  state.sun.y = 115;
  state.eclipseFlash = Math.max(0, state.eclipseFlash - delta);

  if (state.mode === 'playing') {
    if (state.eclipse) {
      state.eclipseRemaining = Math.max(0, state.eclipseRemaining - delta);
      state.eclipseBeatRemaining -= delta;
      if (state.eclipseBeatRemaining <= 0) {
        playEclipseBeat();
        state.eclipseBeatRemaining = ECLIPSE_BEAT_INTERVAL;
      }
      if (state.eclipseRemaining === 0) {
        state.eclipse = false;
        state.eclipseRecoveryRemaining = ECLIPSE_RECOVERY_DURATION;
        state.shake = Math.max(state.shake, 1.2);
      }
    } else if (state.eclipseRecoveryRemaining > 0) {
      state.eclipseRecoveryRemaining = Math.max(0, state.eclipseRecoveryRemaining - delta);
    }
  }

  if (state.eclipse) {
    const eclipseProgress = 1 - state.eclipseRemaining / ECLIPSE_DURATION;
    state.moon.x = -state.moon.radius
      + (WIDTH + state.moon.radius * 2) * eclipseProgress;
    state.moon.y = state.sun.y;
  } else {
    state.moon.x = state.moon.radius
      + (WIDTH - state.moon.radius * 2) * (0.5 + Math.sin(state.elapsed / 4500) * 0.5);
    state.moon.y = 35;
  }

  const distance = Math.hypot(state.sun.x - state.moon.x, state.sun.y - state.moon.y);
  state.eclipseStrength = Math.max(
    0,
    1 - distance / (state.sun.radius + state.moon.radius)
  );
  const targetShake = state.eclipse ? 1.6 : state.eclipseRecoveryRemaining > 0 ? 0.6 : 0;
  state.shake += (targetShake - state.shake) * Math.min(1, delta * 0.008);
}

function spawnPipe(customGap = BASE_PIPE_GAP) {
  const minTop = 90;
  const maxTop = GROUND_Y - customGap - 120;
  const topHeight = minTop + Math.random() * (maxTop - minTop);

  state.pipes.push({
    x: WIDTH + 30,
    width: BASE_PIPE_WIDTH,
    gapY: topHeight + customGap,
    gapHeight: customGap,
    scored: false,
  });
}

function intersectsPipe(pipe, bird) {
  const pipeLeft = pipe.x;
  const pipeRight = pipe.x + pipe.width;
  const birdLeft = bird.x - bird.radius;
  const birdRight = bird.x + bird.radius;
  const birdTop = bird.y - bird.radius;
  const birdBottom = bird.y + bird.radius;

  if (birdRight <= pipeLeft || birdLeft >= pipeRight) {
    return false;
  }

  const hitsTop = birdTop < pipe.gapY - pipe.gapHeight / 2;
  const hitsBottom = birdBottom > pipe.gapY + pipe.gapHeight / 2;

  return hitsTop || hitsBottom;
}

function update(delta) {
  state.cloudOffset += delta * 0.02;
  state.groundOffset += delta * 0.12;
  state.startFlash = Math.max(0, state.startFlash - delta / 280);
  updateSky(delta);

  if (state.mode !== 'playing') {
    return;
  }

  const difficulty = getDifficultySettings();
  const pacedDelta = delta * getPaceMultiplier();
  state.bird.velocity += difficulty.gravity * (pacedDelta / 16.67);
  state.bird.y += state.bird.velocity * (pacedDelta / 16.67);
  state.bird.rotation = Math.min(Math.max(state.bird.velocity / 10, -1.3), 1.2);

  state.pipeTimer += pacedDelta;
  if (state.pipeTimer >= difficulty.interval) {
    spawnPipe(difficulty.gap);
    state.pipeTimer = 0;
  }

  for (const pipe of state.pipes) {
    pipe.x -= difficulty.speed * (pacedDelta / 16.67);

    if (!pipe.scored && pipe.x + pipe.width < state.bird.x) {
      pipe.scored = true;
      state.score += 1;
      state.best = Math.max(state.best, state.score);
      playScore();
      if (state.score >= state.nextEclipseScore) {
        state.nextEclipseScore += ECLIPSE_SCORE_INTERVAL;
        startEclipse();
      }
    }
  }

  state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.width > -20);

  const birdTop = state.bird.y - state.bird.radius;
  const birdBottom = state.bird.y + state.bird.radius;
  const hitCeiling = birdTop <= 0;
  const hitGround = birdBottom >= GROUND_Y;

  if (hitCeiling || hitGround) {
    finishGame();
  }

  for (const pipe of state.pipes) {
    if (intersectsPipe(pipe, state.bird)) {
      finishGame();
      break;
    }
  }
}

function mixColor(colorA, colorB, ratio) {
  const clamp = Math.min(1, Math.max(0, ratio));
  return colorA.map((channel, index) => Math.round(channel + (colorB[index] - channel) * clamp));
}

function drawBackground() {
  const baseDayMix = 0.5 + Math.sin(state.skyPhase * Math.PI * 2 - Math.PI / 2) * 0.5;
  const dayMix = Math.max(0, Math.min(1, baseDayMix));
  const topColor = [125, 224, 255];
  const dayTop = mixColor(topColor, [12, 15, 33], 1 - dayMix);
  const bottomColor = [191, 242, 255];
  const dayBottom = mixColor(bottomColor, [33, 43, 70], 1 - dayMix);

  ctx.fillStyle = `rgb(${dayTop[0]}, ${dayTop[1]}, ${dayTop[2]})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(255, 221, 103, 0.3)';
  ctx.beginPath();
  ctx.arc(state.sun.x, state.sun.y, 50, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(state.sun.x, state.sun.y, state.sun.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#dfeaf6';
  ctx.beginPath();
  ctx.arc(state.moon.x, state.moon.y, state.moon.radius, 0, Math.PI * 2);
  ctx.fill();

  if (state.eclipse && state.eclipseStrength > 0.5) {
    ctx.fillStyle = `rgba(15, 10, 10, ${0.75 * state.eclipseStrength})`;
    ctx.beginPath();
    ctx.arc(state.sun.x, state.sun.y, 42, 0, Math.PI * 2);
    ctx.fill();
  }

  const cloudX = ((-state.cloudOffset * 0.7) % 520) - 120;
  for (let i = 0; i < 5; i += 1) {
    const x = cloudX + i * 140;
    drawCloud(x, 80 + (i % 3) * 50);
  }

  ctx.fillStyle = `rgb(${dayBottom[0]}, ${dayBottom[1]}, ${dayBottom[2]})`;
  ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
}

function drawCloud(x, y) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.arc(x + 22, y - 8, 20, 0, Math.PI * 2);
  ctx.arc(x + 45, y, 16, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround() {
  const offset = state.groundOffset % 40;

  ctx.fillStyle = '#d7b35d';
  ctx.fillRect(0, GROUND_Y, WIDTH, GROUND_HEIGHT);

  ctx.fillStyle = '#7ccf5b';
  ctx.fillRect(0, GROUND_Y + 18, WIDTH, 18);

  for (let x = -40; x < WIDTH + 60; x += 40) {
    const px = x - offset;
    ctx.fillStyle = '#5ebd5d';
    ctx.fillRect(px, GROUND_Y + 26, 18, 12);
    ctx.fillStyle = '#4ca75b';
    ctx.fillRect(px + 12, GROUND_Y + 30, 10, 8);
  }
}

function drawPipe(pipe) {
  const topHeight = pipe.gapY - pipe.gapHeight / 2;
  const bottomY = pipe.gapY + pipe.gapHeight / 2;

  ctx.fillStyle = '#55b95d';
  ctx.fillRect(pipe.x, 0, pipe.width, topHeight);
  ctx.fillRect(pipe.x, bottomY, pipe.width, GROUND_Y - bottomY);

  ctx.fillStyle = '#3ca14c';
  ctx.fillRect(pipe.x - 3, topHeight - 20, pipe.width + 6, 20);
  ctx.fillRect(pipe.x - 3, bottomY, pipe.width + 6, 20);

  ctx.fillStyle = '#6ecf67';
  ctx.fillRect(pipe.x + 8, 0, pipe.width - 16, topHeight);
  ctx.fillRect(pipe.x + 8, bottomY, pipe.width - 16, GROUND_Y - bottomY);
}

function drawBird() {
  const bird = state.bird;
  const skin = SKINS[state.skin];
  const x = bird.x;
  const y = bird.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bird.rotation);

  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, bird.radius, bird.radius * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin.wing;
  ctx.beginPath();
  ctx.ellipse(-8, 7, 12, 8, -0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(7, -4, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1d1d1d';
  ctx.beginPath();
  ctx.arc(9, -4, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff8055';
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(20, 4);
  ctx.lineTo(12, 8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = 'rgba(27, 45, 64, 0.9)';
  ctx.font = 'bold 34px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(state.score), WIDTH / 2, 64);

  if (state.eclipse) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('ECLIPSE MODE', WIDTH / 2, 100);
  }

  if (state.mode === 'gameover') {
    ctx.fillStyle = 'rgba(27, 45, 64, 0.88)';
    ctx.fillRect(60, 220, WIDTH - 120, 190);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px Arial';
    ctx.fillText('Game Over', WIDTH / 2, 280);
    ctx.font = '20px Arial';
    ctx.fillText(`Score: ${state.score}`, WIDTH / 2, 320);
    ctx.fillText(`Best: ${state.best}`, WIDTH / 2, 350);
    ctx.font = '18px Arial';
    ctx.fillText('Press Space or tap to retry', WIDTH / 2, 386);
  }
}

function render() {
  menu.hidden = state.mode !== 'start';
  roundActions.hidden = state.mode !== 'gameover';
  ctx.save();
  if (state.shake > 0.1) {
    ctx.translate(
      Math.sin(state.elapsed * 0.025) * state.shake,
      Math.sin(state.elapsed * 0.034) * state.shake * 0.7
    );
  }

  drawBackground();
  state.pipes.forEach(drawPipe);
  drawGround();
  drawBird();
  drawHud();
  if (state.eclipseFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * state.eclipseFlash / ECLIPSE_FLASH_DURATION})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.restore();

  if (state.startFlash > 0) {
    const flash = state.startFlash;
    ctx.fillStyle = `rgba(255, 255, 245, ${flash * 0.88})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

let lastTime = 0;
function gameLoop(timestamp) {
  const delta = timestamp - lastTime || 16.67;
  lastTime = timestamp;

  update(delta);
  render();
  requestAnimationFrame(gameLoop);
}

playerNameInput.value = readStoredValue(STORAGE_KEYS.playerName, 'Player').slice(0, 16) || 'Player';
createSkinPicker();
updatePlayerIdentity();
playerNameInput.addEventListener('input', updatePlayerIdentity);
playerNameInput.addEventListener('change', savePlayerName);
menu.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const skinButton = target.closest('[data-skin]');
  if (skinButton) {
    state.skin = skinButton.dataset.skin;
    updateSkinPreview();
    writeStoredValue(STORAGE_KEYS.skin, state.skin);
    return;
  }

  const playButton = target.closest('[data-play], #playButton');
  if (playButton) {
    savePlayerName();
    startGame();
    return;
  }

  const pageButton = target.closest('[data-page]');
  if (pageButton) {
    showMenuPage(pageButton.dataset.page);
  }
});
document.getElementById('returnToMenu').addEventListener('click', () => {
  resetGame();
  showMenuPage('home');
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof Element && event.target.closest('.menu-ui, .round-actions')) {
    return;
  }
  if (state.mode === 'start' && currentMenuPage !== 'home') return;

  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    flap();
  }
});

window.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('.menu-ui, .round-actions')) {
    return;
  }
  flap();
});

resetGame();requestAnimationFrame(gameLoop);