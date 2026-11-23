import { Vector3 } from 'three';
import { flightAttitude, headingDifference } from '../core/instruments.js';
import { unitsFor, heightValue, formatDistance, climbValue } from '../core/units.js';

const GREEN = '#a1ff91', RED = '#ff8a7a', DEG = Math.PI / 180;

export class FlightDisplay {
  constructor(canvas, cockpit, hud) {
    this.canvas = canvas; this.context = canvas.getContext('2d');
    this.cockpit = cockpit; this.hud = hud;
    this.path = new Vector3(); this.nose = new Vector3();
    this.readouts = Object.fromEntries(['clearance', 'climb', 'power', 'nav'].map(id => [id, document.getElementById(`cockpit-${id}`)]));
  }

  update(flight, camera, world, origin, { visible, cockpit, enabled, target, units = 'imperial', ceilingWarning = false }) {
    this.canvas.hidden = !visible || !enabled || !this.context;
    this.cockpit.hidden = !visible || !cockpit;
    this.hud.classList.toggle('cockpit-view', visible && cockpit);
    this.hud.classList.toggle('green-instruments', visible && enabled && !!this.context);
    this.hud.classList.toggle('hide-instruments', visible && !enabled);
    if (!visible) return;

    const attitude = flightAttitude(flight.quaternion), measure = unitsFor(units);
    const clearance = Math.max(0, flight.position.y - Math.max(0, world.height(flight.position.x, flight.position.z)));
    const climb = climbValue(flight.velocity.y, units);
    this.readouts.clearance.textContent = heightValue(clearance, units);
    this.readouts.climb.textContent = `${climb > 0 ? '+' : ''}${climb.toLocaleString('en-US')}`;
    this.readouts.power.textContent = flight.afterburner ? 'AB' : `${Math.round(flight.throttle * 100)}%`;
    this.readouts.nav.textContent = target ? formatDistance(flight.position.distanceTo(target), units) : 'FREE';
    if (this.canvas.hidden) return;

    const width = innerWidth, height = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    }
    const ctx = this.context;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const cx = width / 2, cy = height * (cockpit ? .46 : .41);
    const scale = Math.max(.1, Math.min(1, (width - 38) / 560, (height - 150) / 480));
    this.textSize = Math.max(12, 9 / scale);
    this.valueSize = Math.max(18, 13 / scale);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
    ctx.strokeStyle = GREEN; ctx.fillStyle = GREEN; ctx.lineWidth = 1.4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = '#123b20'; ctx.shadowBlur = 3;
    ctx.font = `${this.textSize}px "SFMono-Regular", Consolas, monospace`; ctx.textBaseline = 'middle';

    // Use the rendered camera attitude so the ladder follows the visible horizon
    // in both the level chase camera and the rolling cockpit camera.
    const view = flightAttitude(camera.quaternion);
    const focal = height / (2 * Math.tan(camera.fov * DEG / 2)) / scale;
    const halfHeight = cockpit ? 125 : 65;
    ctx.save(); ctx.beginPath(); ctx.rect(-150, -halfHeight, 300, halfHeight * 2); ctx.clip();
    ctx.translate(0, (height / 2 - cy) / scale); ctx.rotate(view.bank);
    for (let angle = -90; angle <= 90; angle += 5) {
      const delta = view.pitch - angle * DEG;
      if (Math.abs(delta) > 75 * DEG) continue;
      const y = Math.tan(delta) * focal;
      if (Math.abs(y) > 230) continue;
      ctx.setLineDash(angle < 0 ? [5, 5] : []);
      const outer = angle === 0 ? 130 : 72, inner = angle === 0 ? 28 : 24;
      this.line(-outer, y, -inner, y); this.line(inner, y, outer, y);
      if (angle !== 0) {
        this.line(-outer, y, -outer, y + (angle > 0 ? 5 : -5));
        this.line(outer, y, outer, y + (angle > 0 ? 5 : -5));
        ctx.setLineDash([]); this.label(String(angle), -outer - 20, y); this.label(String(angle), outer + 20, y);
      }
    }
    ctx.restore();

