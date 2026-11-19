// The player on foot: a low-poly figure, WASD relative to the camera yaw,
// Shift to run, simple circle-vs-building collision.
import * as THREE from 'three';
import { resolveCollisions } from './car.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e6f8e });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d34 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.42), hair);
  hairTop.position.y = 1.9;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pants);
  legL.position.set(-0.17, 0.36, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pants);
  legR.position.set(0.17, 0.36, 0);
  legR.castShadow = true;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), shirt);
  armL.position.set(-0.42, 1.12, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), shirt);
  armR.position.set(0.42, 1.12, 0);
  group.add(armR);
  // A visible pistol in the right hand so combat reads on screen.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x1c1e22 }));
  gun.position.set(0.42, 0.82, 0.18);
  group.add(gun);
  return { group, legL, legR, armL, armR };
}

export function createPlayer(scene, x, z) {
  const mesh = makePlayerMesh();
  mesh.group.position.set(x, 0, z);
  scene.add(mesh.group);
  const state = {
    x, z,
    heading: 0,
    radius: 0.6,
    speed: 0,
    moving: false,
    walkPhase: 0,
  };
  return { mesh, state };
}

const WALK_SPEED = 5.2;
const RUN_SPEED = 8.5;

export function stepPlayer(player, keys, camYaw, dt, colliders) {
  const s = player.state;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = running ? RUN_SPEED : WALK_SPEED;
  let mx = 0;
  let mz = 0;
  if (f !== 0 || r !== 0) {
    // WASD relative to the camera yaw.
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    mx = (-sin * f + cos * r);
    mz = (-cos * f - sin * r);
    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;
    s.x += mx * speed * dt;
    s.z += mz * speed * dt;
    s.heading = Math.atan2(mx, mz);
    s.moving = true;
    s.speed = speed;
    s.walkPhase += dt * speed * 1.6;
  } else {
    s.moving = false;
    s.speed = 0;
  }
  resolveCollisions(s, colliders, false);
  player.mesh.group.position.set(s.x, 0, s.z);
  player.mesh.group.rotation.y = s.heading;
  // Walk swing.
  const swing = s.moving ? Math.sin(s.walkPhase) * 0.5 : 0;
  player.mesh.legL.rotation.x = swing;
  player.mesh.legR.rotation.x = -swing;
  player.mesh.armL.rotation.x = -swing * 0.7;
  player.mesh.armR.rotation.x = swing * 0.7;
}
