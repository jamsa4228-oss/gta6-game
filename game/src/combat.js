// Combat on foot: a hitscan shot through the crosshair and a close punch.
// The shot raycasts the camera's centre line against pedestrians and cars; a
// miss still kicks up a spark where it meets the street. A muzzle light and a
// burst sell each shot. Ammo is infinite; the fire rate is the limit.
import * as THREE from 'three';

const FIRE_INTERVAL = 0.25;
const PUNCH_RANGE = 2.4;

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;
  const muzzleLight = new THREE.PointLight(0xffd34d, 0, 14, 1.6);
  scene.add(muzzleLight);
  let cooldown = 0;
  const centre = new THREE.Vector2(0, 0);

  return {
    update(dt) {
      cooldown = Math.max(0, cooldown - dt);
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 70);
    },
    /**
     * Fire one shot. `playerPos`/`heading` place the muzzle flash at Rico's hand;
     * the ray itself goes from the camera through the crosshair. Returns the
     * ped hit, the car hit, or null. `effects` and `audio` are the game's own.
     */
    shoot(camera, playerPos, heading, peds, cars, effects, audio) {
      if (cooldown > 0) return null;
      cooldown = FIRE_INTERVAL;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const muzzle = new THREE.Vector3(playerPos.x + fx * 1.1, 1.45, playerPos.z + fz * 1.1);
      muzzleLight.position.copy(muzzle);
      muzzleLight.intensity = 3.2;
      effects.muzzle(muzzle);
      if (audio) audio.shot();
      raycaster.setFromCamera(centre, camera);
      const pedGroups = [];
      for (const ped of peds) if (!ped.down) pedGroups.push(ped.group);
      const carGroups = [];
      for (const car of cars) carGroups.push(car.group);
      const hits = raycaster.intersectObjects([...pedGroups, ...carGroups], true);
      if (hits.length > 0) {
        const hit = hits[0];
        const point = hit.point;
        effects.burst(point, 0xffd34d, 12, 8);
        let node = hit.object;
        while (node) {
          for (const ped of peds) {
            if (ped.group === node) return { kind: 'ped', ped, point };
          }
          for (const car of cars) {
            if (car.group === node) return { kind: 'car', car, point };
          }
          node = node.parent;
        }
        return { kind: 'wall', point };
      }
      // No hit: spark where the bullet meets the street.
      const dir = raycaster.ray.direction;
      if (dir.y < -0.02) {
        const t = -raycaster.ray.origin.y / dir.y;
        if (t > 0 && t < 140) {
          const point = raycaster.ray.origin.clone().addScaledVector(dir, t);
          effects.burst(point, 0xffd34d, 8, 6);
          return { kind: 'ground', point };
        }
      }
      return { kind: 'none', point: null };
    },
    /** A punch: the nearest pedestrian in front of Rico, inside range, goes down. */
    punch(playerPos, heading, peds) {
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      let best = null;
      let bestD = PUNCH_RANGE;
      for (const ped of peds) {
        if (ped.down) continue;
        const dx = ped.pos.x - playerPos.x;
        const dz = ped.pos.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d > PUNCH_RANGE) continue;
        const along = dx * fx + dz * fz;
        if (along < 0) continue;
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      return best;
    },
  };
}
