// SOLMAR BAY — boot and the one loop.
// Third-person open-world crime game: on foot and by car, traffic, pedestrians,
// police and wanted level, four story missions, combat, minimap, save.
// ?shot=start|drive|chase|mission sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
// ?fresh=1 clears the localStorage save.
import * as THREE from 'three';
import { createCity, ROAD_COORDS } from './city.js';
import { createCar, driveCar, randomCarColor, CAR_TOP_SPEED } from './car.js';
import { createPlayer, stepPlayer } from './player.js';
import { createTraffic, stepTraffic, createPedestrians, stepPedestrians } from './traffic.js';
import { createPolice, addWanted, setWanted, stepPolice, clearPolice } from './police.js';
import { createMissions, MISSIONS } from './missions.js';
import { createCombat, combatStep, combatReload, combatFire } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
if (params.get('fresh') === '1') {
  try { localStorage.removeItem('solmar-bay-save-v1'); } catch (e) { /* no storage */ }
}

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const SAVE_KEY = 'solmar-bay-save-v1';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d8);
scene.fog = new THREE.Fog(new THREE.Color(0x87b5d8), 90, 320);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
scene.add(camera);

const city = createCity(scene);
const audio = createAudio();
const effects = createEffects(scene);
const input = createInput(renderer.domElement, onLockChange);

const player = createPlayer(scene, city.playerSpawn.x, city.playerSpawn.z);
const combat = createCombat(scene, camera);

// The orange Viento — Rico's mission car, parked by Palm Row.
const playerCar = createCar({
  scene,
  x: city.carSpawn.x,
  z: city.carSpawn.z,
  heading: city.carSpawn.heading,
  color: 0xd86a2a,
  isPlayerCar: true,
});

// Parked cars to steal: three, in the lots around the city.
const parkedCars = [];
{
  const spots = [
    { x: -48, z: 48, heading: 0 },
    { x: 48, z: -48, heading: Math.PI / 2 },
    { x: 96, z: 48, heading: Math.PI },
  ];
  const prng = mulberry32(55);
  for (const spot of spots) {
    parkedCars.push(createCar({ scene, x: spot.x, z: spot.z, heading: spot.heading, color: randomCarColor(prng) }));
  }
}

const traffic = createTraffic(scene, 10);
const peds = createPedestrians(scene, 16);
const police = createPolice(scene);
const missions = createMissions(city.landmarks);

const hud = createHud({});

// Mission beacon: a glowing column + bobbing diamond that marks the target.
const beaconGroup = new THREE.Group();
const beaconCol = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.4, 26, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd83a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
);
beaconCol.position.y = 13;
beaconGroup.add(beaconCol);
const beaconGem = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.1),
  new THREE.MeshBasicMaterial({ color: 0xffd83a }),
);
beaconGem.position.y = 4;
beaconGroup.add(beaconGem);
scene.add(beaconGroup);

// Game state.
const state = {
  phase: 'menu', // menu | playing | paused | over
  money: 0,
  health: 100,
  inCar: false,
  currentCar: null,
  camYaw: 0,
  camPitch: 0.32,
  camDist: 7,
  ramCooldown: 0,
  bustedTimer: 0,
  elapsed: 0,
  frozen: false,
  started: false,
};
let accumulator = 0;
let lastTime = performance.now();
let stepAccumulator = 0;
let lastWanted = 0;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      missionIndex: missions.index,
      missionStep: missions.step,
      health: state.health,
    }));
  } catch (e) { /* storage unavailable */ }
}
function applySave(save) {
  if (!save) return;
  state.money = save.money || 0;
  state.health = save.health || 100;
  missions.index = Math.min(save.missionIndex || 0, 3);
  missions.step = save.missionStep || 0;
  if (missions.index >= 4) missions.done = true;
}

const save = loadSave();

function playerPos() {
  if (state.inCar && state.currentCar) return state.currentCar.state;
  return player.state;
}

