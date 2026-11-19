// Effects: muzzle flash, tracers, sparks and smoke puffs.
// Cheap pooled meshes, no textures, no network.
import * as THREE from 'three';

export function createEffects(scene) {
  const tracers = [];
  const sparks = [];
  const puffs = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  const puffMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.5 });

  const flashLight = new THREE.PointLight(0xffc860, 0, 12);
  scene.add(flashLight);
  let flashTimer = 0;

  return {
    tracer(from, to) {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      if (len < 0.1) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), tracerMat);
      mesh.position.copy(from).addScaledVector(dir, 0.5);
      mesh.lookAt(to);
      scene.add(mesh);
      tracers.push({ mesh, life: 0.07 });
    },
    sparksAt(point, count) {
      for (let i = 0; i < count; i += 1) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), sparkMat);
        mesh.position.copy(point);
        scene.add(mesh);
        sparks.push({
          mesh,
          life: 0.35,
          vel: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8),
        });
      }
    },
    puff(point) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), puffMat.clone());
      mesh.position.copy(point);
      scene.add(mesh);
      puffs.push({ mesh, life: 0.9, grow: 1.6 });
    },
    muzzleFlash(point) {
      flashLight.position.copy(point);
      flashLight.intensity = 14;
      flashTimer = 0.06;
    },
    step(dt) {
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) flashLight.intensity = 0;
      }
      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].mesh);
          tracers.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const sp = sparks[i];
        sp.life -= dt;
        sp.vel.y -= 12 * dt;
        sp.mesh.position.addScaledVector(sp.vel, dt);
        if (sp.life <= 0) {
          scene.remove(sp.mesh);
          sparks.splice(i, 1);
        }
      }
      for (let i = puffs.length - 1; i >= 0; i -= 1) {
        const pf = puffs[i];
        pf.life -= dt;
        pf.mesh.scale.multiplyScalar(1 + pf.grow * dt);
        pf.mesh.material.opacity = Math.max(0, pf.life / 0.9) * 0.45;
        pf.mesh.position.y += dt * 1.2;
        if (pf.life <= 0) {
          scene.remove(pf.mesh);
          puffs.splice(i, 1);
        }
      }
    },
  };
}
