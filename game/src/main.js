// SOLMAR BAY — entrypoint: open-world crime game in three.js.
// Rico Vega owes fixer Marisol Kane $5,000. Four missions, wanted level 0-5,
// stealable cars, traffic, pedestrians, police chases, sunset over the bay.
import * as THREE from 'three';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createCity, collideCircle, mulberry32 } from './city.js';
import { makeCar, updateCar, CAR_COLORS } from './car.js';
import { createPlayer, updatePlayer } from './player.js';
import { shoot, punchHit } from './combat.js';
import { createTraffic, updateTraffic, killPed } from './traffic.js';
import { createPolice, addWanted, setWanted, updatePolice, policePositions } from './police.js';
import { createMissions, MISSION_DEFS } from './missions.js';
import { createHud } from './hud.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shot = params.get('shot') || '';
const SAVE_KEY = 'solmarbay-save-v1';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff9a52);
scene.fog = new THREE.Fog(0xffb27a, 120, 420);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 40, 80);

const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
sun.position.set(-180, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.camera.far = 600;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffd9a0, 0x3a2f2f, 0.9));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('error', (e) => {
  const box = document.getElementById('err');
  if (box) {
    box.style.display = 'block';
    box.textContent = 'Error: ' + (e.message || 'unknown');
  }
});

// ---------------------------------------------------------------- world
const rng = mulberry32(seed);
const city = createCity(scene, rng);
const world = { colliders: city.colliders, bounds: city.bounds };
const input = createInput(canvas);
const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud();
const player = createPlayer(scene);
player.pos.set(city.spots.player.x, 0, city.spots.player.z);
player.yaw = Math.PI;
const traffic = createTraffic(scene, city, rng);
const police = createPolice(scene, city);

// Waypoint beacon: tall glowing column + spinning diamond on top.
const beaconMat = new THREE.MeshBasicMaterial({
  color: 0xffd23e,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 20, 1, true), beaconMat);
const beaconTop = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.1),
  new THREE.MeshBasicMaterial({ color: 0xffd23e })
);
beacon.visible = false;
beaconTop.visible = false;
scene.add(beacon);
scene.add(beaconTop);
function setBeacon(x, z) {
  beacon.position.set(x, 20, z);
  beaconTop.position.set(x, 26, z);
  beacon.visible = true;
  beaconTop.visible = true;
}
function hideBeacon() {
  beacon.visible = false;
  beaconTop.visible = false;
}

// Parked, stealable cars at curbs along the roads.
const parkedCars = [];
const curbSpots = [
  [6, -60, 'sedan'], [-6, -60, 'taxi'], [66, 0, 'sedan'], [54, 60, 'truck'],
  [-66, 60, 'sedan'], [6, 120, 'taxi'], [-6, 120, 'sedan'], [126, -60, 'truck'],
  [-126, 0, 'sedan'], [6, -120, 'sedan'], [66, -120, 'taxi'], [-66, -120, 'sedan'],
];
for (const [x, z, type] of curbSpots) {
  const colors = CAR_COLORS[type];
  const color = colors[Math.floor(rng() * colors.length)];
  const car = makeCar(scene, type, x, z, rng() < 0.5 ? 0 : Math.PI, color);
  parkedCars.push(car);
}

// Cash pickups scattered around the city.
const pickups = [];
const pickupSpots = [
  [30, -6], [-30, 6], [90, -6], [-90, 66], [6, 90], [-6, -90], [126, 6], [-126, -66],
];
for (const [x, z] of pickupSpots) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x37d67a })
  );
  m.position.set(x, 1, z);
  scene.add(m);
  pickups.push({ mesh: m, x, z, taken: false, respawn: 0 });
}

// ---------------------------------------------------------------- game state
const game = {
  state: 'menu', // menu | playing | paused | end
  money: 0,
  debt: 5000,
  car: null,
  autopilot: false,
  shakeT: 0,
  audio,
  message: (t) => hud.message(t),
  shootCooldown: 0,
  punchCooldown: 0,
  stealCooldown: 0,
  shotCooldown: 0,
  speedCooldown: 0,
  lastShot: null,
  saveTimer: 0,
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.money === 'number') game.money = s.money;
    if (typeof s.missionsDone === 'number') missions.index = Math.min(s.missionsDone, MISSION_DEFS.length);
    if (s.debtPaid) game.debt = 0;
  } catch (err) {
    /* corrupted save: start fresh */
  }
}

