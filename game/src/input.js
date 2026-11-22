// Keyboard + mouse input for SOLMAR BAY.
// WASD/arrows drive and walk, Shift runs, E enters/exits cars and pays, Space or
// left click shoots, F punches, P/Escape pauses, Enter confirms. One-shot presses are
// queued as bit flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const SHOOT_KEY = new Set(['Space']);

export function createInput() {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;

  function press(code) {
    if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(code)) actions |= ACTION_PUNCH;
    else if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (SHOOT_KEY.has(code)) actions |= ACTION_SHOOT;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    press(event.code);
    if (
      FORWARD.has(event.code) || BACK.has(event.code) ||
      LEFT.has(event.code) || RIGHT.has(event.code) ||
      SHOOT_KEY.has(event.code)
    ) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_SHOOT;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  const has = (set) => {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  };

  return {
    /** Driving: throttle -1..1 (forward positive), steer -1..1 (right positive). */
    drive() {
      const throttle = (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0);
      const steer = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      return { throttle, steer };
    },
    /** On foot: x right, z forward, in camera space, each -1..1. */
    move() {
      const x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const z = (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0);
      return { x, z };
    },
    run() {
      return has(RUN);
    },
    mouseHeld() {
      return mouseDown;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
