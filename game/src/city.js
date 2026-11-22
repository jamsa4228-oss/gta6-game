// The city of SOLMAR BAY: a sunset coastal grid with a beach, a pier, palms,
// neon signs and the buildings the missions point at. Everything is built from
// a seed, so the same seed always builds the same city (the screenshots use it).
// It also owns the collision helpers: every solid is an axis-aligned box, and
// anything round (a player, a car) is resolved against them as a circle.
import * as THREE from 'three';

/** A tiny seeded random source (a linear congruential generator): same seed, same city. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const STREETS = [-160, -80, 0, 80, 160];
const ROAD_WIDTH = 12;
const CITY_MIN = -200;
const CITY_MAX = 200;
const BEACH_Z = 200;
const OCEAN_Z = 240;
const BOUNDS = { x: 196, zMin: -196, zMax: 236 };

const FACADE_COLORS = ['#b98a5e', '#8fa3b0', '#a85f4e', '#7d8a6a', '#9a7ba8', '#c2b49a'];

/** A facade's two textures: the wall with its windows, and only the lit windows (for glow). */
function facadeTextures(base, rng) {
  const W = 128;
  const H = 256;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = W;
  mapCanvas.height = H;
  const g = mapCanvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = W;
  glowCanvas.height = H;
  const e = glowCanvas.getContext('2d');
  e.fillStyle = '#000000';
  e.fillRect(0, 0, W, H);
  const cols = 4;
  const rows = 8;
  const ww = W / cols;
  const wh = H / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * ww + ww * 0.22;
      const y = r * wh + wh * 0.22;
      const w = ww * 0.56;
      const h = wh * 0.56;
      const lit = rng() < 0.45;
      g.fillStyle = lit ? '#ffd27a' : '#2e3440';
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.strokeRect(x, y, w, h);
      if (lit) {
        e.fillStyle = '#ffca6a';
        e.fillRect(x, y, w, h);
      }
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, H - 28, W, 28);
  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(glowCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

/** A glowing text sign (canvas texture on a plane): neon that needs no light to shine. */
function makeSign(text, color, w = 14, h = 3.5) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.font = 'bold 80px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, fog: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/** The sunset sky: a vertical gradient on the inside of a huge sphere. */
function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1c1440');
  grad.addColorStop(0.45, '#7a2d5e');
  grad.addColorStop(0.7, '#ff7e3d');
  grad.addColorStop(0.86, '#ffb36b');
  grad.addColorStop(1, '#ffd27a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Push a circle (a player, a car) out of every solid box it overlaps.
 * `pos` is a THREE.Vector3 whose y is ignored; it is moved in place.
 */
export function resolveCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.x1, Math.min(pos.x, c.x2));
    const cz = Math.max(c.z1, Math.min(pos.z, c.z2));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // The centre is inside the box: leave along the shallowest side.
      const pl = pos.x - c.x1;
      const pr = c.x2 - pos.x;
      const pt = pos.z - c.z1;
      const pb = c.z2 - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = c.x1 - radius;
      else if (m === pr) pos.x = c.x2 + radius;
      else if (m === pt) pos.z = c.z1 - radius;
      else pos.z = c.z2 + radius;
    }
  }
}

