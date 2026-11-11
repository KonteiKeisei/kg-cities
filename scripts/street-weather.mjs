// The weather out on the street, for the street views (ui-roadview.mjs): read from Calendaria
// exactly as KG Transit reads it for its rides (its weather.mjs), so a train and a street agree
// on the sky. Rain or snow falling past (streaming out from the far end of the street while the
// car moves), drops on a car's windscreen, fog that hides the far end, lightning.

/**
 * The weather as a view needs it:
 *   sky: "clear" | "partly" | "cloudy" | "overcast" | "storm"
 *   precip: null | "rain" | "snow", intensity 0 to 1, fog 0 to 1, wind 0 to 5, lightning, sleet
 */
const PRESETS = {
  clear: { sky: "clear" },
  "heat-wave": { sky: "clear", fog: 0.2 },
  windy: { sky: "partly", wind: 3 },
  "partly-cloudy": { sky: "partly" },
  cloudy: { sky: "cloudy" },
  overcast: { sky: "overcast" },
  mist: { sky: "overcast", fog: 0.45 },
  fog: { sky: "overcast", fog: 0.75 },
  "rolling-fog": { sky: "overcast", fog: 0.85 },
  drizzle: { sky: "overcast", precip: "rain", intensity: 0.2 },
  sunshower: { sky: "partly", precip: "rain", intensity: 0.3 },
  rain: { sky: "storm", precip: "rain", intensity: 0.6, wind: 2 },
  sleet: { sky: "storm", precip: "rain", intensity: 0.5, wind: 2, sleet: true },
  hail: { sky: "storm", precip: "rain", intensity: 0.7, wind: 3, sleet: true },
  "ice-storm": { sky: "storm", precip: "rain", intensity: 0.8, wind: 4, sleet: true },
  thunderstorm: { sky: "storm", precip: "rain", intensity: 0.9, wind: 4, lightning: true },
  monsoon: { sky: "storm", precip: "rain", intensity: 1, wind: 4 },
  hurricane: { sky: "storm", precip: "rain", intensity: 1, wind: 5 },
  tornado: { sky: "storm", precip: "rain", intensity: 0.8, wind: 5, lightning: true },
  snow: { sky: "overcast", precip: "snow", intensity: 0.5, wind: 1 },
  "permafrost-surge": { sky: "overcast", precip: "snow", intensity: 0.4, wind: 3 },
  blizzard: { sky: "storm", precip: "snow", intensity: 1, wind: 5, fog: 0.35 }
};

export const CLEAR = { sky: "clear", precip: null, intensity: 0, fog: 0, wind: 0, lightning: false, sleet: false };

/** A Calendaria weather record (or a preset id) as a view's weather. */
export function streetWeather(record) {
  if (!record) return CLEAR;
  const id = typeof record === "string" ? record : record.id;
  const known = PRESETS[id];
  if (known) return { ...CLEAR, ...known };
  // Custom or unknown presets: what the record says about rain and clouds.
  const p = record.precipitation ?? {};
  const type = p.type === "snow" ? "snow" : p.type ? "rain" : null;
  const hud = record.hudEffect ?? "";
  const sky = type ? (p.intensity > 0.5 ? "storm" : "overcast")
    : hud === "clouds-light" ? "partly" : hud === "clouds-heavy" ? "cloudy" : hud === "clouds-overcast" ? "overcast" : "clear";
  return { ...CLEAR, sky, precip: type, intensity: p.intensity ?? 0, wind: record.wind?.speed ?? 0, fog: hud === "fog" ? 0.6 : 0 };
}

/** Calendaria's weather now, if Calendaria is running; clear otherwise. */
export function currentStreetWeather() {
  try { return streetWeather(globalThis.CALENDARIA?.api?.getCurrentWeather?.()); } catch { return CLEAR; }
}

/** How much a sky is clouded over, 0 (clear) to 1 (storm). */
export const cloudCover = (wx) => ({ clear: 0, partly: 0.25, cloudy: 0.5, overcast: 0.75, storm: 1 })[wx?.sky] ?? 0;

/**
 * Rain or snow falling past, drops on the glass and lightning, drawn over the street on the same
 * canvas (so it shows through the interior's windows only). update(g, w, h, { dt, now, speed
 * (0..1 of a car's pace), vp: { x, y } (the street's far end), glass (a windscreen to wet) }).
 */
