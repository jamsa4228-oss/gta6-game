// SOLMAR BAY — HUD: health, money, wanted stars, speed, objective, feed, minimap.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    health: $('hud-health-fill'),
    healthText: $('hud-health-text'),
    money: $('hud-money'),
    debt: $('hud-debt'),
    stars: $('hud-stars'),
    speed: $('hud-speed'),
    objective: $('hud-objective'),
    missionTitle: $('hud-mission'),
    feed: $('hud-feed'),
    minimap: $('minimap'),
    start: $('screen-start'),
    pause: $('screen-pause'),
    end: $('screen-end'),
    endTitle: $('end-title'),
    endText: $('end-text'),
    endBtn: $('btn-end'),
  };
  const mctx = el.minimap.getContext('2d');
  const feedItems = [];
  let pulse = 0;

  const hud = {
    setHealth(hp) {
      el.health.style.width = Math.max(0, hp) + '%';
      el.healthText.textContent = String(Math.ceil(Math.max(0, hp)));
    },
    setMoney(money, debt) {
      el.money.textContent = '$' + money.toLocaleString('en-US');
      el.debt.textContent = 'Debt: $' + debt.toLocaleString('en-US');
    },
    setStars(n) {
      let s = '';
      for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
      el.stars.textContent = s;
      el.stars.style.color = n > 0 ? '#ffd23e' : '#555';
    },
    setSpeed(kmh) {
      el.speed.textContent = Math.round(kmh) + ' km/h';
    },
    setObjective(t) {
      el.objective.textContent = t || '';
    },
    setMissionTitle(t) {
      el.missionTitle.textContent = t || '';
    },
    message(text) {
      feedItems.unshift(text);
      if (feedItems.length > 5) feedItems.pop();
      el.feed.innerHTML = feedItems.map((m) => '<div>' + m + '</div>').join('');
    },
    show(name) {
      el.start.style.display = name === 'start' ? 'flex' : 'none';
      el.pause.style.display = name === 'pause' ? 'flex' : 'none';
      el.end.style.display = name === 'end' ? 'flex' : 'none';
    },
    showEnd(title, text, btnLabel) {
      el.endTitle.textContent = title;
      el.endText.textContent = text;
      el.endBtn.textContent = btnLabel || 'Continue';
      hud.show('end');
    },
    drawMinimap(state, dt) {
      pulse += dt || 0.016;
      const c = mctx;
      const S = 180;
      const scale = S / 320;
      const toX = (x) => (x + 160) * scale;
      const toZ = (z) => (z + 160) * scale;
      c.fillStyle = '#0d1420';
      c.fillRect(0, 0, S, S);
      // Sea on the west edge.
      c.fillStyle = '#14507e';
      c.fillRect(0, 0, toX(-150), S);
      // Roads.
      c.strokeStyle = '#5a5a60';
      c.lineWidth = 7;
      for (const r of [-120, -60, 0, 60, 120]) {
        c.beginPath();
        c.moveTo(toX(r), 0);
        c.lineTo(toX(r), S);
        c.stroke();
        c.beginPath();
        c.moveTo(0, toZ(r));
        c.lineTo(S, toZ(r));
        c.stroke();
      }
      // Pier.
      c.strokeStyle = '#8a6a4a';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(toX(-150), toZ(0));
      c.lineTo(toX(-210), toZ(0));
      c.stroke();
      // Traffic dots.
      c.fillStyle = '#9a9a9a';
      for (const t of state.traffic || []) {
        c.fillRect(toX(t.x) - 1.5, toZ(t.z) - 1.5, 3, 3);
      }
      // Police dots.
      for (const p of state.police || []) {
        c.fillStyle = p.kind === 'foot' ? '#ff4040' : '#ff2020';
        c.beginPath();
        c.arc(toX(p.x), toZ(p.z), p.kind === 'foot' ? 2.5 : 3.5, 0, Math.PI * 2);
        c.fill();
      }
      // Waypoint: pulsing yellow diamond.
      if (state.waypoint) {
        const wx = toX(state.waypoint.x);
        const wz = toZ(state.waypoint.z);
        const r = 5 + Math.sin(pulse * 5) * 2;
        c.fillStyle = '#ffd23e';
        c.beginPath();
        c.moveTo(wx, wz - r);
        c.lineTo(wx + r, wz);
        c.lineTo(wx, wz + r);
        c.lineTo(wx - r, wz);
        c.closePath();
        c.fill();
      }
      // Player arrow.
      const px = toX(state.px);
      const pz = toZ(state.pz);
      const a = state.heading || 0;
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#111111';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px + Math.sin(a) * 7, pz + Math.cos(a) * 7);
      c.lineTo(px + Math.sin(a + 2.5) * 5, pz + Math.cos(a + 2.5) * 5);
      c.lineTo(px + Math.sin(a - 2.5) * 5, pz + Math.cos(a - 2.5) * 5);
      c.closePath();
      c.fill();
      c.stroke();
    },
  };
  return hud;
}
