/* Agent Village v2 design prototype. Not production code.
   Composites the Blender layers (base + one sprite per bot) and draws the HTML layer on top.
   URL: ?view=scene|project&col=needs|project&scroll=0&motion=reduced */
const Q = new URLSearchParams(location.search);
const D = window.DEMO;

const P = {
  logo: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z"/><path d="M4 7.4 12 12l8-4.6M12 12v9.2"/>',
  home: '<path d="M3.5 10.2 12 3.5l8.5 6.7V20.5h-5.6v-6H9.1v6H3.5z"/>',
  list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01" stroke-width="2.6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  approval: '<path d="M12 3.2 19 6v5.2c0 4.4-2.9 7.8-7 9.6-4.1-1.8-7-5.2-7-9.6V6z"/><path d="m9 12 2.2 2.2L15.3 10"/>',
  input: '<circle cx="12" cy="12" r="8.8"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.2.9-1.2 1.7v.4"/><path d="M12 16.9h.01" stroke-width="2.6"/>',
  error: '<path d="M12 3.6 21 19.4H3z"/><path d="M12 9.6v4.4"/><path d="M12 16.9h.01" stroke-width="2.6"/>',
  cli: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15H17"/>',
  codex: '<path d="M12 3.2 19.6 7.6v8.8L12 20.8l-7.6-4.4V7.6z"/><path d="M9 12h6"/>',
  app: '<path d="M4 5h16v11.2H9.2L4 20.2z"/>',
  out: '<path d="M7 17 17 7M9.5 7H17v7.5"/>',
  back: '<path d="m14.5 6-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.6"/>',
  motion: '<path d="M3 12c2.2-4.6 4.4-4.6 6.6 0s4.4 4.6 6.6 0 3.4-3.2 4.8-1.6"/>',
  still: '<path d="M4 12h16"/>',
  check: '<path d="m5 12.5 4.2 4L19 7"/>',
  doc: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
  table: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 10h17M9.5 10v9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  branch: '<circle cx="6.5" cy="5.5" r="2"/><circle cx="6.5" cy="18.5" r="2"/><circle cx="17.5" cy="8.5" r="2"/><path d="M6.5 7.5v9M17.5 10.5c0 4-5 3.5-9.6 6.3"/>'
};
const I = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n]}</svg>`;
const SRC = { cli: 'Claude Code CLI', codex: 'Codex', app: 'Claude app' };
const STATE = { working: 'Working', idle: 'Idle', approval: 'Approval needed', input: 'Input needed', error: 'Error', offline: 'Offline' };
const ASKS = ['error', 'approval', 'input'];
// where each project note is pinned: fraction along the room's x and y edges
const NOTE_AT = { atlas: [0.84, 0.42], privacy: [0.78, 0.78], connector: [0.8, 0.55], warehouse: [0.86, 0.62], launch: [0.3, 0.86] };
const GROUP = { error: 'Error', approval: 'Approval needed', input: 'Input needed' };

async function load(tag) {
  const r = await fetch(`../renders/${tag}/${tag}.json`);
  return r.json();
}

function shell(colWide) {
  const n = D.asks.length;
  return `<div class="app ${colWide ? 'wide-col' : ''}">
  <nav class="rail">
    ${I('logo', 'logo')}
    <a class="on">${I('home')}</a><a>${I('list')}</a><a>${I('search')}</a><a>${I('bell')}<span class="n">${n}</span></a>
    <span class="sp"></span><a>${I('sliders')}</a><span class="me">N</span>
  </nav>
  <header class="head">
    <h1>Village</h1><span class="tag demo">Demo</span>
    <span class="counts">5 projects · 14 agents</span>
    <div class="tabs"><button class="on">Village</button><button>List</button></div>
    <span class="sp"></span>
    <div class="srcs">${D.sources.map(s => `<span class="src">${I(s.id)}${s.label}<span class="st ${s.status === 'supported' ? 'ok' : 'no'}">${s.status}</span></span>`).join('')}</div>
    <span class="sync">synced ${D.syncedAt}</span>
  </header>
  <main class="stage" id="stage"></main>
  <aside class="col" id="col"></aside>
