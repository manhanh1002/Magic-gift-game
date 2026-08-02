import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createInitialGameState, rollDiceForRound, resolveAuctions } from './game/logic';
import { Icon } from './game/types';
import type { GameState, PlayerId } from './game/types';
import { generateComputerBids, placeComputerDice, doComputerInitialSetup } from './ai/computer';
import { calculateScore, checkAndAwardFormations } from './game/scoring';

let gameState: GameState;

const scene = new THREE.Scene();

// ── Atmospheric Fog ──────────────────────────────────────────────
scene.fog = new THREE.FogExp2(0x1a3a1a, 0.018);

// ── Sky Dome ─────────────────────────────────────────────────────
function buildSkyDome() {
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  // Vertex-colored gradient: deep indigo top → teal horizon
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d')!;
  const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0,  '#0d1b3e');   // deep night blue at zenith
  grad.addColorStop(0.35, '#1a3a5c');   // midnight teal
  grad.addColorStop(0.65, '#2d6e3e');   // forest green at horizon
  grad.addColorStop(1.0,  '#1a3a1a');   // dark grass line
  skyCtx.fillStyle = grad;
  skyCtx.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}
buildSkyDome();

// ── Stars ─────────────────────────────────────────────────────────
function buildStars() {
  const positions: number[] = [];
  for (let i = 0; i < 1200; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.random() * Math.PI * 0.55; // upper hemisphere only
    const r     = 180;
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.85 });
  scene.add(new THREE.Points(geo, mat));
}
buildStars();

// ── Ground Plane ─────────────────────────────────────────────────
const groundGeo = new THREE.CircleGeometry(60, 64);
const groundCanvas = document.createElement('canvas');
groundCanvas.width = 512; groundCanvas.height = 512;
const gCtx = groundCanvas.getContext('2d')!;
const groundGrad = gCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
groundGrad.addColorStop(0.0,  '#2a5c2a');
groundGrad.addColorStop(0.5,  '#1e4a1e');
groundGrad.addColorStop(1.0,  '#0f2a0f');
gCtx.fillStyle = groundGrad;
gCtx.fillRect(0, 0, 512, 512);
const groundTex = new THREE.CanvasTexture(groundCanvas);
const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

// ── Firefly Particles ────────────────────────────────────────────
const fireflyPositions: number[] = [];
const fireflyVelocities: number[] = [];
for (let i = 0; i < 180; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 2 + Math.random() * 14;
  fireflyPositions.push(r * Math.cos(a), Math.random() * 4 + 0.2, r * Math.sin(a));
  fireflyVelocities.push((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.01);
}
const fireflyGeo = new THREE.BufferGeometry();
fireflyGeo.setAttribute('position', new THREE.Float32BufferAttribute(fireflyPositions, 3));
const fireflyMat = new THREE.PointsMaterial({
  color: 0xaaffaa, size: 0.18, sizeAttenuation: true,
  transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
});
const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
scene.add(fireflies);

function animateFireflies() {
  const pos = fireflyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + fireflyVelocities[i * 3]);
    pos.setY(i, pos.getY(i) + fireflyVelocities[i * 3 + 1]);
    pos.setZ(i, pos.getZ(i) + fireflyVelocities[i * 3 + 2]);
    // Bounce back
    const y = pos.getY(i);
    if (y < 0.1 || y > 5.5) fireflyVelocities[i * 3 + 1] *= -1;
    const dx = pos.getX(i), dz = pos.getZ(i);
    if (Math.sqrt(dx*dx + dz*dz) > 16) {
      fireflyVelocities[i * 3] *= -1;
      fireflyVelocities[i * 3 + 2] *= -1;
    }
  }
  pos.needsUpdate = true;
}

