// The HUD: cash, wanted stars, health, the mission banner, a toast line, a
// context prompt, the minimap and the menu / end overlays. All DOM; the 3D
// scene never knows about it. The minimap is a little canvas drawn top-down:
// streets, beach and ocean, the player arrow, the waypoint and police dots.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $('cash'),
    wanted: $('wanted'),
    health: $('health'),
    healthFill: $('health-fill'),
    missionTitle: $('mission-title'),
    missionObjective: $('mission-objective'),
    prompt: $('prompt'),
    toast: $('toast'),
    crosshair: $('crosshair'),
    minimap: $('minimap'),
    vignette: $('vignette'),
    menu: $('overlay-menu'),
    end: $('overlay-end'),
    endTitle: $('end-title'),
    endText: $('end-text'),
    startBtn: $('btn-start'),
    continueBtn: $('btn-continue'),
    againBtn: $('btn-again'),
  };

  const cashEl = els.cash;
  const starsEl = els.wanted;
  const healthFillEl = els.healthFill;
  const missionTitleEl = els.missionTitle;
  const missionObjectiveEl = els.missionObjective;
  const promptEl = els.prompt;
  const toastEl = els.toast;
  const crosshairEl = els.crosshair;
  const minimapEl = els.minimap;
  const vignetteEl = els.vignette;
  const menuEl = els.menu;
  const endEl = els.end;
  const endTitleEl = els.endTitle;
  const endTextEl = els.endText;
  const startBtnEl = els.startBtn;
  const continueBtnEl = els.continueBtn;
  const againBtnEl = els.againBtn;
  const mapCtx = minimapEl ? minimapEl.getContext('2d') : null;

  let toastTimer = 0;

  function setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    starsEl.textContent = s;
  }

  return {
    setCash(n) {
      cashEl.textContent = `$${n.toLocaleString('en-US')}`;
    },
    setWanted(n) {
      setStars(n);
    },
    setHealth(n) {
      const v = Math.max(0, Math.min(100, n));
      healthFillEl.style.width = `${v}%`;
      healthFillEl.style.background = v <= 30
        ? 'linear-gradient(90deg, #ff6b5e, #d92b2b)'
        : 'linear-gradient(90deg, #57e389, #2fbf71)';
    },
    setMission(title, objective) {
      missionTitleEl.textContent = title;
      missionObjectiveEl.textContent = objective;
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.style.display = 'block';
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastEl.style.display = 'none';
      }, 3400);
    },
    setPrompt(text) {
      if (!text) {
        promptEl.textContent = '';
        promptEl.style.display = 'none';
        return;
      }
      promptEl.textContent = text;
      promptEl.style.display = 'block';
    },
    setCrosshair(on) {
      crosshairEl.style.display = on ? 'block' : 'none';
    },
    flashDamage() {
      vignetteEl.style.opacity = '0.55';
      window.setTimeout(() => {
        vignetteEl.style.opacity = '0';
      }, 130);
    },
    showMenu(hasSave) {
      menuEl.classList.add('show');
      continueBtnEl.style.display = hasSave ? 'inline-block' : 'none';
    },
    hideMenu() {
      menuEl.classList.remove('show');
    },
    onStart(handler) {
      startBtnEl.addEventListener('click', handler);
    },
    onContinue(handler) {
      continueBtnEl.addEventListener('click', handler);
    },
    showEnd(title, text) {
      endTitleEl.textContent = title;
      endTextEl.textContent = text;
      endEl.classList.add('show');
    },
    hideEnd() {
      endEl.classList.remove('show');
    },
    onAgain(handler) {
      againBtnEl.addEventListener('click', handler);
    },
    /** Draw the minimap. `state` carries the player, waypoint, police and bounds. */
    drawMinimap(state, t) {
      if (!mapCtx) return;
      const W = minimapEl.width;
      const H = minimapEl.height;
      const x0 = -200;
      const x1 = 200;
      const z0 = -200;
      const z1 = 244;
      const mx = (x) => ((x - x0) / (x1 - x0)) * W;
      const my = (z) => ((z - z0) / (z1 - z0)) * H;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = '#20242c';
      mapCtx.fillRect(0, 0, W, H);
      // Ocean and beach along the south edge.
      mapCtx.fillStyle = '#1d4e6e';
      mapCtx.fillRect(0, my(240), W, H - my(240));
      mapCtx.fillStyle = '#d9b380';
      mapCtx.fillRect(0, my(200), W, my(240) - my(200));
      // Streets.
      mapCtx.strokeStyle = '#565b66';
      mapCtx.lineWidth = 3;
      for (const s of [-160, -80, 0, 80, 160]) {
        mapCtx.beginPath();
        mapCtx.moveTo(mx(s), my(-200));
        mapCtx.lineTo(mx(s), my(200));
        mapCtx.stroke();
        mapCtx.beginPath();
        mapCtx.moveTo(mx(-200), my(s));
        mapCtx.lineTo(mx(200), my(s));
        mapCtx.stroke();
      }
      // Waypoint: a pulsing yellow diamond.
      if (state.waypoint) {
        const pulse = 5 + Math.sin(t * 4) * 1.5;
        const wx = mx(state.waypoint.x);
        const wy = my(state.waypoint.z);
        mapCtx.fillStyle = '#ffd34d';
        mapCtx.beginPath();
        mapCtx.moveTo(wx, wy - pulse);
        mapCtx.lineTo(wx + pulse, wy);
        mapCtx.lineTo(wx, wy + pulse);
        mapCtx.lineTo(wx - pulse, wy);
        mapCtx.closePath();
        mapCtx.fill();
      }
      // Police dots.
      mapCtx.fillStyle = '#ff3b30';
      for (const p of state.police) {
        mapCtx.beginPath();
        mapCtx.arc(mx(p.x), my(p.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // The player: a white arrow pointing where he faces.
      const px = mx(state.playerX);
      const py = my(state.playerZ);
      mapCtx.save();
      mapCtx.translate(px, py);
      mapCtx.rotate(Math.atan2(Math.sin(state.heading), Math.cos(state.heading)) + Math.PI);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -7);
      mapCtx.lineTo(5, 6);
      mapCtx.lineTo(-5, 6);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
  };
}
