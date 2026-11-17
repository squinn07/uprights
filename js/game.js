/* Uprights - game rules, input and actor direction.
   Rendering lives in scene.js (world) and characters.js (players). World units are yards. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const PH = Physics.POST_HALF, BAR = Physics.BAR_Y, TOP = Physics.TOP_Y, BR = Physics.BALL_R;
  const { P, mix, run, refNoGood } = Characters;
  const V = World.V;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
  const onColor = hex => (lum(hex) > 0.6 ? '#111' : '#fff');

  const CAM_BACK = 14;
  const OP_KICK = 1.28;          // seconds from snap to foot on ball, like a real operation
  // The catch net behind the posts (matches scene.js). K and C: how stiff and how deadening it is.
  const NET = { z: 6, halfW: 7, y0: 2.4, y1: 18, K: 60, C: 9, GRIP: 3 };
  const WIND_K = 0.085;          // sideways push on the ball, yards/s^2 per mph of wind
  const cam = { x: 0, z: -54 };
  const overlay = $('overlay'), ctx = overlay.getContext('2d');
  let W = 0, H = 0;

  /* ---------------- game state ---------------- */
  const g = {
    state: 'menu', t: 0, time: 0, team: null, kick: null,
    score: 0, makes: 0, zone: null, lives: 3, longest: 0,
    aim: 0, power: 0, meter: 0, accErr: 0, accPos: -1, approachDur: 0.55,
    ball: { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, ang: 0, hidden: false, rest: false },
    trail: [], decided: false, good: false, decT: 0, followT: 0, camOff: 0,
    excite: 0, caught: false, lastHash: 0, hashRun: 0, holdU: 0,
  };
  const params = new URLSearchParams(location.search);
  const demoMode = params.get('demo'), demo = demoMode === '1' || demoMode === 'miss';
  const keys = {};
  const camS = { init: false, p: [0, 0, 0], t: [0, 0, 0] };   // smoothed camera position and look target
  const closeUp = ['snapper', 'holder', 'kicker'].includes(params.get('view')) ? params.get('view') : null;

  /* ---------------- world + actors ---------------- */
  let webgl = true;
  try { World.init($('field')); } catch (e) { webgl = false; console.error(e); }
  if (!webgl) {
    document.body.insertAdjacentHTML('beforeend', '<div class="screen"><div class="panel"><h1>3D not available</h1><p class="lead">This game needs WebGL. Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration switched on.</p></div></div>');
    $('selectScreen').classList.add('hidden');
    return;
  }

  const actors = { group: new THREE.Group(), refs: [] };
  const isMx = f => f instanceof Characters.MixamoFigure;
  (function buildActors() {
    Characters.loadMixamo();
    // Built-in player bodies; any role whose Mixamo clips are present is animated by them.
    const mk = (...clips) => (Characters.hasClips(...clips) ? new Characters.RigFigure() : new Characters.Rig());
    actors.kicker = mk('idle', 'kick');
    actors.holder = mk('kneel');
    // The long snapper keeps the built-in posed stance (crouch over the ball, hike, come up to block);
    // the Mixamo hike clip put him in an awkward stance.
    actors.snapper = new Characters.Rig();
    actors.holder.feet = 'ground';           // no foot through the turf
    for (const s of [-1, 1]) {
      const r = new Characters.Rig({ official: true });
      r.place(s * 2.3, 0.9, Math.PI); r.apply(P.STAND);
      actors.refs.push(r); World.scene.add(r.root);
    }
    actors.group.add(actors.kicker.root, actors.holder.root, actors.snapper.root);
    actors.group.visible = false;
    World.scene.add(actors.group);
  })();

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    World.resize(W, H);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- flow ---------------- */
  function startGame(team) {
    AudioFX.init();
    g.team = team;
    const k = team.kicker;
    const range = 60 + (k.leg - 78) * 0.4;             // yards this kicker can reach at full power
    g.vmax = Physics.speedForRange(range);
    g.maxDist = Math.min(65, Math.floor(range) - 2);
    g.dead = 0.05 + (k.acc - 78) * 0.004;              // half-width of the perfect-timing zone
    g.score = 0; g.makes = 0; g.threes = 0; g.ones = 0; g.kicks = 0; g.zone = null; g.lives = 3; g.longest = 0;
    g.kick = null; g.lastHash = 0; g.hashRun = 0;

    const kit = {
      jersey: team.primary, helmet: team.primary, stripe: team.secondary,
      pants: lum(team.secondary) < 0.12 && lum(team.primary) < 0.12 ? '#d9d9d9' : team.secondary,
      numColor: lum(team.primary) > 0.6 ? '#111' : '#fff',
    };
    actors.kicker.setKit({ ...kit, num: k.number });
    actors.holder.setKit({ ...kit, num: 4 });
    actors.snapper.setKit({ ...kit, num: 46 });
    Characters.tintMixamo(kit);
    World.setTeam(team);

    const rs = document.documentElement.style;
    rs.setProperty('--team1', team.primary); rs.setProperty('--on1', onColor(team.primary));
    rs.setProperty('--team2', team.secondary); rs.setProperty('--on2', onColor(team.secondary));
    $('teamAbbr').textContent = team.abbr;
    $('kickerName').textContent = `#${k.number} ${k.name}`;

    $('selectScreen').classList.add('hidden');
    $('overScreen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    actors.group.visible = true;
    AudioFX.ambience();
    nextKick();
  }

  function nextKick() {
    const m = g.makes, prev = g.kick;
    const lo = Math.round(20 + Math.min(m, 10) * 1.5);
    const hi = Math.max(lo + 5, Math.min(g.maxDist, 35 + m * 3));
    let dist, hash;
    do {
      dist = randInt(lo, hi);
      hash = Math.random() < 0.5 ? -1 : 1;
      if (g.hashRun >= 2 && hash === g.lastHash) hash = -hash;   // never three in a row on one hash
    } while (prev && dist === prev.dist && hash === prev.hash);
    g.hashRun = hash === g.lastHash ? g.hashRun + 1 : 1;
    g.lastHash = hash;

    let wind = 0;
    if (m >= 3) {
      // keeps building with every make: 20 mph by the 11th, up to 35 later; never drops far below the current top
      const max = Math.min(35, 5 + (m - 3) * 2);
      wind = Math.round((0.45 + 0.55 * Math.random()) * max) * (Math.random() < 0.5 ? -1 : 1);
    }
    g.kick = {
      dist, hash, wind, bx: hash * PH, bz: -dist, zLOS: -dist + 7.5,
      pMin: Physics.powerForDistance(g.vmax, dist + 0.8),
    };
    g.aim = 0; g.power = 0; g.meter = 0; g.accErr = 0; g.accPos = -1;
    g.decided = false; g.good = false; g.decT = 0; g.followT = 0; g.camOff = 0;
    g.trail = []; g.caught = false; g.holdU = 0; g.look = null; camS.init = false; g.opT = 0;
    Object.assign(g.ball, { x: g.kick.bx, y: 0.1, z: g.kick.zLOS - 0.1, vx: 0, vy: 0, vz: 0, ang: 0, hidden: false, rest: false, netted: false });
    cam.x = g.kick.bx; cam.z = g.kick.bz - CAM_BACK;
    World.setKick(g.kick);
    setState('aim');
    $('banner').classList.add('hidden');
    updateHUD();
    AudioFX.ambience();
  }

  function setState(s) {
    g.state = s; g.t = 0;
    $('snapBtn').classList.toggle('hidden', s !== 'aim');
    $('hint').textContent =
      s === 'aim' ? 'Drag left or right to aim, then press READY' :
      s === 'power' ? 'Tap to set POWER' :
      s === 'accuracy' ? 'Tap in the green for ACCURACY, and the ball is snapped' : '';

    // cue Mixamo clips on the roles that use them
    const cfg = Characters.Mixamo.cfg, { kicker, holder, snapper } = actors;
    const SA = Characters.Mixamo.snap;                        // what the game learned from snap.fbx
    const snapAt = cfg.snapStart != null ? cfg.snapStart : SA ? SA.release : 0;
    if (s === 'aim') {
      if (isMx(kicker)) kicker.play('idle', { fade: 0.3 });
      if (isMx(holder)) holder.play('kneel', { paused: true, fade: 0 });
      if (isMx(snapper)) snapper.play('snap', { paused: true, fade: 0, at: SA ? SA.stance : snapAt });   // set in his stance
      const KA = Characters.Mixamo.kick;                       // what the game learned from kick.fbx
      g.approachDur = isMx(kicker)
        ? clamp((KA ? KA.contact : 0.5 * Characters.Mixamo.clips.kick.duration) / (cfg.kickSpeed || 1), 0.2, 3)
        : 0.55;
    } else if (s === 'snap') {
      if (isMx(snapper)) snapper.play('snap', { once: true, fade: 0.06, at: snapAt, speed: cfg.snapSpeed || 1.5, until: SA ? SA.end + 0.1 : null });
      if (isMx(holder) && cfg.kneelPlay) holder.play('kneel', { once: true, fade: 0.08, at: cfg.kneelStart || 0 });
    } else if (s === 'approach') {
      if (isMx(kicker)) kicker.play('kick', { once: true, fade: 0.12, speed: cfg.kickSpeed || 1 });
    }
  }

  function updateHUD() {
    const k = g.kick;
    $('score').textContent = g.score;
    $('makes').textContent = g.makes;
    $('lives').innerHTML = [0, 1, 2].map(i => `<span class="${i < g.lives ? '' : 'lost'}">🏈</span>`).join('');
    if (!k) return;
    $('sitDist').textContent = `${k.dist} YD`;
    $('sitHash').textContent = k.hash < 0 ? '◀ LEFT HASH' : 'RIGHT HASH ▶';
    $('sitWind').textContent = k.wind === 0 ? 'WIND CALM' : k.wind > 0 ? `WIND ${k.wind} MPH ➡` : `⬅ WIND ${-k.wind} MPH`;
  }

  // Aim is locked in: run the two meters, then the whole operation plays out without stopping.
  function ready() {
    if (g.state !== 'aim') return;
    AudioFX.init();
    AudioFX.tension();
    setState('power');
  }
  function startSnap() {
    g.opT = 0;
    setState('snap');
    AudioFX.snap();
  }

  function lockPower(v) { g.power = clamp(v, 0, 1); AudioFX.blip(false); setState('accuracy'); }
  function lockAccuracy(e) { g.accErr = clamp(e, -1, 1); AudioFX.blip(true); startSnap(); }
  // One input drives the whole kick: tap for power, tap again for accuracy.
  function action() {
    if (g.state === 'power') lockPower(g.meter);
    else if (g.state === 'accuracy') lockAccuracy(g.accPos);
  }

  function strike() {
    const k = g.kick, kr = g.team.kicker, e = g.accErr, w = g.dead;
    let errDeg = 0;
    if (Math.abs(e) > w) errDeg = Math.sign(e) * Math.pow((Math.abs(e) - w) / (1 - w), 1.2) * 16;
    errDeg += (Math.random() * 2 - 1) * (0.15 + (95 - kr.acc) * 0.02);
    const b = Physics.launch(k.bx, k.bz, g.aim + errDeg * Math.PI / 180, Physics.speedAt(g.vmax, g.power));
    Object.assign(g.ball, b, { hidden: false, rest: false, netted: false, ang: 0 });
    g.curve = errDeg * 0.06;                            // a mishit keeps drifting the same way
    g.trail = [];
    g.followT = 0;
    AudioFX.kick(); AudioFX.flight();
    setState('flight');
  }

  // Scoring: the gap between the uprights is split into thirds. Middle third 3 points, outer thirds 1.
  const zoneOf = x => (Math.abs(x) < PH / 3 ? 0 : x < 0 ? -1 : 1);

  function decide(good, msg, x) {
    if (g.decided) return;
    const k = g.kick;
    g.decided = true; g.good = good; g.decT = 0;
    g.kicks++;
    let sub;
    if (good) {
      g.zone = zoneOf(x || 0);
      const pts = g.zone === 0 ? 3 : 1;
      g.score += pts; g.makes++;
      if (pts === 3) g.threes++; else g.ones++;
      g.longest = Math.max(g.longest, k.dist);
      sub = `+${pts}  ·  ${pts === 3 ? 'middle third' : 'outside third'}  ·  ${k.dist} yards`;
      AudioFX.whistle(false); AudioFX.cheer();
      if (isMx(actors.kicker) && Characters.Mixamo.clips.celebrate) actors.kicker.play('celebrate', { fade: 0.35 });
    } else {
      g.lives--; g.zone = null;
      sub = g.lives > 0 ? `${g.lives} ${g.lives === 1 ? 'life' : 'lives'} left` : 'Out of lives';
      AudioFX.whistle(true); AudioFX.groan();
    }
    $('bannerMain').textContent = good ? msg : `NO GOOD — ${msg}`;
    $('bannerSub').textContent = sub;
    $('banner').className = good ? 'good' : 'bad';
    updateHUD();
  }

  /* ---------------- leaderboard ----------------
     Online (shared by everyone) when js/leaderboard-config.js has Supabase details,
     otherwise the top 10 kept in this browser. The device list is always kept too. */
  const LB_KEY = 'fgk_leaderboard', LB_MAX = 10;
  function loadLB() {
    try { const a = JSON.parse(localStorage.getItem(LB_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveLB(list) { try { localStorage.setItem(LB_KEY, JSON.stringify(list)); } catch (e) {} }
  const lbOrder = (a, b) => b.score - a.score || b.threes - a.threes || b.made - a.made || a.t - b.t;
  const qualifies = score => { const l = loadLB(); return score > 0 && (l.length < LB_MAX || score > l[l.length - 1].score); };

  const CFG = window.LEADERBOARD_CONFIG || {};
  const ONLINE = !!(CFG.url && CFG.key);
  function api(path, opts = {}) {
    const h = { apikey: CFG.key, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(CFG.key)) h.Authorization = 'Bearer ' + CFG.key;   // legacy anon key (JWT)
    return fetch(CFG.url.replace(/\/+$/, '') + '/rest/v1/' + path,
      Object.assign({}, opts, { headers: Object.assign(h, opts.headers || {}) }))
      .then(r => { if (!r.ok) throw new Error('leaderboard HTTP ' + r.status); return r; });
  }
  const teamColors = abbr => {
    const t = NFL_TEAMS.find(x => x.abbr === abbr);
    return t ? { c1: t.primary, on1: onColor(t.primary) } : { c1: '#444', on1: '#fff' };
  };
  const fetchOnline = () => api('scores?select=id,name,team,score,threes,ones,made' +
    '&order=score.desc,threes.desc,made.desc,created_at.asc&limit=' + LB_MAX)
    .then(r => r.json()).then(rows => rows.map(r => Object.assign(r, { id: 'o' + r.id }, teamColors(r.team))));
  const postOnline = e => api('scores', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: e.name, team: e.team, score: e.score, threes: e.threes, ones: e.ones, made: e.made, longest: e.longest || 0 }),
  }).then(r => r.json()).then(rows => 'o' + rows[0].id);
  // how many online scores beat this one (for "you're #N")
  const rankOnline = score => api('scores?select=id&score=gt.' + score, { headers: { Prefer: 'count=exact', Range: '0-0' } })
    .then(r => 1 + (parseInt((r.headers.get('content-range') || '').split('/')[1], 10) || 0));

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (n, of) => (of > 0 ? Math.round(100 * n / of) : 0) + '%';
  // a count with its share of all kicks taken; games always end on the 3rd miss,
  // so older entries without a kick count had made + 3 kicks
  const withPct = (n, r) => `${n | 0}<small class="pct">${pct(n | 0, r.kicks || ((r.made | 0) + 3))}</small>`;
  function renderLB(table, meId, list, note) {
    let html = '<tr><th class="l">#</th><th class="l">Name</th><th class="l hideS">Team</th><th>Score</th><th>Middle +3</th><th>Outside +1</th><th>Made</th></tr>';
    if (!list) html += '<tr><td class="empty" colspan="7">Loading…</td></tr>';
    else if (!list.length) html += '<tr><td class="empty" colspan="7">No scores yet. Make some kicks!</td></tr>';
    (list || []).forEach((r, i) => {
      html += `<tr class="${r.id === meId ? 'me' : ''}"><td class="l">${i + 1}</td><td class="l">${esc(r.name)}</td>` +
        `<td class="l tm hideS"><span style="background:${esc(r.c1)};color:${esc(r.on1)}">${esc(r.team)}</span></td>` +
        `<td class="sc">${r.score | 0}</td><td>${withPct(r.threes, r)}</td><td>${withPct(r.ones, r)}</td><td>${withPct(r.made, r)}</td></tr>`;
    });
    if (note) html += `<tr><td class="empty" colspan="7">${esc(note)}</td></tr>`;
    table.innerHTML = html;
  }
  // show the shared board (falls back to this device's list if it can't be reached)
  let lbShowSeq = 0;
  function showLB(table, meId, note) {
    if (!ONLINE) { renderLB(table, meId, loadLB(), note); return; }
    const seq = ++lbShowSeq;
    renderLB(table, meId, null);
    fetchOnline().then(list => { if (seq === lbShowSeq) renderLB(table, meId, list, note); })
      .catch(err => {
        console.warn(err);
        if (seq === lbShowSeq) renderLB(table, meId, loadLB(), 'Online leaderboard unavailable, showing this device.');
      });
  }
  $('lbLead').textContent = ONLINE ? 'Top 10 scores from everyone' : 'Top 10 games on this device';

  let lbPending = null;            // this game's entry, waiting for a name
  $('lbEntry').addEventListener('submit', e => {
    e.preventDefault();
    if (!lbPending) return;
    const name = $('lbName').value.trim().slice(0, 14) || 'Player';
    try { localStorage.setItem('fgk_name', name); } catch (err) {}
    const entry = Object.assign(lbPending, { name });
    lbPending = null;
    $('lbEntry').classList.add('hidden');
    if (qualifies(entry.score)) {
      const list = loadLB();
      list.push(entry);
      list.sort(lbOrder);
      saveLB(list.slice(0, LB_MAX));
    }
    if (!ONLINE) { renderLB($('lbTableOver'), entry.id, loadLB()); return; }
    renderLB($('lbTableOver'), null, null);
    postOnline(entry)
      .then(id => rankOnline(entry.score).then(rank => showLB($('lbTableOver'), id, `${name}, you're #${rank} in the world.`),
                                           () => showLB($('lbTableOver'), id)))
      .catch(err => { console.warn(err); renderLB($('lbTableOver'), entry.id, loadLB(), "Couldn't save online, saved on this device."); });
  });
  $('lbOpenBtn').addEventListener('click', () => { showLB($('lbTable')); $('lbScreen').classList.remove('hidden'); });
  $('lbCloseBtn').addEventListener('click', () => $('lbScreen').classList.add('hidden'));

  function gameOver() {
    setState('over');
    let best = 0;
    try { best = parseInt(localStorage.getItem('fgk_best') || '0', 10) || 0; } catch (e) {}
    const top = loadLB()[0];
    if (top) best = Math.max(best, top.score);
    const isBest = g.score > best;
    if (isBest) { best = g.score; try { localStorage.setItem('fgk_best', String(best)); } catch (e) {} }
    $('overWho').textContent = `${g.team.kicker.name} · ${g.team.city} ${g.team.name}`;
    $('overScore').textContent = g.score;
    $('overMakes').textContent = g.makes;
    $('overThrees').textContent = g.threes;
    $('overOnes').textContent = g.ones;
    $('overMakesPct').textContent = `${pct(g.makes, g.kicks)} of ${g.kicks} kicks`;
    $('overThreesPct').textContent = `${pct(g.threes, g.kicks)} of kicks`;
    $('overOnesPct').textContent = `${pct(g.ones, g.kicks)} of kicks`;
    $('overLong').textContent = g.longest ? `${g.longest} yd` : '—';
    $('overBest').textContent = best;
    $('newBest').classList.toggle('hidden', !isBest || g.score === 0);
    // a score good enough for the top 10 (any score, when the board is online) asks for a name
    lbPending = (ONLINE ? g.score > 0 : qualifies(g.score)) ? {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(),
      team: g.team.abbr, c1: g.team.primary, on1: onColor(g.team.primary),
      score: g.score, threes: g.threes, ones: g.ones, made: g.makes, kicks: g.kicks, longest: g.longest,
    } : null;
    $('lbEntry').classList.toggle('hidden', !lbPending);
    $('lbMsg').textContent = ONLINE ? 'Save your score to the leaderboard' : 'You made the leaderboard!';
    showLB($('lbTableOver'));
    if (lbPending) {
      let last = ''; try { last = localStorage.getItem('fgk_name') || ''; } catch (e) {}
      $('lbName').value = last;
      setTimeout(() => { try { $('lbName').focus(); $('lbName').select(); } catch (e) {} }, 50);
    }
    $('banner').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('overScreen').classList.remove('hidden');
  }

  /* ---------------- ball vs. goalposts ---------------- */
  function crossPlane(x, y) {
    const b = g.ball, ax = Math.abs(x), R = 0.19, side = Math.sign(x) || 1;
    if (Math.abs(y - BAR) < R && ax < PH + R) {                    // crossbar
      AudioFX.doink();
      if (y >= BAR) { b.vy = Math.abs(b.vy) * 0.4 + 3; b.vz *= 0.55; decide(true, 'OFF THE BAR… AND IN!', x); }
      else { b.vz *= -0.35; b.vy *= 0.3; b.z = -0.05; decide(false, 'OFF THE CROSSBAR'); }
    } else if (y > BAR && y < TOP + R && Math.abs(ax - PH) < R) {  // upright
      AudioFX.doink();
      if (ax < PH) { b.vx = -side * (Math.abs(b.vx) * 0.5 + 2); b.vz *= 0.6; decide(true, 'DOINK… AND IN!', x); }
      else { b.vx = side * (Math.abs(b.vx) * 0.5 + 3); b.vz *= 0.3; decide(false, 'OFF THE UPRIGHT'); }
    } else if (ax >= PH) decide(false, x < 0 ? 'WIDE LEFT' : 'WIDE RIGHT');
    else if (y > BAR) decide(true, Math.abs(x) < PH / 3 ? "RIGHT DOWN THE MIDDLE!" : "IT'S GOOD!", x);
    else decide(false, 'SHORT');
  }

  function flyBall(dt) {
    const b = g.ball, k = g.kick;
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    const ax = k.wind * WIND_K + g.curve;
    let moving = false;
    for (let i = 0; i < n; i++) {
      if (b.hidden || b.rest) break;
      moving = true;
      const px = b.x, py = b.y, pz = b.z;
      const airborne = b.y > BR + 0.01 || b.vy > 0;
      Physics.step(b, h, airborne ? ax : 0);
      if (!g.decided && pz < 0 && b.z >= 0) {
        const u = -pz / (b.z - pz);
        crossPlane(px + (b.x - px) * u, py + (b.y - py) * u);
      }
      if (b.y < BR && b.vy < 0) {                                   // hit the turf
        if (!g.decided && b.z < 0) decide(false, 'SHORT');
        b.y = BR; b.vy = -b.vy * 0.42; b.vx *= 0.6; b.vz *= 0.6;
        if (b.vy < 1.2) { b.vy = 0; if (Math.hypot(b.vx, b.vz) < 0.8) b.rest = true; }
      }
      // The catch net stretches like a spring and grips the ball, which then drops out of the pocket.
      if (!b.netted && pz <= NET.z && b.z > NET.z && Math.abs(b.x) < NET.halfW && b.y > NET.y0 && b.y < NET.y1) {
        b.netted = true;
      }
      if (b.netted) {
        const d = b.z - NET.z;
        if (d > 0) {                                        // (keeps hold below the bottom bar too, so the ball drops out in front)
          b.vz += (-NET.K * d - NET.C * b.vz) * h;
          const grip = Math.exp(-NET.GRIP * h);
          b.vx *= grip; if (b.vy > 0) b.vy *= grip;
        }      }
      if (b.z > 9.7) { if (b.y > 2.3) b.hidden = true; else { b.z = 9.7; b.vz = 0; b.vx = 0; } }      // wall / stands
      if (Math.abs(b.x) > 31.7) { if (b.y > 2.3) b.hidden = true; else { b.vx = 0; b.vz *= 0.5; } }
    }
    if (moving) b.ang += dt * Math.min(14, 2 + Math.hypot(b.vx, b.vy, b.vz) * 0.5);
    const last = g.trail[g.trail.length - 1];
    if (!b.hidden && (!last || Math.hypot(b.x - last.x, b.y - last.y, b.z - last.z) > 0.7)) {
      g.trail.push({ x: b.x, y: b.y, z: b.z });
    }
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    g.time += dt; g.t += dt;
    const k = g.kick;
    if (!k) return;
    const b = g.ball;

    if (g.state === 'aim') {
      const dir = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
      if (dir) g.aim = clamp(g.aim + dir * dt * 0.12, -0.26, 0.26);
      // (testing aid: &missafter=N makes the self-play start missing after N makes, to reach game over with a score)
      if (demo && g.t > 0.9) { g.aim = demoMode === 'miss' || g.makes >= (+params.get('missafter') || 1e9) ? -0.26 : Math.atan2(-k.bx - 0.5 * k.wind * WIND_K * Math.pow(0.35 + k.dist * 0.052, 2), k.dist); ready(); }
    } else if (g.state === 'snap' || g.state === 'approach') {
      // Snap, catch, placement and run-up overlap: the kicker starts moving so that his foot
      // arrives OP_KICK seconds after the snap, just as the ball is set down.
      g.opT += dt;
      const t = g.opT;
      const from = { x: k.bx, y: 0.2, z: k.zLOS - 0.1 }, hands = { x: k.bx + 0.12, y: 0.62, z: k.bz };
      if (t < 0.65) {
        const u = t / 0.65;
        b.x = lerp(from.x, hands.x, u); b.z = lerp(from.z, hands.z, u);
        b.y = lerp(from.y, hands.y, u) + Math.sin(u * Math.PI) * 0.22;
        b.ang = t * 34;
      } else {
        if (!g.caught) { g.caught = true; AudioFX.catchBall(); }
        const u = ease((t - 0.65) / 0.3);
        b.x = lerp(hands.x, k.bx, u); b.y = lerp(hands.y, 0.158, u); b.z = k.bz;
        g.holdU = u;
      }
      if (g.state === 'snap') { if (t >= Math.max(0.25, OP_KICK - g.approachDur)) setState('approach'); }
      else if (g.t >= g.approachDur && t >= 1.0) strike();
    } else if (g.state === 'power') {
      const ph = g.t / 0.7, c = ph % 2;
      g.meter = c < 1 ? c : 2 - c;
      if (ph >= 4) lockPower(0.2);                                  // hesitated too long
      else if (demo && ph < 1 && g.meter >= Math.min(0.97, k.pMin + 0.08)) lockPower(g.meter);
    } else if (g.state === 'accuracy') {
      const T = 1.05 - 0.45 * g.power, ph = g.t / T;
      g.accPos = ph < 1 ? -1 + 2 * ph : ph < 2 ? 1 - 2 * (ph - 1) : -1;
      if (ph >= 2) lockAccuracy(-1);
      else if (demo && ph < 1 && g.accPos >= -0.03) lockAccuracy(g.accPos);
    } else if (g.state === 'flight') {
      g.followT += dt;
      flyBall(dt);
      if (!b.hidden) g.look = { x: b.x, y: b.y, z: b.z };
      const target = clamp((b.z - k.bz) * 0.6, 0, k.dist * 0.62);
      g.camOff += (target - g.camOff) * Math.min(1, dt * 3);
      cam.z = k.bz - CAM_BACK + g.camOff;
      if (g.decided) {
        g.decT += dt;
        if (g.decT > 2.7) { if (g.lives <= 0) gameOver(); else nextKick(); }
      } else if (g.followT > 9) decide(false, 'SHORT');             // safety net
    }

    const want = g.state === 'flight' && g.decided && g.good ? 1 : 0;
    g.excite += (want - g.excite) * Math.min(1, dt * 4);
  }

  /* ---------------- directing the actors ---------------- */
  const heading = (dx, dz) => Math.atan2(-dx, dz);
  const after0 = st => st === 'flight' || st === 'over';     // rotation.y that faces a player along (dx, dz)

  function kickerPose() {
    const st = g.state;
    if (st === 'approach') {
      const u = g.t / g.approachDur;
      if (u < 0.6) return mix(P.K_READY, run(u / 0.6 * Math.PI * 2), u / 0.12);
      if (u < 0.85) return mix(run(0), P.K_BACK, ease((u - 0.6) / 0.25));
      return mix(P.K_BACK, P.K_CONTACT, (u - 0.85) / 0.15);
    }
    if (st === 'flight' || st === 'over') {
      const t = g.followT;
      let p = t < 0.18 ? mix(P.K_CONTACT, P.K_FOLLOW, ease(t / 0.18)) : mix(P.K_FOLLOW, P.STAND, ease((t - 0.4) / 0.6));
      if (g.decided && g.good) {
        const c = ease(g.decT / 0.35);
        p = mix(p, P.CELEB, c);
        p.hy = (p.hy || 0) + Math.abs(Math.sin(g.decT * 9)) * 0.1 * c;
      } else if (g.decided) p = mix(p, P.DEJECT, ease(g.decT / 0.6));
      return p;
    }
    const p = mix(P.K_READY, P.K_READY, 0);
    p.sx += Math.sin(g.time * 1.6) * 0.012;              // breathing
    return p;
  }

  function directActors(dt) {
    const k = g.kick, b = g.ball, st = g.state;
    const pre = st === 'aim' || st === 'power' || st === 'accuracy';      // before the snap
    const op = st === 'snap' || st === 'approach';                         // snap-hold-kick in progress
    const tSnap = op ? g.opT : pre ? 0 : 9;
    const { kicker, holder, snapper } = actors;

    // --- kicker: waits three steps back and two to the side, then runs through the ball
    const K0 = { x: k.bx - 1.9, z: k.bz - 3.2 }, K1 = { x: k.bx - 0.3, z: k.bz - 0.32 }, K2 = { x: k.bx + 0.3, z: k.bz + 1.1 };
    const hA = heading(K1.x - K0.x, K1.z - K0.z);
    let kx = K0.x, kz = K0.z, kh = hA;
    if (st === 'approach') {
      const u = clamp(g.t / g.approachDur, 0, 1);
      kx = lerp(K0.x, K1.x, u); kz = lerp(K0.z, K1.z, u);
    } else if (st === 'flight' || st === 'over') {
      const f = ease(g.followT / 0.7);
      kx = lerp(K1.x, K2.x, f); kz = lerp(K1.z, K2.z, f); kh = lerp(hA, -0.08, f);
    }
    const KA = Characters.Mixamo.kick;
    if (isMx(kicker) && KA) {
      // Follow the clip's own run-up, started from wherever puts the kicking foot on the ball at contact.
      const sp = Characters.Mixamo.cfg.kickSpeed || 1, th = Characters.Mixamo.cfg.kickAngle == null ? -0.4 : Characters.Mixamo.cfg.kickAngle;
      const ct = st === 'approach' ? g.t * sp : st === 'flight' || st === 'over' ? (g.approachDur + g.followT) * sp : 0;
      const tv = KA.travelAt(ct), tc = KA.travelAt(KA.contact);
      const pre = ct > KA.contact ? tc : tv, lx = pre.x - KA.strike.x, lf = pre.f - KA.strike.f;
      kx = k.bx + lx * Math.cos(th) - lf * Math.sin(th);
      kz = k.bz + lx * Math.sin(th) + lf * Math.cos(th);
      if (ct > KA.contact) {                                // after the strike: half the travel, veering away from the holder
        const th2 = 0.3, dx = (tv.x - tc.x) * 0.5, df = (tv.f - tc.f) * 0.5;
        kx += dx * Math.cos(th2) - df * Math.sin(th2);
        kz += dx * Math.sin(th2) + df * Math.cos(th2);
      }
      kh = th;
      if (ct > KA.contact) kh = th + 0.5 * ease((ct - KA.contact) / 0.3);   // square up so the follow-through clears the holder
      if ((st === 'flight' || st === 'over') && kicker.name === 'kick' && ct > KA.duration + 0.15 && !(g.decided && g.good && Characters.Mixamo.clips.celebrate)) {
        kicker.play('idle', { fade: 0.4 });
      }
    }
    kicker.place(kx, kz, kh);
    if (!isMx(kicker)) kicker.apply(kickerPose());

    // --- holder: kneels beside the spot, facing the kicker's side
    holder.place(k.bx + (isMx(holder) ? 0.8 : 0.7), k.bz, Math.PI / 2);
    if (isMx(holder)) holder.setLean(after0(st) ? 0.1 : 0.38);             // leans in to reach the ball, sits back after the kick
    const held = op && g.opT >= 0.55;
    const after = st === 'flight' || st === 'over';
    if (isMx(holder)) {
      // hands out as a target, both hands to the catch, then the near hand's fingertip on top of the ball
      if (held) {
        const down = g.holdU >= 1;
        holder.reach('l', V(b.x + 0.07, b.y + (down ? 0.26 : 0.08), b.z + 0.03));   // targets are for the wrist; fingers reach further
        holder.reach('r', down ? null : V(b.x + 0.09, b.y + 0.1, b.z + 0.12));
      } else if (!after) {
        holder.reach('r', V(k.bx + 0.2, 0.7, k.bz + 0.42)); holder.reach('l', V(k.bx + 0.2, 0.7, k.bz + 0.24));
      } else {                                                        // pull the hands back out of the kicker's way
        holder.reach('r', V(k.bx + 0.42, 0.5, k.bz + 0.12)); holder.reach('l', V(k.bx + 0.42, 0.5, k.bz - 0.12));
      }
    } else {
      const pose = mix(P.KNEEL, P.KNEEL, 0);
      pose.sy = after ? -0.45 : held ? -0.1 * (1 - g.holdU) : -0.45;       // turn toward the snap, then the ball
      pose.hdy = after ? -0.7 : 0; pose.hx = after ? 0.05 : 0.35;
      pose.lsz = -0.1; pose.lsx = 0.9; pose.le = 0.5; pose.rsx = 0.9; pose.rsz = 0.1; pose.re = 0.4;
      holder.apply(pose);
      if (held) {
        const top = V(b.x, b.y + 0.17, b.z);
        holder.pointArm(1, top);
        if (g.holdU < 1) holder.pointArm(-1, top);                         // two hands until it is down
      } else if (!after) {
        const tgt = V(k.bx + 0.2, 0.68, k.bz + 0.5);                        // hands out: a target for the snapper
        holder.pointArm(1, tgt); holder.pointArm(-1, tgt);
      }
    }

    // --- long snapper: over the ball, fires it back, then comes up to block
    const SA = Characters.Mixamo.snap;
    if (isMx(snapper) && SA) {
      // turn him to face the goal whatever way the clip faces, and put the ball between his hands
      const h = SA.turn, c = Math.cos(h), s = Math.sin(h), hx = SA.hands.x, hz = SA.hands.z;
      snapper.place(k.bx - (hx * c + hz * s), k.zLOS - 0.1 + (-hx * s + hz * c), snapper.cur ? SA.turnAt(snapper.cur.time) : h);
    } else snapper.place(k.bx, k.zLOS - 0.72, 0);
    if (!isMx(snapper)) {
      let p = P.CROUCH;
      if (tSnap > 0) p = tSnap < 0.12 ? mix(P.CROUCH, P.SNAP, tSnap / 0.12) : mix(P.SNAP, P.BLOCK, ease((tSnap - 0.14) / 0.4));
      snapper.apply(p);
    }
    kicker.update(dt); holder.update(dt); snapper.update(dt);

    // --- officials under the posts
    for (const r of actors.refs) {
      let p = P.STAND;
      if (g.decided) p = mix(P.STAND, g.good ? P.REF_GOOD : refNoGood(g.decT), ease(g.decT / 0.25));
      r.apply(p);
    }

    // --- ball, guide, camera
    const mode = pre ? 'ground' : op && g.opT < 0.65 ? 'snap' : st === 'flight' || st === 'over' ? 'flight' : 'hold';
    World.setBall(b, mode, mode === 'snap' ? b.ang : g.holdU);
    World.setTrail(st === 'flight' ? g.trail : []);
    const aiming = st === 'aim' ? 0.9 : pre || op ? 0.35 : 0;
    World.setAim(k, g.aim, aiming);
    // scoring thirds between the uprights: only once the ball is in the air
    World.setZones(st === 'flight', g.decided && g.good ? g.zone : null);
  }

  /* ---------------- meters (2D overlay) ---------------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }
  function drawMeters() {
    ctx.clearRect(0, 0, W, H);
    if (!g.kick || !['power', 'accuracy', 'snap', 'approach'].includes(g.state)) return;
    const k = g.kick, mw = Math.min(440, W * 0.86), x = (W - mw) / 2, h = 22, y = H - 112;
    ctx.fillStyle = 'rgba(8,12,22,0.8)'; rr(x - 12, y - 24, mw + 24, 106, 12);
    ctx.font = '700 11px "Segoe UI", Arial, sans-serif'; ctx.textBaseline = 'alphabetic';

    const pv = g.state === 'power' ? g.meter : g.power;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText('POWER  ·  get past the white line', x, y - 7);
    ctx.textAlign = 'right'; ctx.fillText(`${Math.round(pv * 100)}%`, x + mw, y - 7);
    ctx.fillStyle = '#0c1220'; ctx.fillRect(x, y, mw, h);
    const pg = ctx.createLinearGradient(x, 0, x + mw, 0);
    pg.addColorStop(0, '#2ecc71'); pg.addColorStop(0.65, '#f1c40f'); pg.addColorStop(1, '#e74c3c');
    ctx.fillStyle = pg; ctx.fillRect(x, y, mw * pv, h);
    const mx = x + mw * clamp(k.pMin, 0, 1);                          // least power that reaches the bar
    ctx.fillStyle = '#fff'; ctx.fillRect(mx - 1.5, y - 4, 3, h + 8);

    const y2 = y + 46, cx = x + mw / 2;
    ctx.textAlign = 'left'; ctx.fillStyle = g.state === 'power' ? 'rgba(255,255,255,0.4)' : '#fff';
    ctx.fillText('ACCURACY  ·  stop in the green', x, y2 - 7);
    const ag = ctx.createLinearGradient(x, 0, x + mw, 0);
    ag.addColorStop(0, '#e74c3c'); ag.addColorStop(0.3, '#f1c40f'); ag.addColorStop(0.5, '#f7e27a'); ag.addColorStop(0.7, '#f1c40f'); ag.addColorStop(1, '#e74c3c');
    ctx.globalAlpha = g.state === 'power' ? 0.35 : 1;
    ctx.fillStyle = ag; ctx.fillRect(x, y2, mw, h);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(cx - g.dead * mw / 2, y2, g.dead * mw, h);
    if (g.state !== 'power') {
      const pos = g.state === 'accuracy' ? g.accPos : g.accErr;
      ctx.fillStyle = '#fff'; ctx.fillRect(cx + pos * mw / 2 - 2.5, y2 - 5, 5, h + 10);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(cx + pos * mw / 2 - 2.5, y2 - 5, 5, h + 10);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- camera ---------------- */
  // Behind the kicker until the ball is struck, then it rises, drifts and turns to follow the flight.
  function updateCamera(dt) {
    const p = [cam.x, 4.5, cam.z], t = [cam.x, 4.5 - Math.tan(0.125) * 30, cam.z + 30];
    const k = g.kick, b = g.look;
    if (k && b && (g.state === 'flight' || g.state === 'over')) {
      const w = ease(g.followT / 0.7);
      p[0] += (b.x - k.bx) * 0.55 * w;
      p[1] += Math.min(6, b.y * 0.38) * w;
      let lx = b.x, ly = Math.max(1.5, b.y), lz = Math.max(b.z, p[2] + 14);
      if (g.decided) {                                        // settle back on the posts and the officials
        const s = ease((g.decT - 0.5) / 1.0) * 0.6;
        lx = lerp(lx, 0, s); ly = lerp(ly, BAR, s); lz = lerp(lz, 0, s);
      }
      const f = 0.88 * w;
      t[0] = lerp(t[0], lx, f); t[1] = lerp(t[1], ly, f); t[2] = lerp(t[2], lz, f);
    }
    const a = camS.init ? Math.min(1, dt * 7) : 1;
    for (let i = 0; i < 3; i++) { camS.p[i] += (p[i] - camS.p[i]) * a; camS.t[i] += (t[i] - camS.t[i]) * a; }
    camS.init = true;
    World.setCamera(camS.p[0], camS.p[1], camS.p[2], camS.t[0], camS.t[1], camS.t[2]);
  }

  /* ---------------- main loop ---------------- */
  let lastT = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0);
    lastT = ts;
    if (g.state !== 'menu' && g.state !== 'over') update(dt); else g.time += dt;
    if (g.kick) directActors(dt);
    updateCamera(dt);
    if (params.get('view') === 'net' && g.kick) {          // testing aid: a fixed camera on the catch net
      World.lookFrom([g.ball.x + 4, 3.2, NET.z - 5], [g.ball.x, 3, NET.z + 0.5]);
    }
    if (closeUp && g.kick) {                              // testing aid: ?view=snapper|holder|kicker
      const a = actors[closeUp].root.position;
      const ox = +(params.get('vx') || -2.2), oz = +(params.get('vz') || -3.2);   // optional camera offset
      World.lookFrom([a.x + ox, 1.6, -a.z + oz], [a.x, 0.9, -a.z]);
    }
    World.update(dt, g.excite, g.kick ? g.ball : null);
    World.render();
    drawMeters();
    requestAnimationFrame(frame);
  }

  /* ---------------- input ---------------- */
  let drag = null;
  overlay.addEventListener('pointerdown', e => {
    AudioFX.init();
    if (g.state === 'aim') {
      drag = { x: e.clientX, aim: g.aim };
      try { overlay.setPointerCapture(e.pointerId); } catch (err) {}
    } else action();
    e.preventDefault();
  });
  overlay.addEventListener('pointermove', e => {
    if (drag && g.state === 'aim') {
      const F = Math.min(Math.max(W * 0.85, H * 0.75), H * 1.45);
      g.aim = clamp(drag.aim + (e.clientX - drag.x) / F, -0.26, 0.26);
    }
  });
  const endDrag = () => { drag = null; };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { keys[e.code] = true; e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && g.state !== 'menu' && g.state !== 'over') {
      e.preventDefault();
      if (g.state === 'aim') ready(); else action();
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  $('snapBtn').addEventListener('click', e => { e.currentTarget.blur(); ready(); });
  // leaving the game-over screen saves a leaderboard score that wasn't saved yet
  const commitLB = () => { if (lbPending) $('lbEntry').requestSubmit(); };
  $('againBtn').addEventListener('click', () => { commitLB(); startGame(g.team); });
  $('changeBtn').addEventListener('click', () => { commitLB(); showSelect(); });

  const muteBtn = $('muteBtn');
  const paintMute = () => { muteBtn.textContent = AudioFX.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { AudioFX.init(); AudioFX.setMuted(!AudioFX.isMuted()); paintMute(); muteBtn.blur(); });
  paintMute();

  /* ---------------- team select ---------------- */
  function showSelect() {
    g.state = 'menu'; g.kick = null;
    actors.group.visible = false;
    World.setKick(null);
    cam.x = 0; cam.z = -54;
    AudioFX.silence();
    $('hud').classList.add('hidden');
    $('overScreen').classList.add('hidden');
    $('selectScreen').classList.remove('hidden');
  }

  function buildSelect() {
    const root = $('confs');
    for (const conf of ['AFC', 'NFC']) {
      const c = document.createElement('div'); c.className = 'conf';
      c.innerHTML = `<h2>${conf}</h2>`;
      const divs = document.createElement('div'); divs.className = 'divs';
      for (const dv of ['East', 'North', 'South', 'West']) {
        const d = document.createElement('div'); d.className = 'division';
        d.innerHTML = `<h3>${conf} ${dv}</h3>`;
        for (const t of NFL_TEAMS.filter(t => t.conf === conf && t.div === dv)) {
          const b = document.createElement('button');
          b.className = 'team';
          b.style.setProperty('--c1', t.primary); b.style.setProperty('--c2', t.secondary);
          b.style.setProperty('--on', onColor(t.primary));
          const tn = document.createElement('span'); tn.className = 'tn'; tn.textContent = `${t.city} ${t.name}`;
          const kn = document.createElement('span'); kn.className = 'kn'; kn.textContent = `#${t.kicker.number} ${t.kicker.name}`;
          const rt = document.createElement('span'); rt.className = 'rt'; rt.textContent = `LEG ${t.kicker.leg} · ACC ${t.kicker.acc}`;
          b.append(tn, kn, rt);
          b.addEventListener('click', () => startGame(t));
          d.appendChild(b);
        }
        divs.appendChild(d);
      }
      c.appendChild(divs); root.appendChild(c);
    }
  }

  buildSelect();
  World.setKick(null);
  const pre = NFL_TEAMS.find(t => t.abbr === (params.get('team') || '').toUpperCase());
  if (pre) startGame(pre);
  // Testing aid: ?team=DAL&demo=1&ff=200 plays itself and skips ahead 200 frames.
  // Add &until=snap (or another state) to first skip ahead to that state; ff then counts from there.
  const until = params.get('until');
  for (let i = 0; until && g.kick && g.state !== until && i < 20000; i++) { update(1 / 60); directActors(1 / 60); }
  if (params.get('lbname') && g.state === 'over' && lbPending) { $('lbName').value = params.get('lbname'); $('lbEntry').requestSubmit(); }   // testing aid
  for (let i = +params.get('ff') || 0; i > 0 && g.kick; i--) {
    if (g.state !== 'over') { update(1 / 60); if (g.kick) directActors(1 / 60); updateCamera(1 / 60); World.update(1 / 60, g.excite, g.ball); }
  }
  requestAnimationFrame(frame);
})();