// ── Central Magic Tower ──────────────────────────────────────────
function buildMagicTower() {
  // Base pillar
  const pillarGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.5, 8);
  const stoneTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = '#3a3560'; x.fillRect(0, 0, 64, 128);
    x.fillStyle = '#2a2545';
    for (let i = 0; i < 8; i++) {
      x.fillRect(0, i * 16, 64, 2);
    }
    return new THREE.CanvasTexture(c);
  })();
  const pillarMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, metalness: 0.1 });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.set(0, 1.75, 0);
  pillar.castShadow = true;
  scene.add(pillar);

  // Conical cap
  const coneGeo = new THREE.ConeGeometry(0.6, 1.2, 8);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x5c1a8a, roughness: 0.6, metalness: 0.3 });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(0, 4.1, 0);
  cone.castShadow = true;
  scene.add(cone);

  // Glowing orb at top
  const orbGeo = new THREE.SphereGeometry(0.22, 16, 16);
  const orbMat = new THREE.MeshStandardMaterial({
    color: 0x88ffcc, emissive: 0x44ffaa, emissiveIntensity: 2.5,
    transparent: true, opacity: 0.92,
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.set(0, 4.85, 0);
  scene.add(orb);

  // Orb point light
  const orbLight = new THREE.PointLight(0x44ffaa, 2.5, 12);
  orbLight.position.set(0, 4.85, 0);
  scene.add(orbLight);

  // Slow orb pulse
  let t = 0;
  const pulse = () => { t += 0.02; orbLight.intensity = 2 + Math.sin(t) * 0.8; requestAnimationFrame(pulse); };
  pulse();

  // Floating rune rings
  const runeAngles = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3];
  runeAngles.forEach((angle, i) => {
    const rGeo = new THREE.TorusGeometry(0.12, 0.03, 8, 16);
    const rMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0xffaa00, emissiveIntensity: 1.5 });
    const rune = new THREE.Mesh(rGeo, rMat);
    const orbitR = 0.8;
    rune.position.set(orbitR * Math.cos(angle), 3.6 + i * 0.15, orbitR * Math.sin(angle));
    scene.add(rune);
    // Animate orbit
    let rt = angle;
    const spin = () => {
      rt += 0.008;
      rune.position.x = orbitR * Math.cos(rt);
      rune.position.z = orbitR * Math.sin(rt);
      rune.rotation.y = rt;
      requestAnimationFrame(spin);
    };
    spin();
  });
}
buildMagicTower();

// ── Scattered Stone Rings ─────────────────────────────────────────
function buildStonePillars() {
  const positions = [
    {x:  8, z:  3, h: 0.8}, {x: -8, z:  2, h: 1.2}, {x:  5, z: -9, h: 0.6},
    {x: -6, z: -8, h: 1.0}, {x: 10, z: -5, h: 0.9}, {x: -10, z:  6, h: 0.7},
  ];
  const stoneMatSmall = new THREE.MeshStandardMaterial({ color: 0x4a4060, roughness: 0.95 });
  positions.forEach(p => {
    const g = new THREE.CylinderGeometry(0.15, 0.2, p.h, 6);
    const m = new THREE.Mesh(g, stoneMatSmall);
    m.position.set(p.x, p.h / 2, p.z);
    m.castShadow = true;
    scene.add(m);
  });
}
buildStonePillars();

// ── Lighting ─────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 15, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 5;
controls.maxDistance = 40;

// Ambient — soft blue-green moonlight
const ambientLight = new THREE.AmbientLight(0x4a6e8a, 0.7);
scene.add(ambientLight);

