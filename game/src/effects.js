// Cheap particle bursts (sparks, smoke, muzzle flash) on one THREE.Points pool.
// Nothing allocates in the hot path after construction: positions, colours and
// lifetimes are reused, and a dead particle is parked below the ground.
import * as THREE from 'three';

const MAX = 420;

export function createEffects(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX * 3);
  const colours = new Float32Array(MAX * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const material = new THREE.PointsMaterial({
    size: 0.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const parts = [];
  for (let i = 0; i < MAX; i += 1) {
    parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, x: 0, y: -100, z: 0, r: 1, g: 1, b: 1 });
    positions[i * 3 + 1] = -100;
  }
  let cursor = 0;

  function spawn(x, y, z, color, count, speed, up, life) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n += 1) {
      const p = parts[cursor];
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.35) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * Math.cos(e) * s;
      p.vy = Math.sin(e) * s + up;
      p.vz = Math.sin(a) * Math.cos(e) * s;
      p.max = life * (0.6 + Math.random() * 0.7);
      p.life = p.max;
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      cursor = (cursor + 1) % MAX;
    }
  }

  return {
    /** A spray of bright sparks, for impacts and gunfire. */
    burst(at, color, count = 14, speed = 9) {
      spawn(at.x, at.y, at.z, color, count, speed, 2, 0.6);
    },
    /** A slow grey puff, for exhaust and hard landings. */
    smoke(at) {
      spawn(at.x, at.y, at.z, 0x999999, 10, 2, 3, 1.2);
    },
    /** The brief yellow flash at a gun's muzzle. */
    muzzle(at) {
      spawn(at.x, at.y, at.z, 0xffd34d, 8, 12, 0, 0.12);
    },
    update(dt) {
      for (let i = 0; i < MAX; i += 1) {
        const p = parts[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          positions[i * 3 + 1] = -100;
          continue;
        }
        p.vy -= 9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.05) {
          p.y = 0.05;
          p.vy *= -0.3;
        }
        const fade = p.life / p.max;
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        colours[i * 3] = p.r * fade;
        colours[i * 3 + 1] = p.g * fade;
        colours[i * 3 + 2] = p.b * fade;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}
