// The city's other inhabitants: traffic that loops the streets and pedestrians
// who stroll the sidewalks. Traffic slows for whatever is ahead of it; peds flee
// a speeding car and fall when one hits them (or a fist, or a bullet, does).
import * as THREE from 'three';
import { makeCar } from './car.js';
import { createFigure } from './player.js';
import { makeRng } from './city.js';

const TRAFFIC_COLORS = [0x8a8f96, 0x5e6b7a, 0x7a5e4e, 0x4e6b52, 0x6b5e7a, 0x9a8a6a];
const SHIRT_COLORS = [0xd95f4e, 0x4e8ad9, 0x6ab04e, 0xd9b34e, 0x9a5fd9, 0xe8e8e8, 0x3a3f47];

const STREETS = [-160, -80, 0, 80, 160];

function loopRoute(rng) {
  // A rectangle loop around one block: four corners, driven in order.
  const cx = STREETS[1 + Math.floor(rng() * 3)];
  const cz = STREETS[1 + Math.floor(rng() * 3)];
  const hw = 40;
  return [
    new THREE.Vector3(cx - hw, 0, cz - hw),
    new THREE.Vector3(cx + hw, 0, cz - hw),
    new THREE.Vector3(cx + hw, 0, cz + hw),
    new THREE.Vector3(cx - hw, 0, cz + hw),
  ];
}

export function createTraffic(scene, city, seed) {
  const rng = makeRng(seed + 77);
  const cars = [];
  const peds = [];

  for (let i = 0; i < 10; i += 1) {
    const route = loopRoute(rng);
    const start = route[0];
    const car = makeCar(scene, {
      color: TRAFFIC_COLORS[i % TRAFFIC_COLORS.length],
      x: start.x,
      z: start.z,
      heading: 0,
      maxSpeed: 10 + rng() * 4,
      beam: false,
    });
    car.route = route;
    car.leg = 1;
    car.speed = 0;
    cars.push(car);
  }

  function spawnPed() {
    const street = STREETS[Math.floor(rng() * STREETS.length)];
    const along = rng() < 0.5;
    const pos = along
      ? new THREE.Vector3(street + 8 + rng() * 4, 0, -180 + rng() * 360)
      : new THREE.Vector3(-180 + rng() * 360, 0, street + 8 + rng() * 4);
    const figure = createFigure(SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)]);
    figure.group.position.copy(pos);
    scene.add(figure.group);
    return {
      ...figure,
      pos: figure.group.position,
      heading: rng() * Math.PI * 2,
      speed: 1 + rng() * 0.7,
      walkPhase: rng() * 6,
      down: false,
      downTimer: 0,
      fleeing: false,
    };
  }
  for (let i = 0; i < 16; i += 1) peds.push(spawnPed());

  function fallPed(ped) {
    if (ped.down) return;
    ped.down = true;
    ped.downTimer = 0;
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.35;
  }

  return {
    cars,
    peds,
    fallPed,
    /** The ped within `radius` of `pos`, or null. Used for car hits. */
    pedNear(pos, radius) {
      for (const ped of peds) {
        if (ped.down) continue;
        const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
        if (d < radius) return ped;
      }
      return null;
    },
    update(dt, player, colliders) {
      // Traffic: follow the loop, slowing for whatever is ahead.
      for (const car of cars) {
        const target = car.route[car.leg % car.route.length];
        const dx = target.x - car.pos.x;
        const dz = target.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 4) {
          car.leg += 1;
          continue;
        }
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        let throttle = 1;
        const aheadX = car.pos.x + Math.sin(car.heading) * 9;
        const aheadZ = car.pos.z + Math.cos(car.heading) * 9;
        for (const other of cars) {
          if (other === car) continue;
          if (Math.hypot(other.pos.x - aheadX, other.pos.z - aheadZ) < 4) throttle = 0;
        }
        if (player.car) {
          if (Math.hypot(player.car.pos.x - aheadX, player.car.pos.z - aheadZ) < 4.5) throttle = 0;
        }
        car.update(dt, { throttle, steer: Math.max(-1, Math.min(1, diff * 1.8)) }, colliders, cars);
      }
      // Pedestrians: stroll, flee a speeding car, get up again after a fall.
      for (const ped of peds) {
        if (ped.down) {
          ped.downTimer += dt;
          if (ped.downTimer > 4) {
            const fresh = spawnPed();
            ped.group.position.copy(fresh.pos);
            ped.group.rotation.set(0, fresh.heading, 0);
            ped.group.position.y = 0;
            scene.remove(fresh.group);
            ped.heading = fresh.heading;
            ped.speed = fresh.speed;
            ped.down = false;
            ped.downTimer = 0;
          }
          continue;
        }
        const playerPos = player.inCar && player.car ? player.car.pos : player.pos;
        const playerSpeed = player.inCar && player.car ? Math.abs(player.car.speed) : 0;
        const dPlayer = Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
        ped.fleeing = player.inCar && playerSpeed > 8 && dPlayer < 14;
        let speed = ped.speed;
        let heading = ped.heading;
        if (ped.fleeing) {
          speed = 4.2;
          heading = Math.atan2(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
        }
        ped.heading = heading;
        ped.pos.x += Math.sin(heading) * speed * dt;
        ped.pos.z += Math.cos(heading) * speed * dt;
        if (ped.pos.x < -192 || ped.pos.x > 192 || ped.pos.z < -192 || ped.pos.z > 232) {
          ped.heading += Math.PI;
        }
        city.resolveCircle(ped.pos, 0.6, city.colliders);
        city.clampBounds(ped.pos, 0.6);
        ped.walkPhase += dt * speed * 2.2;
        const swing = Math.sin(ped.walkPhase) * 0.5;
        ped.legL.rotation.x = swing;
        ped.legR.rotation.x = -swing;
        ped.armL.rotation.x = -swing * 0.7;
        ped.armR.rotation.x = swing * 0.7;
        ped.group.rotation.y = ped.heading;
      }
    },
  };
}