// Primary directional — warm moon
const dirLight = new THREE.DirectionalLight(0xd0eeff, 1.1);
dirLight.position.set(15, 30, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width  = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far  = 100;
dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -25;
dirLight.shadow.camera.right = dirLight.shadow.camera.top = 25;
scene.add(dirLight);

// Rim light — purple arcane from below
const rimLight = new THREE.DirectionalLight(0x7c3dbf, 0.5);
rimLight.position.set(-10, 5, -15);
scene.add(rimLight);

// Ground bounce — warm green
const bounceLight = new THREE.HemisphereLight(0x2a6e2a, 0x0f2a0f, 0.4);
scene.add(bounceLight);

// ── Emoji Dice Textures ───────────────────────────────────────────
function createEmojiTexture(emoji: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext('2d')!;

  // Rich parchment face
  const faceGrad = context.createRadialGradient(64, 64, 0, 64, 64, 72);
  faceGrad.addColorStop(0,   '#f5e9c8');
  faceGrad.addColorStop(0.7, '#dfc98a');
  faceGrad.addColorStop(1,   '#c4a855');
  context.fillStyle = faceGrad;
  context.roundRect(4, 4, 120, 120, 14);
  context.fill();

  // Subtle inner stroke
  context.strokeStyle = 'rgba(120,80,20,0.35)';
  context.lineWidth = 3;
  context.roundRect(8, 8, 112, 112, 10);
  context.stroke();

  context.font = '78px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, 64, 72);

  return new THREE.CanvasTexture(canvas);
}

const faceMaterials: Record<string, THREE.MeshStandardMaterial> = {};
for (const icon of Object.values(Icon)) {
  faceMaterials[icon] = new THREE.MeshStandardMaterial({
    map: createEmojiTexture(icon),
    roughness: 0.35,
    metalness: 0.15,
  });
}

function get6SidedDieMaterials(winIcon: Icon): THREE.MeshStandardMaterial[] {
  const allIcons = Object.values(Icon);
  const others = allIcons.filter(i => i !== winIcon);
  // BoxGeometry face indices: 0 (+X), 1 (-X), 2 (+Y - Top), 3 (-Y - Bottom), 4 (+Z), 5 (-Z)
  return [
    faceMaterials[others[0]], // +X
    faceMaterials[others[1]], // -X
    faceMaterials[winIcon],   // +Y (TOP FACE -> WINNING ICON)
    faceMaterials[others[2]], // -Y (Bottom)
    faceMaterials[others[3]], // +Z
    faceMaterials[others[4]], // -Z
  ];
}

// Board material — carved stone circle
const boardGeometry = new THREE.PlaneGeometry(3.3, 3.3);
function createBoardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  // Dark stone base
  const bg = x.createRadialGradient(128, 128, 0, 128, 128, 140);
  bg.addColorStop(0,   '#3a2e55');
  bg.addColorStop(0.7, '#2a1f45');
  bg.addColorStop(1,   '#180f30');
  x.fillStyle = bg;
  x.fillRect(0, 0, 256, 256);
  // Rune circle
  x.strokeStyle = 'rgba(180,130,255,0.4)';
  x.lineWidth = 3;
  x.beginPath(); x.arc(128, 128, 110, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(128, 128, 80,  0, Math.PI * 2); x.stroke();
  // Grid lines
  x.strokeStyle = 'rgba(200,170,255,0.25)';
  x.lineWidth = 1.5;
  for (let i = 1; i <= 2; i++) {
    const v = i * (256 / 3);
    x.beginPath(); x.moveTo(v, 0); x.lineTo(v, 256); x.stroke();
    x.beginPath(); x.moveTo(0, v); x.lineTo(256, v); x.stroke();
  }
  return new THREE.CanvasTexture(c);
}
const boardMaterial = new THREE.MeshStandardMaterial({ map: createBoardTexture(), roughness: 0.8, metalness: 0.1 });

let diceMeshes: THREE.Mesh[] = [];
let boardMeshes: THREE.Mesh[] = [];
let gridHelpers: THREE.GridHelper[] = [];
const playerPositions: Record<PlayerId, {x: number, z: number, rotation: number, mesh?: THREE.Mesh}> = {};

export function renderBoard(state: GameState, playerId: PlayerId, pos: {x: number, z: number, rotation: number}) {
  const board = state.players[playerId].board;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const icon = board[r][c];
      if (icon) {
        const geometry = new THREE.BoxGeometry(0.88, 0.88, 0.88);
        const mesh = new THREE.Mesh(geometry, get6SidedDieMaterials(icon));
        
        const localX = c * 1.1 - 1.1;
        const localZ = r * 1.1 - 1.1;
        
        const rot = pos.rotation;
        const worldX = pos.x + localX * Math.cos(rot) - localZ * Math.sin(rot);
        const worldZ = pos.z + localX * Math.sin(rot) + localZ * Math.cos(rot);
        
        mesh.position.set(worldX, 0.44, worldZ);
        mesh.rotation.y = -rot;
        mesh.castShadow = true;
        scene.add(mesh);
        diceMeshes.push(mesh);
      }
    }
  }
}

