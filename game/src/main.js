// SOLMAR BAY: the entrypoint, the loop, the screens and the screenshot harness.
// The game is built from the modules in src/; this file wires them together,
// runs the fixed-step loop, moves the chase camera and keeps the save.
// ?shot=start|drive|chase|mission (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { createCity, makeRng } from './city.js';
import { makeCar } from './car.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createTraffic } from './traffic.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createInput, ACTION_PAUSE, ACTION_ENTER, ACTION_PUNCH, ACTION_SHOOT } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'solmarbay.save.v1';
const START_CASH = 500;
const DEBT = 5000;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const hudEl = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);

const city = createCity(scene, seed);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput();
const combat = createCombat(scene);
const missions = createMissions(scene, city);
const police = createPolice(scene, city, makeRng(seed + 31));
const traffic = createTraffic(scene, city, seed);
const player = createPlayer(scene, city.playerStart);

// The two cars Rico can take: his own teal sedan and Marisol's red target car.
const parked = [];
function addParked(id, color, spot, maxSpeed) {
  const car = makeCar(scene, { color, x: spot.x, z: spot.z, heading: spot.heading, maxSpeed, beam: true });
  car.id = id;
  parked.push({ id, car });
  return car;
}
const starterCar = addParked('starter', 0x2e8f8a, city.starterCar, 36);
const targetCar = addParked('target', 0xd92b2b, city.sportsSpot, 46);

const run = {
  screen: 'menu',
  cash: START_CASH,
  cashAtMissionStart: START_CASH,
  inCar: false,
  currentCar: null,
  endMode: null,
};
let cameraYaw = 0.6;
let menuAngle = 0.35;
let shake = 0;
let elapsed = 0;
let hurtCooldown = 0;
let ramCooldown = 0;
let scriptedDrive = null;
const lastHud = { cash: -1, wanted: -1, health: -1 };

function announce(message) {
  statusEl.textContent = message;
}

function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function allCars() {
  const list = [];
  if (run.currentCar) list.push(run.currentCar);
  for (const p of parked) list.push(p.car);
  for (const c of traffic.cars) list.push(c);
  for (const c of police.cars) list.push(c);
  return list;
}

