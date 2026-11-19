// Keyboard and mouse. Pointer lock turns the mouse into a camera orbit;
// dragging without lock orbits too, so the game plays without lock.
// Tracks single-press keys so logic can consume them exactly once.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, lookX: 0, lookY: 0, firing: false };
  let dragging = false;

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
    dragging = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (state.locked) {
      state.lookX += event.movementX;
      state.lookY += event.movementY;
    } else if (dragging) {
      state.lookX += event.movementX;
      state.lookY += event.movementY;
    }
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      state.firing = true;
      dragging = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      state.firing = false;
      dragging = false;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    wasPressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