</div>`;
}

/* ---------- scene */
function placeScene(stage, J, o = {}) {
  const S = J.scale;
  const fw = J.frame[0] / S, fh = J.frame[1] / S;
  const W = stage.clientWidth, H = stage.clientHeight;
  const s = o.fit || Math.min(W / fw, H / fh);
  const k = s / S; // image px -> screen px
  let ox = (W - fw * s) / 2 + (o.dx || 0), oy = (H - fh * s) / 2 + (o.dy || 0);
  if (o.focus) { ox = W / 2 - o.focus[0] * k + (o.dx || 0); oy = H * (o.fy || 0.5) - o.focus[1] * k + (o.dy || 0); }
  const sc = document.createElement('div');
  sc.className = 'scene';
  sc.style.cssText = `left:${ox}px;top:${oy}px;width:${J.frame[0]}px;height:${J.frame[1]}px;transform:scale(${k})`;
  const tag = J.tag;
  let html = `<img src="../renders/${tag}/${tag}-base.webp" style="left:0;top:0;width:${J.frame[0]}px">`;
  const layers = J.layers.filter(l => !(o.hide || []).includes(l.id)).concat(o.extra || []).sort((a, b) => a.depth - b.depth);
  for (const l of layers) html += `<img src="../renders/${l.dir || tag}/${l.file}" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px">`;
  sc.innerHTML = html;
  stage.appendChild(sc);
  const pt = p => [ox + p[0] * k, oy + p[1] * k];
  return { pt, k, ox, oy };
}

function projectCounts(J, pid) {
  const c = { approval: 0, input: 0, error: 0, n: 0, working: 0 };
  for (const [id, b] of Object.entries(J.bots)) {
    if (b.project !== pid) continue;
    c.n++;
    if (c[b.state] !== undefined) c[b.state]++;
  }
  return c;
}

function counts(c) {
  return ASKS.filter(k => c[k]).map(k => `<span class="cnt ${k}">${I(k)}${c[k]}</span>`).join('');
}

function overlays(stage, J, T, o = {}) {
  let h = '';
  for (const p of D.projects) {
    if (o.only && o.only !== p.id) continue;
    const a = J.projects[p.id];
    // a note pinned to a free spot on the room's floor; the leader is 1.7 m tall in world units
    const [u, v] = NOTE_AT[p.id];
    const q = a.poly;
    const fp = [q[0][0] + u * (q[1][0] - q[0][0]) + v * (q[3][0] - q[0][0]), q[0][1] + u * (q[1][1] - q[0][1]) + v * (q[3][1] - q[0][1])];
    const [x, y] = T.pt(o.only ? a.plate : fp);
    const c = projectCounts(J, p.id);
    const lead = o.leader || 1.7 * 39.19 * J.scale * T.k;
    const sel = o.only === p.id;
    h += `<div class="note ${sel ? 'sel' : ''}" style="left:${x}px;top:${y}px"><div class="lbl"><span class="nm">${p.name}</span>${sel && !o.compact ? `<span class="meta">${c.n} agents · ${c.working} working · ${p.last}</span>` : ''}<span class="ct">${counts(c)}</span></div><div class="leader" style="height:${lead}px;--h:${lead}px"></div></div>`;
  }
  for (const a of D.asks) {
    const b = J.bots[a.bot];
    if (!b) continue;
    if (o.only && b.project !== o.only) continue;
    const [x, y] = T.pt(b.head);
    if (o.detail) {
      h += `<div class="callx ${a.type}" style="left:${x}px;top:${y}px"><span class="lead"></span><div class="k">${I(a.type)}${GROUP[a.type]}</div><div class="t">${a.text}</div><div class="m">${a.bot} · ${SRC[b.source]} · ${a.age}</div></div>`;
    } else {
      h += `<div class="call ${a.type}" style="left:${x}px;top:${y}px">${I(a.type)}<span class="who">${a.bot}</span></div>`;
    }
  }
  if (o.chips) {
    const placed = [];
    for (const [id, b] of Object.entries(J.bots)) {
      if (b.project !== o.only || ASKS.includes(b.state)) continue;
      let [x, y] = T.pt(b.foot);
      const w = 8 * (id.length + 22);
      while (placed.some(p => Math.abs(p[0] - x) < (p[2] + w) / 2 && Math.abs(p[1] - y) < 28)) y += 28;
      placed.push([x, y, w]);
      h += `<div class="chip" style="left:${x}px;top:${y}px"><b>${id}</b> · ${STATE[b.state].toLowerCase()} · ${D.bots[id].last}</div>`;
    }
  }
  stage.insertAdjacentHTML('beforeend', h);
}

