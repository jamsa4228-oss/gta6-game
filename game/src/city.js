// SOLMAR BAY — procedural coastal city: road grid, sunset light, beach + sea, pier.
// Buildings are boxes with a shared lit-window texture; collisions are AABBs.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROADS = [-120, -60, 0, 60, 120];
export const BLOCKS = [-90, -30, 30, 90];
export const CITY = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#20242c';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = Math.random() < 0.42;
      g.fillStyle = lit ? (Math.random() < 0.6 ? '#ffd27a' : '#9fd8ff') : '#12151c';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2b30';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05).toFixed(3) + ')';
    g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  }
  g.fillStyle = '#d8b13a';
  for (let y = 0; y < 256; y += 64) g.fillRect(30, y + 8, 4, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Push a circle (pos.x/pos.z, radius r) out of AABB colliders and the city bounds. */
export function collideCircle(pos, r, colliders, bounds) {
  let hit = false;
  if (bounds) {
    if (pos.x < bounds.minX + r) {
      pos.x = bounds.minX + r;
      hit = true;
    }
    if (pos.x > bounds.maxX - r) {
      pos.x = bounds.maxX - r;
      hit = true;
    }
    if (pos.z < bounds.minZ + r) {
      pos.z = bounds.minZ + r;
      hit = true;
    }
    if (pos.z > bounds.maxZ - r) {
      pos.z = bounds.maxZ - r;
      hit = true;
    }
  }
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    } else {
      const pl = pos.x - b.minX;
      const pr = b.maxX - pos.x;
      const pt = pos.z - b.minZ;
      const pb = b.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = b.minX - r;
      else if (m === pr) pos.x = b.maxX + r;
      else if (m === pt) pos.z = b.minZ - r;
      else pos.z = b.maxZ + r;
    }
  }
  return hit;
}

/** A random point on a block's sidewalk edge (for pedestrians and pickups). */
export function randomSidewalkPoint(rng) {
  const bx = BLOCKS[Math.floor(rng() * BLOCKS.length)];
  const bz = BLOCKS[Math.floor(rng() * BLOCKS.length)];
  const edge = Math.floor(rng() * 4);
  const along = (rng() - 0.5) * 44;
  if (edge === 0) return { x: bx + along, z: bz - 23 };
  if (edge === 1) return { x: bx + along, z: bz + 23 };
  if (edge === 2) return { x: bx - 23, z: bz + along };
  return { x: bx + 23, z: bz + along };
}