export class WeatherOverlay {
  constructor() {
    this.weather = CLEAR;
    this.particles = [];
    this.drops = [];
    this.nextBolt = 0;
    this.flash = 0;
  }

  set(weather) { this.weather = weather ?? CLEAR; }

  update(g, w, h, { dt, now, speed, vp, glass }) {
    const wx = this.weather;
    const snow = wx.precip === "snow";
    // Falling rain or snow, as many as the intensity calls for at this size of window.
    const amount = wx.precip ? Math.max(0.12, wx.intensity) : 0;
    const target = Math.round(amount * (snow ? 900 : 650) * Math.min(2, (w * h) / (640 * 380)));
    while (this.particles.length < target) this.particles.push(this.#spawn(w, h, true));
    if (this.particles.length > target) this.particles.length = target;
    const k = h / 380; // speeds were set for a 380 px window
    const gust = wx.wind * 40 * k;
    g.lineCap = "round";
    for (const p of this.particles) {
      // Moving forward, the weather streams outward from the far end of the street.
      const ox = p.x - vp.x, oy = p.y - vp.y;
      const vx = (ox * speed * (snow ? 0.9 : 1.6) + gust) * p.z + (snow ? Math.sin(now / 500 + p.seed) * 30 * k : 0);
      const vy = ((snow ? 80 + 40 * wx.intensity : 1100) * k + oy * speed * 0.6) * p.z;
      p.x += vx * dt;
      p.y += vy * dt;
      p.age += dt;
      if (p.y > h + 20) Object.assign(p, this.#spawn(w, h, false));
      else if (p.x < -40 || p.x > w + 40) Object.assign(p, this.#spawn(w, h, true));
      const fadeIn = Math.min(1, p.age / 0.4);
      if (snow) {
        g.fillStyle = `rgba(250,252,255,${(0.55 + 0.4 * p.z) * fadeIn})`;
        g.beginPath();
        g.arc(p.x, p.y, (1.2 + 2.6 * p.z) * k, 0, Math.PI * 2);
        g.fill();
      } else {
        g.strokeStyle = wx.sleet && p.seed > 4 ? `rgba(235,240,250,${0.5 * p.z * fadeIn})` : `rgba(200,212,230,${(0.18 + 0.3 * p.z) * fadeIn})`;
        g.lineWidth = (0.7 + 1.2 * p.z) * k;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - vx * 0.022, p.y - vy * 0.022);
        g.stroke();
      }
    }

    // Drops on a car's windscreen in the rain, pushed out and back by the air while it moves.
    const dropTarget = glass && wx.precip === "rain" ? Math.round(60 * Math.max(0.3, wx.intensity)) : 0;
    while (this.drops.length < dropTarget) this.drops.push(this.#drop(w, h, vp));
    if (this.drops.length > dropTarget) this.drops.length = dropTarget;
    for (const d of this.drops) {
      const out = d.x < vp.x ? -1 : 1, run = speed * 150 * k * (0.6 + d.r / 5);
      d.x += out * run * dt;
      d.y -= speed * 40 * k * dt - (1 - speed) * 10 * k * dt;
      if (d.x < 0 || d.x > w || d.y < 0 || d.y > h) Object.assign(d, this.#drop(w, h, vp));
      g.strokeStyle = "rgba(220,230,245,0.25)";
      g.lineWidth = d.r * 0.8 * k;
      g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - out * run * 0.1, d.y + 3 * k); g.stroke();
      g.fillStyle = "rgba(235,242,255,0.5)";
      g.beginPath(); g.arc(d.x, d.y, d.r * k, 0, Math.PI * 2); g.fill();
    }

    // Lightning: a double flicker every so often.
    if (wx.lightning) {
      if (!this.nextBolt) this.nextBolt = now + 4000 + Math.random() * 9000;
      if (now >= this.nextBolt) {
        this.flash = 1;
        setTimeout(() => { this.flash = 0.8; }, 180);
        this.nextBolt = now + 5000 + Math.random() * 12000;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    return this.flash;
  }

  #spawn(w, h, anywhere) {
    return { x: Math.random() * w, y: anywhere ? Math.random() * h : -20 - Math.random() * 80, z: 0.3 + Math.random() * 0.7, seed: Math.random() * 6.28, age: anywhere ? 0 : 1 };
  }

  #drop(w, h, vp) {
    return { x: vp.x + (Math.random() - 0.5) * w * 0.9, y: vp.y - h * 0.15 + Math.random() * h * 0.25, r: 1.5 + Math.random() * 3 };
  }
}