function playerPos() {
  return run.inCar && run.currentCar ? run.currentCar.pos : player.pos;
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ mission: missions.index, cash: run.cash }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function loadSave() {
  try {
    const s = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
    if (s && Number.isInteger(s.mission) && Number.isFinite(s.cash)) return s;
  } catch {
    // A broken save is no save.
  }
  return null;
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function startMission(i, quiet = false) {
  missions.start(i);
  run.cashAtMissionStart = run.cash;
  hud.setMission(missions.current.title, missions.current.objective);
  if (!quiet) saveGame();
  if (missions.current.title === 'Getaway') {
    police.setWanted(3, playerPos());
    hud.toast('Three stars. Lose them.');
  }
}

function resetRun(mission, cash, quiet = false) {
  police.clear();
  run.cash = cash;
  run.cashAtMissionStart = cash;
  run.inCar = false;
  run.currentCar = null;
  player.reset(city.playerStart);
  player.group.visible = true;
  starterCar.pos.set(city.starterCar.x, 0, city.starterCar.z);
  starterCar.heading = city.starterCar.heading;
  starterCar.speed = 0;
  starterCar.damage = 0;
  starterCar.maxSpeed = 36;
  targetCar.pos.set(city.sportsSpot.x, 0, city.sportsSpot.z);
  targetCar.heading = city.sportsSpot.heading;
  targetCar.speed = 0;
  targetCar.damage = 0;
  targetCar.maxSpeed = 46;
  if (!parked.find((p) => p.id === 'starter')) parked.push({ id: 'starter', car: starterCar });
  if (!parked.find((p) => p.id === 'target')) parked.push({ id: 'target', car: targetCar });
  startMission(mission, quiet);
  hud.setCash(run.cash);
  hud.setWanted(0);
  hud.setHealth(100);
  lastHud.cash = run.cash;
  lastHud.wanted = 0;
  lastHud.health = 100;
}

function showHud(on) {
  hudEl.style.display = on ? 'block' : 'none';
}

function startNewGame() {
  input.takeActions();
  resetRun(0, START_CASH);
  run.screen = 'playing';
  run.endMode = null;
  hud.hideMenu();
  hud.hideEnd();
  hud.setCrosshair(true);
  showHud(true);
  snapCamera();
  audio.ensure();
  audio.click();
  announce('Playing. Rico owes Marisol $5,000.');
}

function continueGame(save) {
  input.takeActions();
  resetRun(save.mission, save.cash);
  run.screen = 'playing';
  run.endMode = null;
  hud.hideMenu();
  hud.hideEnd();
  hud.setCrosshair(true);
  showHud(true);
  snapCamera();
  audio.ensure();
  audio.click();
  announce(`Playing. Mission ${missions.index + 1}: ${missions.current.title}.`);
}

function pauseGame() {
  if (run.screen !== 'playing') return;
  run.screen = 'paused';
  run.endMode = 'paused';
  hud.showEnd('Paused', 'Take a breath. The city will wait.');
  document.getElementById('btn-again').textContent = 'Resume';
  audio.siren(false);
  audio.setEngine(0, false);
  announce('Paused.');
}

function resumeGame() {
  run.screen = 'playing';
  run.endMode = null;
  hud.hideEnd();
  document.getElementById('btn-again').textContent = 'Play again';
  announce('Playing.');
}

function bust(reason) {
  if (run.screen !== 'playing') return;
  run.screen = 'busted';
  run.endMode = 'busted';
  police.clear();
  audio.siren(false);
  audio.setEngine(0, false);
  hud.setCrosshair(false);
  hud.showEnd('BUSTED', `${reason} Marisol is not happy. The job starts over.`);
  announce('Busted.');
}

function completeMission() {
  const m = missions.current;
  audio.jingle();
  if (m.title === 'The Debt') hud.toast('Paid. Marisol has another job for you.');
  else if (m.title === 'Hot Wheels') hud.toast('Nice ride. Now lose the heat.');
  else if (m.title === 'Getaway') hud.toast('Clean. Marisol is waiting at the pier.');
  startMission(missions.index + 1);
}

function nearestParked(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const p of parked) {
    const d = Math.hypot(p.car.pos.x - player.pos.x, p.car.pos.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function enterCar(entry) {
  const idx = parked.indexOf(entry);
  if (idx >= 0) parked.splice(idx, 1);
  run.currentCar = entry.car;
  run.inCar = true;
  player.group.visible = false;
  audio.click();
  if (entry.id === 'target') {
    police.addCrime(1, playerPos());
    hud.toast('You stole the sports car. The cops noticed.');
    audio.thud();
  } else {
    hud.toast('Nice wheels. Now get to work.');
  }
}

function enterCarDirect(car, x, z, heading, speed) {
  const idx = parked.findIndex((p) => p.car === car);
  if (idx >= 0) parked.splice(idx, 1);
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.speed = speed;
  run.currentCar = car;
  run.inCar = true;
  player.group.visible = false;
}

function exitCar() {
  const car = run.currentCar;
  if (!car) return;
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  player.pos.set(car.pos.x + rx * 2.6, 0, car.pos.z + rz * 2.6);
  player.heading = car.heading;
  player.group.visible = true;
  run.currentCar = null;
  run.inCar = false;
  parked.push({ id: car.id, car });
  audio.click();
}

function desiredCamera() {
  if (run.screen === 'menu') {
    const r = 230;
    return {
      pos: new THREE.Vector3(Math.sin(menuAngle) * r, 72, Math.cos(menuAngle) * r),
      look: new THREE.Vector3(0, 12, 0),
    };
  }
  const targetPos = playerPos();
  const targetHeading = run.inCar && run.currentCar ? run.currentCar.heading : player.heading;
  const f = forwardOf(cameraYaw);
  const dist = run.inCar ? 11.5 : 7.5;
  const height = run.inCar ? 4.6 : 3.4;
  return {
    pos: new THREE.Vector3(targetPos.x - f.x * dist, height, targetPos.z - f.z * dist),
    look: new THREE.Vector3(targetPos.x + f.x * 7, 1.6, targetPos.z + f.z * 7),
    heading: targetHeading,
  };
}

function updateCamera(dt, snap = false) {
  const desired = desiredCamera();
  if (run.screen === 'menu') {
    camera.position.copy(desired.pos);
    camera.lookAt(desired.look);
    return;
  }
  const targetHeading = desired.heading;
  let diff = targetHeading - cameraYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cameraYaw += diff * Math.min(1, dt * 2.2);
  const f = forwardOf(cameraYaw);
  const targetPos = playerPos();
  const dist = run.inCar ? 11.5 : 7.5;
  const height = run.inCar ? 4.6 : 3.4;
  const want = new THREE.Vector3(targetPos.x - f.x * dist, height, targetPos.z - f.z * dist);
  if (snap) camera.position.copy(want);
  else camera.position.lerp(want, Math.min(1, dt * 7));
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    camera.position.z += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 1.8);
  }
  camera.lookAt(new THREE.Vector3(targetPos.x + f.x * 7, 1.6, targetPos.z + f.z * 7));
}

function snapCamera() {
  if (run.screen === 'menu') {
    updateCamera(STEP, true);
    return;
  }
  const targetHeading = run.inCar && run.currentCar ? run.currentCar.heading : player.heading;
  cameraYaw = targetHeading;
  updateCamera(STEP, true);
}

function step(dt) {
  elapsed += dt;
  city.update(dt, elapsed);
  effects.update(dt);
  combat.update(dt);
  hurtCooldown = Math.max(0, hurtCooldown - dt);
  ramCooldown = Math.max(0, ramCooldown - dt);
  if (run.screen === 'menu') {
    traffic.update(dt, { inCar: false, pos: player.pos, car: null }, city.colliders);
    menuAngle += dt * 0.045;
    updateCamera(dt);
    return;
  }
  if (run.screen !== 'playing') return;

  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    pauseGame();
    return;
  }

  const drive = scriptedDrive || input.drive();
  const move = input.move();

  if (run.inCar && run.currentCar) {
    const car = run.currentCar;
    car.update(dt, drive, city.colliders, allCars());
    if (car.lastHit > 6) {
      audio.thud();
      hud.flashDamage();
      shake = Math.min(0.8, shake + 0.25);
      effects.burst(car.pos, 0xffd34d, 10, 7);
    }
    if (car.damage > 100 && car.maxSpeed > 0) {
      car.maxSpeed = 0;
      hud.toast('Your car is wrecked! Get out and find another.');
      effects.smoke(car.pos);
    }
    if ((actions & ACTION_ENTER) && Math.abs(car.speed) < 3) exitCar();
  } else {
    player.update(dt, move, cameraYaw, input.run(), city.colliders);
    // A traffic car clipping Rico on foot hurts.
    if (hurtCooldown <= 0) {
      for (const c of traffic.cars) {
        if (Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 2.2) {
          player.hurt(12);
          hurtCooldown = 1;
          audio.thud();
          hud.flashDamage();
          shake = Math.min(0.8, shake + 0.4);
          const dx = player.pos.x - c.pos.x;
          const dz = player.pos.z - c.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          player.pos.x += (dx / d) * 2;
          player.pos.z += (dz / d) * 2;
          break;
        }
      }
    }
    // Steal a parked car, or pay Marisol at her door.
    if (actions & ACTION_ENTER) {
      const entry = nearestParked(4);
      if (entry) {
        enterCar(entry);
      } else if (missions.interact({ pos: player.pos, cash: run.cash })) {
        run.cash -= missions.current.pay;
        hud.setCash(run.cash);
        lastHud.cash = run.cash;
        audio.jingle();
        hud.toast('Paid Marisol $200.');
        completeMission();
      }
    }
    // Fists and gunfire.
    if (actions & ACTION_PUNCH) {
      const ped = combat.punch(player.pos, player.heading, traffic.peds);
      if (ped) {
        traffic.fallPed(ped);
        police.addCrime(1, player.pos);
        audio.thud();
        hud.toast('Assault! The cops noticed.');
      }
    }
    if ((actions & ACTION_SHOOT) || input.mouseHeld()) {
      const hit = combat.shoot(camera, player.pos, player.heading, traffic.peds, allCars(), effects, audio);
      if (hit && hit.kind === 'ped') {
        traffic.fallPed(hit.ped);
        police.addCrime(1, player.pos);
        hud.toast('Shots fired! The cops noticed.');
      } else if (hit && hit.kind === 'car') {
        hit.car.damage += 8;
        if (hit.car.damage > 40 && hit.car.maxSpeed > 0) {
          hit.car.maxSpeed = 0;
          effects.smoke(hit.car.pos);
          hud.toast('You disabled that car.');
        }
      }
    }
  }

  // The player's own car running over a pedestrian is a crime too.
  if (run.inCar && run.currentCar) {
    const ped = traffic.pedNear(run.currentCar.pos, 2.4);
    if (ped) {
      traffic.fallPed(ped);
      police.addCrime(1, playerPos());
      audio.thud();
      hud.toast('You hit a pedestrian! The cops noticed.');
    }
  }

  police.update(
    dt,
    { pos: playerPos(), inCar: run.inCar, car: run.currentCar },
    city.colliders,
    allCars(),
    () => bust('The cops caught Rico.'),
  );
  if (police.rammed && run.inCar && run.currentCar && ramCooldown <= 0) {
    ramCooldown = 0.5;
    run.currentCar.damage += 3;
    player.hurt(1);
    audio.thud();
    hud.flashDamage();
    shake = Math.min(0.8, shake + 0.3);
  }

  traffic.update(dt, { inCar: run.inCar, pos: player.pos, car: run.currentCar }, city.colliders);
  missions.update(dt, elapsed);

  // Mission progress.
  const state = {
    pos: playerPos(),
    inCar: run.inCar,
    carId: run.currentCar ? run.currentCar.id : null,
    wanted: police.wanted,
  };
  if (missions.check(state)) {
    if (missions.current.title === 'Payoff') {
      run.cash = DEBT;
      hud.setCash(run.cash);
      lastHud.cash = run.cash;
      clearSave();
      run.screen = 'complete';
      run.endMode = 'complete';
      hud.setCrosshair(false);
      hud.showEnd('DEBT CLEARED', `Rico delivered the car and paid off the $${DEBT.toLocaleString()} debt. Solmar Bay is his again.`);
      audio.jingle();
      audio.siren(false);
      audio.setEngine(0, false);
      announce('Debt cleared. Rico is free.');
    } else {
      completeMission();
    }
  }

  // Sound follows the chase.
  const speedNorm = run.inCar && run.currentCar ? Math.abs(run.currentCar.speed) / run.currentCar.maxSpeed : 0;
  audio.setEngine(speedNorm, run.inCar);
  audio.siren(police.wanted > 0);

  // The prompt line: what E does right now.
  let prompt = null;
  if (run.inCar && run.currentCar) {
    if (Math.abs(run.currentCar.speed) < 3) prompt = 'Press E to get out of the car';
  } else {
    const m = missions.current;
    if (m && m.pay !== undefined && missions.nearWaypoint(player.pos, 8)) {
      prompt = run.cash >= m.pay ? `Press E to pay Marisol $${m.pay}` : `You need $${m.pay} to pay Marisol`;
    } else {
      const entry = nearestParked(4);
      if (entry) prompt = entry.id === 'target' ? 'Press E to steal the sports car' : 'Press E to enter the car';
    }
  }
  hud.setPrompt(prompt);
  hud.setCrosshair(!run.inCar);

  // The HUD, only when something changed.
  if (run.cash !== lastHud.cash) {
    hud.setCash(run.cash);
    lastHud.cash = run.cash;
  }
  if (police.wanted !== lastHud.wanted) {
    hud.setWanted(police.wanted);
    lastHud.wanted = police.wanted;
  }
  if (player.health !== lastHud.health) {
    hud.setHealth(player.health);
    lastHud.health = player.health;
  }
  if (player.health <= 0) {
    bust('Rico is down.');
    return;
  }

  updateCamera(dt);
}