function dimOutside(stage, J, T, pid, alpha = 0.62) {
  const a = J.projects[pid];
  const up = 3.1 * 39.19 * J.scale; // wall height in image px
  const pts = a.poly.concat(a.poly.map(p => [p[0], p[1] - up])).map(T.pt);
  const hull = convexHull(pts);
  const W = stage.clientWidth, H = stage.clientHeight;
  const d = `M0 0H${W}V${H}H0Z M${hull.map(p => p.join(' ')).join(' L')} Z`;
  stage.insertAdjacentHTML('beforeend', `<svg style="position:absolute;inset:0;z-index:5;pointer-events:none" width="${W}" height="${H}"><path d="${d}" fill="rgba(5,5,6,${alpha})" fill-rule="evenodd"/></svg>`);
}

function convexHull(p) {
  p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function hud(stage, reduced) {
  const dot = s => `<span class="dot" style="background:var(--${s})"></span>`;
  stage.insertAdjacentHTML('beforeend', `
  <div class="watermark">DEMO DATA</div>
  <div class="hud log"><h4><span>Recent activity</span><span>local sources</span></h4>
    ${D.activity.map(a => `<div class="row"><span class="tm">${a.t}</span>${dot(a.state)}<span><span class="who">${a.bot}</span> ${a.text}</span></div>`).join('')}
  </div>
  <div class="hud legend">
    <span>${dot('working')}Working</span><span>${dot('idle')}Idle</span>
    <span style="color:var(--approval)">${I('approval')}<span style="color:var(--soft)">Approval</span></span>
    <span style="color:var(--input)">${I('input')}<span style="color:var(--soft)">Input</span></span>
    <span style="color:var(--error)">${I('error')}<span style="color:var(--soft)">Error</span></span>
    <span>${dot('offline')}Offline</span>
  </div>
  <div class="hud ctl"><button>${I('plus')}</button><button>${I('minus')}</button><button>${I('target')}</button>
    <button class="${reduced ? 'on' : ''}"><span class="lab">${I(reduced ? 'still' : 'motion')}${reduced ? 'Reduced motion · on' : 'Motion'}</span></button></div>`);
}

/* ---------- column */
function needsCol(J) {
  const byType = t => D.asks.filter(a => a.type === t);
  const card = a => {
    const b = J.bots[a.bot];
    const proj = D.projects.find(p => p.id === b.project).name;
    return `<div class="ask ${a.type}"><span class="bar"></span><div>
      <div class="top">${I(a.type)}<span class="who">${a.bot}</span><span class="muted">${proj}</span><span class="age">${a.age}</span></div>
      <div class="txt">${a.text}</div>
      <div class="ft"><span class="srcl">${I(b.source)}${SRC[b.source]}</span><span class="btn">${a.open}${I('out')}</span></div></div></div>`;
  };
  return `<div class="ctabs"><button class="on">Needs you <span class="badge">${D.asks.length}</span></button><button>Project</button></div>
  <div class="scroll"><div class="inner">
    <div class="sum"><h2>Needs you</h2><p>5 requests waiting. The oldest is 41 min old.</p></div>
    <div class="filters"><button class="on">All <span class="k">5</span></button><button>Errors <span class="k">1</span></button><button>Approvals <span class="k">2</span></button><button>Questions <span class="k">2</span></button></div>
    ${ASKS.map(t => `<div class="grp ${t}">${GROUP[t]}</div>${byType(t).map(card).join('')}`).join('')}
  </div></div>`;
}

function projectCol(J, pid, scroll) {
  const p = D.projects.find(x => x.id === pid);
  const C = D.context[pid];
  const c = projectCounts(J, pid);
  const bots = Object.entries(J.bots).filter(([, b]) => b.project === pid);
  const agent = ([id, b]) => `<div class="agent"><span class="av"><img src="../renders/avatars/${b.source}-${b.state}.webp"></span>
      <div><div class="nm">${id}</div><div class="ln"><span class="stt ${b.state}">${STATE[b.state]}</span><span>${I(b.source)}</span><span>${SRC[b.source]} · ${D.bots[id].last}</span></div></div><span class="open">${I('out')}</span></div>`;
  return `<div class="ctabs"><button>Needs you <span class="badge">${D.asks.length}</span></button><button class="on">Project · ${p.name}</button></div>
  <div class="scroll"><div class="inner" style="top:${-scroll}px">
    <div class="pj"><span class="back">${I('back')}Needs you · 5</span>
      <h2>${p.name}</h2><div class="sub">${p.sub}</div>
      <div class="stats"><div><b>${c.n}</b><span>agents</span></div><div><b>${c.working}</b><span><i class="dot" style="background:var(--working)"></i>working</span></div><div><b>${c.approval}</b><span><i class="dot" style="background:var(--approval)"></i>approval</span></div><div><b>${bots.filter(([, b]) => b.state === 'idle').length}</b><span><i class="dot" style="background:var(--idle)"></i>idle</span></div></div>
      <div class="last">Last activity ${p.last} · <span class="mono">segment-models</span></div></div>
    <div class="sec"><div class="sh"><h4>Goal</h4><span class="prov">entered by you</span></div><p class="goal">${C.goal}</p></div>
    <div class="sec"><div class="sh"><h4>Agents and chats · ${bots.length}</h4><span class="prov">read locally · CLI, Codex</span></div>${bots.map(agent).join('')}</div>
    <div class="sec unav"><div class="sh"><h4>Claude app</h4><span class="prov">unavailable</span></div><p>No known history source. Claude app chats will not appear here until one is verified.</p></div>
    <div class="sec"><div class="sh"><h4>Decisions</h4><span class="prov">entered by you</span></div>${C.decisions.map(d => `<div class="dec"><span class="d">${d[0]}</span><span>${d[1]}</span></div>`).join('')}</div>
    <div class="sec"><div class="sh"><h4>Tasks · ${C.tasks.length}</h4><span class="prov">entered by you</span></div>${C.tasks.map(t => `<div class="task ${t[0] ? 'done' : ''}"><span class="cb">${t[0] ? I('check') : ''}</span><span class="tx">${t[1]}</span><span class="ow ${t[2] === 'you' ? 'you' : ''}">${t[2]}</span></div>`).join('')}</div>
    <div class="sec"><div class="sh"><h4>Linked repo</h4><span class="prov">detected · local folder</span></div>
      <div class="repo">${I('branch')}<div><div class="nm">${C.repo.name}</div><div class="br">branch ${C.repo.branch}</div></div><div class="nb">Link only. Agent activity is not a commit.</div></div></div>
    <div class="sec"><div class="sh"><h4>Artifacts · ${C.artifacts.length}</h4><span class="prov">links added by you</span></div><div class="arts">${C.artifacts.map(a => `<span class="art">${I(a[0])}${a[1]}</span>`).join('')}</div></div>
    <div class="foot"><span class="btn primary">Open full context${I('out')}</span><span class="btn">Pin</span></div>
  </div></div>`;
}

/* ---------- views */
async function main() {
  const view = Q.get('view') || 'scene';
  const reduced = Q.get('motion') === 'reduced';
  const colMode = Q.get('col') || (view === 'project' ? 'project' : 'needs');
  document.body.innerHTML = shell(colMode === 'project');
  const stage = document.getElementById('stage');
  const col = document.getElementById('col');
  if (view === 'scene') {
    const J = await load('scene');
    J.tag = 'scene';
    const o = { dy: -30, fit: Math.min(stage.clientWidth / (J.frame[0] / J.scale) * 1.07, 0.95) };
    if (reduced) {
      const R = await load('parked').catch(() => null);
      o.hide = ['release-notes'];
      if (R) o.extra = R.layers.map(l => ({ ...l, dir: 'parked' }));
    }
    const T = placeScene(stage, J, o);
    overlays(stage, J, T);
    hud(stage, reduced);
    col.innerHTML = needsCol(J);
  } else {
    const J = await load('zoom');
    J.tag = 'zoom';
    const T = placeScene(stage, J, { dy: 10 });
    dimOutside(stage, J, T, 'warehouse');
    overlays(stage, J, T, { only: 'warehouse', detail: true, chips: true, leader: 40 });
    hud(stage, reduced);
    col.innerHTML = colMode === 'project' ? projectCol(J, 'warehouse', +(Q.get('scroll') || 0)) : needsCol(J);
  }
  document.body.dataset.ready = '1';
}
if (!window.NO_MAIN) main();
