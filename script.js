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

let audioCtx = null;

const state = {
  mode: 'start',
  score: 0,
  best: 0,
  elapsed: 0,
  eclipse: false,
  eclipseStrength: 0,
  skyPhase: 0,
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

function resetGame() {
  state.mode = 'start';
  state.score = 0;
  state.elapsed = 0;
  state.eclipse = false;
  state.eclipseStrength = 0;
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
    state.pipes = [];
    state.pipeTimer = 0;
  }

  state.mode = 'playing';
  state.bird.y = HEIGHT / 2 - 18;
  state.bird.velocity = FLAP_FORCE;
  state.bird.rotation = -1.2;
  state.startFlash = 1;
  state.shake = Math.max(state.shake, 9);
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
  const eclipseBoost = state.eclipse ? 1.18 + Math.min(0.9, state.score * 0.025) : 1;
  const speed = BASE_PIPE_SPEED * baseBoost * eclipseBoost;
  const gap = Math.max(126, BASE_PIPE_GAP - state.score * 1.1 - (state.eclipse ? 18 : 0));
  const interval = Math.max(1080, BASE_PIPE_INTERVAL / baseBoost / (state.eclipse ? 1.08 : 1));
  const gravity = GRAVITY * (1 + state.score * 0.007 + (state.eclipse ? 0.12 : 0));

  return { speed, gap, interval, gravity };
}

function updateSky(delta) {
  state.elapsed += delta;
  state.skyPhase = (state.elapsed % 24000) / 24000;

  const orbit = state.skyPhase * Math.PI * 2;
  const orbitRadiusX = WIDTH * 0.2;
  const orbitRadiusY = 70;

  state.sun.x = WIDTH * 0.5;
  state.sun.y = 115;
  state.moon.x = WIDTH * 0.5 + Math.cos(orbit + Math.PI / 2) * orbitRadiusX;
  state.moon.y = 115 + Math.sin(orbit + Math.PI / 2) * orbitRadiusY;

  const dx = state.sun.x - state.moon.x;
  const dy = state.sun.y - state.moon.y;
  const distance = Math.hypot(dx, dy);
  const overlapStrength = Math.max(0, 1 - distance / 34);
  state.eclipseStrength = overlapStrength;
  state.eclipse = overlapStrength > 0.55;

  if (state.eclipse) {
    state.shake = Math.min(14, state.shake + delta * 0.025);
  } else {
    state.shake = Math.max(0, state.shake - delta * 0.025);
  }
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
  state.bird.velocity += difficulty.gravity * (delta / 16.67);
  state.bird.y += state.bird.velocity * (delta / 16.67);
  state.bird.rotation = Math.min(Math.max(state.bird.velocity / 10, -1.3), 1.2);

  state.pipeTimer += delta;
  if (state.pipeTimer >= difficulty.interval) {
    spawnPipe(difficulty.gap);
    state.pipeTimer = 0;
  }

  for (const pipe of state.pipes) {
    pipe.x -= difficulty.speed * (delta / 16.67);

    if (!pipe.scored && pipe.x + pipe.width < state.bird.x) {
      pipe.scored = true;
      state.score += 1;
      state.best = Math.max(state.best, state.score);
      playScore();
    }
  }

  state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.width > -20);

  const birdTop = state.bird.y - state.bird.radius;
  const birdBottom = state.bird.y + state.bird.radius;
  const hitCeiling = birdTop <= 0;
  const hitGround = birdBottom >= GROUND_Y;

  if (hitCeiling || hitGround) {
    state.mode = 'gameover';
    playCrash();
  }

  for (const pipe of state.pipes) {
    if (intersectsPipe(pipe, state.bird)) {
      state.mode = 'gameover';
      playCrash();
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
  const eclipseMix = state.eclipse ? 0.8 : 0;
  const dayMix = Math.max(0, Math.min(1, baseDayMix - eclipseMix * 0.65));
  const topColor = mixColor([125, 224, 255], [145, 20, 20], eclipseMix);
  const dayTop = mixColor(topColor, [12, 15, 33], 1 - dayMix);
  const bottomColor = mixColor([191, 242, 255], [110, 28, 28], eclipseMix);
  const dayBottom = mixColor(bottomColor, [33, 43, 70], 1 - dayMix);

  ctx.fillStyle = `rgb(${dayTop[0]}, ${dayTop[1]}, ${dayTop[2]})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const sunGlow = state.eclipse ? 0.8 : 1;
  ctx.fillStyle = `rgba(255, 221, 103, ${0.3 * sunGlow})`;
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

  if (state.eclipse) {
    ctx.fillStyle = `rgba(180, 30, 30, ${0.2 + state.eclipseStrength * 0.6})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

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
  const x = bird.x;
  const y = bird.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bird.rotation);

  ctx.fillStyle = '#ffd54d';
  ctx.beginPath();
  ctx.ellipse(0, 0, bird.radius, bird.radius * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffb61e';
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

  ctx.strokeStyle = '#1d1d1d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(18, 5);
  ctx.stroke();

  ctx.restore();
}

function drawStartScreen() {
  ctx.fillStyle = 'rgba(12, 18, 30, 0.22)';
  ctx.fillRect(52, 170, WIDTH - 104, 260);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px Arial';
  ctx.fillText('FLAPPY SKY', WIDTH / 2, 240);

  ctx.font = 'bold 22px Arial';
  ctx.fillText('SPACE / TAP TO START', WIDTH / 2, 288);

  ctx.font = '18px Arial';
  ctx.fillText('Avoid the pipes and outrun the eclipse', WIDTH / 2, 332);
  ctx.fillText('The longer you survive, the harder it gets', WIDTH / 2, 364);
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

  if (state.mode === 'start') {
    drawStartScreen();
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
  ctx.save();
  if (state.shake > 0.1) {
    ctx.translate(
      (Math.random() - 0.5) * state.shake * 2.8,
      (Math.random() - 0.5) * state.shake * 2.8
    );
  }

  drawBackground();
  state.pipes.forEach(drawPipe);
  drawGround();
  drawBird();
  drawHud();
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

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    flap();
  }
});

window.addEventListener('pointerdown', () => {
  flap();
});

resetGame();
requestAnimationFrame(gameLoop);
