/* Agent Village: isometric drawing engine for the DESIGN PROTOTYPE.
   Not production code. Every prop and bot is drawn as a separate asset
   with its own anchor, so the scene stays layered (never a flat image). */
(function (G) {
  const TW = 64, TH = 32, ZH = 38;            // 2:1 isometric, px per world unit
  const P = (x, y, z = 0) => [(x - y) * TW / 2, (x + y) * TH / 2 - z * ZH];
  const f = n => Math.round(n * 10) / 10;
  const pts = a => a.map(p => { const q = P(p[0], p[1], p[2] || 0); return f(q[0]) + ',' + f(q[1]); }).join(' ');

  /* ---------- colour ---------- */
  const h2r = h => { h = h.replace('#', ''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const r2h = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const lt = (c, t) => mix(c, '#ffffff', t), dk = (c, t) => mix(c, '#05060a', t);

  /* ---------- tokens shared with the UI ---------- */
  const STATE = {
    working:  { c: '#00BA7C', label: 'Actif' },
    idle:     { c: '#8B98A5', label: 'Inactif' },
    approval: { c: '#FFAD1F', label: 'Approbation' },
    input:    { c: '#1D9BF0', label: 'Question' },
    error:    { c: '#F4212E', label: 'Erreur' },
    offline:  { c: '#536471', label: 'Hors ligne' }
  };
  const SOURCE = {
    cli:   { kind: 'term',    body: '#D98B6A', label: 'Claude Code CLI', short: 'CLI' },
    codex: { kind: 'capsule', body: '#AFC0DE', label: 'Codex',           short: 'Codex' },
    app:   { kind: 'orb',     body: '#E6DCC6', label: 'App Claude',      short: 'App' }
  };
  const MAT = {
    floor: '#8E5D3F', plank: '#6E452E', wall: '#4A5070', wallTop: '#6A7194',
    deskTop: '#D9C8A8', metal: '#2B2F3A', screenBack: '#2A2F3B',
    platform: '#1A1D27', path: '#2E3343', pot: '#6C7590', leaf: '#4F9A6E', trunk: '#5B3F2E'
  };

  /* ---------- defs registry ---------- */
  let DEFS = new Map();
  const def = (id, s) => { if (!DEFS.has(id)) DEFS.set(id, s); return `url(#${id})`; };
  const takeDefs = () => { const s = [...DEFS.values()].join(''); DEFS = new Map(); return s; };
  const cid = c => c.replace('#', '');

  /* ---------- primitives ---------- */
  function box(x, y, z, w, d, h, c, o = {}) {
    const top = o.top || lt(c, .10), L = o.left || c, R = o.right || dk(c, .24);
    let s = '';
    if (h > 0) {
      s += `<polygon points="${pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])}" fill="${L}"/>`;
      s += `<polygon points="${pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])}" fill="${R}"/>`;
    }
    s += `<polygon points="${pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])}" fill="${top}"/>`;
    if (!o.noEdge) s += `<polyline points="${pts([[x, y + d, z + h], [x + w, y + d, z + h], [x + w, y, z + h]])}" fill="none" stroke="${lt(top, .35)}" stroke-width="1" stroke-opacity=".5"/>`;
    return s;
  }
  const faceY = (y, x1, x2, z1, z2, fill, ex = '') => `<polygon points="${pts([[x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2]])}" fill="${fill}" ${ex}/>`;
  const faceX = (x, y1, y2, z1, z2, fill, ex = '') => `<polygon points="${pts([[x, y1, z1], [x, y2, z1], [x, y2, z2], [x, y1, z2]])}" fill="${fill}" ${ex}/>`;
  const quad = (x, y, w, d, z, fill, ex = '') => `<polygon points="${pts([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]])}" fill="${fill}" ${ex}/>`;
  const line3 = (a, b, st, sw = 1, ex = '') => { const p = P(...a), q = P(...b); return `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${st}" stroke-width="${sw}" ${ex}/>`; };
  const ell = (x, y, z, r, fill, ex = '') => { const p = P(x, y, z); return `<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${f(r * TW / 2 * Math.SQRT2)}" ry="${f(r * TH / 2 * Math.SQRT2)}" fill="${fill}" ${ex}/>`; };
  const dot = (x, y, z, r, fill, ex = '') => { const p = P(x, y, z); return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${r}" fill="${fill}" ${ex}/>`; };

  function cyl(x, y, z, r, h, c, o = {}) {
    const g = def('cg' + cid(c), `<linearGradient id="cg${cid(c)}" x1="0" x2="1"><stop offset="0" stop-color="${lt(c, .12)}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${dk(c, .32)}"/></linearGradient>`);
    const b = P(x, y, z), t = P(x, y, z + h), rx = r * TW / 2 * Math.SQRT2, ry = r * TH / 2 * Math.SQRT2;
    return `<path d="M${f(b[0] - rx)},${f(t[1])} L${f(b[0] - rx)},${f(b[1])} A${f(rx)},${f(ry)} 0 0 0 ${f(b[0] + rx)},${f(b[1])} L${f(b[0] + rx)},${f(t[1])} Z" fill="${g}"/>` +
      `<ellipse cx="${f(t[0])}" cy="${f(t[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="${o.top || lt(c, .16)}"/>`;
  }
  function gem(x, y, z, a, c) {
    const p = P(x, y, z), v = a * .78, ox = p[0], oy = p[1] - v / 2;
    const T = (dx, dy) => f(ox + dx) + ',' + f(oy + dy);
    return `<polygon points="${T(0, -a)} ${T(a, -a / 2)} ${T(0, 0)} ${T(-a, -a / 2)}" fill="${lt(c, .18)}"/>` +
      `<polygon points="${T(-a, -a / 2)} ${T(0, 0)} ${T(0, v)} ${T(-a, -a / 2 + v)}" fill="${c}"/>` +
      `<polygon points="${T(0, 0)} ${T(a, -a / 2)} ${T(a, -a / 2 + v)} ${T(0, v)}" fill="${dk(c, .28)}"/>`;
  }
  const shadow = (x, y, r, op = .32) => ell(x, y, 0.005, r, `rgba(0,0,0,${op})`, 'filter="url(#soft)"');
  const pool = (x, y, z, r, c, op = .5) => {
    const g = def('pl' + cid(c) + Math.round(op * 100), `<radialGradient id="pl${cid(c)}${Math.round(op * 100)}"><stop offset="0" stop-color="${c}" stop-opacity="${op}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`);
    return ell(x, y, z, r, g, 'style="mix-blend-mode:screen"');
  };
  const BASE_DEFS = `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>`;

  /* ---------- props (each one = a future PNG asset) ---------- */
  const A = {};
  A.plant = (x, y) => shadow(x, y, .22) + cyl(x, y, 0, .16, .3, MAT.pot) + gem(x - .05, y + .05, .55, 10, MAT.leaf) + gem(x + .08, y - .06, .72, 9, lt(MAT.leaf, .06)) + gem(x, y, .92, 7, lt(MAT.leaf, .12));
  A.tree = (x, y) => shadow(x, y, .45, .35) + cyl(x, y, 0, .07, .6, MAT.trunk) + gem(x, y, .95, 19, '#3F8A62') + gem(x + .05, y - .05, 1.55, 14, '#4C9A70') + gem(x, y, 2.05, 9, '#5BAA7E');
  A.lamp = (x, y, warm = '#FFC98A') => shadow(x, y, .2) + cyl(x, y, 0, .14, .05, MAT.metal) + cyl(x, y, .05, .025, 1.45, '#3A3F4D') + cyl(x, y, 1.45, .16, .2, '#F3E6D0', { top: '#FFF6E6' }) + pool(x, y, 1.55, .35, warm, .6);
  A.post = (x, y) => shadow(x, y, .18) + cyl(x, y, 0, .06, 1.9, '#3A3F4D') + box(x - .13, y - .13, 1.9, .26, .26, .16, '#2C303C') + dot(x, y, 1.82, 5, '#FFE3B0') + pool(x, y, 1.8, .5, '#FFD9A0', .55);
  A.desk = (x, y, st) => {
    const sc = STATE[st] ? STATE[st].c : '#666';
    const on = st !== 'offline';
    let s = shadow(x + .65, y + .33, .7, .28);
    [[.05, .05], [1.19, .05], [.05, .54], [1.19, .54]].forEach(([a, b]) => s += box(x + a, y + b, 0, .06, .06, .7, MAT.metal, { noEdge: 1 }));
    s += box(x, y, .7, 1.3, .65, .06, MAT.deskTop);
    if (on) s += quad(x + .1, y + .05, .9, .45, .765, sc, `opacity=".16" style="mix-blend-mode:screen"`);
    s += box(x + .5, y + .26, .76, .07, .07, .12, MAT.metal, { noEdge: 1 });
    s += box(x + .18, y + .22, .86, .72, .07, .44, MAT.screenBack);
    s += faceY(y + .2901, x + .78, x + .84, .92, .95, on ? sc : '#3a3f4a', on ? `class="led"` : '');
    if (on) s += pool(x + .55, y + .1, 1.2, .6, sc, .45);
    s += cyl(x + 1.12, y + .48, .76, .045, .09, '#E7E2D8');
    return s;
  };
  A.rug = (x, y, r, c) => ell(x, y, .006, r, c, 'opacity=".55"') + ell(x, y, .007, r * .78, lt(c, .12), 'opacity=".35"');
  A.shelf = (x, y, d, accent) => {
    let s = box(x, y, 0, .45, d, 1.9, '#5A3E2E');
    const spines = ['#C46B5A', '#E2B65C', '#6B8FB8', '#8C7AB8', '#5FA38A', '#D9D2C2', accent];
    [.15, .6, 1.05, 1.5].forEach((z, row) => {
      s += faceX(x + .451, y + .05, y + d - .05, z - .04, z, '#3C281C');
      let yy = y + .08, i = row;
      while (yy < y + d - .12) { const w = .07 + ((i * 37) % 5) * .012, hh = .26 + ((i * 13) % 4) * .03; s += faceX(x + .452, yy, yy + w, z, z + hh, spines[i % spines.length]); yy += w + .015; i++; }
    });
    return s;
  };
  A.graphBoard = (x1, x2, z1, z2, accent) => {
    let s = faceY(.001, x1, x2, z1, z2, '#1C2033') + faceY(.002, x1 + .05, x2 - .05, z1 + .05, z2 - .05, '#232842');
    const N = [[.15, .7], [.35, .3], [.5, .65], [.7, .35], [.85, .7], [.3, .8], [.62, .85]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 3], [2, 5], [2, 6], [6, 4]];
    const pt = n => [x1 + (x2 - x1) * N[n][0], .003, z1 + (z2 - z1) * N[n][1]];
    E.forEach(([a, b]) => s += line3(pt(a), pt(b), accent, 1.2, 'opacity=".75"'));
    N.forEach((_, i) => s += dot(...pt(i), i === 2 ? 4 : 2.6, i === 2 ? '#fff' : accent));
    return s;
  };
  A.lockers = (x, n, accent) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const xx = x + i * .38; s += box(xx, .05, 0, .36, .45, 1.75, '#5C6684');
      s += line3([xx + .18, .501, .1], [xx + .18, .501, 1.65], '#3F4760', 1);
      [1.45, 1.38].forEach(z => s += line3([xx + .05, .501, z], [xx + .14, .501, z], '#3F4760', 1));
      s += dot(xx + .3, .5, .9, 1.6, accent);
    }
    return s;
  };
  A.safe = (x, y) => shadow(x + .4, y + .4, .55) + box(x, y, 0, .8, .8, .85, '#3E4458') + faceY(y + .801, x + .1, x + .7, .1, .75, '#4A5169') + (() => { const p = P(x + .4, y + .8, .45); return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="7" fill="#C9CFDD"/><circle cx="${f(p[0])}" cy="${f(p[1])}" r="3" fill="#6B7390"/>`; })();
  A.shield = (y1, y2, z1, z2, accent) => {
    const m = (y1 + y2) / 2, pt = (y, z) => [0.002, y, z];
    return faceX(.001, y1 - .1, y2 + .1, z1 - .1, z2 + .1, '#262B40') + `<polygon points="${pts([pt(y1, z2), pt(y2, z2), pt(y2, (z1 + z2) / 2), pt(m, z1), pt(y1, (z1 + z2) / 2)])}" fill="${accent}" opacity=".85"/>`;
  };
  A.pegboard = (x1, x2, z1, z2, accent) => {
    let s = faceY(.001, x1, x2, z1, z2, '#6B5A48');
    for (let x = x1 + .1; x < x2 - .05; x += .16) for (let z = z1 + .08; z < z2 - .05; z += .14) s += dot(x, .002, z, .8, '#4E4134');
    const tools = [[.15, .55, '#C9CFDD'], [.3, .7, accent], [.48, .5, '#E2B65C'], [.62, .65, '#C9CFDD'], [.8, .55, '#C46B5A']];
    tools.forEach(([t, hh, c]) => { const x = x1 + (x2 - x1) * t; s += faceY(.003, x - .03, x + .03, z2 - .12 - (z2 - z1) * hh, z2 - .12, c); });
    return s;
  };
  A.bench = (x, y, d) => box(x, y, 0, .6, d, .72, '#6E4A33') + box(x + .1, y + .2, .72, .3, .25, .12, '#8A93A8') + cyl(x + .3, y + d - .4, .72, .1, .18, '#C46B5A');
  A.spool = (x, y) => shadow(x, y, .3) + cyl(x, y, 0, .28, .08, '#7A5A3E') + cyl(x, y, .08, .18, .3, '#3E7CB1') + cyl(x, y, .38, .28, .08, '#7A5A3E');
  A.rack = (x, y) => {
    let s = shadow(x + .3, y + .28, .5) + box(x, y, 0, .6, .55, 1.95, '#252A36');
    for (let z = .2; z < 1.85; z += .17) { s += faceY(y + .551, x + .05, x + .55, z, z + .12, '#313848'); [.1, .17, .24].forEach((t, i) => s += faceY(y + .552, x + t, x + t + .035, z + .04, z + .08, i === 0 ? '#00BA7C' : '#7DA7FF', `class="blink b${(Math.round(z * 10) + i) % 4}"`)); }
    return s;
  };
  A.pipes = (y1, y2) => box(.05, y1, 1.55, .12, y2 - y1, .1, '#7C8597') + box(.05, y1, 1.75, .12, y2 - y1, .1, '#A08A5A');
  A.vat = (x, y, c) => shadow(x, y, .35) + cyl(x, y, 0, .28, .7, '#8C95AA') + cyl(x, y, .7, .29, .06, c, { top: lt(c, .25) });
  A.whiteboard = (x, y) => shadow(x + .5, y + .1, .5) + box(x + .05, y, 0, .04, .04, 1.1, MAT.metal, { noEdge: 1 }) + box(x + .95, y, 0, .04, .04, 1.1, MAT.metal, { noEdge: 1 }) + box(x, y + .02, .55, 1.05, .05, .85, '#E9EEF5') + [[.15, '#F2C14E'], [.35, '#9DD3A8'], [.55, '#F28FAD'], [.75, '#9DB8F2']].map(([t, c], i) => faceY(y + .071, x + t, x + t + .14, .95 - (i % 2) * .22, 1.09 - (i % 2) * .22, c)).join('');
  A.couch = (x, y, c) => shadow(x + .75, y + .35, .8) + box(x, y, 0, 1.5, .7, .4, c) + box(x, y, .4, 1.5, .16, .42, dk(c, .06)) + box(x, y, .4, .16, .7, .22, dk(c, .04)) + box(x + 1.34, y, .4, .16, .7, .22, dk(c, .04));
  A.spot = (x, y) => shadow(x, y, .3) + line3([x - .2, y, 0], [x, y, 1.5], '#3A3F4D', 2) + line3([x + .2, y, 0], [x, y, 1.5], '#3A3F4D', 2) + line3([x, y + .2, 0], [x, y, 1.5], '#3A3F4D', 2) + box(x - .12, y - .12, 1.5, .24, .3, .22, '#2C303C') + pool(x + .6, y + .9, .02, .7, '#FFF1D6', .28);
  A.table = (x, y) => shadow(x, y, .45) + cyl(x, y, 0, .05, .45, MAT.metal) + cyl(x, y, .45, .4, .05, '#E8E4DC') + cyl(x + .55, y + .25, 0, .16, .3, '#7FA394');
  A.beanbag = (x, y, c) => { const p = P(x, y, 0); return shadow(x, y, .35) + `<ellipse cx="${f(p[0])}" cy="${f(p[1] - 9)}" rx="20" ry="13" fill="${def('rg' + cid(c), `<radialGradient id="rg${cid(c)}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${lt(c, .3)}"/><stop offset=".6" stop-color="${c}"/><stop offset="1" stop-color="${dk(c, .3)}"/></radialGradient>`)}"/>`; };
  A.cone = (x, y) => { const b = P(x, y, 0), t = P(x, y, .45); return `<polygon points="${f(b[0] - 8)},${f(b[1])} ${f(t[0])},${f(t[1])} ${f(b[0] + 8)},${f(b[1])}" fill="#F08A3C"/><polygon points="${f(b[0])},${f(b[1] + 1)} ${f(t[0])},${f(t[1])} ${f(b[0] + 8)},${f(b[1])}" fill="#B9622A"/><rect x="${f(b[0] - 5)}" y="${f(b[1] - 9)}" width="10" height="3" fill="#F5F0E6" opacity=".9"/>`; };
  A.crate = (x, y) => shadow(x + .25, y + .25, .4) + box(x, y, 0, .5, .5, .42, '#9A7448');

  /* ---------- bots (sprite = separate PNG frames) ---------- */
  function botSprite(source, state, o = {}) {
    const S = SOURCE[source], kind = S.kind, off = state === 'offline';
    const body = off ? mix(S.body, '#5A6070', .5) : S.body;
    const g = def('bb' + cid(body), `<radialGradient id="bb${cid(body)}" cx=".34" cy=".28" r=".85"><stop offset="0" stop-color="${lt(body, .38)}"/><stop offset=".55" stop-color="${body}"/><stop offset="1" stop-color="${dk(body, .32)}"/></radialGradient>`);
    const sc = STATE[state].c;
    const needs = ['approval', 'input', 'error'].includes(state);
    const eye = off ? '#3A404C' : needs ? lt(sc, .25) : '#CFF6FF';
    const visorFill = off ? '#1A1D24' : '#10131A';
    let b = '', vx, vy, vw, vh;
    if (kind === 'orb') { b = `<circle cx="0" cy="-27" r="18" fill="${g}"/><path d="M-17.5,-21 Q0,-13 17.5,-21" fill="none" stroke="${dk(body, .22)}" stroke-width="3" opacity=".7"/>`; vx = -12; vy = -32; vw = 24; vh = 12; }
    if (kind === 'term') { b = `<rect x="-17" y="-46" width="34" height="34" rx="10" fill="${g}"/><rect x="-11" y="-14" width="22" height="4" rx="2" fill="${dk(body, .3)}"/>`; vx = -12.5; vy = -39; vw = 25; vh = 14; }
    if (kind === 'capsule') { b = `<path d="M7,-47 L11,-55 L16,-57" fill="none" stroke="${dk(body, .35)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17.5" cy="-57.5" r="3" fill="${off ? '#3A404C' : sc}"/><rect x="-13" y="-51" width="26" height="42" rx="13" fill="${g}"/><rect x="-13" y="-22" width="26" height="4" fill="${dk(body, .18)}" opacity=".6"/>`; vx = -10; vy = -42; vw = 20; vh = 12; }
    const cx = vx + vw / 2, cy = vy + vh / 2;
    let e = '';
    const blink = o.frame === 'blink';
    if (off || blink) e = `<rect x="${cx - 7}" y="${cy - .8}" width="5" height="1.6" rx=".8" fill="${eye}"/><rect x="${cx + 2}" y="${cy - .8}" width="5" height="1.6" rx=".8" fill="${eye}"/>`;
    else if (state === 'error') e = [-4.5, 4.5].map(dx => `<path d="M${cx + dx - 2.4},${cy - 2.4} l4.8,4.8 M${cx + dx + 2.4},${cy - 2.4} l-4.8,4.8" stroke="${eye}" stroke-width="1.8" stroke-linecap="round"/>`).join('');
    else if (kind === 'term') {
      const yy = state === 'working' ? cy + 1.5 : cy;
      e = `<path d="M${cx - 7},${yy - 3} l3.6,3 l-3.6,3" fill="none" stroke="${eye}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect class="${state === 'working' ? 'caret' : ''}" x="${cx + .5}" y="${yy + 2}" width="6" height="1.8" rx=".9" fill="${eye}"/>`;
      if (state === 'input') e += `<text x="${cx + 3.5}" y="${yy - .5}" font-size="6.5" font-weight="700" fill="${eye}" text-anchor="middle" font-family="ui-monospace,monospace">?</text>`;
    }
    else if (state === 'working') e = `<rect x="${cx - 7}" y="${cy + .5}" width="5" height="2.4" rx="1.2" fill="${eye}"/><rect x="${cx + 2}" y="${cy + .5}" width="5" height="2.4" rx="1.2" fill="${eye}"/>`;
    else if (state === 'approval') e = `<circle cx="${cx - 4.5}" cy="${cy}" r="3" fill="${eye}"/><circle cx="${cx + 4.5}" cy="${cy}" r="3" fill="${eye}"/><circle cx="${cx - 3.6}" cy="${cy - 1}" r="1" fill="#fff"/><circle cx="${cx + 5.4}" cy="${cy - 1}" r="1" fill="#fff"/>`;
    else if (state === 'input') e = `<ellipse cx="${cx - 4.5}" cy="${cy}" rx="2.2" ry="2.8" fill="${eye}"/><text x="${cx + 4.5}" y="${cy + 3.4}" font-size="9.5" font-weight="800" fill="${eye}" text-anchor="middle" font-family="ui-monospace,monospace">?</text>`;
    else e = `<ellipse cx="${cx - 4.5}" cy="${cy}" rx="2.1" ry="2.9" fill="${eye}"/><ellipse cx="${cx + 4.5}" cy="${cy}" rx="2.1" ry="2.9" fill="${eye}"/>`;
    const visor = `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" rx="${Math.min(vh / 2, 6)}" fill="${visorFill}"/><rect x="${vx + 2}" y="${vy + 1.5}" width="${vw * .45}" height="2" rx="1" fill="#fff" opacity=".12"/>`;
    const gloss = off ? '' : (kind === 'orb' ? `<ellipse cx="-7" cy="-38" rx="5" ry="3" fill="#fff" opacity=".35"/>` : kind === 'term' ? `<ellipse cx="-9" cy="-42" rx="4.5" ry="2.2" fill="#fff" opacity=".35"/>` : `<ellipse cx="-5" cy="-46" rx="3.5" ry="2.2" fill="#fff" opacity=".35"/>`);
    const lift = o.lift != null ? o.lift : 0;
    return `<g class="bot-body st-${state}" transform="translate(0,${-lift})"${off ? ' opacity=".9"' : ''}>${b}${visor}${e}${gloss}</g>`;
  }
  function ring(state) {
    const c = STATE[state].c, rx = 21, ry = 10.5;
    if (state === 'idle') return '';
    if (state === 'offline') return `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="1.5 4" stroke-linecap="round"/>`;
    if (state === 'working') return `<ellipse class="ring-run" cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="7 5" stroke-linecap="round"/>`;
    const halo = `<ellipse class="ring-pulse" cx="0" cy="0" rx="${rx + 4}" ry="${ry + 2}" fill="${c}" opacity=".18"/>`;
    if (state === 'approval') return halo + `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="2.2"/>` + [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b]) => `<line x1="${a * (rx - 1)}" y1="${b * (ry - 1)}" x2="${a * (rx + 5)}" y2="${b * (ry + 4)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`).join('');
    if (state === 'input') return halo + `<path d="M${-rx * .5},${ry * .87} A${rx},${ry} 0 1 1 ${rx * .5},${ry * .87}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`;
    return halo + `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="2.2"/><ellipse cx="0" cy="0" rx="${rx - 5}" ry="${ry - 2.5}" fill="none" stroke="${c}" stroke-width="1.4" opacity=".85"/>`;
  }
  function botAt(b, x, y, hover = .32) {
    const g = P(x, y, 0), h = P(x, y, hover);
    const anchorTop = P(x, y, hover + 1.75);
    return {
      s: `<g class="bot" data-bot="${b.id}" tabindex="0"><g transform="translate(${f(g[0])},${f(g[1])})">${ring(b.state)}<ellipse cx="0" cy="0" rx="12" ry="5" fill="rgba(0,0,0,.35)" filter="url(#soft)"/></g><g transform="translate(${f(h[0])},${f(h[1])})"><g class="bob">${botSprite(b.source, b.state)}</g></g></g>`,
      anchor: { type: 'bot', id: b.id, x: anchorTop[0], y: anchorTop[1], gy: g[1] }
    };
  }

  /* ---------- pavilion = one project ---------- */
  const W = 6, D = 5, H = 2.2;
  const SLOTS = { a: [1.0, 1.35], b: [3.5, 1.35], c: [2.2, 3.15] };
  function pavilion(p, bots) {
    const ox = p.at[0], oy = p.at[1];
    const L = [];  // [depth, svg]
    let back = '';
    back += box(-.25, -.25, -.35, W + .25, D + .25, .35, '#2B2F3D', { top: MAT.floor, left: '#3A3348', right: '#2A2536' });
    for (let i = 1; i < D * 2; i++) back += line3([0, i * .5, .001], [W, i * .5, .001], MAT.plank, 1, 'opacity=".35"');
    if (p.theme === 'lot') {
      back = box(-.25, -.25, -.35, W + .25, D + .25, .35, '#22252F', { top: '#262A36', left: '#2C2F3D', right: '#20232D' });
      back += `<polygon points="${pts([[.4, .4, .01], [W - .4, .4, .01], [W - .4, D - .4, .01], [.4, D - .4, .01]])}" fill="none" stroke="#536471" stroke-width="1.5" stroke-dasharray="6 6"/>`;
      L.push([5, A.cone(1.2, 1.0)], [6, A.cone(4.6, 3.8)], [7, A.crate(3.6, 1.0)], [8, A.cone(1.0, 3.9)]);
    } else {
      back += A.rug(3.0, 3.25, 1.35, p.accent);
      back += box(-.2, -.2, 0, W + .2, .2, H, MAT.wall, { top: MAT.wallTop });
      back += box(-.2, 0, 0, .2, D, H, MAT.wall, { top: MAT.wallTop });
      back += line3([0, .01, H - .12], [W, .01, H - .12], p.accent, 2.5, 'opacity=".9"') + line3([0, .01, H - .12], [W, .01, H - .12], p.accent, 6, 'opacity=".35" filter="url(#glow)"');
      back += line3([.01, 0, H - .12], [.01, D, H - .12], p.accent, 2.5, 'opacity=".9"');
      const T = p.theme;
      if (T === 'library') { back += A.graphBoard(1.1, 4.9, 1.2, 2.0, p.accent); L.push([2, A.shelf(.02, .55, 2.6, p.accent)], [8.3, A.table(4.9, 3.7)]); }
      if (T === 'vault') { back += A.shield(1.9, 2.7, 1.05, 1.85, p.accent); L.push([3, A.lockers(4.75, 3, p.accent)], [5.5, A.safe(.25, 3.5)]); }
      if (T === 'workshop') { back += A.pegboard(1.0, 4.9, 1.2, 2.0, p.accent); L.push([2.2, A.bench(.02, .7, 2.0)], [8.6, A.spool(4.9, 3.75)]); }
      if (T === 'datacenter') { back += A.pipes(.3, 4.8); L.push([3.6, A.rack(4.85, .05)], [4.2, A.rack(5.4, .05)], [7.6, A.vat(5.35, 2.4, '#7FA394')], [9.2, A.vat(5.35, 3.6, p.accent)]); }
      if (T === 'studio') { L.push([1.3, A.whiteboard(.25, .15)], [5.2, A.couch(4.3, .35, '#6F5D86')], [6, A.spot(.6, 3.9)]); }
      L.push([5.6, A.lamp(5.6, .45)], [5.6, A.plant(.45, 4.55)]);
    }
    const anchors = [];
    (bots || []).forEach(b => {
      const s = SLOTS[b.slot];
      if (s) {
        const bp = botAt(b, s[0] + .72, s[1] - .38);
        L.push([s[0] + s[1] - .5, bp.s]);
        L.push([s[0] + s[1] + .4, `<g data-desk="${b.id}">${A.desk(s[0], s[1], b.state)}</g>`]);
        anchors.push(bp.anchor);
      } else if (b.pos) {
        const extra = b.seat ? A.beanbag(b.pos[0], b.pos[1] + .15, '#6F5D86') : '';
        const bp = botAt(b, b.pos[0], b.pos[1], b.seat ? .18 : .32);
        L.push([b.pos[0] + b.pos[1], extra + bp.s]);
        anchors.push(bp.anchor);
      }
    });
    L.sort((a, b) => a[0] - b[0]);
    const g0 = P(ox, oy, 0);
    const top = P(0, 0, H + .25);
    const body = back + L.map(x => x[1]).join('');
    const tr = `translate(${f(g0[0])},${f(g0[1])})`;
    anchors.forEach(a => { a.x += g0[0]; a.y += g0[1]; if (a.gy != null) a.gy += g0[1]; });
    return {
      s: `<g class="pav" data-project="${p.id}" transform="${tr}">${body}</g>`,
      anchors: [{ type: 'project', id: p.id, x: top[0] + g0[0], y: top[1] + g0[1] }, ...anchors],
      depth: ox + oy
    };
  }

  /* ---------- whole village ---------- */
  function village(data) {
    let s = '';
    const X0 = -1.6, Y0 = -1.6, X1 = 25.6, Y1 = 14.6;
    s += box(X0, Y0, -1.1, X1 - X0, Y1 - Y0, .75, MAT.platform, { top: '#20232F', left: '#151821', right: '#0E1017' });
    for (let x = X0 + .6; x < X1; x += 1.2) s += dot(x, Y1, -.6, 1.6, '#FFD9A0', 'opacity=".55"');
    for (let y = Y0 + .6; y < Y1; y += 1.2) s += dot(X1, y, -.6, 1.6, '#FFD9A0', 'opacity=".55"');
    s += box(X0, 5.4, -.35, X1 - X0, 2.2, .37, MAT.path, { top: '#30364A' });
    s += box(6.4, Y0, -.35, 2.2, X1 - 12, .37, MAT.path, { top: '#30364A' });
    s += box(15.4, Y0, -.35, 2.2, X1 - 12, .37, MAT.path, { top: '#30364A' });
    for (let x = X0 + .4; x < X1; x += .8) s += quad(x, 6.42, .4, .06, .025, '#414862');
    const items = [];
    data.projects.forEach(p => { const v = pavilion(p, data.bots.filter(b => b.project === p.id)); items.push([v.depth + 5.5, v.s, v.anchors, p.id]); });
    [[7.5, 6.5], [16.5, 6.5], [-.9, 6.5], [24.9, 6.5]].forEach(([x, y]) => items.push([x + y, A.post(x, y), []]));
    [[-1, -1], [24.8, -.9], [-.9, 13.8], [24.7, 13.7], [7.6, -.9], [16.6, 13.8]].forEach(([x, y]) => items.push([x + y, A.tree(x, y), []]));
    (data.walkers || []).forEach(w => { const b = data.bots.find(z => z.id === w.id); const bp = botAt(b, w.at[0], w.at[1]); items.push([w.at[0] + w.at[1], `<g class="walker" data-path="${w.path.join(',')}">${bp.s}</g>`, [bp.anchor]]); });
    items.sort((a, b) => a[0] - b[0]);
    const anchors = [];
    items.forEach(i => { s += i[1]; anchors.push(...(i[2] || [])); });
    return { s, anchors };
  }

  function stars(vb, n = 90) {
    let s = '', seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) s += `<circle cx="${f(vb[0] + r() * vb[2])}" cy="${f(vb[1] + r() * vb[3] * .8)}" r="${f(.5 + r() * 1.1)}" fill="#fff" opacity="${f(.12 + r() * .35)}"/>`;
    return s;
  }
  function svgWrap(inner, vb, cls = '') {
    return `<svg class="${cls}" viewBox="${vb.join(' ')}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><defs>${BASE_DEFS}${takeDefs()}</defs>${inner}</svg>`;
  }

  G.Iso = { P, f, pts, box, cyl, gem, ell, dot, quad, faceX, faceY, line3, shadow, pool, A, botSprite, ring, botAt, pavilion, village, stars, svgWrap, takeDefs, STATE, SOURCE, MAT, lt, dk, mix, BASE_DEFS };
})(window);
