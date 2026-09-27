/* 編集画面：表示変換・マウス操作・モード管理・キーボード */
(function () {
  'use strict';
  const SP = window.SP;
  let canvas, ctx, dpr = 1, W = 0, H = 0;
  let ghost = null, calibPts = [], drag = null, spaceDown = false, cursorW = null, raf = 0, clip = [];
  SP.mode = 'select';
  SP.placeType = null;
  SP.placeRot = 0;
  SP.activeTool = null;

  const MODE_NAMES = { select: '選択', place: '配置', calib: '縮尺合わせ', verify: '縮尺確認', origin: '原点指定', tool: '一括配置' };

  /* ---------- 座標変換 ---------- */
  const toWorld = e => {
    const r = canvas.getBoundingClientRect();
    return { x: SP.view.x + (e.clientX - r.left) / SP.view.zoom, y: SP.view.y + (e.clientY - r.top) / SP.view.zoom, sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const cssToMm = n => n / SP.view.zoom;
  const capture = e => { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 取得できなくても操作は続ける */ } };
  // タッチ操作：指ごとの位置と、2本指のピンチ状態
  const touches = new Map();
  let pinch = null, coarse = window.matchMedia('(pointer: coarse)').matches;
  const hitPx = () => coarse ? 12 : 4;        // 当たり判定の余裕（画面px）
  const handlePx = () => coarse ? 22 : 10;    // ハンドルをつかめる半径（画面px）
  const handleR = () => coarse ? 10 : 7;      // ハンドルの描画半径（画面px）
  SP.viewRect = () => ({ x0: SP.view.x, y0: SP.view.y, x1: SP.view.x + W / SP.view.zoom, y1: SP.view.y + H / SP.view.zoom });
  SP.viewCenter = () => ({ x: SP.view.x + W / 2 / SP.view.zoom, y: SP.view.y + H / 2 / SP.view.zoom });

  const snapV = (v, axis) => SP.opts.snap ? SP.round(v - SP.state.origin[axis], SP.opts.snapMm) + SP.state.origin[axis] : Math.round(v);
  SP.snapPt = (p, force) => (SP.opts.snap || force) ? { x: snapV(p.x, 'x'), y: snapV(p.y, 'y') } : { x: Math.round(p.x), y: Math.round(p.y) };

  /* ---------- 描画 ---------- */
  SP.render = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function draw() {
    raf = 0;
    if (!canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = SP.COLORS.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const L = SP.state.layers;
    const T = { zoom: SP.view.zoom * dpr, x: SP.view.x, y: SP.view.y, W: canvas.width, H: canvas.height };
    SP.drawScene(ctx, T, { bg: true, objects: L.objects, labels: L.labels, notes: L.notes, grid: L.grid, lw: 1.2 });
    const px = 1 / T.zoom, u = dpr * px;          // u = 1 CSS px の mm
    const C = SP.COLORS;

    if (SP.state.bg.src && SP.state.bg.visible) {
      const r = SP.bgRect();
      ctx.strokeStyle = 'rgba(60,60,80,.35)'; ctx.lineWidth = u; ctx.setLineDash([u * 4, u * 4]);
      ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
    }
    // 原点
    const o = SP.state.origin;
    ctx.strokeStyle = C.note; ctx.lineWidth = 1.4 * u; ctx.beginPath();
    ctx.moveTo(o.x - 14 * u, o.y); ctx.lineTo(o.x + 14 * u, o.y); ctx.moveTo(o.x, o.y - 14 * u); ctx.lineTo(o.x, o.y + 14 * u); ctx.stroke();
    ctx.beginPath(); ctx.arc(o.x, o.y, 5 * u, 0, Math.PI * 2); ctx.stroke();

    // 選択
    if (SP.sel.size) {
      ctx.strokeStyle = C.sel; ctx.lineWidth = 1.6 * u;
      SP.selObjects().forEach(ob => {
        const cs = SP.corners(ob), pad = ob.type === 'dim' ? 6 * u : 0;
        if (pad) { const a = SP.corners({ ...ob, d: pad * 2 }); cs.splice(0, 4, ...a); }
        ctx.beginPath(); cs.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      });
      if (SP.mode === 'select') {
        const b = SP.boundsOf(SP.selObjects());
        if (b) {
          if (SP.sel.size > 1) { ctx.setLineDash([u * 5, u * 4]); ctx.lineWidth = u; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.setLineDash([]); }
          const h = rotHandlePos(b);
          ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(h.x, b.y0); ctx.lineTo(h.x, h.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(h.x, h.y, (handleR() - 1) * u, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2 * u; ctx.stroke();
          ctx.beginPath(); ctx.arc(h.x, h.y, 2.5 * u, -0.3, Math.PI * 1.4); ctx.lineWidth = 1.2 * u; ctx.stroke();
        }
      }
    }
    // 配置ゴースト
    if (SP.mode === 'place' && ghost) {
      ctx.save(); ctx.globalAlpha = 0.55;
      SP.drawObject(ctx, SP.makeObject(SP.placeType, ghost.x, ghost.y, { rot: ghostRot(ghost) }), px, { lw: 1.2, labels: true });
      ctx.restore();
    }
    // 一括配置プレビュー
    const tool = SP.activeTool;
    if (tool) {
      ctx.save(); ctx.globalAlpha = 0.72;
      tool.getPreview().forEach(ob => SP.drawObject(ctx, ob, px, { lw: 1.2, labels: true }));
      ctx.restore();
      if (tool.drawGuides) tool.drawGuides(ctx, u);
      (tool.getHandles() || []).forEach(h => {
        ctx.beginPath(); ctx.arc(h.x, h.y, handleR() * u, 0, Math.PI * 2);
        ctx.fillStyle = h.fill || '#fff'; ctx.fill(); ctx.strokeStyle = C.ghost; ctx.lineWidth = 2 * u; ctx.stroke();
        if (h.label) {
          ctx.font = `${11 * u}px ${SP.FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3 * u; ctx.strokeStyle = '#fff'; ctx.strokeText(h.label, h.x + 11 * u, h.y);
          ctx.fillStyle = C.ghost; ctx.fillText(h.label, h.x + 11 * u, h.y);
        }
      });
    }
    // 縮尺の点
    if (SP.mode === 'calib' || SP.mode === 'verify') {
      const k = SP.mmPerPx(), s = SP.state.scale, br = SP.bgRect();
      const w = p => ({ x: br.x + p.x * k, y: br.y + p.y * k });
      if (SP.mode === 'verify' && s.p1 && s.p2) {
        const a = w(s.p1), b = w(s.p2);
        ctx.strokeStyle = 'rgba(46,122,78,.8)'; ctx.lineWidth = 2 * u; ctx.setLineDash([u * 6, u * 4]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        [a, b].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 * u, 0, Math.PI * 2); ctx.fillStyle = 'rgba(46,122,78,.85)'; ctx.fill(); });
      }
      const pts = calibPts.map(w);
      if (pts.length === 1 && cursorW) pts.push({ x: cursorW.x, y: cursorW.y, rubber: true });
      if (pts.length === 2) { ctx.strokeStyle = '#d0231b'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); }
      pts.forEach(p => {
        if (p.rubber) return;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 * u, 0, Math.PI * 2);
        ctx.fillStyle = '#e0261d'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.stroke();
      });
    }
    // 範囲選択
    if (drag && drag.kind === 'marquee') {
      const a = drag.start, b = drag.cur;
      ctx.fillStyle = 'rgba(47,111,214,.08)'; ctx.strokeStyle = C.sel; ctx.lineWidth = u; ctx.setLineDash([u * 4, u * 3]);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y)); ctx.setLineDash([]);
    }
    updateStatus();
  }

  const rotHandlePos = b => ({ x: (b.x0 + b.x1) / 2, y: b.y0 - cssToMm(coarse ? 40 : 28) });

  function ghostRot(p) {
    const t = SP.TYPES[SP.placeType], pod = SP.findPodium();
    if (t.face && SP.opts.autoFace && pod) return SP.faceAngle(p.x, p.y, pod.x, pod.y);
    return SP.placeRot;
  }

  /* ---------- ステータスバー ---------- */
  function updateStatus() {
    const s = SP.state.scale, el = document.getElementById('st-scale');
    if (s.calibrated) { el.textContent = `1px ＝ ${SP.fmt(s.mmPerPx, s.mmPerPx < 1 ? 3 : 2)} mm`; el.classList.remove('unset'); }
    else if (SP.state.bg.src) { el.textContent = `縮尺未設定（仮 1px ＝ ${SP.fmt(SP.mmPerPx(), 2)} mm）`; el.classList.add('unset'); }
    else { el.textContent = '図面なし（mm で直接配置）'; el.classList.remove('unset'); }
    document.getElementById('st-zoom').textContent = `画面上 約1:${SP.fmt(1 / SP.view.zoom / 0.2646)}`;
    document.getElementById('st-mode').textContent = `モード：${MODE_NAMES[SP.mode] || SP.mode}`;
    if (cursorW) {
      const o = SP.state.origin;
      document.getElementById('st-cursor').textContent = `X ${SP.fmt(cursorW.x - o.x)}　Y ${SP.fmt(cursorW.y - o.y)} mm`;
    }
  }

  /* ---------- モード ---------- */
  // モード表示（タッチ操作でも終了・確定できるようにボタンを付ける）
  let bannerActs = [];
  const banner = (text, acts) => {
    const b = document.getElementById('mode-banner');
    if (acts) bannerActs = acts;
    b.innerHTML = '';
    if (!text) { b.hidden = true; return; }
    const s = document.createElement('span'); s.textContent = text; b.appendChild(s);
    bannerActs.forEach(([label, fn, primary]) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = label; if (primary) btn.className = 'primary';
      btn.onclick = fn; b.appendChild(btn);
    });
    b.hidden = false;
  };
  const exitMode = () => { SP.setMode('select'); SP.emit('libclear'); };
  SP.setMode = (mode, arg) => {
    SP.activeTool = null;
    SP.mode = mode;
    SP.placeType = mode === 'place' ? arg : null;
    if (mode === 'place') SP.placeRot = SP.TYPES[arg].rot || 0;
    calibPts = []; ghost = null;
    const texts = {
      place: mode === 'place' ? `「${SP.TYPES[arg].name}」を配置：タップ／クリックで置く（R キーで回転）` : '',
      calib: '縮尺合わせ：実寸が分かっている区間の1点目を指定（拡大してから指定すると正確です）',
      verify: '縮尺確認：縮尺合わせと同じ基準区間（緑の点線）の1点目を指定',
      origin: '原点にしたい点を指定（例：舞台センターの舞台端）',
      tool: typeof arg === 'string' ? arg : '',
    };
    const acts = mode === 'tool'
      ? [['配置する', () => SP.activeTool && SP.activeTool.apply(), true], ['キャンセル', () => SP.endTool()]]
      : [['終了', exitMode]];
    banner(texts[mode] || '', acts);
    canvas.style.cursor = mode === 'select' || mode === 'tool' ? 'default' : 'crosshair';
    SP.emit('mode');
    SP.render();
  };
  SP.startTool = tool => {
    SP.setMode('tool', tool.hint);
    SP.activeTool = tool;
    SP.sel = new Set(); SP.emit('select');
    SP.emit('tool'); SP.render();
  };
  SP.endTool = () => { SP.setMode('select'); SP.emit('tool'); };
  SP.clearCalibPts = () => { calibPts = []; SP.render(); };

  /* ---------- 表示 ---------- */
  SP.fitView = () => {
    let b = SP.boundsOf(SP.state.objects);
    if (SP.state.bg.src) {
      const r = SP.bgRect();
      b = b ? { x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.w), y1: Math.max(b.y1, r.y + r.h) } : { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
    }
    if (!b) { const o = SP.state.origin; b = { x0: o.x - 9000, y0: o.y - 11000, x1: o.x + 9000, y1: o.y + 2000 }; }
    const bw = Math.max(b.x1 - b.x0, 2000), bh = Math.max(b.y1 - b.y0, 2000);
    const z = Math.min(W / (bw * 1.1), H / (bh * 1.1));
    SP.view.zoom = SP.clamp(z, 0.003, 3);
    SP.view.x = (b.x0 + b.x1) / 2 - W / 2 / SP.view.zoom;
    SP.view.y = (b.y0 + b.y1) / 2 - H / 2 / SP.view.zoom;
    SP.render();
  };
  const zoomAt = (sx, sy, f) => {
    const wx = SP.view.x + sx / SP.view.zoom, wy = SP.view.y + sy / SP.view.zoom;
    SP.view.zoom = SP.clamp(SP.view.zoom * f, 0.003, 3);
    SP.view.x = wx - sx / SP.view.zoom; SP.view.y = wy - sy / SP.view.zoom;
    SP.render(); SP.emit('view');
  };

  /* ---------- ヒットテスト ---------- */
  SP.hitAt = (x, y) => {
    const list = SP.sortedObjects(SP.state.objects);
    const tol = cssToMm(hitPx());
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (!SP.layerVisible(o)) continue;
      if (SP.hitTest(o, x, y, o.type === 'dim' ? cssToMm(hitPx() + 4) : tol)) return o;
    }
    return null;
  };
  const toolHandleAt = p => {
    const hs = SP.activeTool.getHandles() || [];
    for (let i = hs.length - 1; i >= 0; i--) if (Math.hypot(hs[i].x - p.x, hs[i].y - p.y) <= cssToMm(handlePx())) return hs[i];
    return null;
  };
  const onRotHandle = p => {
    if (!SP.sel.size) return null;
    const b = SP.boundsOf(SP.selObjects()), h = b && rotHandlePos(b);
    return h && Math.hypot(h.x - p.x, h.y - p.y) <= cssToMm(handlePx()) ? b : null;
  };

  /* ---------- タッチ：2本指で移動・拡大縮小 ---------- */
  function cancelDrag() {
    if (!drag) return;
    if ((drag.kind === 'move' || drag.kind === 'rotate') && drag.orig) drag.orig.forEach(r => { r.o.x = r.x; r.o.y = r.y; if (r.rot !== undefined) r.o.rot = r.rot; });
    if (drag.kind === 'bg') { SP.state.bg.x = drag.ox; SP.state.bg.y = drag.oy; }
    drag = null;
    SP.emit('live');
  }
  function pinchGeom() {
    const [a, b] = [...touches.values()], r = canvas.getBoundingClientRect();
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
  }
  function startPinch() {
    const g = pinchGeom();
    pinch = { d0: g.d, z0: SP.view.zoom, wx: SP.view.x + g.mx / SP.view.zoom, wy: SP.view.y + g.my / SP.view.zoom };
  }
  function updatePinch() {
    const g = pinchGeom();
    SP.view.zoom = SP.clamp(pinch.z0 * g.d / pinch.d0, 0.003, 3);
    SP.view.x = pinch.wx - g.mx / SP.view.zoom;
    SP.view.y = pinch.wy - g.my / SP.view.zoom;
    SP.render(); SP.emit('view');
  }
  // 配置・縮尺・原点は「指を離した位置」で確定（2本指の操作と区別するため）
  function performTap(p) {
    if (SP.mode === 'place') placeAt(p);
    else if (SP.mode === 'calib' || SP.mode === 'verify') pickPoint(p);
    else if (SP.mode === 'origin') {
      const q = SP.snapPt(p);
      SP.state.origin = { x: q.x, y: q.y }; SP.commit();
      SP.toast('原点を設定しました。座標はここを 0,0 として表示されます');
      SP.setMode('select');
    }
  }

  /* ---------- 選択物の操作 ---------- */
  SP.rotateSel = delta => {
    const objs = SP.selObjects(); if (!objs.length) return;
    if (objs.length === 1) objs[0].rot = SP.normDeg(objs[0].rot + delta);
    else {
      const b = SP.boundsOf(objs), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      objs.forEach(o => { const p = SP.rotPt(o.x, o.y, cx, cy, delta); o.x = Math.round(p.x); o.y = Math.round(p.y); o.rot = SP.normDeg(o.rot + delta); });
    }
    SP.commit();
  };
  SP.faceSelToPodium = () => {
    const pod = SP.findPodium();
    if (!pod) { SP.toast('指揮台がありません。先に指揮台を配置してください', 'warn'); return; }
    let n = 0;
    SP.selObjects().forEach(o => { if (SP.typeOf(o).face) { o.rot = SP.faceAngle(o.x, o.y, pod.x, pod.y); n++; } });
    if (n) { SP.commit(); SP.toast(`${n}点を指揮台へ向けました`); } else SP.toast('指揮台へ向けられる配置物（椅子・譜面台など）が選択されていません', 'warn');
  };
  SP.deleteSel = () => { if (!SP.sel.size) return; const n = SP.sel.size; SP.deleteIds([...SP.sel]); SP.commit(); SP.emit('select'); SP.toast(`${n}点を削除しました`); };
  SP.copySel = () => { clip = JSON.parse(JSON.stringify(SP.selObjects())); if (clip.length) SP.toast(`${clip.length}点をコピーしました`); };
  SP.paste = () => {
    if (!clip.length) return;
    const gmap = {}, off = 300;
    const news = clip.map(o => {
      const n = { ...o, id: SP.uid(), x: o.x + off, y: o.y + off };
      if (o.groupId) {
        if (!gmap[o.groupId]) {
          const g = SP.state.groups[o.groupId] || { kind: 'custom', name: 'グループ' };
          gmap[o.groupId] = SP.uid();
          SP.state.groups[gmap[o.groupId]] = { ...g, id: gmap[o.groupId] };
        }
        n.groupId = gmap[o.groupId];
      }
      return n;
    });
    SP.state.objects.push(...news); SP.cleanGroups();
    clip = JSON.parse(JSON.stringify(news));
    SP.sel = new Set(news.map(o => o.id)); SP.commit(); SP.emit('select');
  };
  SP.duplicateSel = () => { SP.copySel(); SP.paste(); };
  SP.groupSel = () => {
    const objs = SP.selObjects(); if (objs.length < 2) { SP.toast('2点以上選択するとグループ化できます', 'warn'); return; }
    SP.makeGroup(objs, 'custom'); SP.commit(); SP.emit('select');
  };
  SP.ungroupSel = () => {
    const gids = new Set(SP.selObjects().map(o => o.groupId).filter(Boolean));
    if (!gids.size) return;
    gids.forEach(g => SP.ungroup(g)); SP.commit(); SP.emit('select'); SP.toast('グループを解除しました。1点ずつ動かせます');
  };
  const nudge = (dx, dy) => { SP.selObjects().forEach(o => { o.x += dx; o.y += dy; }); SP.commit(); };

  /* ---------- ポインタ ---------- */
  function onDown(e) {
    canvas.focus({ preventScroll: true });
    coarse = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      capture(e);
      if (touches.size === 2) { cancelDrag(); startPinch(); SP.render(); return; }
      if (touches.size > 2) return;
    }
    const p = toWorld(e);
    if (e.button === 1 || e.button === 2 || spaceDown) {
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: SP.view.x, vy: SP.view.y };
      capture(e); canvas.style.cursor = 'grabbing'; e.preventDefault(); return;
    }
    if (e.button !== 0) return;
    capture(e);

    if (SP.mode === 'place' || SP.mode === 'calib' || SP.mode === 'verify' || SP.mode === 'origin') {
      drag = { kind: 'tap', p, sx: e.clientX, sy: e.clientY, vx: SP.view.x, vy: SP.view.y };
      return;
    }
    if (SP.mode === 'tool' && SP.activeTool) {
      const h = toolHandleAt(p);
      if (h) { drag = { kind: 'handle', id: h.id }; return; }
      if (SP.activeTool.hitBody && SP.activeTool.hitBody(p.x, p.y)) { drag = { kind: 'toolbody', start: p, last: p }; return; }
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: SP.view.x, vy: SP.view.y };
      return;
    }
    // 選択モード
    {
      const b = onRotHandle(p);
      if (b) {
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        drag = { kind: 'rotate', cx, cy, a0: SP.deg(Math.atan2(p.y - cy, p.x - cx)), orig: SP.selObjects().map(o => ({ o, x: o.x, y: o.y, rot: o.rot })), single: SP.sel.size === 1 };
        return;
      }
    }
    const hit = SP.hitAt(p.x, p.y);
    if (hit) {
      const ids = e.altKey ? new Set([hit.id]) : SP.expandIds([hit.id]);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const allIn = [...ids].every(id => SP.sel.has(id));
        ids.forEach(id => allIn ? SP.sel.delete(id) : SP.sel.add(id));
        SP.emit('select'); SP.render(); return;
      }
      if (!SP.sel.has(hit.id)) { SP.sel = ids; SP.emit('select'); }
      drag = { kind: 'move', start: p, hit, ids, anchor: { x: hit.x, y: hit.y }, orig: SP.selObjects().map(o => ({ o, x: o.x, y: o.y })), moved: false };
    } else {
      if (!e.shiftKey && SP.sel.size) { SP.sel = new Set(); SP.emit('select'); }
      const bg = SP.state.bg, br = SP.bgRect();
      if (bg.src && bg.visible && !bg.locked && !e.shiftKey && p.x >= br.x && p.x <= br.x + br.w && p.y >= br.y && p.y <= br.y + br.h) {
        drag = { kind: 'bg', start: p, ox: br.x, oy: br.y, moved: false };
        canvas.style.cursor = 'grabbing';
      } else drag = { kind: 'marquee', start: p, cur: p, additive: e.shiftKey };
    }
    SP.render();
  }

  function onMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) { if (touches.size >= 2) updatePinch(); return; }
    const p = toWorld(e);
    cursorW = p;
    if (drag && drag.kind === 'tap' && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > (coarse ? 10 : 5)) {
      drag = { kind: 'pan', sx: drag.sx, sy: drag.sy, vx: drag.vx, vy: drag.vy };   // 1本指ドラッグは表示の移動に切り替える
    }
    if (!drag) {
      if (SP.mode === 'place') ghost = SP.snapPt(p);
      else if (SP.mode === 'select') {
        let cur = spaceDown ? 'grab' : 'default';
        if (!spaceDown && onRotHandle(p)) cur = 'alias';
        if (cur === 'default' && SP.hitAt(p.x, p.y)) cur = 'move';
        canvas.style.cursor = cur;
      } else if (SP.mode === 'tool' && SP.activeTool) {
        canvas.style.cursor = toolHandleAt(p) ? 'pointer' : (SP.activeTool.hitBody && SP.activeTool.hitBody(p.x, p.y) ? 'move' : 'default');
      }
      SP.render(); return;
    }
    switch (drag.kind) {
      case 'pan':
        SP.view.x = drag.vx - (e.clientX - drag.sx) / SP.view.zoom;
        SP.view.y = drag.vy - (e.clientY - drag.sy) / SP.view.zoom;
        SP.emit('view'); break;
      case 'move': {
        let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) * SP.view.zoom < (coarse ? 6 : 3)) return;
        drag.moved = true;
        if (SP.opts.snap && !e.altKey) { dx = snapV(drag.anchor.x + dx, 'x') - drag.anchor.x; dy = snapV(drag.anchor.y + dy, 'y') - drag.anchor.y; }
        drag.orig.forEach(r => { r.o.x = Math.round(r.x + dx); r.o.y = Math.round(r.y + dy); });
        SP.emit('live'); break;
      }
      case 'rotate': {
        let delta = SP.deg(Math.atan2(p.y - drag.cy, p.x - drag.cx)) - drag.a0;
        delta = e.shiftKey ? SP.round(delta, 15) : Math.round(delta);
        drag.orig.forEach(r => {
          if (!drag.single) { const q = SP.rotPt(r.x, r.y, drag.cx, drag.cy, delta); r.o.x = Math.round(q.x); r.o.y = Math.round(q.y); }
          r.o.rot = SP.normDeg(r.rot + delta);
        });
        drag.moved = true; SP.emit('live'); break;
      }
      case 'marquee': drag.cur = p; break;
      case 'bg':
        SP.state.bg.x = Math.round(drag.ox + p.x - drag.start.x);
        SP.state.bg.y = Math.round(drag.oy + p.y - drag.start.y);
        drag.moved = true; break;
      case 'handle': SP.activeTool.dragHandle(drag.id, p, e); SP.emit('toolchange'); break;
      case 'toolbody': SP.activeTool.moveBody(p.x - drag.last.x, p.y - drag.last.y); drag.last = p; SP.emit('toolchange'); break;
    }
    SP.render();
  }

  function onUp(e) {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (pinch) { if (touches.size < 2) pinch = null; drag = null; SP.render(); return; }
    }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'tap') { performTap(d.p); SP.render(); return; }
    if (d.kind === 'pan') canvas.style.cursor = spaceDown ? 'grab' : (SP.mode === 'select' || SP.mode === 'tool' ? 'default' : 'crosshair');
    if (d.kind === 'move') {
      if (d.moved) SP.commit();
      else if (!e.shiftKey && SP.sel.size > d.ids.size) { SP.sel = d.ids; SP.emit('select'); }
    }
    if (d.kind === 'rotate' && d.moved) SP.commit();
    if (d.kind === 'bg') { canvas.style.cursor = 'default'; if (d.moved) { SP.commit(); SP.emit('bgchange'); } }
    if (d.kind === 'marquee') {
      const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
      if ((x1 - x0) * SP.view.zoom > 3 || (y1 - y0) * SP.view.zoom > 3) {
        const hits = SP.state.objects.filter(o => SP.layerVisible(o) && o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1).map(o => o.id);
        const ids = SP.expandIds(hits);
        SP.sel = d.additive ? new Set([...SP.sel, ...ids]) : ids;
        SP.emit('select');
      }
    }
    if (d.kind === 'handle' || d.kind === 'toolbody') SP.emit('toolchange');
    SP.render();
  }

  function placeAt(p) {
    const q = SP.snapPt(p);
    const o = SP.makeObject(SP.placeType, q.x, q.y, { rot: ghostRot(q) });
    SP.state.objects.push(o);
    SP.sel = new Set([o.id]);
    SP.commit(); SP.emit('select');
    if (!SP.opts.continuous) { SP.setMode('select'); SP.emit('libclear'); }
  }

  function pickPoint(p) {
    if (!SP.state.bg.src) { SP.toast('先に図面を読み込んでください', 'warn'); return; }
    const k = SP.mmPerPx(), br = SP.bgRect();
    calibPts.push({ x: (p.x - br.x) / k, y: (p.y - br.y) / k });
    if (calibPts.length === 1) banner(SP.mode === 'calib' ? '縮尺合わせ：2点目をクリック' : '縮尺確認：2点目をクリック');
    SP.render();
    if (calibPts.length === 2) {
      const pts = calibPts.slice();
      banner('');
      setTimeout(() => SP.onCalibPoints(pts, SP.mode), 60);
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const k = e.deltaMode === 1 ? 0.05 : 0.0016;
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * k));
  }
  function onDbl(e) {
    if (SP.mode !== 'select') return;
    const p = toWorld(e), hit = SP.hitAt(p.x, p.y);
    if (hit) { SP.sel = new Set([hit.id]); SP.emit('select'); SP.emit('focusLabel'); }
  }

  /* ---------- キーボード ---------- */
  function onKey(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (document.querySelector('dialog[open]') || !document.getElementById('view3d').hidden) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey, kl = k.length === 1 ? k.toLowerCase() : k;
    if (k === ' ') { if (!spaceDown) { spaceDown = true; canvas.style.cursor = 'grab'; } e.preventDefault(); return; }
    if (mod) {
      const act = { z: () => e.shiftKey ? SP.redo() : SP.undo(), y: SP.redo, c: SP.copySel, v: SP.paste, d: SP.duplicateSel,
        a: () => { SP.sel = new Set(SP.state.objects.filter(SP.layerVisible).map(o => o.id)); SP.emit('select'); SP.render(); },
        g: () => e.shiftKey ? SP.ungroupSel() : SP.groupSel(), s: () => SP.saveProject && SP.saveProject() }[kl];
      if (act) { e.preventDefault(); act(); }
      return;
    }
    if (k === 'Escape') {
      if (SP.activeTool) SP.endTool();
      else if (SP.mode !== 'select') { SP.setMode('select'); SP.emit('libclear'); }
      else if (SP.sel.size) { SP.sel = new Set(); SP.emit('select'); }
      SP.render(); return;
    }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); SP.deleteSel(); return; }
    if (kl === 'r') {
      const dlt = e.shiftKey ? -15 : 15;
      if (SP.mode === 'place') { SP.placeRot = SP.normDeg(SP.placeRot + dlt); SP.render(); } else SP.rotateSel(dlt);
      return;
    }
    if (kl === 'f') { SP.fitView(); return; }
    const step = e.shiftKey ? 100 : 10;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[k] && SP.sel.size) { e.preventDefault(); nudge(...arrows[k]); }
  }
  function onKeyUp(e) { if (e.key === ' ') { spaceDown = false; if (!drag) canvas.style.cursor = SP.mode === 'select' || SP.mode === 'tool' ? 'default' : 'crosshair'; } }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    SP.render();
  }

  SP.initEditor = () => {
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d');
    new ResizeObserver(resize).observe(canvas);
    resize();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', e => { touches.delete(e.pointerId); pinch = null; cancelDrag(); SP.render(); });
    // iOS Safari のページ全体の拡大を抑える（キャンバス上のピンチはアプリ側で処理）
    document.addEventListener('gesturestart', e => e.preventDefault());
    canvas.addEventListener('pointerleave', () => { if (SP.mode === 'place') { ghost = null; SP.render(); } });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => { spaceDown = false; });
    ['change', 'select', 'live', 'bgchange'].forEach(ev => SP.on(ev, SP.render));
  };
})();
