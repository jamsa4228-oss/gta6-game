// Rico on foot, and the same little figure reused for pedestrians.
// A low-poly person: jacket body, head, swinging legs and arms, built once
// from shared geometry and tinted per figure. Walks camera-relative, turns
// toward where he moves, and resolves against the city's boxes like a car.
import * as THREE from 'three';
import { resolveCircle } from './city.js';

const BODY_GEO = new THREE.BoxGeometry(0.62, 0.85, 0.38);
const HEAD_GEO = new THREE.SphereGeometry(0.26, 12, 10);
const LIMB_GEO = new THREE.BoxGeometry(0.2, 0.75, 0.2);
const ARM_GEO = new THREE.BoxGeometry(0.16, 0.7, 0.16);
const SKIN_MAT = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
const HAIR_MAT = new THREE.MeshLambertMaterial({ color: 0x1c1a18 });
const PANTS_MAT = new THREE.MeshLambertMaterial({ color: 0x2b3442 });

/** Build one figure. `shirt` is the jacket colour; the rest is shared. */
export function createFigure(shirt, pants = 0x2b3442) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = pants === 0x2b3442 ? PANTS_MAT : new THREE.MeshLambertMaterial({ color: pants });
  const body = new THREE.Mesh(BODY_GEO, shirtMat);
  body.position.y = 1.15;
  group.add(body);
  const head = new THREE.Mesh(HEAD_GEO, SKIN_MAT);
  head.position.y = 1.82;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), HAIR_MAT);
  hair.position.y = 1.86;
  group.add(hair);
  const legL = new THREE.Mesh(LIMB_GEO, pantsMat);
  legL.position.set(-0.17, 0.42, 0);
  group.add(legL);
  const legR = new THREE.Mesh(LIMB_GEO, pantsMat);
  legR.position.set(0.17, 0.42, 0);
  group.add(legR);
  const armL = new THREE.Mesh(ARM_GEO, shirtMat);
  armL.position.set(-0.42, 1.2, 0);
  group.add(armL);
  const armR = new THREE.Mesh(ARM_GEO, shirtMat);
  armR.position.set(0.42, 1.2, 0);
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

export function createPlayer(scene, start) {
  const figure = createFigure(0x2e7d6b);
  const group = figure.group;
  group.position.copy(start);
  scene.add(group);
  const player = {
    group,
    pos: group.position,
    heading: 0,
    health: 100,
    radius: 0.7,
    walkPhase: 0,
    moving: false,
    /** Step the player. `move` is {x, z} in camera space, cameraYaw the camera's heading. */
    update(dt, move, cameraYaw, run, colliders) {
      const len = Math.hypot(move.x, move.z);
      player.moving = len > 0.1;
      if (player.moving) {
        const nx = move.x / len;
        const nz = move.z / len;
        const speed = run ? 9 : 5.5;
        // Camera space to world space: forward is where the camera looks,
        // right is 90 degrees clockwise from it.
        const wx = nx * Math.cos(cameraYaw) + nz * Math.sin(cameraYaw);
        const wz = -nx * Math.sin(cameraYaw) + nz * Math.cos(cameraYaw);
        player.pos.x += wx * speed * dt;
        player.pos.z += wz * speed * dt;
        const target = Math.atan2(wx, wz);
        let diff = target - player.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.heading += diff * Math.min(1, dt * 12);
        player.walkPhase += dt * speed * 1.6;
      }
      resolveCircle(player.pos, player.radius, colliders);
      group.rotation.y = player.heading;
      const swing = player.moving ? Math.sin(player.walkPhase) * 0.55 : 0;
      figure.legL.rotation.x = swing;
      figure.legR.rotation.x = -swing;
      figure.armL.rotation.x = -swing * 0.7;
      figure.armR.rotation.x = swing * 0.7;
    },
    hurt(amount) {
      player.health = Math.max(0, player.health - amount);
      return player.health;
    },
    reset(startPos) {
      player.pos.copy(startPos);
      player.heading = 0;
      player.health = 100;
    },
  };
  return player;
}
