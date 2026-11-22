// SOLMAR BAY — hitscan pistol + melee punch.
import * as THREE from 'three';

const tmp = new THREE.Vector3();

/** Fire one pistol round from `from` along `dir`. Targets: {pos, hp, onDeath}. */
export function shoot(from, dir, targets, effects, audio) {
  let best = null;
  let bestD = 70;
  for (const t of targets) {
    if (!t || t.hp <= 0) continue;
    tmp.copy(t.pos).sub(from);
    const d = tmp.length();
    if (d > 70 || d < 0.5) continue;
    tmp.divideScalar(d);
    if (tmp.dot(dir) < 0.996) continue;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  const end = new THREE.Vector3().copy(from).addScaledVector(dir, best ? bestD : 60);
  end.y = Math.max(0.1, end.y);
  effects.tracer(from, end);
  effects.muzzle(from);
  audio.gunshot();
  if (best) {
    best.hp -= 34;
    effects.blood(best.pos);
    if (best.hp <= 0 && best.onDeath) best.onDeath();
    return best;
  }
  effects.sparks(end);
  return null;
}

/** Melee swing: hits targets in a short arc in front of the attacker. */
export function punchHit(fromPos, yaw, targets, effects) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let hitAny = false;
  for (const t of targets) {
    if (!t || t.hp <= 0) continue;
    const dx = t.pos.x - fromPos.x;
    const dz = t.pos.z - fromPos.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.4) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.5) continue;
    t.hp -= 25;
    const push = 1.2 / (d || 1);
    t.pos.x += dx * push;
    t.pos.z += dz * push;
    effects.burst(t.pos, 0xffd27a, 6, 3, 2);
    if (t.hp <= 0 && t.onDeath) t.onDeath();
    hitAny = true;
  }
  return hitAny;
}
