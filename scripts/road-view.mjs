// The street out of a car's windows, for the driving view (ui-roadview.mjs): a 2D canvas drawn
// behind the interior art (its windows are transparent). Pure drawing: no Foundry.
//
// Drawn in perspective from the driver's seat, looking down the road: the car keeps to the right
// lane of a two-way city street, the road runs away to the horizon, and everything beside it
// (sidewalks, building fronts with their windows, street lamps, the cross streets with their
// traffic lights, oncoming cars) comes out of the distance and sweeps past, out through the side
// windows. World units are metres: x to the right, y up, z ahead. The street is generated block
// by block from a seed, so the same stretch looks the same while it passes.

const CAMERA_HEIGHT = 1.2;
const LANE = 3.4;
/**
 * A downtown street: the car in the inner of two lanes its way, a parking lane at each curb, two
 * lanes the other way. The curbs, from the camera.
 */
const CURB_RIGHT = LANE * 1.5 + 2.6;
const CURB_LEFT = -LANE * 2.5 - 2.6;
const SIDEWALK = 4.5;
/** A block: this long, then a cross street this wide. */
const BLOCK = 90;
const CROSS = 16;
const SEE = 320;

/** Light at an hour: 0 (night) to 1 (full day), with dawn and dusk between. */
export function daylight(hour) {
  if (hour >= 7 && hour < 18) return 1;
  if (hour >= 20 || hour < 5) return 0;
  return hour < 12 ? (hour - 5) / 2 : (20 - hour) / 2;
}

/** A small seeded random: the same block always builds the same. */
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const FACADES = ["#8c6f5a", "#a08a72", "#6f6a66", "#9b7b63", "#7d7f84", "#b59d82", "#5f5650", "#8a8f96", "#a5674f", "#c4b49a"];
const CARS = ["#7a1e1e", "#1f3d6b", "#d8d2c4", "#2b2b2b", "#5a6b3a", "#8e8a80", "#b8862b", "#3f2a4f"];