function simulate(seconds, drive) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    scriptedDrive = drive;
    step(STEP);
  }
  scriptedDrive = null;
}

function drawMinimapNow() {
  hud.drawMinimap(
    {
      playerX: playerPos().x,
      playerZ: playerPos().z,
      heading: run.inCar && run.currentCar ? run.currentCar.heading : player.heading,
      waypoint: missions.current ? missions.current.waypoint : null,
      police: police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
    },
    elapsed,
  );
}

function stageShot(name) {
  if (name === 'start') {
    run.screen = 'menu';
    menuAngle = 0;
    for (let i = 0; i < 30; i += 1) step(STEP);
    updateCamera(STEP, true);
  } else if (name === 'drive') {
    resetRun(0, START_CASH, true);
    run.screen = 'playing';
    showHud(true);
    hud.hideMenu();
    hud.hideEnd();
    // The beachfront road west: the beach and ocean on the left, the city
    // on the right, the sunset straight ahead.
    enterCarDirect(starterCar, 40, 160, -Math.PI / 2, 20);
    police.setWanted(1, playerPos());
    simulate(4, { throttle: 1, steer: 0 });
    snapCamera();
  } else if (name === 'chase') {
    resetRun(2, 300, true);
    run.screen = 'playing';
    showHud(true);
    hud.hideMenu();
    hud.hideEnd();
    enterCarDirect(targetCar, 0, 80, -Math.PI / 2, 30);
    simulate(3, { throttle: 1, steer: 0 });
    snapCamera();
  } else {
    // mission: Hot Wheels, Rico on foot by the red sports car and its beacon.
    resetRun(1, 300, true);
    run.screen = 'playing';
    showHud(true);
    hud.hideMenu();
    hud.hideEnd();
    player.pos.set(-108, 0, 160);
    player.heading = -Math.PI / 2;
    cameraYaw = -Math.PI / 2;
    simulate(1, { throttle: 0, steer: 0 });
    snapCamera();
  }
  drawMinimapNow();
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// A hook for the play-tests: read the state, move Rico, set the heat.
window.__game = {
  state() {
    return {
      screen: run.screen,
      mission: missions.index,
      missionTitle: missions.current ? missions.current.title : null,
      cash: run.cash,
      wanted: police.wanted,
      inCar: run.inCar,
      health: player.health,
      player: { x: player.pos.x, z: player.pos.z },
      car: run.currentCar
        ? { x: run.currentCar.pos.x, z: run.currentCar.pos.z, speed: run.currentCar.speed }
        : null,
      police: police.cars.length,
    };
  },
  teleport(x, z) {
    if (run.inCar && run.currentCar) run.currentCar.pos.set(x, 0, z);
    else player.pos.set(x, 0, z);
  },
  setWanted(n) {
    police.setWanted(n, playerPos());
  },
  start() {
    startNewGame();
  },
};

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (run.screen === 'playing' || run.screen === 'menu') {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      step(STEP);
      accumulator -= STEP;
      guard += 1;
    }
    if (guard >= 8) accumulator = 0;
  }
  if (run.screen === 'playing') {
    drawMinimapNow();
  }
  renderer.render(scene, camera);
}

let accumulator = 0;
let last = performance.now();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Leaving the tab pauses a running game rather than letting the city run unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && run.screen === 'playing') pauseGame();
});

const save = loadSave();
hud.showMenu(!!save);
hud.setCash(run.cash);
hud.setWanted(0);
hud.setHealth(100);
hud.setMission('The Debt', "Rico owes Marisol Kane $5,000. Four jobs clear it.");
hud.onStart(() => startNewGame());
hud.onContinue(() => {
  const s = loadSave();
  if (s) continueGame(s);
});
hud.onAgain(() => {
  if (run.endMode === 'paused') {
    resumeGame();
  } else if (run.endMode === 'busted') {
    resetRun(missions.index, run.cashAtMissionStart);
    run.screen = 'playing';
    run.endMode = null;
    hud.hideEnd();
    hud.setCrosshair(true);
    showHud(true);
    snapCamera();
    announce('Playing.');
  } else {
    startNewGame();
  }
});
showHud(false);
announce('SOLMAR BAY. Press Enter or click Start Engine to play.');

if (shot) stageShot(shot);
else requestAnimationFrame(frame);