function saveGame() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ money: game.money, missionsDone: missions.index, debtPaid: game.debt <= 0 })
    );
  } catch (err) {
    /* storage unavailable */
  }
}

const missions = createMissions({
  city,
  audio,
  setObjective: (t) => hud.setObjective(t),
  setMissionTitle: (t) => hud.setMissionTitle(t),
  message: (t) => hud.message(t),
  addMoney: (n) => {
    game.money += n;
    hud.setMoney(game.money, game.debt);
  },
  setWanted: (n) => setWanted(police, n),
  spawnTargetCar: () => {
    const car = makeCar(scene, 'sport', city.spots.sport.x, city.spots.sport.z, 0, 0xd21f3c);
    parkedCars.push(car);
    return car;
  },
  getPlayerPos: () => (game.car ? game.car.group.position : player.pos),
  isPlayerInCar: (car) => game.car === car,
  completeStory: () => {
    game.debt = 0;
    hud.setMoney(game.money, game.debt);
    saveGame();
    game.state = 'end';
    audio.engineOff();
    hud.showEnd(
      'DEBT PAID',
      'Rico hands Marisol the $5,000 at the pier as the sun sets over Solmar Bay. The debt is settled — for now.',
      'Play again'
    );
  },
  save: () => saveGame(),
});

loadSave();
hud.setMoney(game.money, game.debt);
hud.setHealth(player.health);
hud.setStars(0);
hud.setSpeed(0);

game.damage = (n) => {
  if (game.state !== 'playing') return;
  player.health -= n;
  hud.setHealth(player.health);
  if (player.health <= 0) {
    player.health = 0;
    endRun('wasted');
  }
};
game.shake = (t) => {
  game.shakeT = Math.max(game.shakeT, t);
};
game.busted = () => {
  if (game.state === 'playing') endRun('busted');
};

function witnessNear(pos, r) {
  for (const ped of traffic.peds) {
    if (!ped.dead && Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z) < r) return true;
  }
  for (const cop of police.foot) {
    if (Math.hypot(cop.pos.x - pos.x, cop.pos.z - pos.z) < r) return true;
  }
  for (const car of police.cars) {
    if (Math.hypot(car.group.position.x - pos.x, car.group.position.z - pos.z) < r) return true;
  }
  return false;
}