function createBoards() {
  boardMeshes.forEach(m => scene.remove(m));
  gridHelpers.forEach(h => scene.remove(h));
  diceMeshes.forEach(d => scene.remove(d));
  boardMeshes = [];
  gridHelpers = [];
  diceMeshes = [];

  const numPlayers = gameState.playerOrder.length;
  const radius = Math.max(5, numPlayers * 1.5);

  gameState.playerOrder.forEach((pid, index) => {
    const angle = (index / numPlayers) * Math.PI * 2;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const rotation = angle;
    
    // Board platform — slight raised stone slab
    const slabGeo = new THREE.BoxGeometry(3.6, 0.12, 3.6);
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x3a2e55, roughness: 0.8, metalness: 0.15 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(x, -0.06, z);
    slab.rotation.y = -rotation;
    slab.receiveShadow = true;
    slab.castShadow  = true;
    scene.add(slab);
    boardMeshes.push(slab);

    // Board surface on top of slab
    const mesh = new THREE.Mesh(boardGeometry, boardMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -rotation;
    mesh.position.set(x, 0.01, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    boardMeshes.push(mesh);
    
    playerPositions[pid] = { x, z, rotation, mesh };

    // Subtle glowing grid lines
    const grid = new THREE.GridHelper(3.3, 3, 0xaa88ff, 0x6644aa);
    grid.position.set(x, 0.02, z);
    grid.rotation.y = -rotation;
    scene.add(grid);
    gridHelpers.push(grid);

    // Glow corner gems
    const gemGeo = new THREE.OctahedronGeometry(0.12, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xcc88ff, emissive: 0x7722bb, emissiveIntensity: 1.2,
      roughness: 0.1, metalness: 0.8,
    });
    [[-1.65, -1.65], [-1.65, 1.65], [1.65, -1.65], [1.65, 1.65]].forEach(([lx, lz]) => {
      const wx = x + lx * Math.cos(rotation) - lz * Math.sin(rotation);
      const wz = z + lx * Math.sin(rotation) + lz * Math.cos(rotation);
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.set(wx, 0.14, wz);
      gem.castShadow = true;
      scene.add(gem);
      boardMeshes.push(gem);
    });

    // Per-board point light (faint arcane glow)
    const bLight = new THREE.PointLight(0x9955ff, 0.6, 5);
    bLight.position.set(x, 0.8, z);
    scene.add(bLight);
    boardMeshes.push(bLight as unknown as THREE.Mesh);
  });
}

export function updateScene() {
  diceMeshes.forEach(mesh => scene.remove(mesh));
  diceMeshes = [];
  
  gameState.playerOrder.forEach(pid => {
    renderBoard(gameState, pid, playerPositions[pid]);
  });
}

// UI Elements
const mainMenu = document.getElementById('main-menu')!;
const playerCountSelect = document.getElementById('player-count') as HTMLSelectElement;
const startGameBtn = document.getElementById('start-game-btn')!;

const hud = document.getElementById('hud')!;
const hudDiceSupply = document.getElementById('dice-supply')!;
const hudTurnIndicator = document.getElementById('turn-indicator')!;
const playersHudContainer = document.getElementById('players-hud-container')!;

const logPanel = document.getElementById('game-log')!;
const logContent = document.getElementById('log-content')!;

const liveScoreboardPanel = document.getElementById('live-scoreboard')!;
const scoreboardTableContainer = document.getElementById('scoreboard-table-container')!;

function renderLiveScoreboard() {
  if (!gameState) return;
  let html = `
    <table class="live-scoring-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Form. VP</th>
          <th>Form. 🪙</th>
          <th>Rem. 🪙</th>
          <th>🪙→VP</th>
          <th>Total VP</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const pid of gameState.playerOrder) {
    const p = gameState.players[pid];
    const estGoldVp = Math.floor(p.gold / 2);
    const totalEstVp = p.vp + estGoldVp;
    const isHuman = pid === 'player';

    html += `
      <tr>
        <td>${isHuman ? '⚔ ' : '🤖 '}${p.name}</td>
        <td>${p.awardedFormationVp}</td>
        <td>${p.awardedFormationGold}</td>
        <td>${p.gold}</td>
        <td>${estGoldVp}</td>
        <td class="score-total">${totalEstVp}</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  scoreboardTableContainer.innerHTML = html;
}

const bidPanel = document.getElementById('bidding-panel')!;
const bidInputsContainer = document.getElementById('bid-inputs')!;
const bidGoldAvailable = document.getElementById('bid-gold-available')!;
const bidError = document.getElementById('bid-error')!;
const submitBidsBtn = document.getElementById('submit-bids') as HTMLButtonElement;

const msgOverlay = document.getElementById('message-overlay')!;
const msgTitle = document.getElementById('message-title')!;
const msgBody = document.getElementById('message-body')!;
const msgNext = document.getElementById('message-next') as HTMLButtonElement;

// Rolling Modal Elements
const diceRollingModal = document.getElementById('dice-rolling-modal')!;
const rollingModalTitle = document.getElementById('rolling-modal-title')!;
const rollingModalSubtitle = document.getElementById('rolling-modal-subtitle')!;
const rollingDiceContainer = document.getElementById('rolling-dice-container')!;
const rollAuctionSummary = document.getElementById('roll-auction-summary')!;
const rollModalContinue = document.getElementById('roll-modal-continue') as HTMLButtonElement;

const setupPickPanel = document.getElementById('setup-pick-panel')!;
const setupIconsContainer = document.getElementById('setup-icons-container')!;

const instructionBanner = document.getElementById('instruction-banner')!;
const instructionText = document.getElementById('instruction-text')!;
const placementIconSpan = document.getElementById('placement-icon')!;
const confirmPlacementBtn = document.getElementById('confirm-placement-btn') as HTMLButtonElement;

// Rules Modal Elements
const rulesModal = document.getElementById('rules-modal')!;
const rulesBtnMenu = document.getElementById('rules-btn-menu')!;
const rulesBtnHud = document.getElementById('rules-btn-hud')!;
const closeRulesBtn = document.getElementById('close-rules-btn')!;
const tabBtnEn = document.getElementById('tab-btn-en')!;
const tabBtnVi = document.getElementById('tab-btn-vi')!;
const rulesContentEn = document.getElementById('rules-content-en')!;
const rulesContentVi = document.getElementById('rules-content-vi')!;

const openRules = () => rulesModal.classList.remove('hidden');
const closeRules = () => rulesModal.classList.add('hidden');

rulesBtnMenu.addEventListener('click', openRules);
rulesBtnHud.addEventListener('click', openRules);
closeRulesBtn.addEventListener('click', closeRules);

tabBtnEn.addEventListener('click', () => {
  tabBtnEn.classList.add('active');
  tabBtnVi.classList.remove('active');
  rulesContentEn.classList.remove('hidden');
  rulesContentVi.classList.add('hidden');
});

tabBtnVi.addEventListener('click', () => {
  tabBtnVi.classList.add('active');
  tabBtnEn.classList.remove('active');
  rulesContentVi.classList.remove('hidden');
  rulesContentEn.classList.add('hidden');
});

// Raycaster setup for manual placement
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.01);
const intersectionPoint = new THREE.Vector3();

