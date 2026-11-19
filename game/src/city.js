// SOLMAR BAY — a sun-soaked modern coastal city, fully original.
// Grid roads, varied buildings, a beach and marina to the south, palms and
// streetlights. Deterministic: one fixed seed, so every load is the same city.
import * as THREE from 'three';

export const ROAD_COORDS = [-120, -72, -24, 24, 72, 120];
export const ROAD_WIDTH = 12;
export const CITY_HALF = 150;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_COLORS = [0xe8dcc8, 0xd9c1a3, 0xc9a06c, 0x9fb8c8, 0x7fa8a0, 0xe0e0da, 0xc98a6b, 0x8fa3b8, 0xf2e6d0];
const GLASS_COLORS = [0x5f8fa8, 0x6fa8c8, 0x4f7f9f];

export function createCity(scene) {
  const rng = mulberry32(7);
  const colliders = [];
  const buildings = [];
  const waterMeshes = [];

  // Sky, sun and light.
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));

  // Ground: grass-green city floor, sand strip and sea to the south.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 260, CITY_HALF * 2 + 260),
    new THREE.MeshLambertMaterial({ color: 0x7da05c }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 260, 46),
    new THREE.MeshLambertMaterial({ color: 0xe0c98f }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, CITY_HALF + 23);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 260, 220),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, CITY_HALF + 46 + 110);
  scene.add(sea);
  waterMeshes.push(sea);

  // Roads: dark asphalt strips along every grid line, plus sidewalks.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  for (const c of ROAD_COORDS) {
    const roadX = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.12, CITY_HALF * 2 + 4), roadMat);
    roadX.position.set(c, 0.06, 0);
    roadX.receiveShadow = true;
    scene.add(roadX);
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(CITY_HALF * 2 + 4, 0.12, ROAD_WIDTH), roadMat);
    roadZ.position.set(0, 0.06, c);
    roadZ.receiveShadow = true;
    scene.add(roadZ);
    // Sidewalks flank each road.
    for (const off of [-ROAD_WIDTH / 2 - 1.5, ROAD_WIDTH / 2 + 1.5]) {
      const walkX = new THREE.Mesh(new THREE.BoxGeometry(3, 0.14, CITY_HALF * 2 + 4), walkMat);
      walkX.position.set(c + off, 0.07, 0);
      walkX.receiveShadow = true;
      scene.add(walkX);
      const walkZ = new THREE.Mesh(new THREE.BoxGeometry(CITY_HALF * 2 + 4, 0.14, 3), walkMat);
      walkZ.position.set(0, 0.07, c + off);
      walkZ.receiveShadow = true;
      scene.add(walkZ);
    }
    // Centre dashes.
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
    for (let t = -CITY_HALF + 8; t < CITY_HALF; t += 12) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 3), dashMat);
      dash.position.set(c, 0.14, t);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 0.5), dashMat);
      dash2.position.set(t, 0.14, c);
      scene.add(dash2);
    }
  }

  // Buildings: fill the blocks between roads. A few blocks are parks or lots.
  const blockCenters = [];
  for (let i = 0; i < ROAD_COORDS.length - 1; i += 1) {
    for (let j = 0; j < ROAD_COORDS.length - 1; j += 1) {
      blockCenters.push({
        x: (ROAD_COORDS[i] + ROAD_COORDS[i + 1]) / 2,
        z: (ROAD_COORDS[j] + ROAD_COORDS[j + 1]) / 2,
      });
    }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const windowMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
  for (const block of blockCenters) {
    const roll = rng();
    if (roll < 0.12) {
      // Park: grass block with trees.
      const park = new THREE.Mesh(new THREE.BoxGeometry(34, 0.3, 34), new THREE.MeshLambertMaterial({ color: 0x5c8a44 }));
      park.position.set(block.x, 0.15, block.z);
      park.receiveShadow = true;
      scene.add(park);
      for (let t = 0; t < 5; t += 1) addPalm(scene, block.x + (rng() * 2 - 1) * 12, block.z + (rng() * 2 - 1) * 12, rng);
      continue;
    }
    if (roll < 0.2) {
      // Parking lot: flat slab, no collider, cars park here later.
      const lot = new THREE.Mesh(new THREE.BoxGeometry(34, 0.2, 34), new THREE.MeshLambertMaterial({ color: 0x6a6d72 }));
      lot.position.set(block.x, 0.1, block.z);
      lot.receiveShadow = true;
      scene.add(lot);
      continue;
    }
    const count = rng() < 0.5 ? 1 : 2;
    for (let b = 0; b < count; b += 1) {
      const w = 12 + rng() * 10;
      const d = 12 + rng() * 10;
      const h = 8 + rng() * rng() * 26;
      const ox = count === 1 ? 0 : (b === 0 ? -8 : 8);
      const oz = count === 1 ? 0 : (b === 0 ? -6 : 7);
      const x = block.x + ox;
      const z = block.z + oz;
      const glass = rng() < 0.3;
      const color = glass ? GLASS_COLORS[Math.floor(rng() * GLASS_COLORS.length)] : BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      // Roof cap.
      const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x4a4038 }));
      roof.scale.set(w + 0.6, 0.5, d + 0.6);
      roof.position.set(x, h + 0.25, z);
      scene.add(roof);
      // Window strips.
      if (h > 12) {
        const floors = Math.floor(h / 4);
        for (let f = 0; f < floors; f += 1) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 1.1, d + 0.2), windowMat);
          strip.position.set(x, 3 + f * 4, z);
          scene.add(strip);
        }
      }
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      buildings.push({ x, z, w, d, h });
    }
  }

  // Marina pier (south edge, near x=0) + a lighthouse-ish tower.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 46), new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  pier.position.set(0, 0.3, CITY_HALF + 30);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  colliders.push({ minX: -5, maxX: 5, minZ: CITY_HALF + 8, maxZ: CITY_HALF + 52 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 26, 10), new THREE.MeshLambertMaterial({ color: 0xf0e8d8 }));
  tower.position.set(-14, 13, CITY_HALF + 8);
  tower.castShadow = true;
  scene.add(tower);
  colliders.push({ minX: -17, maxX: -11, minZ: CITY_HALF + 5, maxZ: CITY_HALF + 11 });

  // Palms and streetlights along the roads.
  for (const c of ROAD_COORDS) {
    for (let t = -CITY_HALF + 20; t < CITY_HALF; t += 40) {
      addPalm(scene, c + 9, t + 8, rng);
      addPalm(scene, c - 9, t - 8, rng);
      addStreetlight(scene, c + 8, t);
      addStreetlight(scene, c - 8, t + 20);
    }
  }

  // Named landmarks (mission anchors): garage, hotel, safehouse, bank.
  const landmarks = {
    garage: markLandmark(scene, -96, 0, 0xd86a2a, 'GARAGE'),
    hotel: markLandmark(scene, 96, -96, 0x2a9ad8, 'HOTEL'),
    safehouse: markLandmark(scene, -24, 120, 0x3aa84a, 'SAFEHOUSE'),
    bank: markLandmark(scene, 72, 72, 0xd8b62a, 'BANK'),
    marina: { x: 0, z: CITY_HALF + 12 },
  };

  return {
    colliders,
    buildings,
    landmarks,
    playerSpawn: { x: -24, z: -8 },
    carSpawn: { x: -18, z: -24, heading: Math.PI / 2 },
    update(dt, elapsed) {
      // Gentle sea shimmer.
      sea.position.y = -0.4 + Math.sin(elapsed * 0.5) * 0.06;
    },
  };
}

function addPalm(scene, x, z, rng) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
  );
  trunk.position.set(x, 3, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 2.2, 7),
    new THREE.MeshLambertMaterial({ color: 0x3f8a3a }),
  );
  leaves.position.set(x, 6.8, z);
  leaves.castShadow = true;
  scene.add(leaves);
}

function addStreetlight(scene, x, z) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x3a3d42 }),
  );
  pole.position.set(x, 3.5, z);
  scene.add(pole);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  lamp.position.set(x, 7.1, z);
  scene.add(lamp);
}

// A glowing beacon column over a landmark so missions read from a distance.
function markLandmark(scene, x, z, color, label) {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.set(x, 15, z);
  scene.add(beacon);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.8, 0.5, 12),
    new THREE.MeshLambertMaterial({ color }),
  );
  base.position.set(x, 0.25, z);
  scene.add(base);
  return { x, z, color, label, beacon };
}
