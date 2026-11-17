/* Players and officials.
     - Rig:       the built-in jointed 3D player, posed in code (officials, and any role without clips).
     - RigFigure: the same built-in body, moved by Mixamo animation clips (see assets/mixamo/README.txt).
                  Used automatically for any role whose clips are present.
     - MixamoFigure: the Mixamo character itself; now only used behind the scenes, as the
                  invisible skeleton a RigFigure copies and to analyse clips. */
const Characters = (() => {
  'use strict';
  const col = hex => new THREE.Color(hex).convertSRGBToLinear();
  const HIP = 1.045;                       // hip height of a standing player, in yards
  const DOWN = new THREE.Vector3(0, -1, 0);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();

  /* ---------------- shared geometry ---------------- */
  const G = {};
  function geo() {
    if (G.sphere) return G;
    G.sphere = new THREE.SphereGeometry(1, 20, 14);
    G.torso = new THREE.CylinderGeometry(0.21, 0.19, 0.5, 18);
    G.upper = new THREE.CapsuleGeometry(0.068, 0.2, 4, 10);
    G.fore = new THREE.CapsuleGeometry(0.05, 0.2, 4, 10);
    G.thigh = new THREE.CapsuleGeometry(0.116, 0.28, 4, 12);
    G.shin = new THREE.CapsuleGeometry(0.066, 0.32, 4, 10);
    G.foot = new THREE.BoxGeometry(0.11, 0.075, 0.27);
    G.neck = new THREE.CylinderGeometry(0.085, 0.1, 0.12, 12);
    G.bar = new THREE.BoxGeometry(1, 1, 1);
    G.plane = new THREE.PlaneGeometry(0.3, 0.3);
    return G;
  }

  function numberTexture(num, color) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.font = '900 96px "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = color; x.fillText(String(num), 64, 70, 120);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function stripeTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#111' : '#f4f4f4'; x.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2; return t;
  }

  /* ---------------- built-in rig ---------------- */
  class Rig {
    constructor(opts) {
      opts = opts || {};
      const g = geo(), std = (rough, hex, metal) => new THREE.MeshStandardMaterial({ roughness: rough, metalness: metal || 0, color: col(hex || '#888888') });
      const M = this.mat = {
        jersey: std(0.85), pants: std(0.8), helmet: std(0.28, null, 0.2), stripe: std(0.4),
        skin: std(0.7, '#c58f6a'), sock: std(0.9, '#f1f1f1'), shoe: std(0.55, '#151515'), mask: std(0.4, '#a7adb3', 0.5),
        num: new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9, depthWrite: false }),
      };
      const add = (parent, geom, mat, pos, scale) => {
        const m = new THREE.Mesh(geom, mat); m.castShadow = true;
        if (pos) m.position.set(pos[0], pos[1], pos[2]);
        if (scale) m.scale.set(scale[0], scale[1], scale[2]);
        parent.add(m); return m;
      };
      const node = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

      this.root = new THREE.Group();
      this.hips = node(this.root, 0, HIP, 0);
      add(this.hips, g.sphere, M.pants, [0, -0.02, 0], [0.255, 0.19, 0.195]);
      this.spine = node(this.hips, 0, 0.04, 0);
      if (opts.official) {
        M.jersey.color.set(0xffffff); M.jersey.map = stripeTexture();
        M.pants.color.copy(col('#16181c')); M.sock.color.copy(col('#16181c'));
      }
      add(this.spine, g.torso, M.jersey, [0, 0.29, 0], [1, 1, 0.68]);
      add(this.spine, g.sphere, M.jersey, [0, 0.52, 0], opts.official ? [0.25, 0.085, 0.15] : [0.335, 0.105, 0.19]);
      if (!opts.official) {
        add(this.spine, g.plane, M.num, [0, 0.31, 0.142]);                          // back
        add(this.spine, g.plane, M.num, [0, 0.31, -0.142]).rotation.y = Math.PI;    // front
      }
      // head
      this.head = node(this.spine, 0, 0.6, 0);
      add(this.head, g.neck, M.skin, [0, 0.04, 0]);
      if (opts.official) {
        add(this.head, g.sphere, M.skin, [0, 0.19, 0], [0.105, 0.125, 0.115]);
        add(this.head, g.sphere, M.shoe, [0, 0.245, 0], [0.112, 0.075, 0.12]);      // cap
        add(this.head, g.bar, M.shoe, [0, 0.235, -0.13], [0.15, 0.015, 0.1]);
      } else {
        add(this.head, g.sphere, M.skin, [0, 0.19, -0.02], [0.1, 0.12, 0.1]);
        add(this.head, g.sphere, M.helmet, [0, 0.215, 0.012], [0.158, 0.162, 0.175]);
        add(this.head, g.sphere, M.stripe, [0, 0.216, 0.012], [0.022, 0.166, 0.179]);
        for (const y of [0.2, 0.15, 0.1]) add(this.head, g.bar, M.mask, [0, y, -0.17], [0.2, 0.014, 0.014]);
        for (const x of [-0.1, 0, 0.1]) add(this.head, g.bar, M.mask, [x, 0.15, -0.168], [0.014, 0.115, 0.014]);
        for (const s of [-1, 1]) add(this.head, g.bar, M.mask, [s * 0.12, 0.13, -0.11], [0.014, 0.014, 0.13]);
      }
      // arms and legs
      this.sh = {}; this.el = {}; this.hp = {}; this.kn = {}; this.an = {}; this.wr = {};
      for (const s of [-1, 1]) {
        const k = s < 0 ? 'l' : 'r';
        const sh = this.sh[k] = node(this.spine, s * (opts.official ? 0.24 : 0.29), 0.5, 0);
        add(sh, g.upper, M.jersey, [0, -0.15, 0]);
        const el = this.el[k] = node(sh, 0, -0.31, 0);
        add(el, g.fore, M.skin, [0, -0.14, 0]);
        add(el, g.sphere, M.skin, [0, -0.3, 0], [0.055, 0.065, 0.045]);
        this.wr[k] = node(el, 0, -0.25, 0);                      // wrist: where arm IK aims
        const hp = this.hp[k] = node(this.hips, s * 0.11, -0.03, 0);
        add(hp, g.thigh, M.pants, [0, -0.24, 0]);
        const kn = this.kn[k] = node(hp, 0, -0.48, 0);
        add(kn, g.shin, M.sock, [0, -0.24, 0]);
        const an = this.an[k] = node(kn, 0, -0.45, 0);           // ankle (only animated clips bend it)
        add(an, g.foot, M.shoe, [0, -0.047, -0.06]);
      }
    }

    setKit(kit) {
      const M = this.mat;
      M.jersey.color.copy(col(kit.jersey)); M.pants.color.copy(col(kit.pants));
      M.helmet.color.copy(col(kit.helmet)); M.stripe.color.copy(col(kit.stripe));
      if (M.num.map) M.num.map.dispose();
      M.num.map = numberTexture(kit.num, kit.numColor); M.num.needsUpdate = true;
    }

    place(x, z, heading) { this.root.position.set(x, 0, -z); this.root.rotation.y = heading || 0; }

    // A pose is a flat set of joint angles (radians); anything missing is 0.
    apply(p) {
      const n = k => p[k] || 0;
      this.hips.position.y = HIP + n('hy');
      this.hips.rotation.set(n('hrx'), 0, 0);
      this.spine.rotation.set(n('sx'), n('sy'), n('sz'));
      this.head.rotation.set(n('hx'), n('hdy'), 0);
      this.sh.l.rotation.set(n('lsx'), 0, n('lsz')); this.el.l.rotation.x = n('le');
      this.sh.r.rotation.set(n('rsx'), 0, n('rsz')); this.el.r.rotation.x = n('re');
      this.hp.l.rotation.set(n('lhx'), 0, n('lhz')); this.kn.l.rotation.x = n('lk');
      this.hp.r.rotation.set(n('rhx'), 0, n('rhz')); this.kn.r.rotation.x = n('rk');
    }

    // Straighten one arm and point it at a world-space target (used for the holder's hands).
    pointArm(side, target, bend) {
      const k = side < 0 ? 'l' : 'r', sh = this.sh[k];
      this.root.updateMatrixWorld(true);
      sh.getWorldPosition(v1);
      v2.copy(target).sub(v1).normalize();
      sh.parent.getWorldQuaternion(q1).invert();
      v2.applyQuaternion(q1);
      sh.quaternion.setFromUnitVectors(DOWN, v2);
      this.el[k].rotation.x = bend || 0;
    }
    update() {}
  }

  /* ---------------- poses ---------------- */
  const KEYS = ['hy', 'hrx', 'sx', 'sy', 'sz', 'hx', 'hdy', 'lsx', 'lsz', 'le', 'rsx', 'rsz', 're', 'lhx', 'lhz', 'lk', 'rhx', 'rhz', 'rk'];
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const o = {};
    for (const k of KEYS) { const x = a[k] || 0, y = b[k] || 0; if (x || y) o[k] = x + (y - x) * t; }
    return o;
  }
  // Sign conventions: +x on a hip or shoulder swings the limb forward, a knee bends with -x,
  // the spine leans forward with -x, and arms lift away from the body with -z (left) / +z (right).
  const P = {
    STAND: { lsz: -0.12, rsz: 0.12, le: 0.18, re: 0.18 },
    K_READY: { sx: -0.1, lhx: 0.28, lk: -0.18, rhx: -0.2, rk: -0.22, lsz: -0.16, rsz: 0.16, le: 0.35, re: 0.35 },
    K_BACK: { hy: -0.05, sx: -0.22, sy: 0.3, lhx: 0.5, lk: -0.35, rhx: -0.95, rk: -1.45, lsx: 0.4, lsz: -1.25, rsx: -0.7, rsz: 0.3, re: 0.5 },
    K_CONTACT: { hy: -0.03, sx: -0.06, sy: -0.1, lhx: 0.08, lk: -0.18, rhx: 0.6, rk: -0.12, lsx: 0.6, lsz: -1.2, rsx: -0.5, rsz: 0.3, re: 0.4 },
    K_FOLLOW: { hy: 0.07, sx: 0.14, sy: -0.35, lhx: -0.28, lk: -0.12, rhx: 1.6, rk: -0.05, lsx: 1.0, lsz: -0.7, le: 0.4, rsx: -0.8, rsz: 0.45, re: 0.5 },
    CELEB: { sx: 0.08, lsx: 2.85, rsx: 2.85, lsz: -0.3, rsz: 0.3, hx: 0.15 },
    DEJECT: { sx: -0.22, hx: -0.5, lsz: -0.08, rsz: 0.08, le: 0.1, re: 0.1 },
    KNEEL: { hy: -0.5, lhx: -0.05, lk: -1.55, rhx: 1.5, rk: -1.5, sx: -0.62, hx: 0.35 },
    CROUCH: { hy: -0.285, lhx: 1.15, lhz: -0.32, lk: -1.25, rhx: 1.15, rhz: 0.32, rk: -1.25, sx: -1.45, hx: 0.85, lsx: 1.4, rsx: 1.4, lsz: 0.12, rsz: -0.12 },
    SNAP: { hy: -0.285, lhx: 1.15, lhz: -0.32, lk: -1.25, rhx: 1.15, rhz: 0.32, rk: -1.25, sx: -1.5, hx: 0.3, lsx: 0.25, rsx: 0.25, lsz: 0.1, rsz: -0.1 },
    BLOCK: { hy: -0.13, lhx: 0.6, lhz: -0.22, lk: -0.8, rhx: 0.5, rhz: 0.22, rk: -0.75, sx: -0.38, hx: 0.2, lsx: 1.05, rsx: 1.05, lsz: -0.3, rsz: 0.3, le: 1.2, re: 1.2 },
    REF_GOOD: { lsx: 3.0, rsx: 3.0, lsz: -0.12, rsz: 0.12 },
  };
  function run(ph) {
    const s = Math.sin(ph);
    return {
      hy: -0.05 + 0.035 * Math.abs(Math.cos(ph)), sx: -0.22,
      lhx: 0.75 * s, rhx: -0.75 * s, lk: -0.35 - 0.8 * Math.max(0, -s), rk: -0.35 - 0.8 * Math.max(0, s),
      lsx: -0.7 * s, rsx: 0.7 * s, le: 1.1, re: 1.1, lsz: -0.1, rsz: 0.1,
    };
  }
  const refNoGood = t => { const s = Math.sin(t * 9); return { lsx: 1.0, rsx: 1.0, lsz: 0.55 * s + 0.1, rsz: -0.55 * s - 0.1 }; };

  /* ---------------- Mixamo ---------------- */
  const Mixamo = { base: null, clips: {}, scale: 1, cfg: {}, error: null };

  function b64ToBuffer(b64) {
    const bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  // Remove forward/sideways travel from the hips so the game can move the player itself.
  function inPlace(clip) {
    for (const tr of clip.tracks) {
      if (!/Hips\.position$/.test(tr.name)) continue;
      const v = tr.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
    return clip;
  }

  function loadMixamo() {
    const pack = window.MIXAMO_PACK;
    if (!pack || !pack.files || !pack.files.character || !THREE.FBXLoader) return false;
    try {
      const loader = new THREE.FBXLoader();
      const base = loader.parse(b64ToBuffer(pack.files.character), '');
      base.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(base), h = box.max.y - box.min.y;
      if (!(h > 0)) throw new Error('character has no size');
      base.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      Mixamo.base = base; Mixamo.scale = 2.03 / h; Mixamo.cfg = pack.config || {};
      // An untextured character gets a painted uniform, a helmet and a number.
      let textured = false;
      base.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.map) textured = true; });
      Mixamo.plain = !textured;
      Mixamo.backDepth = Mixamo.cfg.numberDepth == null ? 0.15 : Mixamo.cfg.numberDepth;      // sits on the shoulder pads
      gearMats();
      if (base.animations && base.animations[0]) Mixamo.clips.tpose = base.animations[0];
      for (const name of Object.keys(pack.files)) {
        if (name === 'character') continue;
        try {
          const o = loader.parse(b64ToBuffer(pack.files[name]), '');
          if (o.animations && o.animations.length) {
            const clip = o.animations.reduce((a, b) => (b.duration > a.duration ? b : a));
            if (name === 'kick') {
              try { Mixamo.kick = analyzeKick(clip); } catch (e) { console.warn('Mixamo: could not analyse kick.fbx', e); }
            }
            if (name === 'snap') {
              try { Mixamo.snap = analyzeSnap(clip); } catch (e) { console.warn('Mixamo: could not analyse snap.fbx', e); }
            }
            Mixamo.clips[name] = inPlace(clip);
          }
        } catch (e) { console.warn('Mixamo: could not read ' + name + '.fbx', e); }
      }
      console.info('Mixamo clips: ' + Object.keys(Mixamo.clips).map(n => n + ' ' + Mixamo.clips[n].duration.toFixed(2) + 's').join(', '));
      return true;
    } catch (e) {
      Mixamo.error = e; Mixamo.base = null;
      console.warn('Mixamo: could not load the character, using built-in players instead.', e);
      return false;
    }
  }

  // Read a kick clip before its travel is stripped: when the foot strikes, which foot, where that
  // foot is relative to where the player started, and how the hips travel over time. The game uses
  // this to start the kicker in the right spot so his foot arrives at the ball without sliding.
  // Positions are in yards in the player's own frame: x = to his right, f = forward.
  function analyzeKick(clip) {
    const fig = new MixamoFigure({ noGear: true });
    fig.mixer.clipAction(clip).play();
    const bone = re => { let r = null; fig.inner.traverse(o => { if (!r && o.isBone && re.test(o.name)) r = o; }); return r; };
    const hips = bone(/Hips$/);
    const feet = [bone(/LeftToeBase$/) || bone(/LeftFoot$/), bone(/RightToeBase$/) || bone(/RightFoot$/)];
    if (!hips || !feet[0] || !feet[1]) throw new Error('skeleton has no hips/feet');
    const N = Math.max(2, Math.floor(clip.duration * 60)), v = new THREE.Vector3();
    const hp = [], fp = [[], []];
    for (let i = 0; i <= N; i++) {
      fig.mixer.setTime(Math.min(i / 60, clip.duration - 1e-4));
      fig.root.updateMatrixWorld(true);
      hips.getWorldPosition(v); hp.push({ x: v.x, f: -v.z });
      feet.forEach((b, j) => { b.getWorldPosition(v); fp[j].push({ x: v.x, f: -v.z, y: v.y }); });
    }
    let best = -Infinity, bi = Math.round(N / 2), bj = 1;
    for (let j = 0; j < 2; j++) {
      for (let i = 1; i <= N; i++) {
        if (fp[j][i].y > 0.55) continue;                       // ignore the high follow-through
        const vel = (fp[j][i].f - hp[i].f) - (fp[j][i - 1].f - hp[i - 1].f);
        if (vel > best) { best = vel; bi = i; bj = j; }
      }
    }
    const frac = Mixamo.cfg.kickContact;
    if (frac != null) {                                         // manual override from config.json
      bi = Math.max(1, Math.min(N, Math.round(frac * N)));
      bj = (fp[1][bi].f - hp[bi].f) >= (fp[0][bi].f - hp[bi].f) ? 1 : 0;
    }
    const travel = hp.map(p => ({ x: p.x - hp[0].x, f: p.f - hp[0].f }));
    const info = {
      contact: bi / 60, foot: bj ? 'right' : 'left', strike: { x: fp[bj][bi].x, f: fp[bj][bi].f }, duration: clip.duration,
      travelAt(t) {
        const u = Math.max(0, Math.min(N, t * 60)), i = Math.min(N - 1, Math.floor(u)), k = u - i;
        return { x: travel[i].x + (travel[i + 1].x - travel[i].x) * k, f: travel[i].f + (travel[i + 1].f - travel[i].f) * k };
      },
    };
    console.info(`Mixamo kick: ${info.foot} foot strikes at ${info.contact.toFixed(2)}s of ${clip.duration.toFixed(2)}s, ` +
      `run-up ${travel[bi].f.toFixed(2)} yd, total travel ${travel[N].f.toFixed(2)} yd, strike point x ${info.strike.x.toFixed(2)} f ${info.strike.f.toFixed(2)}`);
    return info;
  }

  // Read a snap clip: when the hands start to whip back (the hike), the stance just before it,
  // when the hands have come through (where the game stops the clip), and where the hands sit
  // in the stance relative to the hips, so the snapper can be placed with the ball in his hands.
  function analyzeSnap(clip) {
    const fig = new MixamoFigure({ noGear: true });
    fig.mixer.clipAction(clip).play();
    const bone = re => { let r = null; fig.inner.traverse(o => { if (!r && o.isBone && re.test(o.name)) r = o; }); return r; };
    const hands = [bone(/LeftHand$/), bone(/RightHand$/)], hips = bone(/Hips$/);
    if (!hands[0] || !hands[1] || !hips) throw new Error('skeleton has no hands/hips');
    const N = Math.max(2, Math.floor(clip.duration * 60)), v = new THREE.Vector3(), hp = new THREE.Vector3();
    const shL = bone(/LeftArm$/), shR = bone(/RightArm$/), q2v = new THREE.Vector3();
    if (!shL || !shR) throw new Error('skeleton has no shoulders');
    const f = [], pos = [];                                         // hands' mid-point, forward of the body, per frame
    for (let i = 0; i <= N; i++) {
      fig.mixer.setTime(Math.min(i / 60, clip.duration - 1e-4));
      fig.root.updateMatrixWorld(true);
      hips.getWorldPosition(hp);
      // which way the body faces (square to the shoulders): the clip may turn the character away from its own forward
      shL.getWorldPosition(v); shR.getWorldPosition(q2v);
      const yaw = Math.atan2(-(q2v.z - v.z), q2v.x - v.x);
      const m = new THREE.Vector3();
      hands.forEach(b => { b.getWorldPosition(v); m.add(v); });
      m.multiplyScalar(0.5);
      const dx = m.x - hp.x, dz = m.z - hp.z;
      f.push(dx * -Math.sin(yaw) + dz * -Math.cos(yaw));            // reach along the body's facing
      pos.push({ x: m.x, z: m.z, yaw, hipX: hp.x, hipZ: hp.z });
    }
    // the hike: the biggest drop in hand forward-reach within the first half of the clip
    const half = Math.floor(N * 0.6);
    let hi = 0; for (let i = 0; i <= half; i++) if (f[i] > f[hi]) hi = i;
    let lo = hi; for (let i = hi; i <= half; i++) if (f[i] < f[lo]) lo = i;
    const at = frac => { const goal = f[hi] - (f[hi] - f[lo]) * frac; let i = hi; while (i < lo && f[i] > goal) i++; return i; };
    // Hands in the figure's own frame at the stance (hips pinned where frame 0 has them, as the game plays it)
    const P = pos[hi], hx = P.x - P.hipX + pos[0].hipX, hz = P.z - P.hipZ + pos[0].hipZ;
    const yaws = pos.map(p => p.yaw);
    const s = { stance: hi / 60, release: at(0.2) / 60, end: lo / 60, turn: -P.yaw, hands: { x: hx, z: hz },
      turnAt: t => -yaws[Math.max(0, Math.min(N, Math.round(t * 60)))] };      // keeps him square to the goal through the clip
    console.info(`Mixamo snap: stance ${s.stance.toFixed(2)}s, hike ${s.release.toFixed(2)}-${s.end.toFixed(2)}s of ${clip.duration.toFixed(2)}s, ` +
      `body turned ${(P.yaw * 180 / Math.PI).toFixed(0)} deg, reach ${f[hi].toFixed(2)} yd`);
    return s;
  }

  // --- two-bone IK so a Mixamo arm can reach a point (the holder's hands on the ball)
  const ia = new THREE.Vector3(), ib = new THREE.Vector3(), ic = new THREE.Vector3(), iba = new THREE.Vector3(), ibc = new THREE.Vector3();
  const iax = new THREE.Vector3(), iq = new THREE.Quaternion(), ipq = new THREE.Quaternion(), itq = new THREE.Quaternion();
  function rotateWorld(bone, q) {
    bone.parent.getWorldQuaternion(ipq);
    itq.copy(ipq).invert().multiply(q).multiply(ipq).multiply(bone.quaternion);
    bone.quaternion.copy(itq); bone.updateMatrixWorld(true);
  }
  function solveArm(up, lo, hand, t) {
    up.getWorldPosition(ia); lo.getWorldPosition(ib); hand.getWorldPosition(ic);
    const l1 = ia.distanceTo(ib), l2 = ib.distanceTo(ic);
    const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, ia.distanceTo(t)));
    iba.copy(ia).sub(ib).normalize(); ibc.copy(ic).sub(ib).normalize();
    const cl = v => Math.max(-1, Math.min(1, v));
    const th0 = Math.acos(cl(iba.dot(ibc))), th1 = Math.acos(cl((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
    iax.crossVectors(iba, ibc);
    if (iax.lengthSq() < 1e-6) iax.set(0, 1, 0).cross(iba);
    iq.setFromAxisAngle(iax.normalize(), th1 - th0); rotateWorld(lo, iq);      // bend the elbow to the right length
    hand.getWorldPosition(ic);
    iba.copy(ic).sub(ia).normalize(); ibc.copy(t).sub(ia).normalize();
    iq.setFromUnitVectors(iba, ibc); rotateWorld(up, iq);                       // then swing the whole arm onto the target
  }

  class MixamoFigure {
    constructor(opts) {
      opts = opts || {};
      this.inner = THREE.SkeletonUtils.clone(Mixamo.base);
      this.inner.scale.multiplyScalar(Mixamo.scale);
      this.inner.rotation.y = Math.PI;                 // Mixamo characters face +Z; our players face -Z
      this.lean = new THREE.Group(); this.lean.add(this.inner);
      this.root = new THREE.Group(); this.root.add(this.lean);
      this.mixer = new THREE.AnimationMixer(this.inner);
      if (Mixamo.plain && !opts.noGear) this._gear();
      this.cur = null; this.name = null;
      this.arms = {};
      for (const [k, side] of [['l', 'Left'], ['r', 'Right']]) {
        const find = suffix => { let r = null; const re = new RegExp(side + suffix + '$'); this.inner.traverse(o => { if (!r && o.isBone && re.test(o.name)) r = o; }); return r; };
        const up = find('Arm'), lo = find('ForeArm'), hand = find('Hand');
        if (up && lo && hand) this.arms[k] = { up, lo, hand, w: 0, goal: 0, target: new THREE.Vector3(), has: false,
          anim: [new THREE.Quaternion(), new THREE.Quaternion()], wrote: [new THREE.Quaternion(), new THREE.Quaternion()] };
      }
    }
    // Ask an arm ('l' or 'r') to reach a world-space point; pass null to let the animation have it back.
    reach(k, target) {
      const A = this.arms[k]; if (!A) return;
      if (target) { A.target.copy(target); A.goal = 1; } else A.goal = 0;
    }
    _arm(A, dt) {
      const bones = [A.up, A.lo];
      // The mixer only rewrites a bone when its animated value changes, so put back the animated pose ourselves.
      bones.forEach((b, i) => { if (A.has && b.quaternion.equals(A.wrote[i])) b.quaternion.copy(A.anim[i]); else A.anim[i].copy(b.quaternion); });
      A.w += (A.goal - A.w) * Math.min(1, dt * 12);
      if (A.w < 0.003) { A.has = false; return; }
      this.root.updateMatrixWorld(true);
      solveArm(A.up, A.lo, A.hand, A.target);
      bones.forEach((b, i) => { itq.copy(b.quaternion); b.quaternion.copy(A.anim[i]).slerp(itq, A.w); A.wrote[i].copy(b.quaternion); });
      A.has = true;
    }
    // Helmet and jersey number, fixed to the head and chest bones so they move with the animation.
    _gear() {
      const bone = re => { let r = null; this.inner.traverse(o => { if (!r && o.isBone && re.test(o.name)) r = o; }); return r; };
      const head = bone(/Head$/), top = bone(/HeadTop_End$/), chest = bone(/Spine2$/) || bone(/Spine1$/) || bone(/Spine$/);
      const g = geo(), a = new THREE.Vector3(), b = new THREE.Vector3();
      this.root.updateMatrixWorld(true);
      if (head && top) {
        head.getWorldPosition(a); top.getWorldPosition(b);
        const r = a.distanceTo(b) * 0.7, helmet = new THREE.Group();
        helmet.position.copy(a).lerp(b, 0.5);
        const add = (geom, mat, pos, scale) => { const m = new THREE.Mesh(geom, mat); m.castShadow = true; m.position.set(pos[0], pos[1], pos[2]); m.scale.set(scale[0], scale[1], scale[2]); helmet.add(m); };
        add(g.sphere, GEAR.helmet, [0, 0.01, 0.015], [r, r * 1.03, r * 1.1]);
        add(g.sphere, GEAR.stripe, [0, 0.012, 0.015], [r * 0.14, r * 1.055, r * 1.125]);
        for (const y of [-0.12, -0.42, -0.72]) add(g.bar, GEAR.mask, [0, y * r, -r * 1.06], [r * 1.25, 0.014, 0.014]);
        for (const x of [-0.62, 0, 0.62]) add(g.bar, GEAR.mask, [x * r, -0.42 * r, -r * 1.05], [0.014, r * 0.7, 0.014]);
        for (const s of [-1, 1]) add(g.bar, GEAR.mask, [s * r * 0.78, -0.55 * r, -r * 0.7], [0.014, 0.014, r * 0.8]);
        this.root.add(helmet); head.attach(helmet);
      }
      // Pads: a football player is much thicker through the shoulders, neck, hips and thighs than the bare model.
      const pad = (mat, pos, scale, to, geom) => {
        const m = new THREE.Mesh(geom || g.sphere, mat); m.castShadow = true;
        m.position.copy(pos); m.scale.set(scale[0], scale[1], scale[2]);
        this.root.add(m); to.attach(m);
      };
      const LA = bone(/LeftArm$/), RA = bone(/RightArm$/), neck = bone(/Neck$/), hips = bone(/Hips$/);
      const LU = bone(/LeftUpLeg$/), RU = bone(/RightUpLeg$/), LL = bone(/LeftLeg$/), RL = bone(/RightLeg$/);
      const c = new THREE.Vector3();
      if (LA && RA && chest) {
        LA.getWorldPosition(a); RA.getWorldPosition(b);
        const sw = a.distanceTo(b);
        pad(GEAR.jersey, c.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.03, 0.01)), [sw * 0.76, sw * 0.24, sw * 0.46], chest);
      }
      if (neck && head) {
        neck.getWorldPosition(a); head.getWorldPosition(b);
        pad(GEAR.skin, c.copy(a).lerp(b, 0.5), [1.08, (a.distanceTo(b) + 0.1) / 0.12, 1.08], neck, g.neck);
      }
      if (hips && LU && RU) {
        LU.getWorldPosition(a); RU.getWorldPosition(b);
        const hw = a.distanceTo(b);
        pad(GEAR.pants, c.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.03, 0.015)), [hw * 1.14, hw * 0.86, hw * 0.9], hips);
        for (const [U, L] of [[LU, LL], [RU, RL]]) {
          if (!L) continue;
          U.getWorldPosition(a); L.getWorldPosition(b);
          pad(GEAR.pants, c.copy(a).lerp(b, 0.42), [hw * 0.57, a.distanceTo(b) * 0.56, hw * 0.6], U);
        }
      }
      if (chest) {
        this.numMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        chest.getWorldPosition(a);
        const back = new THREE.Mesh(g.plane, this.numMat); back.position.set(a.x, a.y + 0.02, a.z + Mixamo.backDepth);
        this.root.add(back); chest.attach(back);
      }
    }
    setLean(a) { this.lean.rotation.x = -a; }
    place(x, z, heading) { this.root.position.set(x, 0, -z); this.root.rotation.y = heading || 0; }
    // o.once: play through and hold the last frame; o.paused: freeze on the first frame; o.fade: blend time
    play(name, o) {
      o = o || {};
      const clip = Mixamo.clips[name];
      if (!clip) return 0;
      const a = this.mixer.clipAction(clip);
      a.reset();
      if (o.at) a.time = Math.min(o.at, clip.duration - 0.05);   // start part-way through
      a.setLoop(o.once || o.paused ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = true;
      a.timeScale = o.paused ? 0 : (o.speed || 1);
      this.stopAt = o.until || null;                            // o.until: freeze the clip at this time
      if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, o.fade == null ? 0.2 : o.fade, false);
      a.play();
      this.cur = a; this.name = name;
      return clip.duration;
    }
    update(dt) { this.mixer.update(dt); for (const k in this.arms) this._arm(this.arms[k], dt); }
    setKit(kit) {
      if (!this.numMat) return;
      if (this.numMat.map) this.numMat.map.dispose();
      this.numMat.map = numberTexture(kit.num, kit.numColor); this.numMat.needsUpdate = true;
    }
  }

  /* The built-in player's body, moved by Mixamo clips. An invisible Mixamo skeleton plays the
     animation; every frame each built-in joint is turned the way its Mixamo bone has turned
     from the bind pose, so the clips keep their motion while the players keep their own look. */
  const rq = new THREE.Quaternion(), rq2 = new THREE.Quaternion(), rq3 = new THREE.Quaternion(), rv = new THREE.Vector3(), rv2 = new THREE.Vector3();
  class RigFigure extends MixamoFigure {
    constructor() {
      super({ noGear: true });
      this.inner.visible = false;
      const B = this.body = new Rig();
      this.lean.add(B.root);
      const bone = name => { let r = null; const re = new RegExp(name + '$'); this.inner.traverse(o => { if (!r && o.isBone && re.test(o.name)) r = o; }); return r; };
      this.root.updateMatrixWorld(true);
      const UP = [0, 1, 0], DN = [0, -1, 0], TOE = [0, -0.55, -1];
      // [built-in joint, Mixamo bone, bone its segment points at, direction of the built-in segment at rest]
      const map = [[B.hips, 'Hips'], [B.spine, 'Spine2', 'Neck', UP], [B.head, 'Head', 'HeadTop_End', UP]];
      for (const [k, S] of [['l', 'Left'], ['r', 'Right']]) {
        map.push([B.sh[k], S + 'Arm', S + 'ForeArm', DN], [B.el[k], S + 'ForeArm', S + 'Hand', DN],
          [B.hp[k], S + 'UpLeg', S + 'Leg', DN], [B.kn[k], S + 'Leg', S + 'Foot', DN], [B.an[k], S + 'Foot', S + 'ToeBase', TOE]);
      }
      this.joints = [];
      for (const [node, bn, cn, dir] of map) {
        const b = bone(bn); if (!b) continue;
        const off = new THREE.Quaternion();                     // bind-pose bone rotation -> built-in rest rotation
        const c = cn && bone(cn);
        if (c && dir) {
          b.getWorldPosition(rv); c.getWorldPosition(rv2);
          off.setFromUnitVectors(new THREE.Vector3(...dir).normalize(), rv2.sub(rv).normalize());
        }
        b.getWorldQuaternion(rq);
        off.premultiply(rq.invert());
        this.joints.push({ node, bone: b, off });
      }
      const hips = bone('Hips');
      if (hips) { hips.getWorldPosition(rv); this.hipBone = hips; this.hipK = HIP / Math.max(0.3, rv.y); }
      this.rarm = { l: { w: 0, goal: 0, target: new THREE.Vector3() }, r: { w: 0, goal: 0, target: new THREE.Vector3() } };
    }
    reach(k, target) {
      const A = this.rarm[k];
      if (target) { A.target.copy(target); A.goal = 1; } else A.goal = 0;
    }
    _retarget() {
      const B = this.body;
      this.root.updateMatrixWorld(true);
      if (this.hipBone) {
        this.hipBone.getWorldPosition(rv);
        B.root.worldToLocal(rv);
        B.hips.position.copy(rv.multiplyScalar(this.hipK));
      }
      for (const j of this.joints) {
        j.bone.getWorldQuaternion(rq).multiply(j.off);                 // where the built-in joint should face, in the world
        j.node.parent.getWorldQuaternion(rq2).invert();
        j.node.quaternion.copy(rq2.multiply(rq));
      }
    }
    _rigArm(k, dt) {
      const A = this.rarm[k], B = this.body;
      A.w += (A.goal - A.w) * Math.min(1, dt * 12);
      if (A.w < 0.003) return;
      const up = B.sh[k], lo = B.el[k];
      rq.copy(up.quaternion); rq2.copy(lo.quaternion);
      B.root.updateMatrixWorld(true);
      solveArm(up, lo, B.wr[k], A.target);
      rq3.copy(up.quaternion); up.quaternion.copy(rq).slerp(rq3, A.w);
      rq3.copy(lo.quaternion); lo.quaternion.copy(rq2).slerp(rq3, A.w);
    }
    // Feet: this.feet = 'ground' lifts any foot the animation pushes into the turf back onto it;
    // 'stance' plants both feet flat, a little wider than the hips (a two-footed crouch).
    _legs() {
      if (!this.feet) return;
      const B = this.body, ANK = 0.085;                         // ankle height that puts the sole on the turf
      this.root.updateMatrixWorld(true);
      for (const [k, s] of [['l', -1], ['r', 1]]) {
        const an = B.an[k];
        if (this.feet === 'stance') {
          rv.set(B.hips.position.x + s * 0.3, 0, B.hips.position.z + 0.08);
          B.root.localToWorld(rv); rv.y = ANK;
        } else {
          an.getWorldPosition(rv);
          // the toe is the lowest point when the foot points down, so check it too
          rv2.set(0, -0.084, -0.195); an.localToWorld(rv2);
          if (rv.y >= ANK && rv2.y >= 0) continue;
          rv.y = Math.max(rv.y, ANK);
        }
        solveArm(B.hp[k], B.kn[k], an, rv);
        this.root.getWorldQuaternion(rq); an.parent.getWorldQuaternion(rq2).invert();   // sole flat on the turf
        an.quaternion.copy(rq2.multiply(rq));
      }
    }
    update(dt) {
      this.mixer.update(dt);
      if (this.stopAt && this.cur && this.cur.time >= this.stopAt) { this.cur.time = this.stopAt; this.cur.timeScale = 0; }
      this._retarget();
      this._legs();
      this._rigArm('l', dt); this._rigArm('r', dt);
    }
    setKit(kit) { this.body.setKit(kit); }
  }

  const GEAR = {};        // helmet materials shared by every Mixamo player
  function gearMats() {
    if (GEAR.helmet) return;
    GEAR.helmet = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.2 });
    GEAR.stripe = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    GEAR.mask = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5, color: col('#a7adb3') });
    GEAR.jersey = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    GEAR.pants = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    GEAR.skin = new THREE.MeshStandardMaterial({ roughness: 0.7, color: col('#c58f6a') });
  }

  // Paint a uniform onto an untextured character (Mixamo's X Bot / Y Bot): each vertex is coloured by
  // the bone that moves it - torso and upper arms get the jersey, hips and thighs the pants, and so on.
  function paintUniform(kit) {
    const pal = [col(kit.jersey), col(kit.pants), col('#c58f6a'), col('#f1f1f1'), col('#151515')];
    Mixamo.base.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const g = o.geometry, n = g.attributes.position.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      if (!g.userData.region) {
        const names = o.skeleton.bones.map(b => b.name), reg = g.userData.region = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          let bi = si.getX(i), bw = sw.getX(i);
          if (sw.getY(i) > bw) { bi = si.getY(i); bw = sw.getY(i); }
          if (sw.getZ(i) > bw) { bi = si.getZ(i); bw = sw.getZ(i); }
          if (sw.getW(i) > bw) { bi = si.getW(i); }
          const nm = names[bi] || '';
          reg[i] = /Head|Neck|ForeArm|Hand/.test(nm) ? 2 : /Foot|Toe/.test(nm) ? 4 : /UpLeg|Hips/.test(nm) ? 1 : /Leg/.test(nm) ? 3 : 0;
        }
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      }
      const reg = g.userData.region, ca = g.attributes.color;
      const k = /Joints/i.test(o.name + ' ' + [].concat(o.material).map(m => m.name).join(' ')) ? 0.72 : 1;   // seams a shade darker
      for (let i = 0; i < n; i++) { const c = pal[reg[i]]; ca.setXYZ(i, c.r * k, c.g * k, c.b * k); }
      ca.needsUpdate = true;
      for (const m of [].concat(o.material)) {
        m.vertexColors = true; m.color.set(0xffffff);
        if (m.specular) m.specular.setScalar(0.04);            // cloth, not shiny plastic
        if ('shininess' in m) m.shininess = 6;
        m.needsUpdate = true;
      }
    });
    GEAR.helmet.color.copy(col(kit.helmet)); GEAR.stripe.color.copy(col(kit.stripe));
    GEAR.jersey.color.copy(col(kit.jersey)); GEAR.pants.color.copy(col(kit.pants));
  }

  // Tint clothing materials when the character names them recognisably; otherwise leave it alone.
  function tintMixamo(kit) {
    if (!Mixamo.base) return;
    if (Mixamo.plain) { paintUniform(kit); return; }
    Mixamo.base.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        const n = (m.name || '') + ' ' + (o.name || '');
        // Mixamo's default X Bot / Y Bot: body panels take the jersey color, joints the trim color
        if (/Beta_Joints|Alpha_Joints/i.test(n)) m.color.copy(col(kit.stripe));
        else if (/Beta_|Alpha_/i.test(n)) m.color.copy(col(kit.jersey));
        else if (/jersey|shirt|uniform|top/i.test(n)) m.color.copy(col(kit.jersey));
        else if (/pant|short|bottom/i.test(n)) m.color.copy(col(kit.pants));
        else if (/helmet/i.test(n)) m.color.copy(col(kit.helmet));
      }
    });
  }

  return {
    Rig, MixamoFigure, RigFigure, Mixamo, P, mix, run, refNoGood, loadMixamo, tintMixamo,
    hasClips: (...names) => !!Mixamo.base && names.every(n => Mixamo.clips[n]),
  };
})();