/** Blend two colours ("#rrggbb", or an "rgb(r,g,b)" a blend already made), t of the way from a to b. */
const mix = (a, b, t) => {
  const p = (h) => (h.startsWith("rgb") ? h.match(/\d+/g).slice(0, 3).map(Number) : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};
const shade = (hex, k) => mix(hex, "#000000", 1 - k);

/** One block's buildings, lamps and its corner's traffic light, from its index. */
function block(index) {
  const r = rng(index + 7919);
  const out = { buildings: [], lamps: [], z: index * BLOCK };
  for (const side of [1, -1]) {
    let z = 0;
    while (z < BLOCK - CROSS - 4) {
      const len = Math.min(BLOCK - CROSS - z, 10 + r() * 26);
      out.buildings.push({
        side, z0: z, z1: z + len - 0.6, height: 8 + r() ** 2 * 48, colour: FACADES[Math.floor(r() * FACADES.length)],
        lit: r(), floors: 3.4, bays: 2 + Math.floor(r() * 2), set: r() * 1.2
      });
      z += len;
    }
    for (let lz = 12; lz < BLOCK - CROSS; lz += 30) out.lamps.push({ side, z: lz });
  }
  return out;
}

/**
 * The street, moving. draw(ctx, width, height, { distance (metres travelled), speed (m/s),
 * hour, time (seconds, for the oncoming traffic and the shake), horizon (0..1 of the height) }).
 */
export class RoadScene {
  constructor() { this.blocks = new Map(); }

  #block(i) {
    if (!this.blocks.has(i)) {
      this.blocks.set(i, block(i));
      if (this.blocks.size > 12) this.blocks.delete(this.blocks.keys().next().value);
    }
    return this.blocks.get(i);
  }

  /**
   * walking: the camera on the right-hand sidewalk at eye height, with a walker's sway, no
   * headlights. weather (street-weather.mjs): clouds grey the sky and dim the day, rain wets the
   * road (lamps and headlights shine off it), snow whitens the ground, fog hides the far end.
   */
  draw(ctx, w, h, { distance = 0, speed = 15, hour = 12, time = 0, horizon = 0.27, walking = false, weather = null } = {}) {
    const cover = ({ clear: 0, partly: 0.25, cloudy: 0.5, overcast: 0.75, storm: 1 })[weather?.sky] ?? 0;
    const day = daylight(hour), light = day * (1 - 0.4 * cover), night = 1 - day;
    const wet = weather?.precip === "rain" ? Math.max(0.3, weather.intensity) : 0;
    const snowy = weather?.precip === "snow" ? Math.max(0.3, weather.intensity) : 0;
    this.wet = wet;
    const moving = Math.min(1, speed / (walking ? 1 : 10));
    // A little bounce on the springs while driving; a step's rise and fall while walking.
    const shake = walking
      ? Math.abs(Math.sin(time * Math.PI * 1.9)) * 0.045 * moving
      : Math.sin(time * 9.1) * 0.012 * moving + Math.sin(time * 3.7) * 0.008 * moving;
    const hy = h * horizon, cx = w / 2, f = h * 0.95;
    const camY = (walking ? 1.62 : CAMERA_HEIGHT) + shake;
    // Walking: on the sidewalk, a little in from the curb; the world moves left by that much.
    const camX = walking ? CURB_RIGHT + SIDEWALK * 0.45 : 0;
    const sx = (x, z) => cx + (f * (x - camX)) / z;
    const sy = (y, z) => hy + (f * (camY - y)) / z;

    // Sky, then the far haze of the city.
    // Clouds turn a blue sky grey (and a night sky to a flat murk).
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, mix(mix("#0b1222", "#1a1d24", cover), mix("#5d8fc7", "#7c838c", cover), light));
    sky.addColorStop(1, mix(mix("#2a2f45", "#30333a", cover), mix("#c9d9e8", "#a9afb6", cover), light));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, hy + 2);
    if (night > 0.3) {
      // The city's own glow low on the sky.
      const glow = ctx.createLinearGradient(0, hy - h * 0.2, 0, hy);
      glow.addColorStop(0, "rgba(255,160,90,0)");
      glow.addColorStop(1, `rgba(255,160,90,${0.25 * night})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, hy - h * 0.2, w, h * 0.2);
    }
    // The ground.
    ctx.fillStyle = mix("#141416", "#4a4a4c", light);
    ctx.fillRect(0, hy, w, h - hy);

    const near = 0.6;
    const quad = (pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    // A flat strip on the ground from x0 to x1, between z0 and z1.
    const ground = (x0, x1, z0, z1, fill) => {
      z0 = Math.max(near, z0);
      if (z1 <= z0) return;
      quad([[sx(x0, z0), sy(0, z0)], [sx(x1, z0), sy(0, z0)], [sx(x1, z1), sy(0, z1)], [sx(x0, z1), sy(0, z1)]], fill);
    };

    // The road, its sidewalks, and the lane markings sliding by. Wet: darker and glossy; snow:
    // the sidewalks white and the road greyed where the traffic has not cleared it.
    const road = mix(mix("#1b1b1e", "#56565a", light), "#0c0d10", wet * 0.45);
    const walk = mix(mix("#26262a", "#8a8782", light), "#15161a", wet * 0.35);
    ground(CURB_LEFT, CURB_RIGHT, near, SEE, snowy ? mix(road, mix("#3a3d44", "#c9ced6", light), snowy * 0.45) : road);
    ground(CURB_RIGHT, CURB_RIGHT + SIDEWALK, near, SEE, snowy ? mix(walk, mix("#5a5e66", "#eef1f5", light), snowy * 0.85) : walk);
    ground(CURB_LEFT - SIDEWALK, CURB_LEFT, near, SEE, snowy ? mix(walk, mix("#5a5e66", "#eef1f5", light), snowy * 0.85) : walk);
    // The double yellow down the middle, unbroken; white dashes between lanes, sliding by.
    const yellow = mix("#6b5a1c", "#e2c24a", 0.4 + light * 0.6), white = mix("#444", "#d8d8d8", 0.3 + light * 0.6);
    ground(-LANE * 0.5 - 0.16, -LANE * 0.5 - 0.06, near, SEE, yellow);
    ground(-LANE * 0.5 + 0.06, -LANE * 0.5 + 0.16, near, SEE, yellow);
    const offset = distance % 12;
    for (let z = -offset; z < SEE; z += 12) {
      ground(LANE * 0.5 - 0.06, LANE * 0.5 + 0.06, z, z + 3, white);
      ground(-LANE * 1.5 - 0.06, -LANE * 1.5 + 0.06, z, z + 3, white);
    }

    // Blocks ahead, far to near, so the near ones are drawn over the far.
    const first = Math.floor(distance / BLOCK);
    const blocks = [];
    for (let i = first; i <= first + Math.ceil(SEE / BLOCK) + 1; i++) blocks.push(this.#block(i));
    const things = [];
    for (const b of blocks) {
      const base = b.z - distance;
      for (const bd of b.buildings) things.push({ kind: "building", z: base + bd.z0, bd, base });
      for (const l of b.lamps) things.push({ kind: "lamp", z: base + l.z, l });
      // The corner's traffic light, on the right.
      things.push({ kind: "signal", z: base + BLOCK - CROSS - 1 });
      // The cross street: its crossing lines.
      ground(CURB_LEFT, CURB_RIGHT, base + BLOCK - CROSS + 1, base + BLOCK - CROSS + 2.2, mix("#3a3a3a", "#dcdcdc", 0.3 + light * 0.5));
    }
    // Oncoming cars in the left lane, a few, each passing at its own time.
    for (let k = 0; k < 4; k++) {
      const period = 9 + k * 4.3, phase = ((time + k * 3.1) % period) / period;
      const z = SEE * (1 - phase) * 0.8;
      things.push({ kind: "car", z, colour: CARS[(k * 3 + Math.floor((time + k * 3.1) / period)) % CARS.length], x: k % 2 ? -LANE : -LANE * 2 });
    }
    things.sort((a, b) => b.z - a.z);

    for (const t of things) {
      if (t.z > SEE) continue;
      if (t.kind === "building") this.#building(ctx, t, { sx, sy, near, light, night, w, h });
      else if (t.kind === "lamp") this.#lamp(ctx, t, { sx, sy, near, night });
      else if (t.kind === "signal") this.#signal(ctx, t, { sx, sy, near, time });
      else if (t.kind === "car") this.#car(ctx, t, { sx, sy, near, light, night });
    }

    // Night: the headlights on the road ahead (driving only).
    if (night > 0.2 && !walking) {
      const beam = ctx.createRadialGradient(cx, h * 0.92, 10, cx, h * 0.75, h * 0.6);
      beam.addColorStop(0, `rgba(255,236,190,${0.32 * night * (1 + wet * 0.5)})`);
      beam.addColorStop(1, "rgba(255,236,190,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(0, hy, w, h - hy);
    }

    // Fog: the far end of the street lost in it, thickest at the horizon.
    const fog = Math.min(0.85, (weather?.fog ?? 0) + (weather?.sky === "storm" ? 0.12 : 0) + snowy * 0.15);
    if (fog > 0) {
      const tint = mix(mix("#20242c", "#8a7a80", Math.min(1, day * 2)), "#c3c9cf", Math.max(0, day * 2 - 1));
      const [r, g, b] = tint.match(/\d+/g);
      const band = ctx.createLinearGradient(0, 0, 0, h);
      band.addColorStop(0, `rgba(${r},${g},${b},${fog * 0.55})`);
      band.addColorStop(horizon, `rgba(${r},${g},${b},${fog * 0.95})`);
      band.addColorStop(Math.min(1, horizon + 0.35), `rgba(${r},${g},${b},${fog * 0.25})`);
      band.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** A light's shine on a wet road below it: a soft streak running toward the viewer. */
  #reflect(ctx, x, yGround, radius, colour, alpha) {
    if (!this.wet || alpha <= 0) return;
    const len = radius * 9;
    const g = ctx.createLinearGradient(x, yGround, x, yGround + len);
    g.addColorStop(0, `rgba(${colour},${alpha * this.wet})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - radius * 0.8, yGround, radius * 1.6, len);
  }

  #building(ctx, { bd, base }, { sx, sy, near, light, night }) {
    const x = (bd.side > 0 ? CURB_RIGHT + SIDEWALK + bd.set : CURB_LEFT - SIDEWALK - bd.set);
    const t = { base };
    const z0 = Math.max(near, base + bd.z0), z1 = base + bd.z1;
    if (z1 <= near) return;
    // The front, facing the street: a wall from z0 to z1 at x, up to its height.
    const top0 = sy(bd.height, z0), top1 = sy(bd.height, z1), bot0 = sy(0, z0), bot1 = sy(0, z1);
    const x0 = sx(x, z0), x1 = sx(x, z1);
    const wall = shade(bd.colour, 0.35 + light * 0.65);
    ctx.beginPath(); ctx.moveTo(x0, bot0); ctx.lineTo(x1, bot1); ctx.lineTo(x1, top1); ctx.lineTo(x0, top0); ctx.closePath();
    ctx.fillStyle = wall; ctx.fill();
    // Its near end, the side the camera sees as the block passes (a darker face).
    if (z0 > near + 0.01) {
      const depth = 14, xe = x + bd.side * depth;
      ctx.beginPath(); ctx.moveTo(x0, bot0); ctx.lineTo(sx(xe, z0), sy(0, z0)); ctx.lineTo(sx(xe, z0), sy(bd.height, z0)); ctx.lineTo(x0, top0); ctx.closePath();
      ctx.fillStyle = shade(bd.colour, 0.22 + light * 0.4); ctx.fill();
    }
    // Windows: a grid of floors and bays, some lit at night.
    const floors = Math.floor(bd.height / bd.floors), len = bd.z1 - bd.z0, bays = Math.max(1, Math.floor(len / 3.2));
    if (z1 > 3 && Math.abs(x1 - x0) > 0.5) {
      for (let fl = 0; fl < floors; fl++) {
        const y0 = 1.2 + fl * bd.floors, y1 = y0 + bd.floors * 0.55;
        if (y1 > bd.height - 0.6) break;
        for (let b = 0; b < bays; b++) {
          const za = t.base + bd.z0 + b * (len / bays) + 0.6, zb = za + len / bays - 1.2;
          if (zb <= near) continue;
          const zaa = Math.max(near, za);
          const on = ((fl * 31 + b * 17 + Math.floor(bd.lit * 97)) % 10) / 10 < 0.35 + bd.lit * 0.3;
          const glass = on && night > 0.15 ? `rgba(255,214,140,${0.55 + 0.45 * night})` : mix("#1c222b", "#6f8597", light);
          ctx.beginPath();
          ctx.moveTo(sx(x, zaa), sy(y0, zaa)); ctx.lineTo(sx(x, zb), sy(y0, zb)); ctx.lineTo(sx(x, zb), sy(y1, zb)); ctx.lineTo(sx(x, zaa), sy(y1, zaa)); ctx.closePath();
          ctx.fillStyle = glass; ctx.fill();
        }
      }
    }
  }

  #lamp(ctx, { z, l }, { sx, sy, near, night }) {
    if (z <= near) return;
    const x = l.side > 0 ? CURB_RIGHT + 0.5 : CURB_LEFT - 0.5, top = 6.5;
    const width = Math.max(1, (0.14 * ctx.canvas.height) / z);
    ctx.strokeStyle = "#2c2c30"; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(sx(x, z), sy(0, z)); ctx.lineTo(sx(x, z), sy(top, z)); ctx.lineTo(sx(x - l.side * 1.4, z), sy(top, z)); ctx.stroke();
    if (night > 0.2) {
      const px = sx(x - l.side * 1.4, z), py = sy(top - 0.2, z), r = Math.min(ctx.canvas.height * 0.03, Math.max(2, (0.25 * ctx.canvas.height) / z));
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 4);
      g.addColorStop(0, `rgba(255,200,120,${0.9 * night})`); g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g; ctx.fillRect(px - r * 4, py - r * 4, r * 8, r * 8);
      this.#reflect(ctx, px, sy(0, z), r, "255,200,120", 0.5 * night);
    }
  }

  #signal(ctx, { z }, { sx, sy, near, time }) {
    if (z <= near) return;
    const x = CURB_RIGHT + 0.6, top = 4.6;
    ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = Math.max(1, (0.12 * ctx.canvas.height) / z);
    ctx.beginPath(); ctx.moveTo(sx(x, z), sy(0, z)); ctx.lineTo(sx(x, z), sy(top, z)); ctx.stroke();
    const bx = sx(x, z), by = sy(top, z), s = Math.max(2, (0.35 * ctx.canvas.height) / z);
    ctx.fillStyle = "#111"; ctx.fillRect(bx - s / 2, by - s * 3, s, s * 3);
    // Green most of the time, a little amber, then red.
    const phase = (time % 30) / 30, on = phase < 0.7 ? 2 : phase < 0.8 ? 1 : 0;
    ["#ff3b30", "#ffb020", "#3cd070"].forEach((c, i) => {
      ctx.fillStyle = i === on ? c : "#222";
      ctx.beginPath(); ctx.arc(bx, by - s * 2.5 + i * s, s * 0.34, 0, Math.PI * 2); ctx.fill();
    });
  }

  #car(ctx, { z, colour, x }, { sx, sy, near, light, night }) {
    // A wet day still has the cars' lights on.
    night = Math.max(night, this.wet * 0.4);
    if (z <= near + 1) return;
    const half = 0.9, height = 1.4;
    const l = sx(x - half, z), r = sx(x + half, z), top = sy(height, z), bot = sy(0.25, z);
    ctx.fillStyle = shade(colour, 0.35 + light * 0.65);
    ctx.fillRect(l, top, r - l, bot - top);
    ctx.fillStyle = mix("#0d1117", "#3b4a5a", light);
    ctx.fillRect(l + (r - l) * 0.12, top + (bot - top) * 0.08, (r - l) * 0.76, (bot - top) * 0.35);
    // Its headlights, toward us.
    const hy = sy(0.7, z), rad = Math.max(1.5, (0.18 * ctx.canvas.height) / z);
    for (const hx of [l + (r - l) * 0.18, r - (r - l) * 0.18]) {
      ctx.fillStyle = night > 0.2 ? "rgba(255,248,220,0.95)" : "#d9d4c4";
      ctx.beginPath(); ctx.arc(hx, hy, rad, 0, Math.PI * 2); ctx.fill();
      if (night > 0.2) {
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, rad * 6);
        g.addColorStop(0, `rgba(255,240,200,${0.5 * night})`); g.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = g; ctx.fillRect(hx - rad * 6, hy - rad * 6, rad * 12, rad * 12);
      }
      // On a wet road, every car's headlights shine off it, by day dimly too.
      this.#reflect(ctx, hx, sy(0, z), rad * 1.5, "255,240,205", 0.25 + 0.45 * night);
    }
  }
}