let currentDieToPlace: Icon | null = null;
let selectedCell: {r: number, c: number} | null = null;
let isPlacementPhaseActive = false;

window.addEventListener('click', (event) => {
  if (!gameState) return;
  const targetEl = event.target as HTMLElement;
  if (targetEl && (targetEl.tagName === 'BUTTON' || targetEl.tagName === 'INPUT' || targetEl.closest('.panel-modal') || targetEl.closest('.side-panel'))) {
    return;
  }

  if (!currentDieToPlace && !isPlacementPhaseActive) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const pos = playerPositions['player'];
  if (!pos) return;

  if (raycaster.ray.intersectPlane(boardPlane, intersectionPoint)) {
    const dx = intersectionPoint.x - pos.x;
    const dz = intersectionPoint.z - pos.z;

    const rot = pos.rotation;
    const localX = dx * Math.cos(rot) + dz * Math.sin(rot);
    const localZ = -dx * Math.sin(rot) + dz * Math.cos(rot);

    const c = Math.floor((localX + 1.65) / 1.1);
    const r = Math.floor((localZ + 1.65) / 1.1);

    if (r >= 0 && r < 3 && c >= 0 && c < 3) {
      const p = gameState.players.player;

      // CASE 1: Player is placing a newly won die
      if (currentDieToPlace) {
        if (!p.board[r][c]) {
          p.board[r][c] = currentDieToPlace;
          gameState.log.push(`You placed ${currentDieToPlace} at row ${r+1}, col ${c+1}.`);
          checkAndAwardFormations(gameState, 'player');
          currentDieToPlace = null;
          updateScene();

          if (gameState.roundPhase === 'initial-setup') {
            instructionBanner.classList.add('hidden');
            gameState.diceSupply--;
            finishInitialSetup();
          } else {
            handleNextManualPlacement();
          }
        }
      }
      // CASE 2: Rearranging / Swapping placed dice
      else if (isPlacementPhaseActive) {
        if (selectedCell === null) {
          if (p.board[r][c]) {
            selectedCell = { r, c };
            instructionText.innerHTML = `Selected <strong>${p.board[r][c]}</strong> at (${r+1},${c+1}). Click another spot to move/swap.`;
          }
        } else {
          if (selectedCell.r === r && selectedCell.c === c) {
            selectedCell = null;
            updatePlacementInstruction();
          } else {
            const iconA = p.board[selectedCell.r][selectedCell.c];
            const iconB = p.board[r][c];
            p.board[selectedCell.r][selectedCell.c] = iconB;
            p.board[r][c] = iconA;

            if (iconB) {
              gameState.log.push(`You swapped ${iconA} at (${selectedCell.r+1},${selectedCell.c+1}) with ${iconB} at (${r+1},${c+1}).`);
            } else {
              gameState.log.push(`You moved ${iconA} to (${r+1},${c+1}).`);
            }
            checkAndAwardFormations(gameState, 'player');
            selectedCell = null;
            updateScene();
            updatePlacementInstruction();
          }
        }
      }
    }
  }
});

Object.values(Icon).forEach(icon => {
  // Setup inputs
  const div = document.createElement('div');
  div.className = 'bid-input-group';
  div.innerHTML = `
    <span>${icon}</span>
    <input type="number" min="0" value="0" data-icon="${icon}" />
  `;
  bidInputsContainer.appendChild(div);

  // Setup picker buttons
  const btn = document.createElement('button');
  btn.innerHTML = `<span style="font-size:32px;">${icon}</span>`;
  btn.onclick = () => {
    setupPickPanel.classList.add('hidden');
    currentDieToPlace = icon as Icon;
    placementIconSpan.textContent = currentDieToPlace;
    instructionBanner.classList.remove('hidden');
  };
  setupIconsContainer.appendChild(btn);
});

