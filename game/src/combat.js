// Combat: a pistol. Click to fire, R to reload. Raycast from the camera;
// hits knock pedestrians down, damage police cars and traffic.
import * as THREE from 'three';

export function createCombat(scene, camera) {
  const raycaster = new THREE.Raycaster();
  const state = {
    mag: 12,
    magSize: 12,
    reserve: Infinity,
    reloading: false,
    reloadTimer: 0,
    cooldown: 0,
    range: 60,
  };
  return { state, raycaster, camera, scene };
}

export function combatStep(combat, dt) {
  const s = combat.state;
  if (s.cooldown > 0) s.cooldown -= dt;
  if (s.reloading) {
    s.reloadTimer -= dt;
    if (s.reloadTimer <= 0) {
      s.reloading = false;
      s.mag = s.magSize;
    }
  }
}

export function combatReload(combat) {
  const s = combat.state;
  if (!s.reloading && s.mag < s.magSize) {
    s.reloading = true;
    s.reloadTimer = 1.1;
    return true;
  }
  return false;
}

// Fire one round. Returns a hit record or null.
export function combatFire(combat, targets) {
  const s = combat.state;
  if (s.cooldown > 0 || s.reloading) return null;
  if (s.mag <= 0) return { dry: true };
  s.mag -= 1;
  s.cooldown = 0.22;
  combat.camera.getWorldDirection(combat.raycaster.ray.direction);
  combat.raycaster.ray.origin.copy(combat.camera.position);
  combat.raycaster.far = s.range;
  const hits = combat.raycaster.intersectObjects(targets, false);
  const hit = hits.length > 0 ? hits[0] : null;
  return { dry: false, hit, from: combat.camera.position.clone(), to: hit ? hit.point.clone() : null };
}
