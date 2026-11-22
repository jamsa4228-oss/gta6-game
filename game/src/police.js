// SOLMAR BAY — wanted level, police car chases, foot cops, busted / lost-the-cops.
import * as THREE from 'three';
import { makeCar, updateCar } from './car.js';
import { collideCircle } from './city.js';

export function createPolice(scene, city) {
  return {
    scene,
    city,
    wanted: 0,
    cars: [],
    foot: [],
    decayTimer: 0,
    bustedTimer: 0,
    hitCooldown: 0,
  };
}

export function addWanted(p, n) {
  p.wanted = Math.max(0, Math.min(5, p.wanted + n));
  if (n > 0) p.decayTimer = 0;
}

export function setWanted(p, n) {
  p.wanted = Math.max(0, Math.min(5, n));
  p.decayTimer = 0;
  p.bustedTimer = 0;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function roadPointNear(city, nearPos, minD, maxD) {
  const roads = [-120, -60, 0, 60, 120];
  for (let tries = 0; tries < 24; tries++) {
    const onVertical = Math.random() < 0.5;
    const x = onVertical ? roads[Math.floor(Math.random() * roads.length)] : -140 + Math.random() * 280;
    const z = onVertical ? -140 + Math.random() * 280 : roads[Math.floor(Math.random() * roads.length)];
    const d = Math.hypot(x - nearPos.x, z - nearPos.z);
    if (d >= minD && d <= maxD) return { x, z };
  }
  return { x: nearPos.x + 55, z: nearPos.z };
}

function spawnPoliceCar(p, nearPos) {
  const spot = roadPointNear(p.city, nearPos, 50, 75);
  const car = makeCar(p.scene, 'police', spot.x, spot.z, Math.random() * Math.PI * 2, 0xeeeeee);
  car.driver = 'police';
  car.ramCooldown = 0;
  p.cars.push(car);
  return car;
}

function makeFootCop(scene) {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), navy);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.62;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), dark);
  cap.position.y = 1.8;
  g.add(cap);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  legGeo.translate(0, -0.36, 0);
  const legL = new THREE.Mesh(legGeo, navy);
  legL.position.set(-0.14, 0.72, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, navy);
  legR.position.set(0.14, 0.72, 0);
  g.add(legR);
  scene.add(g);
  return { group: g, pos: g.position, hp: 100, legL, legR, walkPhase: 0, attackT: 0, onDeath: null };
}

function spawnFootCop(p, nearPos) {
  const spot = roadPointNear(p.city, nearPos, 25, 40);
  const cop = makeFootCop(p.scene);
  cop.pos.set(spot.x, 0, spot.z);
  p.foot.push(cop);
  return cop;
}

function removeCar(p, car) {
  p.scene.remove(car.group);
  const i = p.cars.indexOf(car);
  if (i >= 0) p.cars.splice(i, 1);
}

function removeCop(p, cop) {
  p.scene.remove(cop.group);
  const i = p.foot.indexOf(cop);
  if (i >= 0) p.foot.splice(i, 1);
}

/**
 * target: {pos, inCar, car, speed}. game: {damage, shake, message, busted, audio}.
 */
export function updatePolice(p, dt, target, world, game) {
  const wantCars = p.wanted >= 1 ? Math.min(3, p.wanted) : 0;
  const wantFoot = p.wanted >= 3 ? p.wanted - 2 : 0;

  while (p.cars.length < wantCars) spawnPoliceCar(p, target.pos);
  while (p.cars.length > wantCars) removeCar(p, p.cars[p.cars.length - 1]);
  while (p.foot.length < wantFoot) spawnFootCop(p, target.pos);
  while (p.foot.length > wantFoot) removeCop(p, p.foot[p.foot.length - 1]);

  p.hitCooldown = Math.max(0, p.hitCooldown - dt);

  for (const car of p.cars) {
    const dx = target.pos.x - car.group.position.x;
    const dz = target.pos.z - car.group.position.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const diff = wrapAngle(want - car.heading);
    car.ramCooldown = Math.max(0, car.ramCooldown - dt);
    updateCar(car, { throttle: 1, steer: Math.max(-1, Math.min(1, diff * 2)), handbrake: false }, dt, world);
    if (d < 4 && car.ramCooldown <= 0) {
      car.ramCooldown = 0.8;
      if (target.inCar && target.car) {
        target.car.speed *= 0.8;
        game.damage(2);
        game.shake(0.35);
      } else if (d < 2.6) {
        game.damage(6);
        game.shake(0.3);
      }
    }
  }

  let nearest = 999;
  for (const cop of p.foot) {
    const dx = target.pos.x - cop.pos.x;
    const dz = target.pos.z - cop.pos.z;
    const d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    const want = Math.atan2(dx, dz);
    const diff = wrapAngle(want - cop.group.rotation.y);
    cop.group.rotation.y += Math.max(-3 * dt, Math.min(3 * dt, diff));
    const speed = 5.6;
    cop.pos.x += Math.sin(cop.group.rotation.y) * speed * dt;
    cop.pos.z += Math.cos(cop.group.rotation.y) * speed * dt;
    cop.walkPhase += speed * dt * 2;
    const swing = 0.5 * Math.sin(cop.walkPhase);
    cop.legL.rotation.x = swing;
    cop.legR.rotation.x = -swing;
    collideCircle(cop.pos, 0.5, world.colliders, world.bounds);
    cop.pos.y = 0;
    cop.attackT -= dt;
    if (d < 2.2 && cop.attackT <= 0 && !target.inCar) {
      cop.attackT = 0.9;
      game.damage(8);
      game.shake(0.25);
    }
  }
  for (const car of p.cars) {
    nearest = Math.min(nearest, Math.hypot(target.pos.x - car.group.position.x, target.pos.z - car.group.position.z));
  }

  // Busted: a foot cop stands on top of the player on foot.
  if (!target.inCar && p.foot.length > 0 && nearest < 2.4) {
    p.bustedTimer += dt;
    if (p.bustedTimer > 2.5) {
      p.bustedTimer = 0;
      game.busted();
    }
  } else {
    p.bustedTimer = Math.max(0, p.bustedTimer - dt * 2);
  }

  // Wanted decays when no cop can see the player for a while.
  if (p.wanted > 0) {
    if (nearest > 45) {
      p.decayTimer += dt;
      if (p.decayTimer > 8) {
        p.wanted -= 1;
        p.decayTimer = 0;
        game.message('You lost the cops. Wanted level dropped.');
      }
    } else {
      p.decayTimer = 0;
    }
  }

  game.audio.siren(p.wanted >= 1, dt);
}

/** Positions for the minimap: {x, z, kind}. */
export function policePositions(p) {
  const out = [];
  for (const c of p.cars) out.push({ x: c.group.position.x, z: c.group.position.z, kind: 'car' });
  for (const c of p.foot) out.push({ x: c.pos.x, z: c.pos.z, kind: 'foot' });
  return out;
}