startGameBtn.addEventListener('click', () => {
  const numPlayers = parseInt(playerCountSelect.value);
  gameState = createInitialGameState(numPlayers);
  createBoards();
  
  camera.position.set(playerPositions['player'].x, 8, playerPositions['player'].z + 10);
  controls.target.set(0, 0, 0);
  
  mainMenu.classList.add('hidden');
  hud.classList.remove('hidden');
  logPanel.classList.remove('hidden');
  liveScoreboardPanel.classList.remove('hidden');
  
  startInitialSetup();
});

function startInitialSetup() {
  gameState.roundPhase = 'initial-setup';
  updateHUD();
  setupPickPanel.classList.remove('hidden');
}

function finishInitialSetup() {
  gameState.playerOrder.forEach(pid => {
    if (pid !== 'player') doComputerInitialSetup(gameState, pid);
  });
  updateHUD();
  startRound();
}

function updateLog() {
  logContent.innerHTML = gameState.log.map(entry => `<p>${entry}</p>`).join('');
  logContent.scrollTop = logContent.scrollHeight;
}

function updateHUD() {
  playersHudContainer.innerHTML = '';
  gameState.playerOrder.forEach(pid => {
    const p = gameState.players[pid];
    const div = document.createElement('div');
    div.className = 'player-info';
    const filled = p.board.flat().filter(Boolean).length;
    const isHuman = pid === 'player';
    div.innerHTML = `
      <h4>${isHuman ? '⚔ ' : '🤖 '}${p.name}</h4>
      <p>💰 ${p.gold} gold &nbsp;|&nbsp; 🎲 ${filled}/9</p>
    `;
    playersHudContainer.appendChild(div);
  });

  hudDiceSupply.textContent = gameState.diceSupply.toString();
  const firstP = gameState.players[gameState.playerOrder[gameState.firstPlayerIndex]];
  hudTurnIndicator.textContent = `First: ${firstP.name}`;
  bidGoldAvailable.textContent = gameState.players['player'].gold.toString();
  
  updateLog();
  renderLiveScoreboard();
  updateScene();
}

