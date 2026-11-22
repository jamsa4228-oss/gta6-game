// SOLMAR BAY — particle bursts, tracers and muzzle flash.
import * as THREE from 'three';

export function createEffects(scene) {
  const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const pool = [];
  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(1, 0.03, 0.03);

  for (let i = 0; i < 220; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.visible = false;
    scene.add(m);
    pool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1, size: 1 });
  }
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  const flash = new THREE.PointLight(0xffc36b, 0, 9, 2);
  scene.add(flash);
  let flashLife = 0;

  function burst(pos, color, count, speed, up) {
    let made = 0;
    for (const p of pool) {
      if (made >= count) break;
      if (p.life > 0) continue;
      p.life = p.max = 0.4 + Math.random() * 0.5;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      p.size = 0.6 + Math.random() * 1.2;
      p.mesh.scale.setScalar(p.size);
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.2) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vel.set(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (up || 2), Math.sin(a) * Math.cos(e) * s);
      made++;
    }
  }

  return {
    burst,
    smoke(pos) {
      burst(pos, 0x9a9a9a, 5, 1.6, 2.5);
    },
    sparks(pos) {
      burst(pos, 0xffc36b, 10, 5, 2);
    },
    blood(pos) {
      burst(pos, 0x8a1414, 12, 3, 2);
    },
    muzzle(pos) {
      flash.position.copy(pos);
      flash.intensity = 26;
      flashLife = 0.07;
      burst(pos, 0xffd27a, 6, 3, 1);
    },
    tracer(from, to) {
      const t = tracers.find((x) => x.life <= 0) || tracers[0];
      const d = new THREE.Vector3().subVectors(to, from);
      const len = d.length();
      t.mesh.position.copy(from).addScaledVector(d, 0.5);
      t.mesh.scale.set(len, 1, 1);
      t.mesh.lookAt(to);
      t.mesh.material.opacity = 0.9;
      t.mesh.visible = true;
      t.life = 0.09;
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        p.vel.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 0.05) {
          p.mesh.position.y = 0.05;
          p.vel.y *= -0.3;
          p.vel.x *= 0.7;
          p.vel.z *= 0.7;
        }
        p.mesh.scale.setScalar(Math.max(0.01, p.size * (p.life / p.max)));
      }
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) flash.intensity = 0;
      }
    },
  };
}
