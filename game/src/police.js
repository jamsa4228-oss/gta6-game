// The wanted system and the police who enforce it.
// Stars rise when Rico commits a crime (stealing, shooting, hitting a pedestrian,
// ramming a cop). Police cars spawn at a distance and chase him; they ram his car
// and, on foot, they can arrest him if they stay close. Stay clean and out of
// sight and the heat fades, one star at a time.
import * as THREE from 'three';
import { makeCar } from './car.js';

const MAX_POLICE = 5;
const POLICE_SPEED = 34;

export function createPolice(scene, city, rng) {
  const cars = [];
  let wanted = 0;
  let sinceCrime = 99;
  let decayTimer = 0;
  let bustTimer = 0;

  function spawnCar(playerPos) {
    const angle = rng() * Math.PI * 2;
    const dist = 70 + rng() * 40;
    let x = playerPos.x + Math.cos(angle) * dist;
    let z = playerPos.z + Math.sin(angle) * dist;
    x = Math.max(-180, Math.min(180, x));
    z = Math.max(-180, Math.min(180, z));
    const car = makeCar(scene, {
      color: 0x1a1d22,
      x,
      z,
      heading: Math.atan2(playerPos.x - x, playerPos.z - z),
      maxSpeed: POLICE_SPEED,
      police: true,
      beam: false,
    });
    cars.push(car);
    return car;
  }

  function syncCount(playerPos) {
    const want = Math.min(wanted + 1, MAX_POLICE);
    while (cars.length < want) spawnCar(playerPos);
    while (cars.length > want) {
      const car = cars.pop();
      car.remove();
    }
    if (wanted === 0) {
      while (cars.length > 0) cars.pop().remove();
    }
  }

  return {
    cars,
    get wanted() {
      return wanted;
    },
    addCrime(amount, playerPos) {
      wanted = Math.min(5, wanted + amount);
      sinceCrime = 0;
      decayTimer = 0;
      syncCount(playerPos);
    },
    setWanted(value, playerPos) {
      wanted = Math.max(0, Math.min(5, value));
      sinceCrime = 0;
      decayTimer = 0;
      syncCount(playerPos);
    },
    /** True while any police car is touching the player's car this frame. */
    rammed: false,
    /**
     * Step the chase. `player` is { pos, inCar, car } (car null on foot).
     * Calls onBusted when the cops arrest Rico on foot.
     */
    update(dt, player, colliders, allCars, onBusted) {
      sinceCrime += dt;
      let nearest = Infinity;
      for (const car of cars) {
        const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
        if (d < nearest) nearest = d;
      }
      // The heat fades only when Rico has been clean a while and no cop is close.
      if (wanted > 0 && sinceCrime > 8 && nearest > 40) {
        decayTimer += dt;
        if (decayTimer > 6) {
          decayTimer = 0;
          wanted -= 1;
          syncCount(player.pos);
        }
      } else {
        decayTimer = 0;
      }
      this.rammed = false;
      for (const car of cars) {
        const dx = player.pos.x - car.pos.x;
        const dz = player.pos.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 1.7));
        const throttle = dist > 5 ? 1 : 0.7;
        car.update(dt, { throttle, steer }, colliders, allCars);
        if (player.inCar && player.car && dist < car.radius + player.car.radius + 0.4) {
          this.rammed = true;
        }
      }
      // Arrest: a cop car sitting on Rico while he is on foot.
      if (!player.inCar && nearest < 3.2) {
        bustTimer += dt;
        if (bustTimer > 1.2) {
          bustTimer = 0;
          onBusted();
        }
      } else {
        bustTimer = 0;
      }
    },
    clear() {
      wanted = 0;
      sinceCrime = 99;
      decayTimer = 0;
      bustTimer = 0;
      while (cars.length > 0) cars.pop().remove();
    },
  };
}