function checkGameEnd() {
  let someoneFilled = false;
  let someoneInstantWin = false;

  for (const pid of gameState.playerOrder) {
    const p = gameState.players[pid];
    const score = calculateScore(p.board, p.gold);
    if (score.legendary) someoneInstantWin = true;

    let count = 0;
    for (let r=0; r<3; r++) {
      for (let c=0; c<3; c++) {
        if (p.board[r][c]) count++;
      }
    }
    if (count >= 9) someoneFilled = true;
  }

  if (someoneFilled || someoneInstantWin || gameState.diceSupply <= 0) {
    let bestScore = -1;
    let bestGold = -1;
    let winners: string[] = [];
    
    // Build an HTML table for detailed scoring
    let resultsText = `
      <table class="scoring-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Form. VP</th>
            <th>Form. 🪙</th>
            <th>Rem. 🪙</th>
            <th>Total 🪙</th>
            <th>🪙 → VP</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const pid of gameState.playerOrder) {
      const p = gameState.players[pid];
      const score = calculateScore(p.board, p.gold);
      
      if (score.legendary) {
        resultsText += `
          <tr class="legendary-row">
            <td>${p.name}</td>
            <td colspan="5">🌟 SIX IDENTICAL ICONS (INSTANT WIN) 🌟</td>
            <td class="score-total">WIN</td>
          </tr>
        `;
        bestScore = 9999;
        winners = [p.name];
        break;
      }

      resultsText += `
        <tr>
          <td>${p.name}</td>
          <td>${score.formationVp}</td>
          <td>${score.formationGold}</td>
          <td>${score.goldBeforeConversion}</td>
          <td>${score.totalGold}</td>
          <td>${score.goldVp}</td>
          <td class="score-total">${score.totalVp}</td>
        </tr>
      `;
      
      if (score.totalVp > bestScore) {
        bestScore = score.totalVp;
        bestGold = p.gold;
        winners = [p.name];
      } else if (score.totalVp === bestScore) {
        if (p.gold > bestGold) {
          bestGold = p.gold;
          winners = [p.name];
        } else if (p.gold === bestGold) {
          winners.push(p.name);
        }
      }
    }

    resultsText += `</tbody></table>`;
    
    const winnerStr = winners.join(' and ');
    gameState.log.push(`Game Over! Winner: ${winnerStr}`);
    updateLog();
    showMessage('Game Over', `Winner: ${winnerStr}<br><br>${resultsText}`);
    msgNext.textContent = 'Main Menu';
    msgNext.onclick = () => {
      msgOverlay.classList.add('hidden');
      hud.classList.add('hidden');
      logPanel.classList.add('hidden');
      liveScoreboardPanel.classList.add('hidden');
      bidPanel.classList.add('hidden');
      instructionBanner.classList.add('hidden');
      mainMenu.classList.remove('hidden');
    };
    return true;
  }
  return false;
}

function startRound() {
  if (checkGameEnd()) return;

  // Clear all bids for the new round
  Object.values(Icon).forEach(icon => gameState.currentBids[icon] = []);
  
  document.querySelectorAll('#bid-inputs input').forEach(i => (i as HTMLInputElement).value = '0');
  bidError.textContent = '';
  
  gameState.roundPhase = 'bidding';
  gameState.currentBidderIndex = 0;
  
  processNextBidder();
}

function updateLiveBidsUI() {
  const liveList = document.getElementById('live-bids-list')!;
  liveList.innerHTML = '';
  Object.values(Icon).forEach(icon => {
    const bids = gameState.currentBids[icon];
    const highest = bids.length > 0 ? Math.max(...bids.map(b => b.amount)) : null;
    const chip = document.createElement('div');
    chip.className = 'live-bid-item';
    chip.innerHTML = `
      <span class="live-bid-icon">${icon}</span>
      ${highest !== null
        ? `<span class="live-bid-val">${highest}g</span>`
        : `<span class="live-bid-none">—</span>`
      }`;
    liveList.appendChild(chip);
  });
}

function processNextBidder() {
  if (gameState.currentBidderIndex >= gameState.playerOrder.length) {
    // All players have bid
    bidPanel.classList.add('hidden');
    resolveRound();
    return;
  }

  updateHUD();
  const numPlayers = gameState.playerOrder.length;
  // Offset by first player
  const actualIndex = (gameState.firstPlayerIndex + gameState.currentBidderIndex) % numPlayers;
  const pid = gameState.playerOrder[actualIndex];

  if (pid === 'player') {
    // Human turn
    updateLiveBidsUI();
    bidPanel.classList.remove('hidden');
    msgOverlay.classList.add('hidden');
    
    gameState.log.push(`It's your turn to bid.`);
    updateLog();
  } else {
    // AI turn
    bidPanel.classList.add('hidden');
    
    gameState.log.push(`>>> ${gameState.players[pid].name} is bidding...`);
    updateLog();
    
    setTimeout(() => {
      const compBids = generateComputerBids(gameState, pid);
      Object.entries(compBids).forEach(([iconStr, amount]) => {
        if (amount > 0) {
          const icon = iconStr as Icon;
          gameState.currentBids[icon].push({ playerId: pid, amount });
          gameState.log.push(`${gameState.players[pid].name} bid ${amount} Gold on ${icon}.`);
        }
      });
      gameState.currentBidderIndex++;
      processNextBidder();
    }, 1500); // 1.5s delay so human can read the log
  }
}

submitBidsBtn.addEventListener('click', () => {
  let totalBid = 0;
  const playerBids: Record<string, number> = {};
  
  let valid = true;
  document.querySelectorAll('#bid-inputs input').forEach(inputEl => {
    const el = inputEl as HTMLInputElement;
    const val = parseInt(el.value) || 0;
    const icon = el.dataset.icon as Icon;
    
    if (val < 0) {
      bidError.textContent = 'Cannot bid negative amounts.';
      valid = false;
    }
    
    // Unique Bid Validation
    if (val > 0) {
      const existingBids = gameState.currentBids[icon].map(b => b.amount);
      if (existingBids.includes(val)) {
        bidError.textContent = `Someone already bid ${val} Gold on ${icon}. Your bid must be unique!`;
        valid = false;
      }
    }

    totalBid += val;
    playerBids[icon] = val;
  });
  if (!valid) return;

  if (totalBid > gameState.players.player.gold) {
    bidError.textContent = `Total bid (${totalBid}) exceeds your gold (${gameState.players.player.gold})!`;
    return;
  }

  // Record human bids
  Object.values(Icon).forEach(icon => {
    if (playerBids[icon] > 0) {
      gameState.currentBids[icon].push({ playerId: 'player', amount: playerBids[icon] });
      gameState.log.push(`You bid ${playerBids[icon]} Gold on ${icon}.`);
    }
  });

  bidPanel.classList.add('hidden');
  
  // Advance turn
  gameState.currentBidderIndex++;
  processNextBidder();
});

