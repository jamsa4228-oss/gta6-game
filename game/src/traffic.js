// Traffic and pedestrians: the city feels alive.
// Traffic cars loop rectangular routes along the road grid. Pedestrians stroll
// the sidewalks and scatter when a car gets close.
import * as THREE from 'three';
import { createCar, randomCarColor } from './car.js';
import { ROAD_COORDS } from './city.js';

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

// A rectangular loop on the road grid, inset so cars drive on the right side.
function loopRoute(rng) {
  const i = 1 + Math.floor(rng() * (ROAD_COORDS.length - 2));
  const j = 1 + Math.floor(rng() * (ROAD_COORDS.length - 2));
  const x0 = ROAD_COORDS[i] - 3;
  const x1 = ROAD_COORDS[i + 1] + 3;
  const z0 = ROAD_COORDS[j] - 3;
  const z1 = ROAD_COORDS[j + 1] + 3;
  const dir = rng() < 0.5 ? 1 : -1;
  const pts = [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
  if (dir < 0) pts.reverse();
  return pts;
}

export function createTraffic(scene, count) {
  const rng = mulberry32(1234);
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const route = loopRoute(rng);
    const start = route[Math.floor(rng() * route.length)];
    const car = createCar({
      scene,
      x: start.x,
      z: start.z,
      heading: 0,
      color: randomCarColor(rng),
    });
    car.state.route = route;
    car.state.wp = 0;
    car.state.speed = 7 + rng() * 3;
    car.state.cruise = car.state.speed;
    cars.push(car);
  }
  return cars;
}

export function stepTraffic(cars, dt, colliders) {
  for (const car of cars) {
    const s = car.state;
    const target = s.route[s.wp];
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) {
      s.wp = (s.wp + 1) % s.route.length;
      continue;
    }
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - s.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    s.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
    // Ease speed into corners.
    const cornerSlow = Math.abs(diff) > 0.6 ? 0.45 : 1;
    s.speed += (s.cruise * cornerSlow - s.speed) * Math.min(1, dt * 1.5);
    s.x += Math.sin(s.heading) * s.speed * dt;
    s.z += Math.cos(s.heading) * s.speed * dt;
    car.mesh.group.position.set(s.x, 0, s.z);
    car.mesh.group.rotation.y = s.heading;
    const spin = s.speed * dt * 2.2;
    for (const wheel of car.mesh.wheels) wheel.rotation.x += spin;
  }
}

function makePedestrianMesh(rng) {
  const group = new THREE.Group();
  const shirtColors = [0xd86a6a, 0x6a8ad8, 0x6ad86a, 0xd8c86a, 0x9a6ad8, 0xe0e0e0];
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColors[Math.floor(rng() * shirtColors.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: [0xc98a5a, 0x8a5a3a, 0xe0b090][Math.floor(rng() * 3)] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d34 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.58;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.24), pants);
  legL.position.set(-0.15, 0.33, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.24), pants);
  legR.position.set(0.15, 0.33, 0);
  group.add(legR);
  return { group, legL, legR };
}

export function createPedestrians(scene, count) {
  const rng = mulberry32(99);
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = makePedestrianMesh(rng);
    const road = ROAD_COORDS[Math.floor(rng() * ROAD_COORDS.length)];
    const along = (rng() * 2 - 1) * 140;
    const side = rng() < 0.5 ? 1 : -1;
    const x = rng() < 0.5 ? road + side * 8.5 : along;
    const z = rng() < 0.5 ? along : road + side * 8.5;
    mesh.group.position.set(x, 0, z);
    scene.add(mesh.group);
    peds.push({
      mesh,
      x, z,
      heading: rng() * Math.PI * 2,
      speed: 1 + rng() * 0.8,
      target: null,
      phase: rng() * 6,
      down: false,
      downTimer: 0,
      radius: 0.5,
    });
  }
  return peds;
}

export function stepPedestrians(peds, dt, playerCar, playerPos, onHit) {
  for (const ped of peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.down = false;
        ped.mesh.group.rotation.x = 0;
        ped.mesh.group.position.y = 0;
      }
      continue;
    }
    // Flee from a fast car nearby.
    let fleeX = 0;
    let fleeZ = 0;
    if (playerCar) {
      const dx = ped.x - playerCar.state.x;
      const dz = ped.z - playerCar.state.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && Math.abs(playerCar.state.speed) > 4) {
        fleeX = dx / (d || 1);
        fleeZ = dz / (d || 1);
      }
    }
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 2) {
      const road = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      const along = (Math.random() * 2 - 1) * 140;
      const side = Math.random() < 0.5 ? 1 : -1;
      ped.target = Math.random() < 0.5
        ? { x: road + side * 8.5, z: along }
        : { x: along, z: road + side * 8.5 };
    }
    let tx = ped.target.x - ped.x;
    let tz = ped.target.z - ped.z;
    if (fleeX !== 0 || fleeZ !== 0) {
      tx = fleeX * 10;
      tz = fleeZ * 10;
    }
    const len = Math.hypot(tx, tz) || 1;
    const vx = (tx / len) * ped.speed * (fleeX !== 0 ? 2.2 : 1);
    const vz = (tz / len) * ped.speed * (fleeX !== 0 ? 2.2 : 1);
    ped.x += vx * dt;
    ped.z += vz * dt;
    ped.heading = Math.atan2(vx, vz);
    ped.phase += dt * ped.speed * 3;
    ped.mesh.group.position.set(ped.x, 0, ped.z);
    ped.mesh.group.rotation.y = ped.heading;
    const swing = Math.sin(ped.phase) * 0.45;
    ped.mesh.legL.rotation.x = swing;
    ped.mesh.legR.rotation.x = -swing;

    // Hit by the player's car: knocked down, wanted up.
    if (playerCar && Math.abs(playerCar.state.speed) > 3) {
      const d = Math.hypot(ped.x - playerCar.state.x, ped.z - playerCar.state.z);
      if (d < 2.2) {
        ped.down = true;
        ped.downTimer = 6;
        ped.mesh.group.rotation.x = -Math.PI / 2;
        ped.mesh.group.position.y = 0.3;
        if (onHit) onHit(ped);
      }
    }
  }
}
