// SOLMAR BAY — the four story missions from fixer Marisol Kane.
// game facade: city, setObjective, setMissionTitle, message, addMoney, setWanted,
// spawnTargetCar, getPlayerPos, isPlayerInCar, completeStory, save, audio.
export const MISSION_DEFS = [
  {
    title: 'The Debt',
    reward: 200,
    brief: 'Marisol Kane wants to see you. Drive to her office downtown and meet her.',
  },
  {
    title: 'Hot Wheels',
    reward: 500,
    time: 90,
    brief: 'Steal the red sport car parked on 60th and bring it to the garage. You have 90 seconds.',
  },
  {
    title: 'Heat',
    reward: 300,
    time: 60,
    brief: 'The cops are all over you. Lose the 3-star wanted level — survive 60 seconds without getting busted.',
  },
  {
    title: 'Payoff',
    reward: 0,
    brief: 'Bring the money to the pier and pay Marisol the $5,000. She will not wait.',
  },
];

function dist2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function createMissions(game) {
  const m = {
    index: 0,
    active: false,
    timer: 0,
    waypoint: null,
    targetCar: null,
    retryIn: 0,

    start(i) {
      m.index = i;
      m.active = true;
      m.retryIn = 0;
      const def = MISSION_DEFS[i];
      game.setMissionTitle('Mission ' + (i + 1) + '/4 — ' + def.title);
      game.setObjective(def.brief);
      game.message('New mission: ' + def.title);
      game.audio.mission();
      if (i === 0) {
        m.waypoint = { x: game.city.spots.office.x, z: game.city.spots.office.z };
        m.timer = 0;
      } else if (i === 1) {
        m.targetCar = game.spawnTargetCar();
        m.waypoint = null;
        m.timer = def.time;
      } else if (i === 2) {
        game.setWanted(3);
        m.waypoint = null;
        m.timer = def.time;
      } else if (i === 3) {
        m.waypoint = { x: game.city.spots.pier.x, z: game.city.spots.pier.z };
        game.setWanted(2);
        m.timer = 0;
      }
    },

    update(dt) {
      if (m.retryIn > 0) {
        m.retryIn -= dt;
        if (m.retryIn <= 0) m.start(m.index);
        return;
      }
      if (!m.active) return;
      const pp = game.getPlayerPos();
      if (m.index === 0) {
        if (m.waypoint && dist2d(pp, m.waypoint) < 6) m.complete();
      } else if (m.index === 1) {
        m.timer -= dt;
        if (m.timer <= 0) {
          m.fail('Too slow — the garage deal fell through.');
          return;
        }
        if (m.targetCar) {
          const inTarget = game.isPlayerInCar(m.targetCar);
          if (inTarget) m.waypoint = { x: game.city.spots.garage.x, z: game.city.spots.garage.z };
          else m.waypoint = { x: m.targetCar.group.position.x, z: m.targetCar.group.position.z };
          if (inTarget && dist2d(pp, game.city.spots.garage) < 7) m.complete();
        }
      } else if (m.index === 2) {
        m.timer -= dt;
        if (m.timer <= 0) m.complete();
      } else if (m.index === 3) {
        if (m.waypoint && dist2d(pp, m.waypoint) < 6) m.complete();
      }
    },

    complete() {
      const def = MISSION_DEFS[m.index];
      if (def.reward) game.addMoney(def.reward);
      game.message('Mission complete: ' + def.title + (def.reward ? ' (+$' + def.reward + ')' : ''));
      game.audio.mission();
      m.active = false;
      m.waypoint = null;
      m.targetCar = null;
      m.index += 1;
      game.save();
      if (m.index >= MISSION_DEFS.length) {
        game.completeStory();
        return;
      }
      m.start(m.index);
    },

    fail(reason) {
      game.message(reason);
      game.audio.fail();
      game.setWanted(0);
      m.active = false;
      m.waypoint = null;
      m.targetCar = null;
      m.retryIn = 1.5;
    },

    /** Called when the player is busted or wasted mid-mission. */
    onBusted() {
      if (!m.active) return;
      if (m.index === 2) m.fail('Busted — the Heat is back on.');
      else if (m.index === 3) m.fail('Busted — Marisol is not happy.');
    },
  };
  return m;
}
