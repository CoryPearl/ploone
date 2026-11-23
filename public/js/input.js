export class Input {
  constructor(onAction) {
    this.keys = new Set(); this.settings = { sensitivity: 1, invert: false }; this.enabled = false;
    window.addEventListener('keydown', event => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, select, textarea')) return;
      if (target?.closest('button, a, summary') && ['Space', 'Enter', 'NumpadEnter'].includes(event.code)) return;
      if (this.enabled && ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyC', 'KeyG', 'KeyH', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat) {
        const action = { Escape: 'pause', KeyR: 'restart', KeyC: 'camera', KeyG: 'gearOrGhost', KeyH: 'instruments', Enter: 'play', KeyN: 'seed' }[event.code];
        if (action) onAction(action);
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.clear(); onAction('blur'); });
  }
  clear() { this.keys.clear(); }
  state() {
    const has = (...codes) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    return {
      pitch: (has('KeyS', 'ArrowDown') - has('KeyW', 'ArrowUp')) * this.settings.sensitivity * (this.settings.invert ? -1 : 1),
      roll: (has('KeyA', 'ArrowLeft') - has('KeyD', 'ArrowRight')) * this.settings.sensitivity,
      yaw: has('KeyQ') - has('KeyE'), throttle: has('ShiftLeft', 'ShiftRight') - has('ControlLeft', 'ControlRight'), drift: !!has('Space')
    };
  }
}
