// SOLMAR BAY — road traffic and sidewalk pedestrians.
import * as THREE from 'three';
import { makeCar, updateCar, CAR_COLORS } from './car.js';
import { collideCircle, randomSidewalkPoint } from './city.js';

const SHIRTS = [0xd8d8d8, 0x4a7a4a, 0xc98a3a, 0x7a4a6a, 0x3a6a8a, 0xa03a3a, 0x8a8a2a];

function makePed(scene, rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({
    color: SHIRTS[Math.floor(rng() * SHIRTS.length)],
    roughness: 0.9,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), shirt);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 1.52;
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.17, 0.66, 0.2);
  legGeo.translate(0, -0.33, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.12, 0.66, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.12, 0.66, 0);
  g.add(legR);
  scene.add(g);
  return {
    group: g,
    pos: g.position,
    hp: 50,
    state: 'walk',
    target: { x: 0, z: 0 },
    speed: 1.1 + rng() * 0.5,
    walkPhase: rng() * 6,
    fleeUntil: 0,
    dead: false,
    respawnIn: 0,
    legL,
    legR,
    onDeath: null,
  };
}

export function createTraffic(scene, city, rng) {
  const cars = [];
  const loops = city.loops;
  const types = ['sedan', 'sedan', 'taxi', 'truck', 'sedan', 'taxi'];
  for (let i = 0; i < 10; i++) {
    const type = types[i % types.length];
    const loop = loops[i % loops.length];
    const idx = Math.floor(rng() * loop.length);
    const p = loop[idx];
    const colors = CAR_COLORS[type];
    const color = colors[Math.floor(rng() * colors.length)];
    const car = makeCar(scene, type, p[0], p[1], 0, color);
    car.driver = 'traffic';
    car.loop = loop;
    car.loopIdx = (idx + 1) % loop.length;
    car.cruise = 8 + rng() * 4;
    cars.push(car);
  }
  const peds = [];
  for (let i = 0; i < 14; i++) {
    const ped = makePed(scene, rng);
    const sp = randomSidewalkPoint(rng);
    ped.pos.set(sp.x, 0, sp.z);
    const tp = randomSidewalkPoint(rng);
    ped.target = tp;
    peds.push(ped);
  }
  return { cars, peds };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function updateTraffic(t, dt, world, playerCar, danger, now) {
  for (const car of t.cars) {
    const p = car.loop[car.loopIdx];
    const dx = p[0] - car.group.position.x;
    const dz = p[1] - car.group.position.z;
    if (Math.hypot(dx, dz) < 9) car.loopIdx = (car.loopIdx + 1) % car.loop.length;
    const want = Math.atan2(dx, dz);
    const diff = wrapAngle(want - car.heading);
    let throttle = car.speed < car.cruise ? 0.7 : 0;
    // Stop for the player's car ahead.
    if (playerCar) {
      const px = playerCar.group.position.x - car.group.position.x;
      const pz = playerCar.group.position.z - car.group.position.z;
      const d = Math.hypot(px, pz);
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      if (d < 9 && (px * fx + pz * fz) / (d || 1) > 0.7) {
        throttle = car.speed > 1 ? -1 : 0;
      }
    }
    updateCar(car, { throttle, steer: Math.max(-1, Math.min(1, diff * 1.8)), handbrake: false }, dt, world);
  }

  for (const ped of t.peds) {
    if (ped.dead) {
      ped.respawnIn -= dt;
      if (ped.respawnIn <= 0) {
        ped.dead = false;
        ped.hp = 50;
        ped.group.visible = true;
        ped.group.rotation.x = 0;
        const sp = randomSidewalkPoint(Math.random);
        ped.pos.set(sp.x, 0, sp.z);
      }
      continue;
    }
    let speed = ped.speed;
    let tx = ped.target.x;
    let tz = ped.target.z;
    if (danger && now < danger.until) {
      const dx = ped.pos.x - danger.x;
      const dz = ped.pos.z - danger.z;
      const d = Math.hypot(dx, dz);
      if (d < 18) {
        tx = ped.pos.x + (dx / (d || 1)) * 20;
        tz = ped.pos.z + (dz / (d || 1)) * 20;
        speed = 3.6;
        ped.fleeUntil = now + 2.5;
      }
    }
    if (now < ped.fleeUntil && (!danger || now >= danger.until)) {
      // Keep running away for a moment after the scare.
      speed = 3.2;
    }
    const dx = tx - ped.pos.x;
    const dz = tz - ped.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5 && speed < 3) {
      const tp = randomSidewalkPoint(Math.random);
      ped.target = tp;
    } else {
      const want = Math.atan2(dx, dz);
      const diff = wrapAngle(want - ped.group.rotation.y);
      ped.group.rotation.y += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      ped.pos.x += Math.sin(ped.group.rotation.y) * speed * dt;
      ped.pos.z += Math.cos(ped.group.rotation.y) * speed * dt;
      ped.walkPhase += speed * dt * 2.2;
      const swing = 0.5 * Math.sin(ped.walkPhase);
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
    }
    collideCircle(ped.pos, 0.5, world.colliders, world.bounds);
    ped.pos.y = 0;
  }
}

/** A pedestrian is run over: falls down and will respawn later. */
export function killPed(ped) {
  ped.hp = 0;
  ped.dead = true;
  ped.respawnIn = 10;
  ped.group.rotation.x = -Math.PI / 2;
  ped.group.position.y = 0.3;
  if (ped.onDeath) ped.onDeath();
}