function nearestEnterableCar(maxDist) {
  const p = player.state;
  let best = null;
  let bestD = maxDist;
  const candidates = [playerCar, ...parkedCars];
  for (const car of candidates) {
    const d = Math.hypot(car.state.x - p.x, car.state.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(car) {
  state.inCar = true;
  state.currentCar = car;
  player.mesh.group.visible = false;
  // Stealing anything but the orange Viento is a crime.
  if (car !== playerCar) {
    addWanted(police, 1);
    hud.showMessage('Car stolen! The cops are onto you.', 3);
    audio.denied();
  } else {
    audio.pickup();
  }
  // If this completes the "enterCar" mission step, advance.
  if (!missions.done) {
    const step = MISSIONS[missions.index].steps[missions.step];
    if (step && step.kind === 'enterCar' && car === playerCar) {
      advanceMission();
    }
  }
}
function exitCar() {
  if (!state.currentCar) return;
  const car = state.currentCar;
  // Step out to the left of the car.
  const sideX = Math.cos(car.state.heading);
  const sideZ = -Math.sin(car.state.heading);
  player.state.x = car.state.x + sideX * 2.4;
  player.state.z = car.state.z + sideZ * 2.4;
  player.state.heading = car.state.heading;
  player.mesh.group.position.set(player.state.x, 0, player.state.z);
  player.mesh.group.visible = true;
  car.state.speed = 0;
  state.inCar = false;
  state.currentCar = null;
  audio.thud();
}

function advanceMission() {
  const result = missions.advance();
  if (result.missionComplete) {
    state.money += result.reward;
    audio.missionComplete();
    hud.showMessage(`Job complete! +$${result.reward}`, 3.5);
    saveGame();
    if (result.storyComplete) {
      setTimeout(() => {
        state.phase = 'over';
        hud.showOverlay('story', { money: state.money });
        if (document.pointerLockElement) document.exitPointerLock();
      }, 1200);
    } else {
      const next = MISSIONS[missions.index];
      hud.showMessage(next.story, 6);
    }
  }
}

function checkMissionSteps() {
  if (missions.done) return;
  const step = MISSIONS[missions.index].steps[missions.step];
  if (!step) return;
  const pos = playerPos();
  if (step.kind === 'reach') {
    const lm = city.landmarks[step.target];
    if (lm && Math.hypot(pos.x - lm.x, pos.z - lm.z) < 7) {
      if (MISSIONS[missions.index].id === 'heat') {
        clearPolice(police, scene);
        hud.showMessage('You lost them. The heat is off.', 3);
      }
      advanceMission();
    }
  }
}

function onRam(car) {
  if (state.ramCooldown > 0) return;
  state.ramCooldown = 0.8;
  state.health -= 6;
  audio.crash();
  effects.sparksAt(new THREE.Vector3(playerPos().x, 1, playerPos().z), 6);
  if (state.health <= 0) wasted('The Solmar Bay PD ran Rico down.');
}

function wasted(reason) {
  state.health = 0;
  state.money = Math.max(0, state.money - 500);
  clearPolice(police, scene);
  state.phase = 'over';
  hud.showOverlay('wasted', { reason });
  saveGame();
  if (document.pointerLockElement) document.exitPointerLock();
}

function busted() {
  state.money = Math.max(0, state.money - 500);
  clearPolice(police, scene);
  state.phase = 'over';
  hud.showOverlay('busted', {});
  saveGame();
  if (document.pointerLockElement) document.exitPointerLock();
}

function respawn() {
  state.health = 100;
  state.phase = 'playing';
  if (state.inCar) exitCar();
  player.state.x = city.playerSpawn.x;
  player.state.z = city.playerSpawn.z;
  player.mesh.group.position.set(player.state.x, 0, player.state.z);
  player.mesh.group.visible = true;
  hud.hideOverlay();
  input.requestLock();
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  const kind = hud.overlayKind();
  if (state.phase === 'menu') {
    applySave(save);
    state.phase = 'playing';
    hud.hideOverlay();
    hud.showMessage(missions.currentStory(), 6);
    input.requestLock();
    return;
  }
  if (state.phase === 'paused') {
    state.phase = 'playing';
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (state.phase === 'over') {
    if (kind === 'story') {
      state.phase = 'playing';
      hud.hideOverlay();
      input.requestLock();
      return;
    }
    respawn();
    return;
  }
  if (state.phase === 'playing') {
    input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (!locked && state.phase === 'playing' && state.health > 0) {
    state.phase = 'paused';
    saveGame();
    hud.showOverlay('paused');
  }
}

function syncCamera(dt) {
  const pos = playerPos();
  const targetX = pos.x;
  const targetZ = pos.z;
  const targetY = state.inCar ? 1.8 : 1.7;
  // When driving, the camera eases behind the car.
  if (state.inCar && state.currentCar) {
    const want = state.currentCar.state.heading + Math.PI;
    let diff = want - state.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.camYaw += diff * Math.min(1, dt * 1.6);
    state.camDist += (11 - state.camDist) * Math.min(1, dt * 3);
  } else {
    state.camDist += (7 - state.camDist) * Math.min(1, dt * 3);
  }
  const dist = state.camDist;
  const pitch = state.camPitch;
  const cx = targetX + Math.sin(state.camYaw) * Math.cos(pitch) * dist;
  const cz = targetZ + Math.cos(state.camYaw) * Math.cos(pitch) * dist;
  const cy = targetY + Math.sin(pitch) * dist + 1.2;
  camera.position.set(cx, Math.max(cy, 1.4), cz);
  camera.lookAt(targetX, targetY, targetZ);
}

function buildShootTargets() {
  const meshes = [];
  const map = new Map();
  for (const ped of peds) {
    if (ped.down) continue;
    const torso = ped.mesh.group.children[0];
    meshes.push(torso);
    map.set(torso, { kind: 'ped', ref: ped });
  }
  for (const car of police.cars) {
    const body = car.mesh.group.children[0];
    meshes.push(body);
    map.set(body, { kind: 'police', ref: car });
  }
  for (const car of traffic) {
    const body = car.mesh.group.children[0];
    meshes.push(body);
    map.set(body, { kind: 'traffic', ref: car });
  }
  return { meshes, map };
}

function shoot() {
  if (state.inCar) return; // drive-bys are for another day
  const { meshes, map } = buildShootTargets();
  const result = combatFire(combat, meshes);
  if (!result) return;
  if (result.dry) {
    audio.dryFire();
    return;
  }
  audio.shot();
  const from = result.from;
  const to = result.to || new THREE.Vector3().copy(from).addScaledVector(new THREE.Vector3(0, -0.1, -1).applyQuaternion(camera.quaternion), combat.state.range);
  effects.tracer(from, to);
  effects.muzzleFlash(new THREE.Vector3().copy(camera.position).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), 0.6));
  if (result.hit) {
    const entry = map.get(result.hit.object);
    effects.sparksAt(result.hit.point, 5);
    if (entry) {
      if (entry.kind === 'ped') {
        const ped = entry.ref;
        ped.down = true;
        ped.downTimer = 8;
        ped.mesh.group.rotation.x = -Math.PI / 2;
        ped.mesh.group.position.y = 0.3;
        addWanted(police, 1);
        hud.showMessage('You shot a pedestrian! Wanted +1', 2.5);
      } else if (entry.kind === 'police') {
        const car = entry.ref;
        car.state.health -= 34;
        effects.puff(result.hit.point);
        addWanted(police, 1);
        if (car.state.health <= 0) {
          car.state.cruise = 0;
          car.state.speed = 0;
          effects.puff(new THREE.Vector3(car.state.x, 1.5, car.state.z));
          hud.showMessage('Police car disabled!', 2.5);
        }
      } else if (entry.kind === 'traffic') {
        const car = entry.ref;
        car.state.cruise = Math.max(2, car.state.cruise - 3);
        addWanted(police, 1);
        hud.showMessage('You shot a car! Wanted +1', 2.5);
      }
    }
  }
}

function step(dt) {
  state.elapsed += dt;
  if (state.ramCooldown > 0) state.ramCooldown -= dt;
  city.update(dt, state.elapsed);

  if (state.phase === 'playing') {
    const look = input.takeLook();
    state.camYaw -= look.x * 0.0028;
    state.camPitch = Math.max(-0.1, Math.min(0.62, state.camPitch + look.y * 0.0022));

    // Pause.
    if (input.wasPressed('KeyP')) {
      state.phase = 'paused';
      saveGame();
      hud.showOverlay('paused');
      if (document.pointerLockElement) document.exitPointerLock();
    }

    if (state.inCar && state.currentCar) {
      const car = state.currentCar;
      driveCar(car, {
        forward: input.state.keys.has('KeyW'),
        back: input.state.keys.has('KeyS'),
        left: input.state.keys.has('KeyA'),
        right: input.state.keys.has('KeyD'),
        handbrake: input.state.keys.has('Space'),
      }, dt, city.colliders);
      if (car.state.justCrashed) {
        car.state.justCrashed = false;
        audio.crash();
        effects.sparksAt(new THREE.Vector3(car.state.x, 1, car.state.z), 5);
      }
      if (input.wasPressed('KeyE')) exitCar();
      audio.engine(car.state.speed / CAR_TOP_SPEED, true);
    } else {
      stepPlayer(player, input.state.keys, state.camYaw, dt, city.colliders);
      audio.engine(0, false);
      // Footsteps.
      if (player.state.moving) {
        stepAccumulator += player.state.speed * dt;
        if (stepAccumulator > 2.6) {
          stepAccumulator = 0;
          audio.step();
        }
      }
      // Enter a car.
      if (input.wasPressed('KeyE')) {
        const step = !missions.done ? MISSIONS[missions.index].steps[missions.step] : null;
        const interactTarget = step && step.kind === 'interact' ? city.landmarks[step.target] : null;
        if (interactTarget && Math.hypot(player.state.x - interactTarget.x, player.state.z - interactTarget.z) < 7) {
          advanceMission();
          audio.pickup();
        } else {
          const car = nearestEnterableCar(3.5);
          if (car) enterCar(car);
        }
      }
      // Shooting.
      if (input.state.firing) shoot();
      if (input.wasPressed('KeyR')) {
        if (combatReload(combat)) audio.reload();
      }
    }

    stepTraffic(traffic, dt, city.colliders);
    stepPedestrians(peds, dt, state.inCar ? state.currentCar : null, player.state, () => {
      addWanted(police, 1);
      hud.showMessage('Pedestrian hit! Wanted +1', 2.5);
      audio.thud();
    });

    // Police chase + wanted.
    stepPolice(police, scene, dt, state.elapsed, playerPos(), state.inCar ? state.currentCar : null, state.inCar ? state.currentCar.state.speed : 0, onRam);
    audio.siren(police.wanted > 0);
    if (police.wanted !== lastWanted) {
      lastWanted = police.wanted;
      hud.setWanted(police.wanted);
    }

    // Busted: on foot, high heat, a cop sits on you.
    if (!state.inCar && police.wanted >= 3) {
      let close = false;
      for (const car of police.cars) {
        if (Math.hypot(car.state.x - player.state.x, car.state.z - player.state.z) < 3) { close = true; break; }
      }
      if (close) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 2.5) {
          state.bustedTimer = 0;
          busted();
        }
      } else {
        state.bustedTimer = 0;
      }
    } else {
      state.bustedTimer = 0;
    }

    checkMissionSteps();
    combatStep(combat, dt);
    hud.tickMessage(dt);

    // Mission start hook: the Heat job sets wanted when it begins.
    if (!missions.done) {
      const m = MISSIONS[missions.index];
      if (m.onStart && !m._started) {
        m._started = true;
        if (m.onStart.wanted) {
          setWanted(police, m.onStart.wanted);
          hud.showMessage('The cops are on you — run!', 3);
        }
      }
    }
  }

  // Beacon follows the current mission target.
  const target = missions.currentTarget(city.landmarks, playerCar);
  if (target && state.phase !== 'menu') {
    beaconGroup.visible = true;
    beaconGroup.position.set(target.x, 0, target.z);
    beaconGem.position.y = 4 + Math.sin(state.elapsed * 2) * 0.5;
    beaconGem.rotation.y += dt * 2;
  } else {
    beaconGroup.visible = false;
  }

  effects.step(dt);
  syncCamera(dt);
  pushHud();
}

function pushHud() {
  hud.setHealth(state.health);
  hud.setMoney(state.money);
  hud.setWanted(police.wanted);
  hud.setAmmo(combat.state.mag, combat.state.magSize, combat.state.reloading);
  if (state.inCar && state.currentCar) {
    hud.setSpeed(state.currentCar.state.speed * 3.6, true);
  } else {
    hud.setSpeed(0, false);
  }
  hud.setMission(missions.currentTitle(), missions.currentText());
  const hint = state.inCar
    ? 'WASD drive · Space handbrake · E exit car · P pause'
    : 'WASD move · Mouse look · E enter car / interact · Click shoot · R reload · P pause';
  hud.setHint(hint);
  hud.drawMinimap({
    player: playerPos(),
    cars: traffic,
    police: police.cars,
    peds,
    missionTarget: missions.currentTarget(city.landmarks, playerCar),
    landmarks: city.landmarks,
    inCar: state.inCar,
  });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!state.frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  state.phase = 'playing';
  state.money = 1250;
  state.health = 100;
  hud.hideOverlay();
  // Put the player in a good default spot and the camera on the city.
  player.state.x = city.playerSpawn.x;
  player.state.z = city.playerSpawn.z;
  player.mesh.group.position.set(player.state.x, 0, player.state.z);
  player.mesh.group.visible = true;
  state.inCar = false;
  state.currentCar = null;
  state.camYaw = 0.5;
  state.camPitch = 0.32;

  if (name === 'start') {
    // On foot beside the orange Viento, city behind, start overlay up.
    player.state.x = -21;
    player.state.z = -18;
    player.mesh.group.position.set(player.state.x, 0, player.state.z);
    state.camYaw = -0.5;
    state.camPitch = 0.28;
    settle(30);
    hud.showOverlay('start', { hasSave: false });
  } else if (name === 'drive') {
    // In the Viento, rolling down Palm Row with traffic ahead.
    state.inCar = true;
    state.currentCar = playerCar;
    player.mesh.group.visible = false;
    playerCar.state.x = -24;
    playerCar.state.z = 60;
    playerCar.state.heading = Math.PI;
    playerCar.state.speed = 18;
    // Stage two traffic cars ahead on the same road.
    traffic[0].state.x = -24; traffic[0].state.z = 20; traffic[0].state.heading = Math.PI; traffic[0].state.speed = 9;
    traffic[1].state.x = -21; traffic[1].state.z = -10; traffic[1].state.heading = Math.PI; traffic[1].state.speed = 8;
    state.camYaw = 0;
    settle(20);
  } else if (name === 'chase') {
    // Wanted 3, two police cars on the Viento's tail, mission objective up.
    setWanted(police, 3);
    state.inCar = true;
    state.currentCar = playerCar;
    player.mesh.group.visible = false;
    playerCar.state.x = 24;
    playerCar.state.z = 40;
    playerCar.state.heading = Math.PI;
    playerCar.state.speed = 26;
    // Place police cars right behind.
    stepPolice(police, scene, 0.01, state.elapsed, playerPos(), playerCar, 26, null);
    if (police.cars[0]) { police.cars[0].state.x = 24; police.cars[0].state.z = 52; police.cars[0].state.heading = Math.PI; police.cars[0].state.speed = 26; }
    if (police.cars[1]) { police.cars[1].state.x = 21; police.cars[1].state.z = 56; police.cars[1].state.heading = Math.PI; police.cars[1].state.speed = 25; }
    if (police.cars[2]) { police.cars[2].state.x = 27; police.cars[2].state.z = 58; police.cars[2].state.heading = Math.PI; police.cars[2].state.speed = 25; }
    state.camYaw = 0;
    settle(12);
  } else if (name === 'mission') {
    // On foot at the Marina pier, beacon over the package point.
    player.state.x = -3;
    player.state.z = CITY_SPAWN_Z();
    player.mesh.group.position.set(player.state.x, 0, player.state.z);
    missions.index = 1;
    missions.step = 0;
    state.camYaw = 2.9;
    state.camPitch = 0.3;
    settle(30);
  }
  pushHud();
  paintTwiceThenReady();
}

function CITY_SPAWN_Z() {
  return 138;
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera(0.016);
    pushHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      state.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.domElement.addEventListener('click', () => {
  if (!shot && state.phase === 'playing' && !input.state.locked) input.requestLock();
});

pushHud();
if (save) hud.setSaveButton(true, save.money);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
