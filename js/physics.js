/* Ball flight physics. Units: yards and seconds.
   World axes: x = across the field (0 is the middle), y = up, z = downfield.
   The goalposts stand on the end line at z = 0; the kick comes from z = -distance. */
const Physics = (() => {
  const G = 10.73;                    // gravity, yd/s^2
  const DRAG = 0.004;                 // quadratic air drag, per yard
  const ELEV = 34 * Math.PI / 180;    // launch angle
  const POST_HALF = 18.5 / 3 / 2;     // half the 18'6" gap between uprights (also the hash offset)
  const BAR_Y = 10 / 3;               // crossbar is 10 ft high
  const TOP_Y = BAR_Y + 35 / 3;       // uprights rise 35 ft above the crossbar
  const BALL_R = 0.12;

  function step(b, dt, ax) {
    const sp = Math.hypot(b.vx, b.vy, b.vz), d = DRAG * sp;
    b.vx += (-d * b.vx + (ax || 0)) * dt;
    b.vy += (-G - d * b.vy) * dt;
    b.vz += (-d * b.vz) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  }

  // How far downfield a straight kick still clears the crossbar (with a little margin).
  function carry(v0) {
    const b = { x: 0, y: BALL_R, z: 0, vx: 0, vy: v0 * Math.sin(ELEV), vz: v0 * Math.cos(ELEV) };
    const clear = BAR_Y + 0.3;
    let rose = false;
    for (let i = 0; i < 4000; i++) {
      step(b, 1 / 240);
      if (b.y > clear) rose = true;
      else if (rose && b.vy < 0) return b.z;
      else if (b.vy < 0) return 0;
    }
    return b.z;
  }

  function speedForRange(range) {
    let lo = 10, hi = 60;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (carry(m) < range) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  const speedAt = (vmax, p) => vmax * (0.5 + 0.5 * p);

  // Meter fraction (0..1) needed to reach `dist`.
  function powerForDistance(vmax, dist) {
    let lo = 0, hi = 1;
    if (carry(speedAt(vmax, 1)) < dist) return 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (carry(speedAt(vmax, m)) < dist) lo = m; else hi = m; }
    return hi;
  }

  function launch(x, z, yaw, speed) {
    const h = speed * Math.cos(ELEV);
    return { x, y: BALL_R, z, vx: h * Math.sin(yaw), vy: speed * Math.sin(ELEV), vz: h * Math.cos(yaw) };
  }

  return { G, POST_HALF, BAR_Y, TOP_Y, BALL_R, step, carry, speedForRange, speedAt, powerForDistance, launch };
})();
if (typeof module !== 'undefined') module.exports = Physics;
