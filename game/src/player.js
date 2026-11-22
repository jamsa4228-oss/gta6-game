// SOLMAR BAY — Rico Vega on foot: walk, run, punch, shoot.
import * as THREE from 'three';
import { collideCircle } from './city.js';

export function createPlayer(scene) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a4d8f, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), jacket);
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.42), dark);
  cap.position.y = 1.8;
  g.add(cap);

  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  legGeo.translate(0, -0.36, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.14, 0.72, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.14, 0.72, 0);
  legR.castShadow = true;
  g.add(legR);

  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);
  armGeo.translate(0, -0.3, 0);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.34, 1.34, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.34, 1.34, 0);
  g.add(armR);

  // Pistol in the right hand, shown while shooting.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.3), dark);
  gun.position.set(0.34, 0.78, 0.18);
  gun.visible = false;
  g.add(gun);

  scene.add(g);
  return {
    group: g,
    pos: g.position,
    yaw: 0,
    health: 100,
    speed: 0,
    walkPhase: 0,
    radius: 0.6,
    legL,
    legR,
    armL,
    armR,
    gun,
    gunTimer: 0,
  };
}

/** WASD relative to camera yaw; Shift runs. Returns true when the player moved. */
export function updatePlayer(p, input, camYaw, dt, world) {
  const ax = input.axis();
  const run = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
  const targetSpeed = run ? 7 : 4;
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  const rx = -fz;
  const rz = fx;
  let mx = fx * ax.y + rx * ax.x;
  let mz = fz * ax.y + rz * ax.x;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 10);
    p.pos.x += mx * p.speed * dt;
    p.pos.z += mz * p.speed * dt;
    p.yaw = Math.atan2(mx, mz);
    p.walkPhase += p.speed * dt * 1.6;
  } else {
    p.speed += (0 - p.speed) * Math.min(1, dt * 10);
  }
  collideCircle(p.pos, p.radius, world.colliders, world.bounds);
  p.pos.y = 0;
  p.group.rotation.y = p.yaw;

  const swing = Math.min(1, p.speed / 4) * 0.55 * Math.sin(p.walkPhase);
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.7;
  p.armR.rotation.x = swing * 0.7;
  if (p.gunTimer > 0) {
    p.gunTimer -= dt;
    p.gun.visible = true;
    p.armR.rotation.x = -1.2;
  } else {
    p.gun.visible = false;
  }
  return len > 0.01;
}
