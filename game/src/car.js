// Cars for SOLMAR BAY: one mesh builder and one arcade driving model.
// A car is a low-poly body with a cabin, four spinning wheels and headlights;
// driving is throttle + steering with drag, so it feels like a car without
// needing a physics engine. Collisions are circles against the city's boxes.
import * as THREE from 'three';
import { resolveCircle } from './city.js';

const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x14161a });
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
const LIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
const TAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xff2a33 });
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xffe9a8,
  transparent: true,
  opacity: 0.13,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** The visible car: body, cabin, wheels, lights and a light beam. */
export function createCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 2.2), GLASS_MAT);
  cabin.position.set(0, 1.18, -0.25);
  group.add(cabin);
  const wheels = [];
  const wheelSpots = [
    [-0.95, 1.45, 0],
    [0.95, 1.45, 0],
    [-0.95, -1.45, 0],
    [0.95, -1.45, 0],
  ];
  for (const [x, z, steer] of wheelSpots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    wheel.rotation.z = Math.PI / 2;
    pivot.add(wheel);
    pivot.userData.steer = steer === 0;
    group.add(pivot);
    wheels.push(pivot);
  }
  for (const x of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), LIGHT_MAT);
    lamp.position.set(x, 0.68, 2.22);
    group.add(lamp);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), TAIL_MAT);
    tail.position.set(x, 0.68, -2.22);
    group.add(tail);
  }
  if (opts.beam !== false) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 12, 1, true), BEAM_MAT);
    beam.rotation.x = Math.PI / 2 - 0.12;
    beam.position.set(0, 0.55, 6.4);
    group.add(beam);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0x111318 }));
    bar.position.set(0, 1.55, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a33 }));
    red.position.set(-0.3, 1.56, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.5), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.set(0.3, 1.56, -0.25);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  return { group, wheels };
}

/**
 * A drivable car. `drive` is { throttle -1..1, steer -1..1 } each step.
 * Returns the car object; `update` moves it and resolves building hits.
 */
export function makeCar(scene, options) {
  const { color = 0x3a7bd5, x = 0, z = 0, heading = 0, maxSpeed = 38, police = false, beam = true } = options;
  const { group, wheels } = createCarMesh(color, { police, beam });
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const car = {
    group,
    wheels,
    pos: group.position,
    heading,
    speed: 0,
    steer: 0,
    maxSpeed,
    radius: 2.4,
    police,
    damage: 0,
    /** How hard the last wall hit was (0 when none): the caller reads it for sound and sparks. */
    lastHit: 0,
    update(dt, drive, colliders, others) {
      car.lastHit = 0;
      const targetSteer = drive.steer * 0.55;
      car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
      const accel = 24;
      if (drive.throttle > 0) car.speed += accel * drive.throttle * dt;
      else if (drive.throttle < 0) {
        car.speed += (car.speed > 0.5 ? -34 : -12) * dt;
      } else {
        car.speed -= car.speed * 0.7 * dt;
      }
      if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
      if (car.speed < -9) car.speed = -9;
      if (Math.abs(car.speed) < 0.05 && drive.throttle === 0) car.speed = 0;
      const turn = car.steer * (car.speed / 2.9) * (car.speed >= 0 ? 1 : -1);
      car.heading += turn * dt;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const before = { x: car.pos.x, z: car.pos.z };
      car.pos.x += fx * car.speed * dt;
      car.pos.z += fz * car.speed * dt;
      resolveCircle(car.pos, car.radius, colliders);
      const moved = Math.hypot(car.pos.x - before.x, car.pos.z - before.z);
      const wanted = Math.abs(car.speed) * dt;
      if (wanted > 0.01 && moved < wanted * 0.35) {
        const hit = Math.abs(car.speed);
        car.speed *= -0.25;
        car.lastHit = hit;
        car.damage += hit * 0.4;
      }
      if (others) {
        for (const other of others) {
          if (other === car) continue;
          const dx = car.pos.x - other.pos.x;
          const dz = car.pos.z - other.pos.z;
          const d = Math.hypot(dx, dz);
          const min = car.radius + other.radius;
          if (d > 0.01 && d < min) {
            const push = (min - d) / 2;
            const nx = dx / d;
            const nz = dz / d;
            car.pos.x += nx * push;
            car.pos.z += nz * push;
            other.pos.x -= nx * push;
            other.pos.z -= nz * push;
            const exchange = (car.speed - other.speed) * 0.4;
            car.speed -= exchange;
            other.speed += exchange;
          }
        }
      }
      car.group.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.42;
      for (const pivot of car.wheels) {
        pivot.children[0].rotation.x += spin;
        if (pivot.userData.steer) pivot.rotation.y = car.steer;
      }
      if (car.police) {
        const phase = Math.floor(performance.now() / 280) % 2 === 0;
        const red = group.userData.lightRed;
        const blue = group.userData.lightBlue;
        if (red && blue) {
          red.material.color.setHex(phase ? 0xff2a33 : 0x551111);
          blue.material.color.setHex(phase ? 0x112255 : 0x2a6bff);
        }
      }
    },
    remove() {
      scene.remove(group);
    },
  };
  return car;
}
