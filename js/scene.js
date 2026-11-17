/* The 3D world: renderer, lighting, turf, stadium, goalposts, ball and on-field guides.
   Game coordinates (see physics.js) map to three.js as (x, y, -z), so "downfield" is -Z. */
const World = (() => {
  'use strict';
  const PH = Physics.POST_HALF, BAR = Physics.BAR_Y, TOP = Physics.TOP_Y;
  const HALF_W = 160 / 6;
  const col = hex => new THREE.Color(hex).convertSRGBToLinear();
  const V = (x, y, z) => new THREE.Vector3(x, y, -z);
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };

  // The painted field texture covers x in [-FX, FX] and game z in [FZ_BOT, FZ_TOP].
  const FX = 33, FZ_TOP = 12, FZ_BOT = -125, S = 28;

  let renderer, scene, camera, sun, maxAniso = 1, time = 0;
  let fieldCanvas, fieldTex, crowdCanvas, crowdTex, boardCanvas, boardTex;
  let wallMat, fasciaMat, padMat;
  let ballObj, ballMesh, trailLine, trailCount = -1, guide, guideTex, guideTip, losLine;
  const ribbons = [];
  let wind = 0;

  function canvasTex(c) {
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    return t;
  }
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* ---------------- sky ---------------- */
  function skyTexture() {
    const c = mkCanvas(1024, 512), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#2f6fc0'); g.addColorStop(0.45, '#7fb2e8'); g.addColorStop(0.75, '#cfe3f5'); g.addColorStop(1, '#e9f1f8');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    x.filter = 'blur(14px)';
    for (let i = 0; i < 26; i++) {                       // soft clouds
      const cx = Math.random() * 1024, cy = 40 + Math.random() * 230, w = 60 + Math.random() * 150;
      x.fillStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.22})`;
      for (let j = 0; j < 5; j++) {
        x.beginPath(); x.ellipse(cx + (Math.random() - 0.5) * w, cy + (Math.random() - 0.5) * 16, w * (0.3 + Math.random() * 0.4), 9 + Math.random() * 12, 0, 0, 7); x.fill();
      }
    }
    return canvasTex(c);
  }

  /* ---------------- turf ---------------- */
  function drawField(team) {
    const c = fieldCanvas, x = c.getContext('2d');
    const px = v => (v + FX) * S, py = z => (FZ_TOP - z) * S;
    const rect = (x1, z1, x2, z2) => x.fillRect(px(x1), py(z2), (x2 - x1) * S, (z2 - z1) * S);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#23521f'; x.fillRect(0, 0, c.width, c.height);

    for (let i = 0; i < 24; i++) {                       // mowing stripes, 5 yards each
      x.fillStyle = i % 2 ? '#2f6e2a' : '#285f25';
      rect(-HALF_W, -120 + i * 5, HALF_W, -115 + i * 5);
    }
    // end zone
    x.fillStyle = team ? team.primary : '#234'; rect(-HALF_W, -10, HALF_W, 0);
    if (team) {
      const light = lum(team.primary) > 0.6;
      const fill = lum(team.secondary) < 0.15 && !light ? '#ffffff' : team.secondary;
      x.save();
      x.translate(px(0), py(-5));
      x.font = `900 ${6.4 * S}px Impact, "Arial Black", sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      const w = x.measureText(team.name.toUpperCase()).width, maxW = 44 * S;
      if (w > maxW) x.scale(maxW / w, 1);
      x.lineWidth = 0.35 * S; x.strokeStyle = light ? '#111' : 'rgba(255,255,255,0.9)'; x.lineJoin = 'round';
      if (fill !== '#ffffff') x.strokeText(team.name.toUpperCase(), 0, 0.2 * S);
      x.fillStyle = fill; x.fillText(team.name.toUpperCase(), 0, 0.2 * S);
      x.restore();
    }

    // paint: thick white border, sidelines, goal line, yard lines
    x.fillStyle = '#f4f6f2';
    rect(-HALF_W - 2, -122, -HALF_W, 2); rect(HALF_W, -122, HALF_W + 2, 2); rect(-HALF_W - 2, 0, HALF_W + 2, 2);
    rect(-HALF_W, -10.11, HALF_W, -9.89);
    for (let i = 1; i <= 20; i++) rect(-HALF_W, -10 - i * 5 - 0.06, HALF_W, -10 - i * 5 + 0.06);
    for (let z = -11; z > -110; z--) {                   // hash marks every yard
      if ((-z - 10) % 5 === 0) continue;
      for (const hx of [-HALF_W + 0.1, -PH - 0.67, PH, HALF_W - 0.77]) rect(hx, z - 0.06, hx + 0.67, z + 0.06);
    }
    // yard numbers, lying on their side the way they are painted on a real field
    x.font = `700 ${2 * S}px "Arial Narrow", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 2; i <= 18; i += 2) {
      const z = -10 - i * 5, yd = i * 5 <= 50 ? i * 5 : 100 - i * 5, d = String(yd);
      for (const s of [-1, 1]) {
        x.save(); x.translate(px(s * (HALF_W - 13)), py(z)); x.rotate(s < 0 ? Math.PI / 2 : -Math.PI / 2);
        x.fillText(d[0], -0.8 * S, 0); x.fillText(d[1], 0.8 * S, 0);
        x.restore();
      }
    }

    // grain so the turf is not a flat colour
    const n = mkCanvas(256, 256), nx = n.getContext('2d'), id = nx.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random();
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v > 0.5 ? 255 : 0;
      id.data[i + 3] = Math.abs(v - 0.5) * 70;
    }
    nx.putImageData(id, 0, 0);
    x.fillStyle = x.createPattern(n, 'repeat'); x.fillRect(0, 0, c.width, c.height);
    // broad, soft wear patches
    x.filter = 'blur(40px)';
    for (let i = 0; i < 60; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(20,50,15,0.10)' : 'rgba(190,210,120,0.07)';
      x.beginPath(); x.ellipse(Math.random() * c.width, Math.random() * c.height, 80 + Math.random() * 200, 60 + Math.random() * 160, 0, 0, 7); x.fill();
    }
    x.filter = 'none';
    if (fieldTex) fieldTex.needsUpdate = true;
  }

  function buildGround() {
    fieldCanvas = mkCanvas(2 * FX * S, (FZ_TOP - FZ_BOT) * S);
    drawField(null);
    fieldTex = canvasTex(fieldCanvas);
    const g = new THREE.PlaneGeometry(2 * FX, FZ_TOP - FZ_BOT); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.96, metalness: 0 }));
    m.position.copy(V(0, 0, (FZ_TOP + FZ_BOT) / 2)); m.receiveShadow = true;
    scene.add(m);
    const og = new THREE.PlaneGeometry(500, 600); og.rotateX(-Math.PI / 2);
    const outer = new THREE.Mesh(og, new THREE.MeshStandardMaterial({ color: col('#4b5356'), roughness: 1 }));
    outer.position.y = -0.04; scene.add(outer);
  }

  /* ---------------- stadium ---------------- */
  function drawCrowd(team) {
    const x = crowdCanvas.getContext('2d');
    x.fillStyle = '#14161b'; x.fillRect(0, 0, 512, 512);
    const pal = team
      ? [team.primary, team.primary, team.primary, team.primary, team.secondary, team.secondary, '#d9d9d9', '#9aa0a8', '#2b2f38', '#5c6672', '#40506a', '#6b4f3f']
      : ['#f1f1f1', '#d5d8dc', '#2b2f38', '#7b8794', '#40506a'];
    const skin = ['#f0c8a4', '#d9a57c', '#b07a55', '#7a5237', '#e8b894'];
    for (let r = 0; r < 32; r++) {
      const y = r * 16;
      x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, y + 14, 512, 2);
      for (let sx = 0; sx < 512; sx += 8) {
        if (Math.random() < 0.06) continue;
        const j = (Math.random() - 0.5) * 2;
        x.fillStyle = pal[Math.floor(Math.random() * pal.length)];
        x.fillRect(sx + 1, y + 6 + j, 6, 9);
        x.fillStyle = skin[Math.floor(Math.random() * skin.length)];
        x.beginPath(); x.arc(sx + 4, y + 3.6 + j, 2.5, 0, 7); x.fill();
      }
    }
    x.fillStyle = 'rgba(12,14,20,0.28)'; x.fillRect(0, 0, 512, 512);       // knock the contrast back
    if (crowdTex) crowdTex.needsUpdate = true;
  }

  function drawBoard(team) {
    const x = boardCanvas.getContext('2d');
    x.fillStyle = '#05070c'; x.fillRect(0, 0, 1024, 320);
    x.fillStyle = team ? team.primary : '#1c2a4a'; x.fillRect(12, 12, 1000, 296);
    x.fillStyle = team ? team.secondary : '#ccc'; x.fillRect(12, 232, 1000, 14);
    x.fillStyle = team && lum(team.primary) > 0.6 ? '#111' : '#fff';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 150px Impact, "Arial Black", sans-serif';
    x.fillText(team ? team.name.toUpperCase() : 'FIELD GOAL', 512, 124, 960);
    x.font = '700 40px Arial, sans-serif';
    x.fillText(team ? `${team.city.toUpperCase()}  ·  UPRIGHTS` : 'UPRIGHTS', 512, 276, 960);
    if (boardTex) boardTex.needsUpdate = true;
  }

  function quad(a, b, c, d, mat, uw, vh) {
    const g = new THREE.BufferGeometry(), P = [a, b, c, d].map(p => V(p[0], p[1], p[2]));
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(p => [p.x, p.y, p.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uw || 1, 0, uw || 1, vh || 1, 0, vh || 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); scene.add(m); return m;
  }

  function buildStadium() {
    crowdCanvas = mkCanvas(512, 512); drawCrowd(null);
    crowdTex = canvasTex(crowdCanvas); crowdTex.wrapS = crowdTex.wrapT = THREE.RepeatWrapping;
    const seats = new THREE.MeshStandardMaterial({ color: col('#23262e'), roughness: 1, side: THREE.DoubleSide });   // under the 3D fans
    const crowdUp = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 1, side: THREE.DoubleSide, color: col('#b9bec8') });
    const concrete = new THREE.MeshStandardMaterial({ color: col('#585d66'), roughness: 1, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: col('#22252c'), roughness: 1, side: THREE.DoubleSide });
    wallMat = new THREE.MeshStandardMaterial({ color: col('#223'), roughness: 0.8, side: THREE.DoubleSide });
    fasciaMat = new THREE.MeshStandardMaterial({ color: col('#223'), roughness: 0.6, side: THREE.DoubleSide });
    const TU = 22, TV = 26, ZN = -140;                 // yards of seating covered by one texture tile
    const slope = (dx, dy) => Math.hypot(dx, dy) / TV;

    // behind the end zone
    quad([-90, 2.2, 10], [90, 2.2, 10], [90, 26, 46], [-90, 26, 46], seats);
    quad([-90, 26, 46], [90, 26, 46], [90, 30.5, 49], [-90, 30.5, 49], fasciaMat);
    quad([-100, 30.5, 49], [100, 30.5, 49], [100, 52, 76], [-100, 52, 76], crowdUp, 200 / TU, slope(27, 22));
    quad([-100, 52, 76], [100, 52, 76], [100, 57, 76], [-100, 57, 76], dark);
    quad([-HALF_W - 5.3, 0, 10], [HALF_W + 5.3, 0, 10], [HALF_W + 5.3, 2.2, 10], [-HALF_W - 5.3, 2.2, 10], wallMat);
    // along both sidelines
    for (const s of [-1, 1]) {
      quad([s * 32, 2.2, 10], [s * 32, 2.2, ZN], [s * 62, 23, ZN], [s * 62, 23, 10], seats);
      quad([s * 62, 23, 10], [s * 62, 23, ZN], [s * 65, 27.5, ZN], [s * 65, 27.5, 10], fasciaMat);
      quad([s * 65, 27.5, 49], [s * 65, 27.5, ZN], [s * 90, 48, ZN], [s * 90, 48, 49], crowdUp, (49 - ZN) / TU, slope(25, 20.5));
      quad([s * 90, 48, 76], [s * 90, 48, ZN], [s * 90, 53, ZN], [s * 90, 53, 76], dark);
      quad([s * 32, 0, 10], [s * 32, 0, ZN], [s * 32, 2.2, ZN], [s * 32, 2.2, 10], wallMat);
      quad([s * 32, 0, 10], [s * 62, 0, 10], [s * 62, 23, 10], [s * 32, 2.2, 10], concrete);   // closes the corner
      // floodlights
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 30, 8), dark);
      pole.position.copy(V(s * 96, 62, 60)); scene.add(pole);
      const bank = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 1), new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }));
      bank.position.copy(V(s * 94, 78, 59)); bank.lookAt(V(0, 0, -40)); scene.add(bank);
    }
    // video board over the end zone
    boardCanvas = mkCanvas(1024, 320); drawBoard(null);
    boardTex = canvasTex(boardCanvas);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(64, 20), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
    board.position.copy(V(0, 70, 77)); scene.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(68, 24, 2), dark);
    frame.position.copy(V(0, 70, 78.2)); scene.add(frame);
  }

  /* ---------------- 3D fans in the lower bowl ---------------- */
  // Every fan is a real little figure (torso + head) standing on its own row, so the crowd has depth,
  // catches the light and jumps up when a kick is good. The far upper decks stay as a painted texture.
  const fans = { n: 0, baseY: null, phase: null, pick: null, hat: null, bodies: null, heads: null, moving: false };
  function buildFans() {
    const spots = [];
    for (let r = 0; r < 40; r++) {                                  // behind the end zone
      const t = (r + 0.5) / 40, z = 10 + 36 * t, y = 2.2 + 24 * t;
      for (let x = -88; x <= 88; x += 0.8) if (Math.random() > 0.06) spots.push([x + (Math.random() - 0.5) * 0.2, y, z]);
    }
    for (const s of [-1, 1]) {                                      // along both sidelines
      for (let r = 0; r < 33; r++) {
        const t = (r + 0.5) / 33, x = s * (32 + 30 * t), y = 2.2 + 21 * t;
        for (let z = 9.6; z > -86; z -= 0.8) if (Math.random() > 0.06) spots.push([x, y, z + (Math.random() - 0.5) * 0.2]);
      }
    }
    const n = fans.n = spots.length;
    const bg = new THREE.CylinderGeometry(0.2, 0.27, 0.72, 6); bg.translate(0, 0.36, 0);
    const hg = new THREE.IcosahedronGeometry(0.135, 1); hg.translate(0, 0.86, 0);
    fans.bodies = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial(), n);
    fans.heads = new THREE.InstancedMesh(hg, new THREE.MeshLambertMaterial(), n);
    fans.baseY = new Float32Array(n); fans.phase = new Float32Array(n); fans.pick = new Float32Array(n); fans.hat = new Uint8Array(n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const p = spots[i], h = 0.85 + Math.random() * 0.3, w = 0.85 + Math.random() * 0.35;
      q.setFromAxisAngle(up, Math.random() * 6.283); sc.set(w, h, w);
      m.compose(V(p[0], p[1], p[2]), q, sc);
      fans.bodies.setMatrixAt(i, m); fans.heads.setMatrixAt(i, m);
      fans.baseY[i] = p[1]; fans.phase[i] = Math.random() * 6.283; fans.pick[i] = Math.random(); fans.hat[i] = Math.random() < 0.3 ? 1 : 0;
    }
    fans.bodies.frustumCulled = fans.heads.frustumCulled = false;
    scene.add(fans.bodies, fans.heads);
    colorFans(null);
  }
  function colorFans(team) {
    const shirts = (team ? [team.primary, team.primary, team.primary, team.primary, team.secondary, team.secondary] : [])
      .concat(['#e6e6e6', '#b9bec6', '#2b2f38', '#5c6672', '#40506a', '#7a4b3a', '#8a1f2b', '#2d5d8a']).map(col);
    const skin = ['#f0c8a4', '#d9a57c', '#b07a55', '#7a5237', '#e8b894'].map(col);
    const hats = (team ? [team.primary, team.secondary] : ['#333333']).concat(['#f0f0f0', '#222222']).map(col);
    for (let i = 0; i < fans.n; i++) {
      const r = fans.pick[i];
      fans.bodies.setColorAt(i, shirts[Math.floor(r * shirts.length)]);
      fans.heads.setColorAt(i, fans.hat[i] ? hats[Math.floor(r * hats.length)] : skin[Math.floor(r * skin.length)]);
    }
    fans.bodies.instanceColor.needsUpdate = true; fans.heads.instanceColor.needsUpdate = true;
  }
  function moveFans(excite) {
    if (excite < 0.02 && !fans.moving) return;
    fans.moving = excite >= 0.02;
    const a = fans.bodies.instanceMatrix.array, b = fans.heads.instanceMatrix.array;
    for (let i = 0; i < fans.n; i++) {
      const y = fans.baseY[i] + (fans.moving ? excite * Math.abs(Math.sin(time * 7 + fans.phase[i])) * 0.5 : 0);
      a[i * 16 + 13] = y; b[i * 16 + 13] = y;
    }
    fans.bodies.instanceMatrix.needsUpdate = true; fans.heads.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- catch net behind the posts ----------------
     A cloth simulation: a grid of points joined by cords and tied to the poles and bars all
     round. The ball pushes a pocket into it, the cords pull it back, and it ripples and settles.
     Points are kept in game coordinates (z = downfield toward the stands). */
  const NET = { z: 6, halfW: 7, y0: 2.4, y1: 18, step: 0.25, mesh: 8 };   // step: simulated points; mesh: holes per yard (about 4.5 in)
  const net = { acc: 0 };
  function buildNet() {
    const nx = Math.round(NET.halfW * 2 / NET.step) + 1, ny = Math.round((NET.y1 - NET.y0) / NET.step) + 1;
    const dx = NET.halfW * 2 / (nx - 1), dy = (NET.y1 - NET.y0) / (ny - 1), n = nx * ny;
    const P = new Float32Array(n * 3), pin = new Uint8Array(n);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const i = r * nx + c;
      P[i * 3] = -NET.halfW + c * dx; P[i * 3 + 1] = NET.y0 + r * dy; P[i * 3 + 2] = NET.z;
      pin[i] = r === 0 || r === ny - 1 || c === 0 || c === nx - 1 ? 1 : 0;      // tied to the frame
    }
    const A = [], B = [], L = [];
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const i = r * nx + c;
      if (c < nx - 1) { A.push(i); B.push(i + 1); L.push(dx); }
      if (r < ny - 1) { A.push(i); B.push(i + nx); L.push(dy); }
    }
    Object.assign(net, { nx, ny, dx, dy, n, P, O: P.slice(), pin, A: Int32Array.from(A), B: Int32Array.from(B), L: Float32Array.from(L) });

    // cords: dark mesh on a see-through sheet; lit, so the pocket and ripples read in 3D
    const c = mkCanvas(64, 64), x = c.getContext('2d');
    x.strokeStyle = 'rgba(22,22,24,1)'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 0); x.moveTo(0, 0); x.lineTo(0, 64); x.stroke();
    x.fillStyle = 'rgba(10,10,12,1)'; x.fillRect(0, 0, 7, 7);                     // knots
    const tex = canvasTex(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(NET.halfW * 2 * NET.mesh, (NET.y1 - NET.y0) * NET.mesh);
    const geo = new THREE.PlaneGeometry(NET.halfW * 2, NET.y1 - NET.y0, nx - 1, ny - 1);
    net.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    net.mesh.frustumCulled = false;
    scene.add(net.mesh);
    writeNet();
    const black = new THREE.MeshStandardMaterial({ color: col('#0c0c0d'), roughness: 0.6 });
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 18.4, 10), black);
      pole.position.copy(V(s * 7.15, 9.2, 6)); pole.castShadow = true; scene.add(pole);
    }
    for (const y of [2.4, 18]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 14.3, 8), black);
      bar.rotation.z = Math.PI / 2; bar.position.copy(V(0, y, 6)); scene.add(bar);
    }
  }

  // Copy the simulated points into the mesh (PlaneGeometry rows run top to bottom).
  function writeNet() {
    const { nx, ny, P } = net, a = net.mesh.geometry.attributes.position;
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const i = (ny - 1 - iy) * nx + ix;
      a.setXYZ(iy * nx + ix, P[i * 3], P[i * 3 + 1], -P[i * 3 + 2]);
    }
    a.needsUpdate = true;
    net.mesh.geometry.computeVertexNormals();
  }

  function stepNet(h, ball, br) {
    const { n, P, O, pin, A, B, L, nx, ny, dx, dy } = net;
    const flutter = Math.min(1, Math.abs(wind) / 15) * 0.9;
    for (let i = 0; i < n; i++) {
      if (pin[i]) continue;
      const j = i * 3, x = P[j], y = P[j + 1], z = P[j + 2];
      const az = 0.5 + flutter * Math.sin(time * 2.3 + x * 0.6 + y * 0.35);      // a slight bow back, rippling in the wind
      P[j] += (x - O[j]) * 0.992;
      P[j + 1] += (y - O[j + 1]) * 0.992 - 1.5 * h * h;
      P[j + 2] += (z - O[j + 2]) * 0.992 + az * h * h;
      O[j] = x; O[j + 1] = y; O[j + 2] = z;
    }
    // the ball: points in front of it are pushed back into a pocket around it
    if (ball && !ball.hidden && ball.z > NET.z - 0.5 && ball.z < NET.z + 4 && Math.abs(ball.x) < NET.halfW && ball.y > NET.y0 && ball.y < NET.y1) {
      const R = 1.3;
      const c0 = Math.max(1, Math.floor((ball.x - R + NET.halfW) / dx)), c1 = Math.min(nx - 2, Math.ceil((ball.x + R + NET.halfW) / dx));
      const r0 = Math.max(1, Math.floor((ball.y - R - NET.y0) / dy)), r1 = Math.min(ny - 2, Math.ceil((ball.y + R - NET.y0) / dy));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const j = (r * nx + c) * 3, ex = P[j] - ball.x, ey = P[j + 1] - ball.y, d = Math.sqrt(ex * ex + ey * ey);
        if (d > R) continue;
        const zmin = ball.z + br - d * d * 0.45;                           // a rounded cup around the ball
        if (P[j + 2] < zmin) P[j + 2] = zmin;
      }
    }
    for (let it = 0; it < 8; it++) {
      for (let k = 0; k < A.length; k++) {
        const a = A[k] * 3, b = B[k] * 3;
        const ex = P[b] - P[a], ey = P[b + 1] - P[a + 1], ez = P[b + 2] - P[a + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6;
        if (d <= L[k]) continue;                                           // cords pull, they don't push
        const pa = pin[A[k]], pb = pin[B[k]];
        if (pa && pb) continue;
        const f = (d - L[k]) / d * (pa || pb ? 1 : 0.5);
        if (!pa) { P[a] += ex * f; P[a + 1] += ey * f; P[a + 2] += ez * f; }
        if (!pb) { P[b] -= ex * f; P[b + 1] -= ey * f; P[b + 2] -= ez * f; }
      }
    }
  }

  function updateNet(dt, ball, br) {
    net.acc = Math.min(net.acc + dt, 0.1);
    const h = 1 / 90;
    if (net.acc < h) return;
    while (net.acc >= h) { net.acc -= h; stepNet(h, ball, br); }
    writeNet();
  }

  /* ---------------- goalposts ---------------- */
  function buildPosts() {
    const yel = new THREE.MeshStandardMaterial({ color: col('#f5cf12'), roughness: 0.35, metalness: 0.35 });
    const R = 0.075;
    const add = (geo, mat, p) => { const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.castShadow = true; scene.add(m); return m; };
    add(new THREE.CylinderGeometry(R * 1.3, R * 1.3, 2.6, 12), yel, V(0, 1.3, 2));
    add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0, 2.6, 2), V(0, BAR, 2), V(0, BAR, 0)), 20, R * 1.3, 10), yel, new THREE.Vector3());
    add(new THREE.CylinderGeometry(R, R, PH * 2, 12), yel, V(0, BAR, 0)).rotation.z = Math.PI / 2;
    padMat = new THREE.MeshStandardMaterial({ color: col('#234'), roughness: 0.7 });
    add(new THREE.CylinderGeometry(0.3, 0.3, 2, 16), padMat, V(0, 1, 2));
    const rib = new THREE.MeshStandardMaterial({ color: col('#ff5a12'), roughness: 0.8, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(R, R, TOP - BAR, 12), yel, V(s * PH, (TOP + BAR) / 2, 0));
      const g = new THREE.PlaneGeometry(0.95, 0.14); g.translate(0.475, 0, 0);
      const r = new THREE.Mesh(g, rib); r.position.copy(V(s * PH, TOP - 0.05, 0)); scene.add(r); ribbons.push(r);
    }
  }

  /* ---------------- scoring thirds between the uprights ----------------
     Shown only after the kick: the middle third is worth 3, the outer thirds 1.
     The third the ball goes through lights up. */
  const zones = { show: 0, target: 0, hit: null, panels: [], labels: [], lines: [] };
  function buildZones() {
    zones.group = new THREE.Group(); zones.group.visible = false; scene.add(zones.group);
    const h = TOP - BAR, w = PH * 2 / 3;
    const label = text => {
      const c = mkCanvas(256, 256), x = c.getContext('2d');
      x.font = '900 150px "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 18; x.strokeStyle = 'rgba(4,60,20,0.9)'; x.strokeText(text, 128, 136);
      x.fillStyle = '#ffffff'; x.fillText(text, 128, 136);
      return canvasTex(c);
    };
    const basic = (opts) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }, opts));
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic({ color: col(i ? '#43e07a' : '#14c14b') }));
      p.position.copy(V(i * w, BAR + h / 2, -0.03)); p.userData = { i, base: i ? 0.17 : 0.3 };
      zones.group.add(p); zones.panels.push(p);
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.95), basic({ map: label(i ? '+1' : '+3') }));
      l.position.copy(V(i * w, BAR + 2.1, -0.06)); l.userData = { i };
      zones.group.add(l); zones.labels.push(l);
    }
    for (const s of [-1, 1]) {                                  // the lines between the thirds
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h), basic({ color: 0xffffff }));
      ln.position.copy(V(s * w / 2, BAR + h / 2, -0.04)); zones.group.add(ln); zones.lines.push(ln);
    }
  }
  function setZones(on, hit) { zones.target = on ? 1 : 0; zones.hit = hit == null ? null : hit; }
  function updateZones(dt) {
    zones.show += (zones.target - zones.show) * Math.min(1, dt * 6);
    zones.group.visible = zones.show > 0.01;
    if (!zones.group.visible) return;
    const s = zones.show, hit = zones.hit, pulse = 0.5 + 0.5 * Math.sin(time * 10);
    for (const p of zones.panels) {
      const lit = hit === p.userData.i;
      p.material.opacity = s * (lit ? 0.45 + 0.2 * pulse : hit == null ? p.userData.base : p.userData.base * 0.5);
    }
    for (const l of zones.labels) {
      const lit = hit === l.userData.i;
      l.material.opacity = s * (hit == null || lit ? 1 : 0.35);
      l.scale.setScalar(lit ? 1.12 + 0.06 * pulse : 1);
    }
    for (const ln of zones.lines) ln.material.opacity = s * 0.7;
  }

  /* ---------------- ball ---------------- */
  function buildBall() {
    const c = mkCanvas(256, 128), x = c.getContext('2d');
    x.fillStyle = '#6a3716'; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 2600; i++) {                     // pebbled leather
      x.fillStyle = Math.random() < 0.5 ? 'rgba(30,12,4,0.35)' : 'rgba(160,100,60,0.25)';
      x.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5);
    }
    x.fillStyle = '#f5f5f0'; x.fillRect(125, 40, 6, 48);
    for (let y = 43; y < 88; y += 6) x.fillRect(118, y, 20, 2.4);
    const tex = canvasTex(c);
    const a = 0.155, b = 0.095, pts = [];
    for (let i = 0; i <= 20; i++) { const t = -1 + i / 10; pts.push(new THREE.Vector2(b * Math.pow(Math.max(0, 1 - t * t), 0.62) + 0.0005, a * t)); }
    ballMesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
    ballMesh.castShadow = true;
    ballObj = new THREE.Group(); ballObj.add(ballMesh); scene.add(ballObj);

    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
    tg.setDrawRange(0, 0);
    trailLine = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.7, toneMapped: false }));
    trailLine.frustumCulled = false; scene.add(trailLine);
  }

  /* ---------------- aim guide and line of scrimmage ---------------- */
  function buildGuides() {
    const c = mkCanvas(8, 64), x = c.getContext('2d');
    x.fillStyle = '#ffe14a'; x.fillRect(0, 0, 8, 36);
    guideTex = canvasTex(c); guideTex.wrapT = THREE.RepeatWrapping;
    const g = new THREE.PlaneGeometry(0.16, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5);
    const off = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    guide = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: guideTex, transparent: true, depthWrite: false, toneMapped: false, ...off }));
    guide.position.y = 0.03; scene.add(guide);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, toneMapped: false });
    guideTip = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, BAR, 6), tipMat); stem.position.y = BAR / 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), tipMat); cone.position.y = BAR + 0.42; cone.rotation.x = Math.PI;
    guideTip.add(stem, cone); guideTip.userData.mat = tipMat; scene.add(guideTip);

    const lg = new THREE.PlaneGeometry(HALF_W * 2, 0.34); lg.rotateX(-Math.PI / 2);
    losLine = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0x2a86ff, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false, ...off }));
    losLine.position.y = 0.03; losLine.visible = false; scene.add(losLine);
  }

  /* ---------------- public API ---------------- */
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    maxAniso = renderer.capabilities.getMaxAnisotropy();

    scene = new THREE.Scene();
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(col('#b4c8e0'), 220, 900);
    camera = new THREE.PerspectiveCamera(37, 1, 0.5, 800);

    scene.add(new THREE.HemisphereLight(col('#cfe0ff'), col('#4f6b3c'), 0.62));
    sun = new THREE.DirectionalLight(col('#fff1d6'), 1.55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 140;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    aimSun(0, -40);

    buildGround(); buildStadium(); buildFans(); buildNet(); buildPosts(); buildZones(); buildBall(); buildGuides();
    return scene;
  }

  // Keep the high-resolution shadow area centred on the action.
  function aimSun(x, z) {
    sun.target.position.copy(V(x, 0, z + 5));
    sun.position.copy(V(x - 26, 44, z - 24));
  }

  function resize(W, H) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    const F = Math.min(Math.max(W * 0.85, H * 0.75), H * 1.45);
    camera.aspect = W / H; camera.fov = 2 * Math.atan(H / (2 * F)) * 180 / Math.PI;
    camera.updateProjectionMatrix();
  }

  function setTeam(team) {
    drawField(team); drawCrowd(team); drawBoard(team); colorFans(team);
    wallMat.color.copy(col(team.primary)).multiplyScalar(0.55);
    fasciaMat.color.copy(col(team.secondary)).multiplyScalar(0.8);
    padMat.color.copy(col(team.primary));
  }

  function setKick(k) {
    losLine.visible = !!k;
    if (!k) { guide.visible = guideTip.visible = false; ballObj.visible = false; return; }
    losLine.position.z = -k.zLOS;
    aimSun(k.bx, k.bz);
    wind = k.wind;
  }

  function setAim(k, aim, opacity) {
    const on = opacity > 0;
    guide.visible = guideTip.visible = on;
    if (!on) return;
    const len = k.dist / Math.cos(aim) - 0.6;
    guide.position.copy(V(k.bx + Math.sin(aim) * 0.6, 0.03, k.bz + Math.cos(aim) * 0.6));
    guide.rotation.y = -aim; guide.scale.z = len;
    guideTex.repeat.y = len / 1.6;
    guide.material.opacity = opacity; guideTip.userData.mat.opacity = opacity;
    guideTip.position.copy(V(k.bx + Math.tan(aim) * k.dist, 0, 0));
  }

  // mode: 'ground' (lying at the line), 'snap' (spiral), 'hold' (u = 0..1 as it is stood up), 'flight' (tumbling)
  function setBall(b, mode, u) {
    ballObj.visible = !b.hidden;
    ballObj.position.copy(V(b.x, b.y, b.z));
    if (mode === 'ground') ballMesh.rotation.set(Math.PI / 2, 0, 0);
    else if (mode === 'snap') ballMesh.rotation.set(Math.PI / 2, u, 0);
    else if (mode === 'hold') ballMesh.rotation.set(Math.PI / 2 * (1 - u) + 0.1 * u, 2.2 * u, -0.06 * u);
    else ballMesh.rotation.set(b.ang, 0, 0);          // end over end, top tumbling back toward the kicker
  }

  function setTrail(pts) {
    if (pts.length === trailCount) return;
    trailCount = pts.length;
    const a = trailLine.geometry.attributes.position, n = Math.min(pts.length, 600);
    for (let i = 0; i < n; i++) a.setXYZ(i, pts[i].x, pts[i].y, -pts[i].z);
    a.needsUpdate = true; trailLine.geometry.setDrawRange(0, n);
  }

  function setCamera(px, py, pz, tx, ty, tz) {
    camera.position.copy(V(px, py, pz));
    camera.lookAt(V(tx, ty, tz));
  }

  function lookFrom(from, at) { camera.position.copy(V(from[0], from[1], from[2])); camera.lookAt(V(at[0], at[1], at[2])); }

  function update(dt, excite, ball) {
    time += dt;
    updateNet(dt, ball, Physics.BALL_R);
    updateZones(dt);
    const str = Math.min(1, Math.abs(wind) / 10);
    ribbons.forEach((r, i) => {
      r.rotation.y = wind < 0 ? Math.PI : 0;
      r.rotation.z = -(1 - str) * 1.35 + Math.sin(time * (5 + str * 9) + i) * (0.05 + 0.12 * str);
    });
    crowdTex.offset.y = excite * 0.012 * Math.abs(Math.sin(time * 8));   // the whole crowd bounces when it erupts
    guideTex.offset.y = -time * 0.9;
    moveFans(excite);
  }

  return {
    init, resize, setTeam, setKick, setAim, setZones, setBall, setTrail, setCamera, lookFrom, update, V, col,
    render: () => renderer.render(scene, camera),
    get scene() { return scene; },
  };
})();
