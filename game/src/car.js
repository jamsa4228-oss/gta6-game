// SOLMAR BAY — cars: mesh builder + arcade driving physics.
import * as THREE from 'three';
import { collideCircle } from './city.js';

export const CAR_TYPES = {
  sedan: { top: 32, accel: 13, brake: 26, len: 4.4, wid: 1.9, h: 0.62 },
  taxi: { top: 32, accel: 13, brake: 26, len: 4.4, wid: 1.9, h: 0.62 },
  truck: { top: 24, accel: 9, brake: 22, len: 5.6, wid: 2.2, h: 1.0 },
  sport: { top: 46, accel: 19, brake: 30, len: 4.2, wid: 1.9, h: 0.52 },
  police: { top: 40, accel: 17, brake: 30, len: 4.4, wid: 1.9, h: 0.62 },
};

export const CAR_COLORS = {
  sedan: [0x8a1f1f, 0x1f3a8a, 0xb8b8b8, 0x222222, 0x2a6b4a],
  taxi: [0xf5c518],
  truck: [0x4a6b3a, 0x7a5a2a, 0x5a5a6a],
  sport: [0xd21f3c, 0xff7a00, 0x7a1fd2],
  police: [0xeeeeee],
};

export function createCarMesh(type, colorHex) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.5, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.9, roughness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const bodyH = spec.h;
  const len = spec.len;
  const wid = spec.wid;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), paint);
  body.position.y = 0.45 + bodyH / 2;
  body.castShadow = true;
  g.add(body);

  const cabLen = len * 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.86, 0.55, cabLen), glass);
  cabin.position.set(0, 0.45 + bodyH + 0.27, -len * 0.06);
  cabin.castShadow = true;
  g.add(cabin);

  if (type === 'truck') {
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(wid * 0.95, 0.5, len * 0.42),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 })
    );
    bed.position.set(0, 0.45 + bodyH + 0.2, -len * 0.2);
    g.add(bed);
    cabin.position.set(0, 0.45 + bodyH + 0.27, len * 0.28);
  }

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    h.position.set(s * (wid / 2 - 0.3), 0.62, len / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    t.position.set(s * (wid / 2 - 0.3), 0.62, -len / 2 - 0.01);
    g.add(t);
  }

  if (type === 'police') {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    r.position.x = -0.28;
    bar.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    b.position.x = 0.28;
    bar.add(b);
    bar.position.set(0, 0.45 + bodyH + 0.62, 0);
    g.add(bar);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, 0.45 + bodyH + 0.62, 0);
    g.add(sign);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = {};
  const corners = {
    fl: [-wid / 2 + 0.1, len / 2 - 0.8],
    fr: [wid / 2 - 0.1, len / 2 - 0.8],
    rl: [-wid / 2 + 0.1, -len / 2 + 0.8],
    rr: [wid / 2 - 0.1, -len / 2 + 0.8],
  };
  for (const [key, [wx, wz]] of Object.entries(corners)) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const mesh = new THREE.Mesh(wheelGeo, dark);
    mesh.castShadow = true;
    pivot.add(mesh);
    g.add(pivot);
    wheels[key] = { pivot, mesh };
  }
  return { group: g, wheels, body };
}

export function makeCar(scene, type, x, z, heading, colorHex) {
  const mesh = createCarMesh(type, colorHex);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  scene.add(mesh.group);
  return {
    type,
    spec: CAR_TYPES[type],
    group: mesh.group,
    wheels: mesh.wheels,
    heading,
    speed: 0,
    steer: 0,
    radius: type === 'truck' ? 2.6 : 2.2,
    color: colorHex,
    driver: null,
    stolen: false,
    autopilotIdx: 0,
  };
}

/** Arcade driving: throttle -1..1, steer -1..1, handbrake bool. */
export function updateCar(car, ctl, dt, world) {
  const spec = car.spec;
  if (ctl.throttle > 0) {
    car.speed += spec.accel * ctl.throttle * dt;
  } else if (ctl.throttle < 0) {
    if (car.speed > 0.5) car.speed += spec.brake * ctl.throttle * dt;
    else car.speed += spec.accel * 0.6 * ctl.throttle * dt;
  }
  car.speed -= car.speed * 0.35 * dt;
  if (ctl.handbrake) car.speed -= car.speed * 2.2 * dt;
  car.speed = Math.max(-10, Math.min(spec.top, car.speed));
  if (Math.abs(car.speed) < 0.05 && ctl.throttle === 0) car.speed = 0;

  const spd = Math.abs(car.speed);
  const authority = Math.min(1, spd / 6) * (1 - Math.min(1, spd / spec.top) * 0.45);
  car.steer += ((ctl.steer || 0) - car.steer) * Math.min(1, dt * 8);
  car.heading += car.steer * authority * 1.9 * dt * (car.speed >= 0 ? 1 : -1);

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.group.position.x += fx * car.speed * dt;
  car.group.position.z += fz * car.speed * dt;
  const hit = collideCircle(car.group.position, car.radius * 0.55, world.colliders, world.bounds);
  if (hit) car.speed *= 0.45;
  car.group.rotation.y = car.heading;

  const spin = (car.speed * dt) / 0.36;
  for (const w of Object.values(car.wheels)) w.mesh.rotation.x += spin;
  car.wheels.fl.pivot.rotation.y = car.steer * 0.42;
  car.wheels.fr.pivot.rotation.y = car.steer * 0.42;
  return hit;
}

export function carForward(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}
