// The story: Rico Vega owes the fixer Marisol Kane $5,000, and four jobs clear it.
// Each mission has a title, an objective line and a waypoint with a beacon over
// it; the game drives the state machine and asks here whether a job is done.
import * as THREE from 'three';

export function createMissions(scene, city) {
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd34d,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 70, 20, 1, true), beaconMat);
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.1),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9 }),
  );
  scene.add(beacon);
  scene.add(marker);

  const list = [
    {
      title: 'The Debt',
      objective: "Drive to Marisol's office and pay her $200. Press E at the door.",
      waypoint: city.officeDoor,
      pay: 200,
    },
    {
      title: 'Hot Wheels',
      objective: 'Steal the red sports car parked by the beach.',
      waypoint: new THREE.Vector3(city.sportsSpot.x, 0, city.sportsSpot.z),
      carId: 'target',
    },
    {
      title: 'Getaway',
      objective: 'Lose the 3-star wanted level. Outrun the cops and stay clean.',
      waypoint: null,
    },
    {
      title: 'Payoff',
      objective: 'Deliver the sports car to the pier garage.',
      waypoint: city.garageSpot,
      carId: 'target',
    },
  ];

  const missions = {
    list,
    index: 0,
    get current() {
      return list[missions.index];
    },
    get done() {
      return missions.index >= list.length;
    },
    /** Point the beacon at the current job (hidden when the job has no place). */
    start(i) {
      missions.index = i;
      const m = list[i];
      if (m && m.waypoint) {
        beacon.visible = true;
        marker.visible = true;
        beacon.position.set(m.waypoint.x, 35, m.waypoint.z);
        marker.position.set(m.waypoint.x, 9, m.waypoint.z);
      } else {
        beacon.visible = false;
        marker.visible = false;
      }
      return m;
    },
    /** Is the player close enough to the current waypoint to act on it? */
    nearWaypoint(pos, radius) {
      const m = missions.current;
      if (!m || !m.waypoint) return false;
      return Math.hypot(pos.x - m.waypoint.x, pos.z - m.waypoint.z) < radius;
    },
    /**
     * The E key at a waypoint: paying Marisol. Returns true when it completed a job.
     * `state` is { pos, cash }.
     */
    interact(state) {
      const m = missions.current;
      if (!m || m.pay === undefined) return false;
      if (!missions.nearWaypoint(state.pos, 8)) return false;
      if (state.cash < m.pay) return false;
      return true;
    },
    /**
     * Has the current job finished on its own? `state` is
     * { pos, inCar, carId, wanted }. Returns true when it has.
     */
    check(state) {
      const m = missions.current;
      if (!m) return false;
      if (m.carId === 'target' && m.waypoint && m.title === 'Hot Wheels') {
        return state.inCar && state.carId === 'target';
      }
      if (m.title === 'Getaway') {
        return state.wanted === 0;
      }
      if (m.carId === 'target' && m.title === 'Payoff') {
        return state.inCar && state.carId === 'target' && missions.nearWaypoint(state.pos, 8);
      }
      return false;
    },
    update(dt, t) {
      if (!marker.visible) return;
      marker.rotation.y += dt * 1.4;
      marker.position.y = 9 + Math.sin(t * 2.2) * 0.8;
    },
  };
  return missions;
}
