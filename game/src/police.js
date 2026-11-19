// Wanted level and police: crimes raise the heat, police cars spawn and chase,
// the heat cools off when the player stays clean.
import * as THREE from 'three';
import { createCar } from './car.js';

export function createPolice(scene) {
  return {
    wanted: 0,
    cars: [],
    cooldown: 0,
    decayTimer: 0,
    sirenPhase: 0,
  };
}

export function addWanted(police, amount) {
  police.wanted = Math.max(0, Math.min(5, police.wanted + amount));
  police.cooldown = 20;
  police.decayTimer = 0;
}

export function setWanted(police, level) {
  police.wanted = Math.max(0, Math.min(5, level));
  police.cooldown = 20;
  police.decayTimer = 0;
}

// Spawn / despawn police cars to match the wanted level.
function syncPoliceCars(police, scene, playerPos, rng) {
  const want = police.wanted > 0 ? Math.min(police.wanted, 3) : 0;
  while (police.cars.length < want) {
    const angle = rng() * Math.PI * 2;
    const dist = 55 + rng() * 25;
    const car = createCar({
      scene,
      x: playerPos.x + Math.sin(angle) * dist,
      z: playerPos.z + Math.cos(angle) * dist,
      heading: 0,
      color: 0x14161a,
      isPolice: true,
    });
    car.state.cruise = 20 + police.wanted * 2.5;
    police.cars.push(car);
  }
  while (police.cars.length > want) {
    const car = police.cars.pop();
    scene.remove(car.mesh.group);
  }
}

export function stepPolice(police, scene, dt, elapsed, playerPos, playerCar, playerSpeed, onRam) {
  if (police.wanted > 0) {
    police.cooldown -= dt;
    if (police.cooldown <= 0) {
      police.decayTimer += dt;
      if (police.decayTimer >= 10) {
        police.decayTimer = 0;
        police.wanted = Math.max(0, police.wanted - 1);
        if (police.wanted > 0) police.cooldown = 20;
      }
    }
  }
  syncPoliceCars(police, scene, playerPos, Math.random);

  police.sirenPhase += dt;
  const flash = Math.sin(police.sirenPhase * 9) > 0;
  for (const car of police.cars) {
    const s = car.state;
    // Chase: steer toward the player, faster than traffic.
    const dx = playerPos.x - s.x;
    const dz = playerPos.z - s.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - s.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    s.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
    const targetSpeed = dist > 6 ? s.cruise : s.cruise * 0.4;
    s.speed += (targetSpeed - s.speed) * Math.min(1, dt * 1.2);
    s.x += Math.sin(s.heading) * s.speed * dt;
    s.z += Math.cos(s.heading) * s.speed * dt;
    car.mesh.group.position.set(s.x, 0, s.z);
    car.mesh.group.rotation.y = s.heading;
    const spin = s.speed * dt * 2.2;
    for (const wheel of car.mesh.wheels) wheel.rotation.x += spin;
    // Flashing light bar.
    if (car.mesh.lightBarA) {
      car.mesh.lightBarA.material.color.setHex(flash ? 0x2244ff : 0x112266);
      car.mesh.lightBarB.material.color.setHex(flash ? 0x661111 : 0xff2222);
    }
    // Ram the player: touch the player (on foot or in car).
    if (dist < 3.4 && onRam) onRam(car, dist);
  }
}

export function clearPolice(police, scene) {
  police.wanted = 0;
  police.cooldown = 0;
  police.decayTimer = 0;
  for (const car of police.cars) scene.remove(car.mesh.group);
  police.cars.length = 0;
}