export function createCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];

  scene.background = new THREE.Color(0x2a1a3f);
  scene.fog = new THREE.Fog(0xc97a4e, 230, 980);

  const sunLight = new THREE.DirectionalLight(0xffb36b, 1.7);
  sunLight.position.set(-260, 150, -70);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x8a6bbf, 0x3a2a22, 0.85));

  // Sky dome and the low sun disc.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(48, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sun.position.set(-640, 105, -260);
  sun.lookAt(0, 60, 0);
  scene.add(sun);

  // Ground: pale concrete for the city, sand for the beach, water past it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 760),
    new THREE.MeshLambertMaterial({ color: 0x77705f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -120);
  scene.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 46),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, BEACH_Z + 22);
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 640),
    new THREE.MeshLambertMaterial({ color: 0x1d4e6e, emissive: 0x0a2a44 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.6, OCEAN_Z + 320);
  scene.add(ocean);

  // Roads: dark strips on the street lines, with dashed centre lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2e35 });
  for (const x of STREETS) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 400), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.03, 0);
    scene.add(road);
  }
  for (const z of STREETS) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_WIDTH), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.04, z);
    scene.add(road);
  }
  const dashGeo = new THREE.BoxGeometry(0.35, 0.02, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8b13a });
  const dashCount = STREETS.length * 2 * 62;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const dummy = new THREE.Object3D();
  let di = 0;
  for (const x of STREETS) {
    for (let z = -186; z <= 186; z += 6) {
      dummy.position.set(x, 0.06, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(di, dummy.matrix);
      di += 1;
    }
  }
  for (const z of STREETS) {
    for (let x = -186; x <= 186; x += 6) {
      dummy.position.set(x, 0.06, z);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(di, dummy.matrix);
      di += 1;
    }
  }
  dashes.count = di;
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  // Buildings: one shared unit box, a few facade variants, roofs dark on top.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const variants = FACADE_COLORS.map((base) => {
    const { map, emissive } = facadeTextures(base, rng);
    const face = new THREE.MeshLambertMaterial({ map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0.85 });
    return [face, face, roofMat, darkMat, face, face];
  });

  function addBuilding(x, z, w, h, d, variant) {
    const mesh = new THREE.Mesh(boxGeo, variants[variant % variants.length]);
    mesh.position.set(x, h / 2, z);
    mesh.scale.set(w, h, d);
    scene.add(mesh);
    colliders.push({ x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2 });
    return mesh;
  }

  // The blocks between the streets: a few buildings each, kept off the roads.
  const blockCentres = [-120, -40, 40, 120];
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const count = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i += 1) {
        const x = bx + (rng() - 0.5) * 52;
        const z = bz + (rng() - 0.5) * 52;
        const w = 16 + rng() * 16;
        const d = 14 + rng() * 14;
        const centre = Math.abs(bx) <= 40 && Math.abs(bz) <= 40;
        const h = centre ? 22 + rng() * 26 : 10 + rng() * 20;
        addBuilding(x, z, w, h, d, Math.floor(rng() * variants.length));
      }
    }
  }

  // Marisol's office: the tall purple block the first mission points at.
  const office = addBuilding(88, -56, 26, 55, 20, 4);
  office.position.y = 55 / 2;
  const officeSign = makeSign('MARISOL', '#ff5fa2', 20, 4);
  officeSign.position.set(88, 46, -45.4);
  officeSign.rotation.y = Math.PI;
  scene.add(officeSign);

  // The pier garage where the last mission ends: a low block with a dark open door.
  const garage = addBuilding(0, 214, 20, 9, 13, 1);
  garage.position.y = 9 / 2;
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6.5),
    new THREE.MeshBasicMaterial({ color: 0x0c0e12 }),
  );
  door.position.set(0, 3.4, 207.4);
  door.rotation.y = Math.PI;
  scene.add(door);
  const garageSign = makeSign('GARAGE', '#ffd34d', 12, 3);
  garageSign.position.set(0, 10.5, 207.2);
  garageSign.rotation.y = Math.PI;
  scene.add(garageSign);

  // The pier: planks out into the water, posts and lamps.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 110), pierMat);
  pier.position.set(0, 0.6, 300);
  scene.add(pier);
  const pierSign = makeSign('PIER', '#4dd8ff', 10, 2.6);
  pierSign.position.set(0, 5.5, 252);
  scene.add(pierSign);
  const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 5, 8);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5e4630 });
  for (let z = 252; z <= 348; z += 24) {
    for (const x of [-4.4, 4.4]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, -1.4, z);
      scene.add(post);
    }
  }

  // Palms along the beach and a few on the corners.
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 7, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondGeo = new THREE.ConeGeometry(1.6, 4.2, 5);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
  function addPalm(x, z) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    palm.add(trunk);
    for (let i = 0; i < 5; i += 1) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1, 7.2, Math.sin(a) * 1.1);
      frond.rotation.z = Math.cos(a) * 1.15;
      frond.rotation.x = -Math.sin(a) * 1.15;
      palm.add(frond);
    }
    palm.position.set(x, 0, z);
    scene.add(palm);
  }
  for (let x = -180; x <= 180; x += 30) addPalm(x + (rng() - 0.5) * 8, 206 + rng() * 8);
  addPalm(-168, -168);
  addPalm(168, -168);
  addPalm(-168, 168);
  addPalm(168, 168);

  // Beach umbrellas.
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xff5f6d });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0x4dd8ff });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6);
  const shadeGeo = new THREE.ConeGeometry(2.6, 1.2, 8);
  for (let i = 0; i < 5; i += 1) {
    const x = -150 + rng() * 300;
    const z = 212 + rng() * 18;
    const pole = new THREE.Mesh(poleGeo, trunkMat);
    pole.position.set(x, 1.7, z);
    scene.add(pole);
    const shade = new THREE.Mesh(shadeGeo, i % 2 ? umbrellaMat : umbrellaMat2);
    shade.position.set(x, 3.8, z);
    scene.add(shade);
  }

  // Streetlights at every other intersection.
  const poleLGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6);
  const poleLMat = new THREE.MeshLambertMaterial({ color: 0x2f333a });
  const lampGeo = new THREE.SphereGeometry(0.55, 10, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
  for (const x of [-160, 0, 160]) {
    for (const z of [-160, 0, 160]) {
      const pole = new THREE.Mesh(poleLGeo, poleLMat);
      pole.position.set(x + 8, 3.25, z + 8);
      scene.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x + 8, 6.7, z + 8);
      scene.add(lamp);
    }
  }

  // A few more neon signs on the beachfront strip.
  const solmarSign = makeSign('SOLMAR', '#ff5fa2', 22, 4.4);
  solmarSign.position.set(-40, 30, 152);
  scene.add(solmarSign);
  const hotelSign = makeSign('HOTEL', '#4dd8ff', 14, 3.4);
  hotelSign.position.set(120, 34, 150);
  scene.add(hotelSign);
  const barSign = makeSign('BAR', '#ffd34d', 8, 2.6);
  barSign.position.set(-120, 14, 148);
  scene.add(barSign);

  function clampBounds(pos, radius) {
    pos.x = Math.max(-BOUNDS.x + radius, Math.min(BOUNDS.x - radius, pos.x));
    pos.z = Math.max(BOUNDS.zMin + radius, Math.min(BOUNDS.zMax - radius, pos.z));
  }

  return {
    colliders,
    resolveCircle: (pos, radius) => resolveCircle(pos, radius, colliders),
    clampBounds,
    bounds: BOUNDS,
    /** Marisol's office door, on the sidewalk in front of it. */
    officeDoor: new THREE.Vector3(88, 0, -72),
    /** Where the red sports car waits for mission two. */
    sportsSpot: { x: -120, z: 160, heading: Math.PI / 2 },
    /** The pier garage door, where the last mission ends. */
    garageSpot: new THREE.Vector3(0, 0, 198),
    /** Where Rico starts, on foot near his own parked car. */
    playerStart: new THREE.Vector3(0, 0, 12),
    /** Where Rico's own car is parked at the start. */
    starterCar: { x: 10, z: 2, heading: Math.PI / 2 },
    update(_dt, t) {
      ocean.position.y = -0.6 + Math.sin(t * 0.6) * 0.12;
    },
  };
}
