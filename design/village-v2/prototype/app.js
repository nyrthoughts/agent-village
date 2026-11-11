/* Agent Village: design prototype (not production code). URL params:
   mode=atoi|project  focus=<projectId>  device=desktop|mobile  screen=scene|atoi|project
   motion=reduced  expand=<botId>  hover=<botId> */
(function () {
  const D = window.DEMO, Iso = window.Iso, Q = new URLSearchParams(location.search);
  const st = {
    mode: Q.get('mode') || 'atoi', focus: Q.get('focus') || 'warehouse', device: Q.get('device') || 'desktop',
    screen: Q.get('screen') || 'scene', reduced: Q.get('motion') === 'reduced', expand: Q.get('expand') || 'model-refresh',
    hover: Q.get('hover'), filter: 'all'
  };
  const $ = (s, r = document) => r.querySelector(s);
  const bot = id => D.bots.find(b => b.id === id);
  const proj = id => D.projects.find(p => p.id === id);
  const askOf = id => D.asks.find(a => a.bot === id);

  /* ---------- icons (original line icons) ---------- */
  const sv = (p, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    logo: `<svg viewBox="0 0 32 32" width="30" height="30"><path d="M16 3 28 9.5v13L16 29 4 22.5v-13Z" fill="none" stroke="#E7E9EA" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 16 28 9.5M16 16 4 9.5M16 16v13" stroke="#E7E9EA" stroke-width="2.2"/><circle cx="16" cy="11" r="2.4" fill="#FFAD1F"/></svg>`,
    village: sv('<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>'),
    list: sv('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
    search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>', 1.8),
    bell: sv('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    approval: sv('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6Z"/><path d="m8.8 12 2.2 2.2 4.4-4.6"/>', 2.2),
    input: sv('<path d="M9.2 9.3a3 3 0 0 1 5.6 1.2c0 2-3 2.6-3 4.3"/><path d="M12 18.3h.01"/>', 2.6),
    error: sv('<path d="M12 9v4.5M12 17.3h.01"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', 2.3),
    ext: sv('<path d="M7 17 17 7M8 7h9v9"/>', 2.4),
    plus: sv('<path d="M12 5v14M5 12h14"/>'), minus: sv('<path d="M5 12h14"/>'),
    target: sv('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>'),
    motion: sv('<path d="M4 12c2-4 4-4 6 0s4 4 6 0 4-4 4-4"/>'),
    still: sv('<path d="M4 12h16"/>'),
    back: sv('<path d="m15 18-6-6 6-6"/>', 2.4),
    branch: sv('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 6"/>'),
    doc: sv('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    table: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>'),
    link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 3),
    sheet: sv('<path d="M5 15l7-7 7 7"/>', 2.4)
  };
  const srcGlyph = id => ({
    cli: `<svg class="glyph" viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="2.5" fill="none" stroke="#D98B6A" stroke-width="1.5"/><path d="m4.5 6 2 2-2 2M8.5 10.5h3" stroke="#D98B6A" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    codex: `<svg class="glyph" viewBox="0 0 16 16"><rect x="3.5" y="1.5" width="9" height="13" rx="4.5" fill="none" stroke="#AFC0DE" stroke-width="1.5"/><circle cx="8" cy="6.5" r="1.4" fill="#AFC0DE"/></svg>`,
    app: `<svg class="glyph" viewBox="0 0 16 16"><circle cx="8" cy="7.5" r="5.8" fill="none" stroke="#E6DCC6" stroke-width="1.5"/><path d="M5.5 7.5h5" stroke="#E6DCC6" stroke-width="1.5" stroke-linecap="round"/></svg>`
  })[id];
  const TYPE = { approval: 'Approbation demandée', input: 'Information demandée', error: 'Erreur' };
  const TYPE_SHORT = { approval: 'Approbation', input: 'Question', error: 'Erreur' };
  const stColor = s => Iso.STATE[s].c;

  /* ---------- scene ---------- */
  const OV = [-490, -170, 1350, 900];
  function focusVB(pid, w, aspect) {
    const p = proj(pid), c = Iso.P(p.at[0] + 3, p.at[1] + 2.5, 1.1), h = w / aspect;
    return [c[0] - w / 2, c[1] - h / 2 - 20, w, h];
  }
  let VB = OV, anchors = [];
  function buildScene(stage) {
    const red = st.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const data = red ? Object.assign({}, D, { walkers: [], bots: D.bots.map(b => b.id === 'release-notes' ? Object.assign({}, b, { pos: [2.9, 3.5] }) : b) }) : D;
    const v = Iso.village(data); anchors = v.anchors;
    const r = stage.getBoundingClientRect(), aspect = r.width / r.height;
    if (st.device === 'mobile') {
      const w = 420, sc = r.width / w, p = proj(st.focus), c = Iso.P(p.at[0] + 3, p.at[1] + 2.5, 1.1);
      const visH = r.height - (st.screen === 'scene' ? 214 : 0);
      VB = [c[0] - w / 2, c[1] - (visH / 2 + 18) / sc, w, r.height / sc];
    }
    else if (st.mode === 'project') VB = focusVB(st.focus, 640, aspect);
    else VB = OV;
    const big = [-900, -700, 2600, 1900];
    $('.scene', stage).innerHTML = Iso.svgWrap(Iso.stars(big, 160) + v.s, VB);
    const svg = $('.scene svg', stage);
    if (st.mode === 'project' || st.device === 'mobile') svg.querySelectorAll('.pav').forEach(g => { if (st.device !== 'mobile' && g.dataset.project !== st.focus) g.classList.add('dim'); });
    svg.querySelectorAll('.pav').forEach(g => g.addEventListener('click', () => openProject(g.dataset.project)));
    svg.querySelectorAll('.bot').forEach(g => g.addEventListener('click', e => { e.stopPropagation(); toast(g.dataset.bot); }));
    placeOverlays(stage);
    startWalkers(svg);
  }
  function toScreen(stage, x, y) {
    const svg = $('.scene svg', stage), m = svg.getScreenCTM(), pt = svg.createSVGPoint(), r = stage.getBoundingClientRect();
    pt.x = x; pt.y = y; const q = pt.matrixTransform(m); return [q.x - r.left, q.y - r.top];
  }
  function placeOverlays(stage) {
    const ov = $('.overlays', stage); ov.innerHTML = '';
    const mob = st.device === 'mobile';
    anchors.forEach(a => {
      if (a.type === 'project') {
        const p = proj(a.id); const [x, y] = toScreen(stage, a.x, a.y);
        if (st.mode === 'project' && !mob && a.id !== st.focus) return;
        if (mob && a.id !== st.focus) return;
        const el = document.createElement('div');
        if (p.theme === 'lot') { el.className = 'plate lot'; el.innerHTML = `<span style="width:8px;height:8px;border-radius:2px;border:1.5px dashed #71767B"></span><div class="nm">Emplacement libre</div>`; }
        else {
          const bs = D.bots.filter(b => b.project === p.id), w = bs.filter(b => b.state === 'working').length;
          const needs = ['approval', 'input', 'error'].map(t => [t, bs.filter(b => b.state === t).length]).filter(x => x[1]);
          el.className = 'plate' + (st.mode === 'project' && a.id === st.focus ? ' sel' : '');
          el.innerHTML = `<span class="sw" style="background:${p.accent}"></span><div><div class="nm">${p.name}</div><div class="sub">${bs.length} agents · ${w} actif${w > 1 ? 's' : ''} · ${p.last}</div></div>` +
            (needs.length ? `<div class="needs">${needs.map(([t, n]) => `<span class="pip ${t}" title="${TYPE[t]}">${I[t]}${n}</span>`).join('')}</div>` : '');
        }
        el.style.left = x + 'px'; el.style.top = (y - 4) + 'px';
        el.addEventListener('click', () => openProject(p.id));
        ov.appendChild(el);
      }
      if (a.type === 'bot') {
        const b = bot(a.id), ask = askOf(a.id); const [x, y] = toScreen(stage, a.x, a.y);
        const inFocus = b.project === st.focus;
        if ((st.mode === 'project' || mob) && !inFocus) return;
        if (ask) {
          const el = document.createElement('div');
          const big = !mob && ((st.mode === 'atoi' && a.id === st.expand) || (st.mode === 'project' && inFocus));
          el.className = `bub ${ask.type}` + (big ? ' big' : '');
          el.innerHTML = big
            ? `<div class="hd"><span class="ic">${I[ask.type]}</span>${TYPE[ask.type]}</div><div class="tx">${ask.text}</div><div class="ft">${b.id} · ${Iso.SOURCE[b.source].label} · ${ask.age}</div>`
            : `<span class="ic">${I[ask.type]}</span>${b.id}`;
          el.style.left = (big ? x + 6 : x) + 'px'; el.style.top = (big ? y + 20 : y - 4) + 'px';
          el.addEventListener('click', () => toast(b.id));
          ov.appendChild(el);
        } else if (st.hover === a.id) {
          const el = document.createElement('div'); el.className = 'chip';
          el.innerHTML = `<span class="d" style="background:${stColor(b.state)}"></span>${b.id}<span class="s">· ${Iso.STATE[b.state].label.toLowerCase()}</span>`;
          const gy = toScreen(stage, a.x, a.gy)[1]; el.style.left = x + 'px'; el.style.top = (gy + 30) + 'px';
          ov.appendChild(el);
        }
      }
    });
  }
  let raf;
  function startWalkers(svg) {
    cancelAnimationFrame(raf);
    const ws = [...svg.querySelectorAll('.walker')];
    if (st.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now();
    function step(t) {
      ws.forEach(g => {
        const a = g.dataset.path.split(',').map(Number), pts = []; for (let i = 0; i < a.length; i += 2) pts.push([a[i], a[i + 1]]);
        const segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]]), lens = segs.map(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1])), tot = lens.reduce((x, y) => x + y, 0);
        let d = ((t - t0) / 1000 * .8) % tot, i = 0; while (d > lens[i]) { d -= lens[i]; i++; }
        const [p, q] = segs[i], k = d / lens[i], cur = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
        const A = Iso.P(pts[0][0], pts[0][1]), B = Iso.P(cur[0], cur[1]);
        g.setAttribute('transform', `translate(${B[0] - A[0]},${B[1] - A[1]})`);
      });
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  /* ---------- context column ---------- */
  function cardsHTML(list) {
    return list.map(a => {
      const b = bot(a.bot), p = proj(b.project);
      return `<div class="card ${a.type}"><div class="ico">${I[a.type]}</div><div class="bd">
        <div class="l1"><b class="mono">${b.id}</b><span class="p">· ${p.name}</span><span class="age">${a.age}</span></div>
        <div class="tx">${a.text}</div>
        <div class="row"><span class="srcchip">${srcGlyph(b.source)}${Iso.SOURCE[b.source].label}</span><button class="openbtn">${a.open}${I.ext}</button></div>
      </div></div>`;
    }).join('');
  }
  function atoiHTML() {
    const n = t => D.asks.filter(a => a.type === t).length;
    const groups = ['error', 'approval', 'input'].filter(t => st.filter === 'all' || st.filter === t);
    return `<div class="ctx-h"><h2>À toi</h2><p>${D.asks.length} demandes en attente. La plus ancienne date de ${D.asks[D.asks.length - 1].age}.</p></div>
      <div class="filters">
        <button data-f="all" class="${st.filter === 'all' ? 'on' : ''}">Tout · ${D.asks.length}</button>
        <button data-f="error" class="${st.filter === 'error' ? 'on' : ''}"><span class="k" style="background:var(--error)"></span>Erreurs · ${n('error')}</button>
        <button data-f="approval" class="${st.filter === 'approval' ? 'on' : ''}"><span class="k" style="background:var(--approval)"></span>Approbations · ${n('approval')}</button>
        <button data-f="input" class="${st.filter === 'input' ? 'on' : ''}"><span class="k" style="background:var(--input)"></span>Questions · ${n('input')}</button>
      </div>` +
      groups.map(t => `<div class="sec-h" style="color:var(--${t})">${TYPE[t]}<span class="ln"></span></div>` + cardsHTML(D.asks.filter(a => a.type === t))).join('') +
      `<div class="foot">Agent Village lit et regroupe. Il ne répond jamais à ta place : chaque action s’ouvre dans l’outil source.</div>`;
  }
  function avatar(b) { return Iso.svgWrap(Iso.botSprite(b.source, b.state), [-30, -68, 60, 64], 'av'); }
  function projectHTML(pid) {
    const p = proj(pid), C = D.context[pid] || D.context.warehouse, bs = D.bots.filter(b => b.project === pid);
    const cnt = s => bs.filter(b => b.state === s).length;
    const stats = [['working', `${cnt('working')} actif`], ['approval', `${cnt('approval')} approbation`], ['input', `${cnt('input')} question`], ['error', `${cnt('error')} erreur`], ['idle', `${cnt('idle')} inactif`], ['offline', `${cnt('offline')} hors ligne`]].filter(([s]) => cnt(s));
    return `<div class="pj-h">
        <button class="pj-back" data-back>${I.back}À toi · ${D.asks.length}</button>
        <div class="pj-t"><span class="sw" style="background:${p.accent}"></span><div><h2>${p.name}</h2><div class="sub">${p.sub}</div></div></div>
        <div class="pj-stats"><span class="stat">${bs.length} agents</span>${stats.map(([s, l]) => `<span class="stat"><span class="d" style="background:${stColor(s)}"></span>${l}</span>`).join('')}</div>
        <div class="pj-last">Dernière activité ${p.last} · <span class="mono">model-refresh</span></div>
      </div>
      <div class="blk"><h3>Objectif <span class="prov">saisi par toi</span></h3><p class="goal">${C.goal}</p></div>
      <div class="blk"><h3>Agents et chats <span class="c">${bs.length}</span><span class="prov">lus en local · CLI, Codex</span></h3>${bs.map(b => `<div class="agent"><div class="av">${avatar(b)}</div><div><div class="nm">${b.id}</div><div class="mt"><span class="stpill" style="color:${stColor(b.state)};background:${stColor(b.state)}1F">${Iso.STATE[b.state].label}</span>${srcGlyph(b.source)}${Iso.SOURCE[b.source].label} · ${b.last}</div></div><button class="go" title="Ouvrir le transcript">${I.ext}</button></div>`).join('')}</div>
      <div class="blk empty"><h3>App Claude <span class="prov">indisponible</span></h3><p class="note-e">Aucune API d’historique connue. Les chats de l’app n’apparaissent pas ici tant qu’une source n’existe pas.</p></div>
      <div class="blk"><h3>Décisions <span class="prov">saisies par toi</span></h3><div class="dec">${C.decisions.map(([d, t]) => `<span class="dt">${d}</span><span>${t}</span>`).join('')}</div></div>
      <div class="blk"><h3>Tâches <span class="c">${C.tasks.length}</span><span class="prov">saisies par toi</span></h3>${C.tasks.map(([done, t, o]) => `<div class="task ${done ? 'done' : ''}"><span class="cb">${done ? I.check : ''}</span><span class="lb">${t}</span><span class="ow ${o === 'À toi' ? 'me' : ''}">${o}</span></div>`).join('')}</div>
      <div class="blk"><h3>Repo lié <span class="prov">détecté · dossier local</span></h3><div class="repo">${I.branch}<div><div class="nm">${C.repo.name}</div><div class="br">branche ${C.repo.branch}</div></div><div class="note">Lien seulement. L’activité d’un agent n’est pas un commit.</div></div></div>
      <div class="blk"><h3>Artefacts <span class="c">${C.artifacts.length}</span><span class="prov">liens ajoutés par toi</span></h3><div class="arts">${C.artifacts.map(([k, n]) => `<span class="art">${I[k]}${n}</span>`).join('')}</div></div>
      <div class="pj-cta"><button class="openbtn">Ouvrir le contexte complet${I.ext}</button><button class="ghost">Épingler</button></div>`;
  }
  function renderCtx(host) {
    const tabs = `<div class="tabs"><button data-tab="atoi" class="${st.mode === 'atoi' ? 'on' : ''}">À toi <span class="n">${D.asks.length}</span></button><button data-tab="project" class="${st.mode === 'project' ? 'on' : ''}">Projet · ${proj(st.focus).name}</button></div>`;
    host.innerHTML = tabs + `<div class="scroll">${st.mode === 'project' ? projectHTML(st.focus) : atoiHTML()}</div>`;
    host.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.mode = b.dataset.tab; render(); });
    host.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filter = b.dataset.f; renderCtx(host); });
    host.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { st.mode = 'atoi'; render(); });
  }
  function openProject(id) { if (proj(id).theme === 'lot') return; st.focus = id; st.mode = 'project'; render(); }
  function toast(id) {
    const b = bot(id); let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = `Prototype : ouvrirait la source de ${b.id} (${Iso.SOURCE[b.source].label}).`;
    Object.assign(t.style, { position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', background: '#1D9BF0', color: '#fff', padding: '10px 16px', borderRadius: '10px', fontWeight: 600, zIndex: 99 });
    clearTimeout(t._h); t._h = setTimeout(() => t.remove(), 2400);
  }

  /* ---------- shell ---------- */
  function stageHTML() {
    const mob = st.device === 'mobile';
    return `<main class="stage"><div class="scene"></div><div class="overlays"></div>
      ${mob ? `<div class="m-dots">${D.projects.filter(p => p.theme !== 'lot').map(p => `<i class="${p.id === st.focus ? 'on' : ''}"></i>`).join('')}</div>` : `
      <div class="ticker"><div class="h">Activité récente</div>${D.activity.map(a => `<div class="tk"><span class="t">${a.t}</span><span class="d" style="background:${stColor(bot(a.bot).state)}"></span><span><b class="mono">${a.bot}</b> ${a.text}</span></div>`).join('')}</div>
      <div class="watermark">DONNÉES DE DÉMO</div>
      <div class="legend">${['working', 'idle', 'approval', 'input', 'error', 'offline'].map(s => `<span><i style="background:${['approval', 'input', 'error'].includes(s) ? stColor(s) : 'transparent'};border:${['approval', 'input', 'error'].includes(s) ? 0 : '2px ' + (s === 'offline' ? 'dotted' : s === 'working' ? 'dashed' : 'solid') + ' ' + stColor(s)};color:${s === 'approval' ? '#000' : '#fff'}">${['approval', 'input', 'error'].includes(s) ? I[s] : ''}</i>${Iso.STATE[s].label}</span>`).join('')}</div>
      <div class="controls"><button title="Zoom avant">${I.plus}</button><button title="Zoom arrière">${I.minus}</button><button title="Recentrer">${I.target}</button><button class="${st.reduced ? 'on' : ''}" data-motion>${st.reduced ? I.still : I.motion}${st.reduced ? 'Animations réduites' : 'Animations'}</button></div>`}
    </main>`;
  }
  function render() {
    document.body.className = [st.device === 'mobile' ? 'mobile' : '', st.reduced ? 'reduced' : '', st.mode === 'project' ? 'm-project' : '', Q.get('shot') ? 'shot' : ''].join(' ');
    const app = $('#app');
    if (st.device === 'mobile') {
      const sheetMode = st.screen === 'scene' ? 'peek' : 'full';
      app.innerHTML = `<div class="app"><div class="m-top">${I.logo}<h1>Village</h1><span class="demo-pill">DÉMO</span><span class="grow"></span><button class="atoi-btn">${I.bell}À toi · ${D.asks.length}</button></div>
        <div class="strip">${D.projects.filter(p => p.theme !== 'lot').map(p => { const bs = D.bots.filter(b => b.project === p.id); const nd = bs.filter(b => ['approval', 'input', 'error'].includes(b.state)); return `<button class="${p.id === st.focus ? 'on' : ''}"><span class="sw" style="background:${p.accent}"></span>${p.name}${nd.length ? `<span class="pip ${nd[0].state}">${nd.length}</span>` : ''}</button>`; }).join('')}</div>
        ${stageHTML()}${st.screen !== 'scene' ? '<div class="scrim"></div>' : ''}
        <div class="sheet ${sheetMode}"><div class="grab"></div><div class="scroll" id="sheet"></div></div></div>`;
      const sh = $('#sheet'); const on = $('.strip .on'); if (on) $('.strip').scrollLeft = on.offsetLeft - 12;
      if (st.screen === 'project') { st.mode = 'project'; sh.innerHTML = projectHTML(st.focus); st.mode = 'atoi'; }
      else sh.innerHTML = atoiHTML();
      if (st.screen === 'scene') { sh.querySelector('.filters').remove(); sh.querySelector('.foot').remove(); }
    } else {
      app.innerHTML = `<div class="app">
        <nav class="rail"><div class="logo">${I.logo}</div><button class="ri on" title="Village">${I.village}</button><button class="ri" title="Liste">${I.list}</button><button class="ri" title="Recherche">${I.search}</button><button class="ri" title="À toi">${I.bell}<span class="badge">${D.asks.length}</span></button><span class="sp"></span><button class="ri" title="Réglages">${I.gear}</button><div class="avatar">N</div></nav>
        <header class="top"><h1>Village</h1><span class="demo-pill">DÉMO</span><span class="meta">${D.projects.length - 1} projets · ${D.bots.length} agents</span>
          <div class="seg"><button class="on">Village</button><button>Liste</button></div><span class="grow"></span>
          ${D.sources.map(s => `<span class="src">${srcGlyph(s.id)}<b>${s.label}</b><span class="st ${s.status === 'supporté' ? 'ok' : 'no'}">${s.status}</span></span>`).join('')}
          <span class="sync">synchro 14:32</span></header>
        ${stageHTML()}<aside class="ctx" id="ctx"></aside></div>`;
      renderCtx($('#ctx')); if (Q.get('scroll')) { const sc = $('#ctx .scroll'); sc.scrollTop = sc.scrollHeight; }
      const mb = $('[data-motion]'); if (mb) mb.onclick = () => { st.reduced = !st.reduced; render(); };
    }
    requestAnimationFrame(() => buildScene($('.stage')));
  }
  addEventListener('resize', () => buildScene($('.stage')));
  document.fonts && document.fonts.ready.then(render); render();
})();
