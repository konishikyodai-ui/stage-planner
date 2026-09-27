/* 舞台図エディタ — 状態・種類定義・履歴・幾何ユーティリティ
   座標はすべて mm（ワールド座標）。y は下向き（画面と同じ）。
   角度は度・時計回り。rot=0 のとき配置物の「正面」は +y（図面の下方向）。 */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};

  SP.SHAKU = 1000 / 3.3;          // 1尺 ≒ 303.03mm
  SP.KEN = SP.SHAKU * 6;          // 1間 ≒ 1,818.18mm
  SP.FONT = '"BIZ UDPGothic", "Yu Gothic UI", "Hiragino Sans", Meiryo, sans-serif';

  SP.uid = () => Math.random().toString(36).slice(2, 10);
  SP.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  SP.rad = d => d * Math.PI / 180;
  SP.deg = r => r * 180 / Math.PI;
  SP.normDeg = a => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
  SP.fmt = (n, dig = 0) => Number(n).toLocaleString('ja-JP', { minimumFractionDigits: dig, maximumFractionDigits: dig });
  SP.round = (v, step = 1) => Math.round(v / step) * step;

  /* ---------- 配置物の種類 ---------- */
  const shaku = n => Math.round(n * SP.SHAKU);
  const timpDia = inch => Math.round(inch * 25.4 + 80);   // 胴の外径の目安（ヘッド径 + 縁）

  SP.CATS = [
    { id: 'basic', name: '基本' },
    { id: 'riser', name: '山台' },
    { id: 'mallet', name: '鍵盤打楽器' },
    { id: 'perc', name: '打楽器' },
    { id: 'inst', name: 'その他の楽器' },
    { id: 'note', name: '注釈' },
  ];
  // layer: 0=エリア注釈 1=山台 2=一般 3=文字・寸法注釈
  // face: 指揮台へ向ける対象 / label: 略称を入れられる / count: 必要物一覧で数える
  SP.TYPES = {
    podium: { name: '指揮台', cat: 'basic', w: 900, d: 900, h: 200, shape: 'podium', layer: 2, count: true, rot: 180, short: '指揮' },
    cstand: { name: '指揮者用譜面台', cat: 'basic', w: 600, d: 90, h: 1100, shape: 'stand', layer: 2, count: true, rot: 180 },
    chair: { name: '椅子', cat: 'basic', w: 450, d: 450, h: 450, shape: 'chair', layer: 2, count: true, face: true, label: true },
    stand: { name: '譜面台', cat: 'basic', w: 480, d: 80, h: 1100, shape: 'stand', layer: 2, count: true, face: true },
    stool: { name: 'スツール（高椅子）', cat: 'basic', w: 400, d: 400, h: 650, shape: 'stool', layer: 2, count: true, face: true, label: true },
    pchair: { name: 'ピアノ椅子', cat: 'basic', w: 560, d: 350, h: 480, shape: 'bench', layer: 2, count: true, face: true },

    riser_63: { name: '山台 6×3尺', cat: 'riser', w: shaku(6), d: shaku(3), h: 300, shape: 'riser', layer: 1, count: true },
    riser_64: { name: '山台 6×4尺', cat: 'riser', w: shaku(6), d: shaku(4), h: 300, shape: 'riser', layer: 1, count: true },
    riser_66: { name: '山台 6×6尺', cat: 'riser', w: shaku(6), d: shaku(6), h: 300, shape: 'riser', layer: 1, count: true },
    riser_43: { name: '山台 4×3尺', cat: 'riser', w: shaku(4), d: shaku(3), h: 300, shape: 'riser', layer: 1, count: true },
    riser_33: { name: '山台 3×3尺', cat: 'riser', w: shaku(3), d: shaku(3), h: 300, shape: 'riser', layer: 1, count: true },

    marimba: { name: 'マリンバ', cat: 'mallet', w: 2500, d: 1000, h: 900, shape: 'mallet', layer: 2, count: true, short: 'Mar.' },
    xylo: { name: 'シロフォン', cat: 'mallet', w: 1700, d: 850, h: 900, shape: 'mallet', layer: 2, count: true, short: 'Xylo.' },
    vib: { name: 'ヴィブラフォン', cat: 'mallet', w: 1400, d: 850, h: 880, shape: 'mallet', layer: 2, count: true, short: 'Vib.' },
    glock: { name: 'グロッケン', cat: 'mallet', w: 900, d: 500, h: 850, shape: 'mallet', layer: 2, count: true, short: 'Glk.' },
    chimes: { name: 'チャイム', cat: 'mallet', w: 1500, d: 650, h: 1900, shape: 'chimes', layer: 2, count: true, short: 'Chm.' },

    timp23: { name: 'ティンパニ 23"', cat: 'perc', w: timpDia(23), d: timpDia(23), h: 720, shape: 'timp', layer: 2, count: true, short: '23"' },
    timp26: { name: 'ティンパニ 26"', cat: 'perc', w: timpDia(26), d: timpDia(26), h: 720, shape: 'timp', layer: 2, count: true, short: '26"' },
    timp29: { name: 'ティンパニ 29"', cat: 'perc', w: timpDia(29), d: timpDia(29), h: 720, shape: 'timp', layer: 2, count: true, short: '29"' },
    timp32: { name: 'ティンパニ 32"', cat: 'perc', w: timpDia(32), d: timpDia(32), h: 720, shape: 'timp', layer: 2, count: true, short: '32"' },
    bd: { name: 'バスドラム', cat: 'perc', w: 1000, d: 650, h: 1100, shape: 'bd', layer: 2, count: true, short: 'B.D.' },
    sd: { name: 'スネアドラム', cat: 'perc', w: 520, d: 520, h: 650, shape: 'drum', layer: 2, count: true, short: 'S.D.' },
    drumset: { name: 'ドラムセット', cat: 'perc', w: 1800, d: 1500, h: 1000, shape: 'drumset', layer: 2, count: true, short: 'Dr.' },
    cym: { name: 'サスペンデッドシンバル', cat: 'perc', w: 500, d: 500, h: 900, shape: 'cym', layer: 2, count: true, short: 'Sus.' },
    tamtam: { name: 'タムタム', cat: 'perc', w: 1300, d: 600, h: 1600, shape: 'tamtam', layer: 2, count: true, short: 'T-t.' },
    ptable: { name: '打楽器台', cat: 'perc', w: 900, d: 450, h: 800, shape: 'table', layer: 2, count: true, short: '台' },

    cb: { name: 'コントラバス', cat: 'inst', w: 700, d: 1200, h: 1850, shape: 'cb', layer: 2, count: true, face: true, label: true, defLabel: 'Cb' },
    piano: { name: 'グランドピアノ', cat: 'inst', w: 1500, d: 2100, h: 1000, shape: 'piano', layer: 2, count: true, short: 'Pf' },
    harp: { name: 'ハープ', cat: 'inst', w: 900, d: 600, h: 1800, shape: 'harp', layer: 2, count: true, face: true, short: 'Hp' },

    text: { name: 'テキスト', cat: 'note', w: 1600, d: 300, h: 0, shape: 'text', layer: 3, count: false, defLabel: 'テキスト' },
    dim: { name: '寸法線', cat: 'note', w: 3000, d: 0, h: 0, shape: 'dim', layer: 3, count: false },
    area: { name: 'エリア（迫り・反響板など）', cat: 'note', w: 3000, d: 2000, h: 0, shape: 'area', layer: 0, count: false, defLabel: '迫り' },
  };

  SP.PART_LABELS = ['Picc', 'Fl', 'Ob', 'E.H.', 'Bsn', 'E♭Cl', 'Cl', 'A.Cl', 'B.Cl', 'S.Sax', 'A.Sax', 'T.Sax', 'B.Sax',
    'Tp', 'Hr', 'Tb', 'B.Tb', 'Euph', 'Tuba', 'Cb', 'Perc', 'Hp', 'Pf'];
  SP.RISER_HEIGHTS = [0, 150, 200, 300, 400, 450, 600, 750, 900];

  /* ---------- 状態 ---------- */
  SP.newState = () => ({
    app: 'stage-planner', version: 1,
    name: '新しい舞台図',
    objects: [], groups: {},
    origin: { x: 0, y: 0 },
    bg: { src: null, w: 0, h: 0, x: 0, y: 0, opacity: 0.55, locked: true, visible: true, fileName: '', page: null },
    scale: { mmPerPx: null, calibrated: false, p1: null, p2: null, refMm: null, refLabel: '' },
    layers: { objects: true, labels: true, notes: true, grid: true },
  });
  SP.state = SP.newState();
  SP.sel = new Set();
  SP.view = { zoom: 0.05, x: -2000, y: -2000 };   // zoom = 画面px / mm
  SP.opts = { continuous: false, autoFace: true, snap: true, snapMm: 50 };
  SP.bgImg = null;

  /* ---------- イベント ---------- */
  const listeners = {};
  SP.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  SP.emit = (ev, ...args) => { (listeners[ev] || []).forEach(fn => fn(...args)); };

  /* ---------- 縮尺 ---------- */
  // 背景画像の 1px が何 mm か。未登録なら仮の値（図面幅 ≒ 20m）
  SP.mmPerPx = () => {
    const s = SP.state.scale;
    if (s.mmPerPx) return s.mmPerPx;
    return SP.state.bg.w ? 20000 / SP.state.bg.w : 10;
  };
  SP.bgRect = () => {
    const b = SP.state.bg, k = SP.mmPerPx();
    return { x: b.x || 0, y: b.y || 0, w: b.w * k, h: b.h * k };
  };

  /* ---------- 履歴 ---------- */
  const H = { stack: [], idx: -1 };
  const snapshot = () => {
    const s = SP.state;
    return JSON.stringify({ name: s.name, objects: s.objects, groups: s.groups, origin: s.origin, scale: s.scale, layers: s.layers, bgPos: { x: s.bg.x || 0, y: s.bg.y || 0 } });
  };
  SP.commit = () => {
    const snap = snapshot();
    if (H.stack[H.idx] !== snap) {
      H.stack = H.stack.slice(0, H.idx + 1);
      H.stack.push(snap);
      if (H.stack.length > 200) H.stack.shift();
      H.idx = H.stack.length - 1;
    }
    SP.emit('change');
  };
  SP.resetHistory = () => { H.stack = [snapshot()]; H.idx = 0; SP.emit('history'); };
  SP.canUndo = () => H.idx > 0;
  SP.canRedo = () => H.idx < H.stack.length - 1;
  const restore = snap => {
    const o = JSON.parse(snap), pos = o.bgPos;
    delete o.bgPos;
    Object.assign(SP.state, o);
    if (pos) { SP.state.bg.x = pos.x; SP.state.bg.y = pos.y; }
    SP.sel = new Set([...SP.sel].filter(id => SP.byId(id)));
    SP.emit('change'); SP.emit('select');
  };
  SP.undo = () => { if (SP.canUndo()) { H.idx--; restore(H.stack[H.idx]); } };
  SP.redo = () => { if (SP.canRedo()) { H.idx++; restore(H.stack[H.idx]); } };

  /* ---------- 配置物 ---------- */
  SP.byId = id => SP.state.objects.find(o => o.id === id);
  SP.typeOf = o => SP.TYPES[o.type] || SP.TYPES.chair;

  const mctx = document.createElement('canvas').getContext('2d');
  SP.measureText = (text, sizeMm) => {
    mctx.font = `100px ${SP.FONT}`;
    return Math.max(sizeMm, mctx.measureText(text || ' ').width * sizeMm / 100);
  };

  SP.makeObject = (type, x, y, extra) => {
    const t = SP.TYPES[type];
    const o = { id: SP.uid(), type, x: Math.round(x), y: Math.round(y), rot: t.rot || 0, w: t.w, d: t.d, h: t.h || 0, label: t.defLabel || '' };
    if (extra) Object.assign(o, extra);
    if (type === 'text') o.w = Math.round(SP.measureText(o.label, o.d) + o.d * 0.4);
    return o;
  };
  SP.fitTextBox = o => { if (o.type === 'text') o.w = Math.round(SP.measureText(o.label, o.d) + o.d * 0.4); };

  SP.deleteIds = ids => {
    const del = new Set(ids);
    SP.state.objects = SP.state.objects.filter(o => !del.has(o.id));
    SP.cleanGroups();
    del.forEach(id => SP.sel.delete(id));
  };
  SP.cleanGroups = () => {
    const used = {};
    SP.state.objects.forEach(o => { if (o.groupId) used[o.groupId] = (used[o.groupId] || 0) + 1; });
    for (const gid of Object.keys(SP.state.groups)) if ((used[gid] || 0) < 2) {
      delete SP.state.groups[gid];
      SP.state.objects.forEach(o => { if (o.groupId === gid) delete o.groupId; });
    }
  };
  SP.groupMembers = gid => SP.state.objects.filter(o => o.groupId === gid);
  SP.expandIds = ids => {
    const out = new Set();
    ids.forEach(id => {
      const o = SP.byId(id); if (!o) return;
      if (o.groupId && SP.state.groups[o.groupId]) SP.groupMembers(o.groupId).forEach(m => out.add(m.id));
      else out.add(o.id);
    });
    return out;
  };
  SP.selObjects = () => SP.state.objects.filter(o => SP.sel.has(o.id));
  // 選択がちょうど1グループ全体ならそのグループID
  SP.selGroupId = () => {
    const objs = SP.selObjects();
    if (objs.length < 2) return null;
    const gid = objs[0].groupId;
    if (!gid || !objs.every(o => o.groupId === gid)) return null;
    return SP.groupMembers(gid).length === objs.length ? gid : null;
  };
  SP.makeGroup = (objs, kind, name) => {
    const gid = SP.uid();
    SP.state.groups[gid] = { id: gid, kind: kind || 'custom', name: name || `グループ（${objs.length}点）` };
    objs.forEach(o => { o.groupId = gid; });
    SP.cleanGroups();
    return gid;
  };
  SP.ungroup = gid => {
    SP.groupMembers(gid).forEach(o => { delete o.groupId; });
    delete SP.state.groups[gid];
  };

  /* ---------- 幾何 ---------- */
  SP.rotPt = (px, py, cx, cy, deg) => {
    const r = SP.rad(deg), c = Math.cos(r), s = Math.sin(r), dx = px - cx, dy = py - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  };
  // 正面の向き（単位ベクトル）
  SP.frontVec = rot => { const r = SP.rad(rot); return { x: -Math.sin(r), y: Math.cos(r) }; };
  // (x,y) から (tx,ty) を向くときの rot
  SP.faceAngle = (x, y, tx, ty) => Math.round(SP.deg(Math.atan2(-(tx - x), ty - y)) * 10) / 10;
  SP.findPodium = () => SP.state.objects.find(o => o.type === 'podium');

  SP.corners = o => {
    const hw = o.w / 2, hd = Math.max(o.d, 1) / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => SP.rotPt(o.x + lx, o.y + ly, o.x, o.y, o.rot));
  };
  SP.boundsOf = objs => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    objs.forEach(o => SP.corners(o).forEach(p => {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }));
    return isFinite(x0) ? { x0, y0, x1, y1 } : null;
  };
  SP.hitTest = (o, x, y, tol) => {
    const p = SP.rotPt(x, y, o.x, o.y, -o.rot);
    const hd = o.type === 'dim' ? 0 : o.d / 2;
    return Math.abs(p.x - o.x) <= o.w / 2 + tol && Math.abs(p.y - o.y) <= hd + tol;
  };
  SP.layerVisible = o => {
    const t = SP.typeOf(o), L = SP.state.layers;
    return (t.layer === 0 || t.layer === 3) ? L.notes : L.objects;
  };
  // 描画順：エリア → 山台 → 一般 → 注釈、同順位は追加順
  SP.sortedObjects = list => list.map((o, i) => [o, i])
    .sort((a, b) => (SP.typeOf(a[0]).layer - SP.typeOf(b[0]).layer) || (a[1] - b[1])).map(p => p[0]);

  // 点の下にある山台の最大段高（3D の床高さ）
  SP.floorHeightAt = (x, y, exceptId) => {
    let h = 0;
    SP.state.objects.forEach(o => {
      if (o.id === exceptId || SP.typeOf(o).shape !== 'riser') return;
      if (SP.hitTest(o, x, y, 0)) h = Math.max(h, o.h || 0);
    });
    return h;
  };

  /* ---------- 必要物一覧 ---------- */
  SP.inventory = objs => {
    const rows = new Map(), parts = new Map();
    objs.forEach(o => {
      const t = SP.typeOf(o);
      if (!t.count) return;
      const name = t.shape === 'riser' ? `${t.name}　段高 ${o.h || 0}mm` : t.name;
      const key = o.type + '|' + name;
      const r = rows.get(key) || { cat: t.cat, name, n: 0, order: Object.keys(SP.TYPES).indexOf(o.type), h: o.h || 0 };
      r.n++; rows.set(key, r);
      if (t.label && o.label) parts.set(o.label, (parts.get(o.label) || 0) + 1);
    });
    const list = [...rows.values()].sort((a, b) =>
      SP.CATS.findIndex(c => c.id === a.cat) - SP.CATS.findIndex(c => c.id === b.cat) || a.order - b.order || b.h - a.h);
    const order = SP.PART_LABELS;
    const partList = [...parts.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0].replace(/\d+$/, '')), ib = order.indexOf(b[0].replace(/\d+$/, ''));
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
    return { list, parts: partList };
  };

  /* ---------- 小物 ---------- */
  SP.toast = (msg, kind) => {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), kind ? 4200 : 2600);
  };
  SP.confirm = (title, msg, okLabel) => new Promise(resolve => {
    const d = document.getElementById('dlg-confirm');
    document.getElementById('cf-title').textContent = title;
    document.getElementById('cf-msg').textContent = msg;
    const ok = document.getElementById('cf-ok'), cancel = document.getElementById('cf-cancel');
    ok.textContent = okLabel || 'OK';
    const done = v => { ok.onclick = cancel.onclick = null; d.onclose = null; if (d.open) d.close(); resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    d.onclose = () => done(false);
    d.showModal();
  });
  SP.download = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const loaded = {};
  SP.loadScript = src => loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error(`ライブラリ ${src} を読み込めませんでした（vendor フォルダがそろっているか確認してください）`)); };
    document.head.appendChild(s);
  }));
  SP.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  SP.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
})();