function resolveRound() {
  // 1. Roll the dice
  gameState.rolledDice = rollDiceForRound(gameState);
  gameState.log.push(`Tower rolled: ${gameState.rolledDice.join(', ')}`);

  // 2. Setup modal UI for rolling
  rollingModalTitle.textContent = 'The Magic Gift Tower Rolls...';
  rollingModalSubtitle.textContent = 'Tumbling the dice of fate!';
  rollAuctionSummary.classList.add('hidden');
  rollAuctionSummary.innerHTML = '';
  rollModalContinue.classList.add('hidden');
  rollingDiceContainer.innerHTML = '';

  const iconsList = Object.values(Icon);
  const numDice = gameState.rolledDice.length;
  const cards: HTMLDivElement[] = [];

  // Create rolling card element for each die
  for (let i = 0; i < numDice; i++) {
    const card = document.createElement('div');
    card.className = 'dice-roll-card is-rolling';
    card.textContent = iconsList[Math.floor(Math.random() * iconsList.length)];
    rollingDiceContainer.appendChild(card);
    cards.push(card);
  }

  diceRollingModal.classList.remove('hidden');

  // Fast face-cycling interval (every 40ms)
  const intervalId = setInterval(() => {
    cards.forEach((card) => {
      if (card.classList.contains('is-rolling')) {
        card.textContent = iconsList[Math.floor(Math.random() * iconsList.length)];
      }
    });
  }, 40);

  // Sequentially stop each die card after 1.2s
  let landedCount = 0;
  cards.forEach((card, idx) => {
    setTimeout(() => {
      card.classList.remove('is-rolling');
      card.classList.add('has-landed');
      card.textContent = gameState.rolledDice[idx];
      landedCount++;

      // When all dice have landed:
      if (landedCount === numDice) {
        clearInterval(intervalId);
        
        // Resolve auctions & record logs
        resolveAuctions(gameState);
        updateHUD();

        rollingModalTitle.textContent = '✨ The Tower Has Spoken!';
        rollingModalSubtitle.textContent = 'Auctions resolved — check your new gifts below!';

        // Build auction summary
        let summaryHtml = '<strong>🏛️ Auction Results:</strong>';
        const recentLogs = gameState.log.slice(-numDice - 2);
        let hasWinners = false;
        recentLogs.forEach(entry => {
          if (entry.includes('won a')) {
            summaryHtml += `<p>${entry}</p>`;
            hasWinners = true;
          }
        });
        if (!hasWinners) {
          summaryHtml += `<p>No bids matched the revealed dice. Unclaimed dice returned to supply.</p>`;
        }

        rollAuctionSummary.innerHTML = summaryHtml;
        rollAuctionSummary.classList.remove('hidden');
        rollModalContinue.classList.remove('hidden');
      }
    }, 1200 + idx * 350);
  });

  rollModalContinue.onclick = () => {
    diceRollingModal.classList.add('hidden');
    beginPlacementPhase();
  };
}

function showMessage(title: string, body: string) {
  msgTitle.innerHTML = title;
  msgBody.innerHTML = body;
  msgOverlay.classList.remove('hidden');
}

function beginPlacementPhase() {
  gameState.playerOrder.forEach(pid => {
    if (pid !== 'player') placeComputerDice(gameState, pid);
  });
  updateHUD();
  isPlacementPhaseActive = true;
  handleNextManualPlacement();
}

function handleNextManualPlacement() {
  const p = gameState.players.player;
  selectedCell = null;

  if (p.unplacedDice.length > 0) {
    currentDieToPlace = p.unplacedDice.pop()!;
    confirmPlacementBtn.classList.add('hidden');
    updatePlacementInstruction();
    instructionBanner.classList.remove('hidden');
  } else {
    currentDieToPlace = null;
    confirmPlacementBtn.classList.remove('hidden');
    updatePlacementInstruction();
    instructionBanner.classList.remove('hidden');
  }
}

function updatePlacementInstruction() {
  const p = gameState.players.player;
  if (currentDieToPlace) {
    const remaining = p.unplacedDice.length + 1;
    instructionText.innerHTML = `Click an empty space to place <span class="banner-icon">${currentDieToPlace}</span> (${remaining} remaining)`;
  } else {
    instructionText.innerHTML = `All dice placed! Click any die to swap positions, or click <strong>Confirm Placement</strong> when ready.`;
  }
}

confirmPlacementBtn.addEventListener('click', () => {
  isPlacementPhaseActive = false;
  currentDieToPlace = null;
  selectedCell = null;
  instructionBanner.classList.add('hidden');
  confirmPlacementBtn.classList.add('hidden');

  gameState.firstPlayerIndex = (gameState.firstPlayerIndex + 1) % gameState.playerOrder.length;
  gameState.log.push(`--- Round Ended ---`);
  updateHUD();
  startRound();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  animateFireflies();
  renderer.render(scene, camera);
}

animate();