export function createCity(scene, rng) {
  const group = new THREE.Group();
  const colliders = [];
  const winTex = windowTexture();
  const roadTex = roadTexture();

  const addBox = (w, h, d, mat, x, y, z, shadow) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadow) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    group.add(m);
    return m;
  };

  // Ground, beach, sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshStandardMaterial({ color: 0x4c5543, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-5, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 340),
    new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 1 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-143, 0.0, 0);
  beach.receiveShadow = true;
  group.add(beach);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(130, 340),
    new THREE.MeshStandardMaterial({ color: 0x14507e, roughness: 0.25, metalness: 0.1 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-215, -0.4, 0);
  group.add(sea);

  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 340),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(-150, 0.02, 0);
  group.add(foam);

  // Roads (textured asphalt with center dashes).
  for (const x of ROADS) {
    const tex = roadTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, 12);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 300),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.02, 0);
    road.receiveShadow = true;
    group.add(road);
  }
  for (const z of ROADS) {
    const tex = roadTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(12, 1);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 12),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, z);
    road.receiveShadow = true;
    group.add(road);
  }

  // Sidewalks.
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 1 });
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), walkMat);
      w.rotation.x = -Math.PI / 2;
      w.position.set(bx, 0.04, bz);
      w.receiveShadow = true;
      group.add(w);
    }
  }

  // Buildings.
  const facadeColors = [0x9a8f80, 0x7a7f8c, 0xb08a6a, 0x6a7a8c, 0x8c6a6a, 0x5f6a72];
  const facadeMats = facadeColors.map(
    (c) =>
      new THREE.MeshStandardMaterial({
        color: c,
        map: winTex,
        emissive: 0xffc36b,
        emissiveMap: winTex,
        emissiveIntensity: 0.35,
        roughness: 0.85,
      })
  );
  const addBuilding = (x, z, w, d, h, mat) => {
    addBox(w, h, d, mat, x, h / 2 + 0.05, z, true);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  const quadOffsets = [
    [-12, -12],
    [12, -12],
    [-12, 12],
    [12, 12],
  ];
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      // Landmark blocks get their own building below; skip the generic fill.
      if ((bx === 30 && bz === 30) || (bx === -30 && bz === 90) || (bx === -90 && bz === -30)) continue;
      const n = 2 + Math.floor(rng() * 3);
      const quads = quadOffsets.slice();
      for (let i = quads.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = quads[i];
        quads[i] = quads[j];
        quads[j] = tmp;
      }
      for (let i = 0; i < n; i++) {
        const q = quads[i];
        const w = 14 + rng() * 6;
        const d = 14 + rng() * 6;
        const h = 8 + rng() * rng() * 38;
        addBuilding(bx + q[0], bz + q[1], w, d, h, facadeMats[Math.floor(rng() * facadeMats.length)]);
      }
    }
  }
  // Landmark: Marisol's office tower (glass, block 30,30).
  addBuilding(
    30,
    30,
    26,
    26,
    55,
    new THREE.MeshStandardMaterial({
      color: 0x3a6a9a,
      map: winTex,
      emissive: 0x9fd8ff,
      emissiveMap: winTex,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.4,
    })
  );
  // Landmark: the garage (low, wide, block -30,90).
  addBuilding(-30, 90, 34, 20, 7, new THREE.MeshStandardMaterial({ color: 0x7a4a3a, roughness: 0.9 }));
  // Landmark: the hospital (white, block -90,-30).
  addBuilding(-90, -30, 24, 18, 12, new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 }));

  // Streetlights at intersections.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  for (const x of ROADS) {
    for (const z of ROADS) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 8), poleMat);
      pole.position.set(x + 7.5, 3, z + 7.5);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
      lamp.position.set(x + 7.5, 6.1, z + 7.5);
      group.add(lamp);
    }
  }

  // Trees on sidewalk corners.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5d33, roughness: 1 });
  for (let i = 0; i < 24; i++) {
    const p = randomSidewalkPoint(rng);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.6, 7), trunkMat);
    trunk.position.set(p.x, 0.8, p.z);
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 8), leafMat);
    leaves.position.set(p.x, 3.0, p.z);
    leaves.castShadow = true;
    group.add(leaves);
  }

  // The pier: wooden walkway out over the sea at z = 0.
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    addBox(10, 0.35, 8, plankMat, -155 - i * 10, 0.25, 0, true);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 7), trunkMat);
    post.position.set(-155 - i * 10, -0.6, 4.2);
    group.add(post);
    const post2 = post.clone();
    post2.position.z = -4.2;
    group.add(post2);
  }
  addBox(6, 4, 6, new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.9 }), -208, 2.2, 0, true);

  scene.add(group);

  return {
    group,
    colliders,
    bounds: CITY,
    loops: [
      [
        [-120, -120],
        [120, -120],
        [120, 120],
        [-120, 120],
      ],
      [
        [-60, -60],
        [60, -60],
        [60, 60],
        [-60, 60],
      ],
      [
        [-120, -60],
        [120, -60],
        [120, 60],
        [-120, 60],
      ],
      [
        [-60, -120],
        [60, -120],
        [60, 120],
        [-60, 120],
      ],
    ],
    spots: {
      office: { x: 30, z: 4 },
      garage: { x: -30, z: 62 },
      pier: { x: -204, z: 0 },
      hospital: { x: -90, z: -2 },
      sport: { x: 54, z: -30 },
      player: { x: 0, z: 24 },
    },
  };
}