function nearestEnterableCar(maxD) {
  let best = null;
  let bd = maxD;
  for (const c of parkedCars) {
    if (c.driver) continue;
    const d = Math.hypot(c.group.position.x - player.pos.x, c.group.position.z - player.pos.z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function enterCar(car) {
  const firstTime = !car.stolen;
  if (firstTime && witnessNear(car.group.position, 25) && game.stealCooldown <= 0) {
    addWanted(police, 1);
    hud.message('Someone saw you steal that car! +1 wanted');
    game.stealCooldown = 5;
  }
  car.stolen = true;
  car.driver = 'player';
  player.group.visible = false;
  game.car = car;
  audio.ensure();
  hud.message('Press E to exit the car');
}

function exitCar() {
  const car = game.car;
  if (!car) return;
  game.car = null;
  car.driver = null;
  car.speed *= 0.3;
  player.group.visible = true;
  const fx = Math.sin(car.heading + Math.PI / 2);
  const fz = Math.cos(car.heading + Math.PI / 2);
  player.pos.set(car.group.position.x + fx * 2.2, 0, car.group.position.z + fz * 2.2);
  player.yaw = car.heading;
  collideCircle(player.pos, player.radius, world.colliders, world.bounds);
}

function endRun(kind) {
  if (game.state !== 'playing') return;
  game.state = 'end';
  missions.onBusted();
  const fine = Math.min(game.money, 200);
  game.money -= fine;
  hud.setMoney(game.money, game.debt);
  audio.engineOff();
  audio.fail();
  if (game.car) {
    game.car.driver = null;
    game.car = null;
  }
  if (kind === 'busted') {
    hud.showEnd(
      'BUSTED!',
      'The cops hauled you in. Fine: $' + fine + '. You wake up at the hospital.',
      'Continue'
    );
  } else {
    hud.showEnd(
      'WASTED!',
      'You got wasted. Hospital bill: $' + fine + '.',
      'Continue'
    );
  }
  saveGame();
}

function respawn() {
  player.health = 100;
  hud.setHealth(100);
  setWanted(police, 0);
  player.pos.set(city.spots.hospital.x, 0, city.spots.hospital.z);
  player.yaw = 0;
  player.group.visible = true;
  game.car = null;
  game.autopilot = false;
  game.state = 'playing';
  hud.show(null);
  hud.message('You wake up at the hospital. The city waits.');
}

function startGame() {
  if (game.state === 'playing') return;
  game.state = 'playing';
  hud.show(null);
  audio.ensure();
  audio.click();
  input.consumeMouse();
  input.requestLock();
  hud.message('Welcome to Solmar Bay. Rico owes Marisol Kane $5,000.');
  if (missions.index >= MISSION_DEFS.length) {
    hud.setMissionTitle('Free roam');
    hud.setObjective('Debt paid. Solmar Bay is yours — drive, explore, cause trouble.');
  } else if (!missions.active) {
    missions.start(missions.index);
  }
}

// ---------------------------------------------------------------- camera
let camYaw = Math.PI;
let camPitch = 0.32;
const camTarget = new THREE.Vector3();

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateCamera(dt) {
  const target = game.car ? game.car.group.position : player.pos;
  const { dx, dy } = input.consumeMouse();
  if (input.locked) {
    camYaw -= dx * 0.0032;
    camPitch = Math.max(0.08, Math.min(0.9, camPitch + dy * 0.0022));
  } else if (game.car) {
    camYaw = lerpAngle(camYaw, game.car.heading, Math.min(1, dt * 1.2));
    camPitch += (0.3 - camPitch) * Math.min(1, dt * 2);
  } else {
    camYaw = lerpAngle(camYaw, player.yaw, Math.min(1, dt * 1.5));
  }
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  const dist = game.car ? 10.5 : 8;
  const height = game.car ? 4.4 : 3.6;
  camTarget.set(target.x - fx * dist, height, target.z - fz * dist);
  camera.position.lerp(camTarget, Math.min(1, dt * 6));
  if (game.shakeT > 0) {
    game.shakeT -= dt;
    camera.position.x += (Math.random() - 0.5) * 0.3;
    camera.position.y += (Math.random() - 0.5) * 0.3;
  }
  camera.lookAt(target.x, game.car ? 1.6 : 1.5, target.z);
}

// ---------------------------------------------------------------- combat targets
function personTargets() {
  const out = [];
  for (const ped of traffic.peds) {
    if (!ped.dead) out.push({ pos: ped.pos, hp: ped.hp, onDeath: () => killPed(ped), _ped: ped });
  }
  for (const cop of police.foot) {
    out.push({
      pos: cop.pos,
      hp: cop.hp,
      onDeath: () => {
        cop.hp = 0;
        cop.group.visible = false;
        const i = police.foot.indexOf(cop);
        if (i >= 0) police.foot.splice(i, 1);
        police.scene.remove(cop.group);
      },
      _cop: cop,
    });
  }
  return out;
}

function tryShoot() {
  if (game.shootCooldown > 0) return;
  game.shootCooldown = 0.28;
  player.gunTimer = 0.18;
  const from = new THREE.Vector3(player.pos.x, 1.5, player.pos.z);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const targets = personTargets();
  const hit = shoot(from, dir, targets, effects, audio);
  game.lastShot = { x: player.pos.x, z: player.pos.z, until: performance.now() / 1000 + 2 };
  if (hit) {
    if (hit._ped) {
      hit._ped.hp = hit.hp;
      if (hit.hp <= 0) {
        hud.message('Pedestrian down. The city saw that.');
        if (game.shotCooldown <= 0) {
          addWanted(police, 1);
          game.shotCooldown = 4;
        }
      }
    }
    if (hit._cop) {
      hit._cop.hp = hit.hp;
      if (game.shotCooldown <= 0) {
        addWanted(police, 1);
        game.shotCooldown = 4;
      }
    }
  } else if (game.shotCooldown <= 0 && witnessNear(player.pos, 60)) {
    addWanted(police, 1);
    game.shotCooldown = 5;
  }
}

function tryPunch() {
  if (game.punchCooldown > 0) return;
  game.punchCooldown = 0.45;
  audio.punch();
  const targets = personTargets();
  punchHit(player.pos, player.yaw, targets, effects);
}

// ---------------------------------------------------------------- car collisions
function collideCars(dt) {
  const all = [];
  if (game.car) all.push(game.car);
  for (const c of traffic.cars) all.push(c);
  for (const c of police.cars) all.push(c);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius * 0.55 + b.radius * 0.55;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.group.position.x -= nx * push;
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.z += nz * push;
        a.speed *= 0.85;
        b.speed *= 0.85;
      }
    }
  }
  // Player car vs pedestrians.
  if (game.car && Math.abs(game.car.speed) > 3) {
    for (const ped of traffic.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.pos.x - game.car.group.position.x, ped.pos.z - game.car.group.position.z);
      if (d < 1.9) {
        killPed(ped);
        effects.blood(ped.pos);
        hud.message('You ran someone over! +1 wanted');
        if (game.stealCooldown <= 0) {
          addWanted(police, 1);
          game.stealCooldown = 5;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- autopilot (screenshot modes)
function autopilotDrive(dt) {
  const car = game.car;
  if (!car) return;
  const loop = city.loops[1];
  const p = loop[car.autopilotIdx || 0];
  const dx = p[0] - car.group.position.x;
  const dz = p[1] - car.group.position.z;
  if (Math.hypot(dx, dz) < 10) car.autopilotIdx = ((car.autopilotIdx || 0) + 1) % loop.length;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  updateCar(car, { throttle: 0.7, steer: Math.max(-1, Math.min(1, diff * 1.8)), handbrake: false }, dt, world);
}

// ---------------------------------------------------------------- per-frame update
let prevE = false;
let prevF = false;
let prevP = false;
let prevM = false;

function updatePlaying(dt, t) {
  game.shootCooldown = Math.max(0, game.shootCooldown - dt);
  game.punchCooldown = Math.max(0, game.punchCooldown - dt);
  game.stealCooldown = Math.max(0, game.stealCooldown - dt);
  game.shotCooldown = Math.max(0, game.shotCooldown - dt);
  game.speedCooldown = Math.max(0, game.speedCooldown - dt);

  const eDown = input.pressed('KeyE');
  if (eDown && !prevE) {
    if (game.car) exitCar();
    else {
      const car = nearestEnterableCar(3.2);
      if (car) enterCar(car);
    }
  }
  prevE = eDown;

  const fDown = input.pressed('KeyF');
  if (fDown && !prevF && !game.car) tryPunch();
  prevF = fDown;

  const pDown = input.pressed('KeyP');
  if (pDown && !prevP) {
    game.state = 'paused';
    hud.show('pause');
    audio.engineOff();
  }
  prevP = pDown;

  const mDown = input.pressed('KeyM');
  if (mDown && !prevM) {
    audio.setMuted(!audio.isMuted());
    hud.message(audio.isMuted() ? 'Muted' : 'Sound on');
  }
  prevM = mDown;

  if (input.consumeClick() && !game.car) tryShoot();

  // Any real driving input cancels the autopilot.
  const ax = input.axis();
  if (ax.x !== 0 || ax.y !== 0 || input.pressed('Space')) game.autopilot = false;

  if (game.car) {
    if (game.autopilot) {
      autopilotDrive(dt);
    } else {
      updateCar(
        game.car,
        {
          throttle: ax.y,
          steer: ax.x,
          handbrake: input.pressed('Space'),
        },
        dt,
        world
      );
    }
    audio.engine(Math.abs(game.car.speed) / game.car.spec.top, Math.max(0, ax.y));
    hud.setSpeed(Math.abs(game.car.speed) * 3.6);
    // Speeding past a police car draws heat.
    if (Math.abs(game.car.speed) > 22 && game.speedCooldown <= 0) {
      for (const pc of police.cars) {
        const d = Math.hypot(pc.group.position.x - game.car.group.position.x, pc.group.position.z - game.car.group.position.z);
        if (d < 30) {
          addWanted(police, 1);
          hud.message('Speeding past a cop! +1 wanted');
          game.speedCooldown = 6;
          break;
        }
      }
    }
  } else {
    updatePlayer(player, input, camYaw, dt, world);
    audio.engine(0, 0);
    hud.setSpeed(Math.abs(player.speed) * 3.6);
  }

  collideCars(dt);
  const nowSec = performance.now() / 1000;
  const danger = game.lastShot && nowSec < game.lastShot.until ? game.lastShot : null;
  updateTraffic(traffic, dt, world, game.car, danger, nowSec);
  updatePolice(
    police,
    dt,
    {
      pos: game.car ? game.car.group.position : player.pos,
      inCar: !!game.car,
      car: game.car,
      speed: game.car ? game.car.speed : player.speed,
    },
    world,
    game
  );
  missions.update(dt);

  // Waypoint beacon follows the active mission.
  if (missions.active && missions.waypoint) {
    setBeacon(missions.waypoint.x, missions.waypoint.z);
  } else {
    hideBeacon();
  }

  // Cash pickups.
  const pp = game.car ? game.car.group.position : player.pos;
  for (const pk of pickups) {
    if (pk.taken) {
      pk.respawn -= dt;
      if (pk.respawn <= 0) {
        pk.taken = false;
        pk.mesh.visible = true;
      }
      continue;
    }
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1 + Math.sin(t * 3 + pk.x) * 0.15;
    if (Math.hypot(pk.x - pp.x, pk.z - pp.z) < 2.4) {
      pk.taken = true;
      pk.respawn = 30;
      pk.mesh.visible = false;
      game.money += 50;
      hud.setMoney(game.money, game.debt);
      hud.message('Picked up $50');
      audio.pickup();
      effects.burst(pk.mesh.position, 0x37d67a, 10, 3, 2);
    }
  }

  // HUD + minimap.
  hud.setHealth(player.health);
  hud.setStars(police.wanted);
  const trafficDots = traffic.cars.map((c) => ({ x: c.group.position.x, z: c.group.position.z }));
  hud.drawMinimap(
    {
      px: pp.x,
      pz: pp.z,
      heading: game.car ? game.car.heading : player.yaw,
      waypoint: missions.active ? missions.waypoint : null,
      police: policePositions(police),
      traffic: trafficDots,
    },
    dt
  );

  game.saveTimer += dt;
  if (game.saveTimer > 10) {
    game.saveTimer = 0;
    saveGame();
  }

  updateCamera(dt);
}

// ---------------------------------------------------------------- buttons
document.getElementById('btn-start').addEventListener('click', () => startGame());
document.getElementById('btn-resume').addEventListener('click', () => {
  game.state = 'playing';
  hud.show(null);
  input.requestLock();
});
document.getElementById('btn-end').addEventListener('click', () => {
  if (game.debt <= 0 && missions.index >= MISSION_DEFS.length) {
    location.reload();
    return;
  }
  respawn();
});
document.getElementById('btn-restart').addEventListener('click', () => {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    /* ignore */
  }
  location.reload();
});

// ---------------------------------------------------------------- shot modes (for screenshots + testing)
function applyShot() {
  if (!shot || shot === 'start') return;
  startGame();
  if (shot === 'drive') {
    const car = makeCar(scene, 'sedan', 0, 40, Math.PI, 0x8a1f1f);
    parkedCars.push(car);
    enterCar(car);
    game.autopilot = true;
    car.autopilotIdx = 0;
  } else if (shot === 'chase') {
    const car = makeCar(scene, 'sport', 0, 40, Math.PI, 0xd21f3c);
    parkedCars.push(car);
    enterCar(car);
    game.autopilot = true;
    car.autopilotIdx = 0;
    setWanted(police, 3);
  } else if (shot === 'mission') {
    missions.start(1);
    // Stand on road x=60 with a clear view of the red sport car at (54,-30).
    player.pos.set(60, 0, -16);
    player.yaw = Math.atan2(54 - 60, -30 - -16);
    camYaw = player.yaw;
  }
}
applyShot();

// ---------------------------------------------------------------- main loop
let lastNow = performance.now();
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastNow) / 1000, 0.05);
  lastNow = nowMs;
  elapsed += dt;
  const t = elapsed;
  if (game.state === 'playing') {
    updatePlaying(dt, t);
  } else if (game.state === 'menu') {
    const a = t * 0.05;
    camera.position.set(Math.sin(a) * 95, 55, Math.cos(a) * 95);
    camera.lookAt(0, 0, 0);
    updateTraffic(traffic, dt, world, null, null, t);
  }
  beaconTop.rotation.y += dt * 2;
  effects.update(dt);
  renderer.render(scene, camera);
}
animate();

// Debug handle for testing.
window.__solmar = {
  game,
  missions,
  police,
  player,
  version: 3,
};
