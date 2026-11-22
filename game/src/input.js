// SOLMAR BAY — keyboard + mouse input (pointer lock).
export function createInput(canvas) {
  const input = {
    keys: Object.create(null),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    mouseClicked: false,
    locked: false,
  };

  window.addEventListener('keydown', (e) => {
    input.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      input.mouseDX += e.movementX || 0;
      input.mouseDY += e.movementY || 0;
    }
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      input.mouseDown = true;
      input.mouseClicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      try {
        canvas.requestPointerLock();
      } catch (err) {
        /* pointer lock unavailable in this browser */
      }
    }
  });

  input.requestLock = () => {
    try {
      canvas.requestPointerLock();
    } catch (err) {
      /* ignore */
    }
  };
  input.consumeMouse = () => {
    const dx = input.mouseDX;
    const dy = input.mouseDY;
    input.mouseDX = 0;
    input.mouseDY = 0;
    return { dx, dy };
  };
  input.consumeClick = () => {
    const c = input.mouseClicked;
    input.mouseClicked = false;
    return c;
  };
  input.axis = () => {
    const k = input.keys;
    return {
      x: (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0),
      y: (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0),
    };
  };
  input.pressed = (code) => !!input.keys[code];
  return input;
}
