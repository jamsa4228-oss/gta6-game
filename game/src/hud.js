// HUD: health, money, wanted stars, mission objective, messages, a live
// canvas minimap (roads, buildings, player, cars, police, mission marker),
// and the overlays: start, pause, wasted/busted, story complete.
export function createHud(callbacks) {
  const el = (id) => document.getElementById(id);
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  let messageTimer = 0;

  function setText(id, text) {
    const node = el(id);
    if (node) node.textContent = text;
  }

  return {
    setHealth(hp) {
      setText('health-value', String(Math.max(0, Math.round(hp))));
      const fill = el('health-fill');
      if (fill) {
        fill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
        fill.classList.toggle('low', hp <= 30);
      }
    },
    setMoney(amount) {
      setText('money-value', `$${Math.round(amount).toLocaleString('en-US')}`);
    },
    setWanted(level) {
      const stars = el('wanted-stars');
      if (!stars) return;
      let html = '';
      for (let i = 0; i < 5; i += 1) html += i < level ? '★' : '☆';
      stars.innerHTML = html;
      stars.classList.toggle('hot', level > 0);
    },
    setAmmo(mag, magSize, reloading) {
      setText('ammo-value', reloading ? 'RELOADING' : `${mag} / ${magSize}`);
    },
    setSpeed(kmh, driving) {
      setText('speed-value', driving ? `${Math.round(Math.abs(kmh))} km/h` : '');
    },
    setMission(title, objective) {
      setText('mission-title', title);
      setText('mission-objective', objective);
    },
    showMessage(text, seconds = 3) {
      const node = el('message');
      if (!node) return;
      node.textContent = text;
      node.hidden = false;
      messageTimer = seconds;
    },
    tickMessage(dt) {
      if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) {
          const node = el('message');
          if (node) node.hidden = true;
        }
      }
    },
    setHint(text) {
      setText('hint', text);
    },
    // Minimap: 170x170, city spans -160..+190 in both axes.
    drawMinimap({ player, cars, police, peds, missionTarget, landmarks, inCar }) {
      const W = minimap.width;
      const H = minimap.height;
      const min = -165;
      const max = 195;
      const toMap = (x, z) => [
        ((x - min) / (max - min)) * W,
        ((z - min) / (max - min)) * H,
      ];
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = '#20262b';
      mctx.fillRect(0, 0, W, H);
      // Sea (south).
      const [, seaY] = toMap(0, 150);
      mctx.fillStyle = '#2e7fa8';
      mctx.fillRect(0, seaY, W, H - seaY);
      // Roads.
      mctx.strokeStyle = '#5a5e64';
      mctx.lineWidth = 4;
      for (const c of [-120, -72, -24, 24, 72, 120]) {
        const [x] = toMap(c, 0);
        mctx.beginPath(); mctx.moveTo(x, 0); mctx.lineTo(x, H); mctx.stroke();
        const [, z] = toMap(0, c);
        mctx.beginPath(); mctx.moveTo(0, z); mctx.lineTo(W, z); mctx.stroke();
      }
      // Landmark dots.
      mctx.fillStyle = '#d8b62a';
      for (const key of ['garage', 'hotel', 'safehouse', 'bank']) {
        const lm = landmarks[key];
        if (!lm) continue;
        const [x, z] = toMap(lm.x, lm.z);
        mctx.beginPath(); mctx.arc(x, z, 3, 0, Math.PI * 2); mctx.fill();
      }
      // Mission marker: pulsing yellow diamond.
      if (missionTarget) {
        const [x, z] = toMap(missionTarget.x, missionTarget.z);
        const pulse = 5 + Math.sin(performance.now() / 200) * 2;
        mctx.fillStyle = '#ffd83a';
        mctx.beginPath();
        mctx.moveTo(x, z - pulse); mctx.lineTo(x + pulse, z); mctx.lineTo(x, z + pulse); mctx.lineTo(x - pulse, z);
        mctx.closePath(); mctx.fill();
      }
      // Traffic cars: white dots.
      mctx.fillStyle = '#e8e8e8';
      for (const car of cars) {
        const [x, z] = toMap(car.state.x, car.state.z);
        mctx.fillRect(x - 1.5, z - 1.5, 3, 3);
      }
      // Police: blue/red dots.
      for (const car of police) {
        const [x, z] = toMap(car.state.x, car.state.z);
        mctx.fillStyle = '#4a86ff';
        mctx.beginPath(); mctx.arc(x, z, 3, 0, Math.PI * 2); mctx.fill();
      }
      // Player: white triangle pointing along heading.
      const [px, pz] = toMap(player.x, player.z);
      mctx.save();
      mctx.translate(px, pz);
      mctx.rotate(player.heading);
      mctx.fillStyle = inCar ? '#ff8c2a' : '#ffffff';
      mctx.beginPath();
      mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6);
      mctx.closePath(); mctx.fill();
      mctx.restore();
      // North tick.
      mctx.fillStyle = '#8a94a0';
      mctx.font = '10px sans-serif';
      mctx.fillText('N', 6, 12);
    },
    showOverlay(kind, data = {}) {
      const overlay = el('overlay');
      const title = el('overlay-title');
      const copy = el('overlay-copy');
      const play = el('play');
      if (!overlay || !title || !copy || !play) return;
      overlay.hidden = false;
      if (kind === 'start') {
        title.innerHTML = 'SOLMAR <span class="amber">BAY</span>';
        copy.textContent = 'A sun-soaked coastal city. Rico Vega owes the fixer Marisol Kane $5,000 — four jobs stand between him and a clean slate. Steal a car, run the package, lose the heat, make the payoff.';
        play.textContent = data.hasSave ? 'Continue — $' + Math.round(data.saveMoney || 0) : 'Start the story';
        el('overlay-sub').hidden = false;
      } else if (kind === 'paused') {
        title.textContent = 'PAUSED';
        copy.textContent = 'Take a breath, Rico. The city waits.';
        play.textContent = 'Resume';
        el('overlay-sub').hidden = true;
      } else if (kind === 'wasted') {
        title.textContent = 'WASTED';
        copy.textContent = data.reason || 'Rico went down. The hospital patched him up — minus $500.';
        play.textContent = 'Get back up';
        el('overlay-sub').hidden = true;
      } else if (kind === 'busted') {
        title.textContent = 'BUSTED';
        copy.textContent = 'The Solmar Bay PD took Rico in. Bail cost $500 — and the heat is off, for now.';
        play.textContent = 'Walk free';
        el('overlay-sub').hidden = true;
      } else if (kind === 'story') {
        title.innerHTML = 'DEBT <span class="amber">PAID</span>';
        copy.textContent = `All four jobs done. Rico is square with Marisol Kane — $${Math.round(data.money || 0)} in his pocket and the whole of Solmar Bay ahead of him. Free roam continues.`;
        play.textContent = 'Keep driving';
        el('overlay-sub').hidden = true;
      }
      el('overlay').dataset.kind = kind;
    },
    hideOverlay() {
      const overlay = el('overlay');
      if (overlay) overlay.hidden = true;
    },
    overlayKind() {
      const overlay = el('overlay');
      return overlay ? overlay.dataset.kind : null;
    },
    onPlay(fn) {
      const play = el('play');
      if (play) play.addEventListener('click', fn);
    },
    setSaveButton(hasSave, money) {
      const btn = el('play');
      if (btn && hasSave) btn.textContent = `Continue — $${Math.round(money || 0)}`;
    },
  };
}
