// Missions and the story: Rico Vega owes the fixer Marisol Kane $5,000.
// Four jobs, each a drive / fetch / escape. The beacon marks the target.
export const MISSIONS = [
  {
    id: 'wheels',
    title: 'JOB 1 — WHEELS',
    story: 'Marisol Kane: "You owe me five grand, Rico. First job — get wheels. The orange Viento is parked by Palm Row. Take it."',
    objective: 'Get in the orange Viento',
    steps: [
      { kind: 'enterCar', target: 'playerCar', text: 'Get in the orange Viento' },
      { kind: 'reach', target: 'garage', text: 'Drive to the Garage on Palm Row' },
    ],
    reward: 500,
  },
  {
    id: 'package',
    title: 'JOB 2 — THE PACKAGE',
    story: 'Marisol: "A package is waiting at the Marina pier. Grab it, then bring it to the Hotel on Coral Ave. No detours."',
    objective: 'Pick up the package at the Marina',
    steps: [
      { kind: 'interact', target: 'marina', text: 'Pick up the package at the Marina (press E)' },
      { kind: 'reach', target: 'hotel', text: 'Deliver the package to the Hotel' },
    ],
    reward: 1200,
  },
  {
    id: 'heat',
    title: 'JOB 3 — HEAT',
    story: 'Marisol: "The cops are onto the drop. Lose them. Get to the Safehouse and lay low until the heat dies."',
    objective: 'Reach the Safehouse with the heat on',
    onStart: { wanted: 2 },
    steps: [
      { kind: 'reach', target: 'safehouse', text: 'Reach the Safehouse — lose the cops' },
    ],
    reward: 1500,
  },
  {
    id: 'payoff',
    title: 'JOB 4 — THE PAYOFF',
    story: 'Marisol: "Last one, Rico. The cash is at the Bank on Marina Drive. Deliver it and you are square with me."',
    objective: 'Deliver the cash to the Bank',
    steps: [
      { kind: 'interact', target: 'bank', text: 'Deliver the cash at the Bank (press E)' },
    ],
    reward: 1800,
  },
];

export function createMissions(landmarks) {
  return {
    index: 0,
    step: 0,
    done: false,
    beacon: null,
    beaconPos: null,
    // Current step text shown on the HUD.
    currentText() {
      if (this.done) return 'All jobs done — Solmar Bay is yours. Free roam.';
      const m = MISSIONS[this.index];
      return m.steps[this.step].text;
    },
    currentTitle() {
      if (this.done) return 'FREE ROAM';
      return MISSIONS[this.index].title;
    },
    currentStory() {
      if (this.done) return '';
      return MISSIONS[this.index].story;
    },
    // Where the beacon should point right now.
    currentTarget(landmarks, playerCar) {
      if (this.done) return null;
      const m = MISSIONS[this.index];
      const step = m.steps[this.step];
      if (step.kind === 'enterCar') return playerCar ? { x: playerCar.state.x, z: playerCar.state.z } : null;
      const lm = landmarks[step.target];
      return lm ? { x: lm.x, z: lm.z } : null;
    },
    advance() {
      const m = MISSIONS[this.index];
      this.step += 1;
      if (this.step >= m.steps.length) {
        this.index += 1;
        this.step = 0;
        if (this.index >= MISSIONS.length) {
          this.done = true;
          return { missionComplete: true, storyComplete: true, reward: m.reward };
        }
        return { missionComplete: true, storyComplete: false, reward: m.reward };
      }
      return { missionComplete: false, storyComplete: false, reward: 0 };
    },
  };
}