    // Project the nose separately from the velocity marker. In chase view the
    // camera follows momentum, so a fixed crosshair would conceal the slip.
    this.nose.set(0, 0, -1).applyQuaternion(flight.quaternion).multiplyScalar(2000).add(flight.position).sub(origin).project(camera);
    const nx = this.nose.x * width / 2 / scale;
    const ny = ((1 - this.nose.y) * height / 2 - cy) / scale;
    if (this.nose.z < 1 && Math.abs(nx) < 180 && Math.abs(ny) < halfHeight) {
      ctx.save(); ctx.translate(nx, ny);
      this.line(-31, 0, -12, 0); this.line(-12, 0, 0, 7); this.line(0, 7, 12, 0); this.line(12, 0, 31, 0);
      this.line(0, -9, 0, -4); ctx.restore();
    }
    this.compass(attitude.heading, cockpit ? -174 : -112);
    this.tape(Math.round(flight.speed * measure.speedFactor), -240, measure.speed.toUpperCase(), cockpit, 20);
    this.tape(Math.round(flight.position.y * measure.lengthFactor), 240, measure.length.toUpperCase(), cockpit, units === 'metric' ? 50 : 100, ceilingWarning ? RED : GREEN);
    this.label(`${(flight.loadFactor || 1).toFixed(1)} G`, 0, cockpit ? 205 : 111);
    if (flight.landingEnabled) this.label(flight.grounded ? 'GROUND' : flight.gear > .98 ? 'GEAR DOWN' : flight.gear > .02 ? 'GEAR IN TRANSIT' : 'GEAR UP', 0, cockpit ? 233 : 139);

    // Velocity marker is projected from the actual travel direction, so a drift
    // visibly separates where the nose points from where the plane is moving.
    this.path.copy(flight.position).sub(origin).addScaledVector(flight.travelDirection, 2000).project(camera);
    const px = (this.path.x * width / 2) / scale;
    const py = ((1 - this.path.y) * height / 2 - cy) / scale;
    if (this.path.z < 1 && Math.abs(px) < 180 && Math.abs(py) < halfHeight) {
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
      this.line(px - 15, py, px - 7, py); this.line(px + 7, py, px + 15, py); this.line(px, py - 14, px, py - 7);
    }

    if (cockpit) {
      ctx.save(); ctx.translate(0, 185);
      for (const angle of [-60, -30, 0, 30, 60]) {
        ctx.save(); ctx.rotate(angle * DEG);
        this.line(0, -39, 0, angle === 0 ? -49 : -45); ctx.restore();
      }
      const bank = Math.max(-70, Math.min(70, attitude.bank / DEG));
      ctx.rotate(bank * DEG); ctx.beginPath(); ctx.moveTo(0, -35); ctx.lineTo(-4, -28); ctx.lineTo(4, -28); ctx.closePath(); ctx.stroke(); ctx.restore();
      this.label(`${Math.round(flight.throttle * 100)}% PWR`, -240, 155);
      this.label(`${climb > 0 ? '+' : ''}${climb} ${measure.climb.toUpperCase()}`, 240, 155);
    }
    ctx.restore();
  }

  line(x1, y1, x2, y2) {
    const ctx = this.context; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  label(text, x, y, align = 'center') {
    const ctx = this.context, stroke = ctx.strokeStyle; ctx.textAlign = align;
    ctx.lineWidth = 3; ctx.strokeStyle = '#12351ed9'; ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y); ctx.lineWidth = 1.4; ctx.strokeStyle = stroke;
  }
  compass(heading, y) {
    const ctx = this.context;
    ctx.save(); ctx.beginPath(); ctx.rect(-142, y - 32, 284, 59); ctx.clip();
    for (let value = Math.floor(heading / 10) * 10 - 40; value < heading + 45; value += 10) {
      const actual = (value + 360) % 360, x = headingDifference(actual, heading) * 4;
      this.line(x, y, x, y - 6);
      this.label(({0:'N',90:'E',180:'S',270:'W'})[actual] || String(actual).padStart(3, '0'), x, y - 19);
    }
    this.line(-5, y + 5, 0, y); this.line(0, y, 5, y + 5);
    this.label(`${String(Math.round(heading) % 360).padStart(3, '0')}°`, 0, y + 20);
    ctx.restore();
  }
  tape(value, x, unit, detailed, step, color = GREEN) {
    const ctx = this.context, direction = x < 0 ? 1 : -1;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color;
    if (color === RED) ctx.shadowColor = '#48110e';
    this.label(unit, x, detailed ? -121 : -43);
    ctx.fillStyle = color === RED ? '#521d1acc' : '#132d2373'; ctx.fillRect(x - 36, -15, 72, 30); ctx.fillStyle = color;
    ctx.strokeRect(x - 36, -15, 72, 30);
    ctx.font = `${this.valueSize}px "SFMono-Regular", Consolas, monospace`; this.label(String(value), x, 1);
    ctx.font = `${this.textSize}px "SFMono-Regular", Consolas, monospace`;
    if (!detailed) { ctx.restore(); return; }
    ctx.save(); ctx.beginPath(); ctx.rect(x - 42, -102, 84, 204); ctx.clip();
    for (let tick = Math.floor(value / step) * step - step * 3; tick <= value + step * 3; tick += step) {
      const y = (value - tick) / step * 30;
      if (tick < 0 || Math.abs(y) < 25) continue;
      this.line(x + direction * 33, y, x + direction * 39, y);
      this.label(String(tick), x, y);
    }
    ctx.restore();
    ctx.restore();
  }
}
