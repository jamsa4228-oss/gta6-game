// Cars: a box-built mesh factory and arcade drive physics.
// One car = body + cabin + 4 wheels + lights. Physics: accelerate, steer by
// speed, brake/reverse, handbrake drift. Circle collision vs buildings.
import * as THREE from 'three';

const CAR_COLORS = [0xc23a2e, 0x2e6fc2, 0xe0d8c8, 0x3a3d42, 0x2ea86a, 0xd8a62a, 0x7a4a9a, 0x9a9a9a];

export function makeCarMesh(color, isPolice = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc8dd });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.9), bodyMat);
  hood.position.set(0, 0.95, 1.75);
  group.add(hood);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights + taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    lamp.position.set(hx, 0.6, 2.22);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd83226 });
  for (const tx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    lamp.position.set(tx, 0.6, -2.22);
    group.add(lamp);
  }

  let lightBar = null;
  let lightBarA = null;
  let lightBarB = null;
  if (isPolice) {
    // Black-and-white police livery: white doors band + light bar.
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.34, 2.4), new THREE.MeshLambertMaterial({ color: 0xf0f0ea }));
    band.position.set(0, 0.62, -0.1);
    group.add(band);
    lightBar = new THREE.Group();
    lightBarA = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    lightBarA.position.set(-0.4, 1.55, -0.2);
    lightBarB = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lightBarB.position.set(0.4, 1.55, -0.2);
    lightBar.add(lightBarA);
    lightBar.add(lightBarB);
    group.add(lightBar);
  }

  return { group, wheels, lightBar, lightBarA, lightBarB };
}

export function createCar({ scene, x, z, heading, color, isPolice = false, isPlayerCar = false }) {
  const mesh = makeCarMesh(color, isPolice);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  scene.add(mesh.group);
  const state = {
    x, z, heading,
    speed: 0,
    steer: 0,
    isPolice,
    isPlayerCar,
    color,
    health: 100,
    radius: 2.1,
    // AI chase fields (police).
    target: null,
    stuckTimer: 0,
  };
  return { mesh, state };
}

export const CAR_TOP_SPEED = 34;
export const CAR_ACCEL = 16;
export const CAR_BRAKE = 30;

export function driveCar(car, input, dt, colliders) {
  const s = car.state;
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const left = input.left ? 1 : 0;
  const right = input.right ? 1 : 0;
  const handbrake = !!input.handbrake;

  // Throttle / brake / reverse.
  if (forward) s.speed += CAR_ACCEL * dt;
  if (back) {
    if (s.speed > 0.5) s.speed -= CAR_BRAKE * dt;
    else s.speed -= CAR_ACCEL * 0.55 * dt;
  }
  if (!forward && !back) {
    // Rolling drag.
    s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), 6 * dt);
  }
  if (handbrake) {
    s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), 26 * dt);
  }
  s.speed = Math.max(-12, Math.min(CAR_TOP_SPEED, s.speed));

  // Steering scales with speed; handbrake lets the rear step out.
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  s.steer += (steerTarget - s.steer) * Math.min(1, dt * 8);
  const steerAuthority = Math.min(1, Math.abs(s.speed) / 8) * (handbrake ? 1.6 : 1);
  s.heading += s.steer * steerAuthority * (s.speed / CAR_TOP_SPEED) * 2.4 * dt * Math.sign(s.speed || 1);

  // Move, then resolve building collisions (circle vs AABB).
  const nx = s.x + Math.sin(s.heading) * s.speed * dt;
  const nz = s.z + Math.cos(s.heading) * s.speed * dt;
  s.x = nx;
  s.z = nz;
  resolveCollisions(s, colliders, true);

  car.mesh.group.position.set(s.x, 0, s.z);
  car.mesh.group.rotation.y = s.heading;
  // Wheel spin + front-wheel steer.
  const spin = s.speed * dt * 2.2;
  for (let i = 0; i < car.mesh.wheels.length; i += 1) {
    car.mesh.wheels[i].rotation.x += spin;
  }
  car.mesh.wheels[0].rotation.y = s.steer * 0.4;
  car.mesh.wheels[1].rotation.y = s.steer * 0.4;
}

// Push a circle (car/player) out of building AABBs. Cars lose speed on impact.
export function resolveCollisions(s, colliders, isCar) {
  const r = s.radius || 0.6;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(s.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(s.z, c.maxZ));
    const dx = s.x - cx;
    const dz = s.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        s.x += dx * push;
        s.z += dz * push;
      } else {
        // Dead centre: push along the smallest penetration axis.
        const pl = s.x - c.minX;
        const pr = c.maxX - s.x;
        const pt = s.z - c.minZ;
        const pb = c.maxZ - s.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) s.x = c.minX - r;
        else if (m === pr) s.x = c.maxX + r;
        else if (m === pt) s.z = c.minZ - r;
        else s.z = c.maxZ + r;
      }
      if (isCar && Math.abs(s.speed) > 4) {
        s.speed *= 0.35;
        s.justCrashed = true;
      }
    }
  }
}

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}
