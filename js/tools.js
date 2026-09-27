/* 一括配置ツール：山台一括・円弧（吹奏楽テンプレート）・横一列
   各ツールは getPreview / getHandles / dragHandle / moveBody / hitBody / buildPanel / apply を持つ */
(function () {
  'use strict';
  const SP = window.SP;
  const esc = s => SP.esc(s);
  const num = (v, def) => { const n = parseFloat(v); return isFinite(n) ? n : def; };
  const bearingOf = (cx, cy, x, y) => SP.deg(Math.atan2(x - cx, -(y - cy)));   // 0 = 上（-y）、時計回り
  const onBearing = (cx, cy, b, r) => ({ x: cx + r * Math.sin(SP.rad(b)), y: cy - r * Math.cos(SP.rad(b)) });
  const originRel = (x, y) => ({ x: Math.round(x - SP.state.origin.x), y: Math.round(y - SP.state.origin.y) });

  function standFor(chair, dist) {
    const f = SP.frontVec(chair.rot);
    return SP.makeObject('stand', chair.x + f.x * dist, chair.y + f.y * dist, { rot: chair.rot });
  }
  function commitObjects(objs, kind, name) {
    objs.forEach(o => { delete o.preview; o.id = SP.uid(); o.x = Math.round(o.x); o.y = Math.round(o.y); });
    SP.state.objects.push(...objs);
    if (objs.length > 1) SP.makeGroup(objs, kind, name);
    SP.sel = new Set(objs.map(o => o.id));
    SP.commit(); SP.emit('select');
  }
  // 位置入力（原点基準）
  function posFields(tool, keyX, keyY, label) {
    const p = originRel(tool[keyX], tool[keyY]);
    return `<div class="grid2">
      <label class="field">${label} X（mm）<input type="number" step="10" data-k="${keyX}" data-origin="x" value="${p.x}"></label>
      <label class="field">${label} Y（mm）<input type="number" step="10" data-k="${keyY}" data-origin="y" value="${p.y}"></label></div>`;
  }
  // data-k 属性を持つ入力をツールの値に結び付ける
  function bindInputs(el, tool) {
    el.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k;
      const read = () => {
        if (inp.type === 'checkbox') tool[k] = inp.checked;
        else if (inp.type === 'number') {
          let v = num(inp.value, tool[k]);
          if (inp.dataset.origin) v += SP.state.origin[inp.dataset.origin];
          tool[k] = v;
        } else tool[k] = inp.value;
        if (tool.onInput) tool.onInput(k);
        SP.render(); tool.refreshInfo && tool.refreshInfo();
      };
      inp.addEventListener('input', read);
      inp.addEventListener('change', read);
    });
  }
  function actionButtons(label) {
    return `<div class="btn-row"><button type="button" class="btn-primary" data-act="apply">${label || '配置する'}</button><button type="button" data-act="cancel">キャンセル</button></div>`;
  }
  function wireActions(el, tool) {
    el.querySelector('[data-act="apply"]').onclick = () => tool.apply();
    el.querySelector('[data-act="cancel"]').onclick = () => SP.endTool();
  }
  SP.refreshToolFields = (el, tool) => {
    el.querySelectorAll('[data-k]').forEach(inp => {
      if (document.activeElement === inp) return;
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') inp.checked = !!tool[k];
      else if (inp.type === 'number') {
        let v = tool[k];
        if (inp.dataset.origin) v -= SP.state.origin[inp.dataset.origin];
        inp.value = Math.round(v * 10) / 10;
      } else if (inp.tagName !== 'TEXTAREA') inp.value = tool[k];
    });
    tool.refreshInfo && tool.refreshInfo();
  };

  /* =====================================================================
     山台一括配置
     ===================================================================== */
  const RISER_TYPES = ['riser_63', 'riser_64', 'riser_66', 'riser_43', 'riser_33'];
  SP.RiserTool = function () {
    const c = SP.viewCenter();
    const t = {
      kind: 'riser', hint: '山台一括配置：プレビューをドラッグで移動、上の丸で回転。「配置する」で確定',
      cx: SP.snapPt(c, true).x, cy: SP.snapPt(c, true).y, rot: 0,
      rows: [600, 450, 300, 150].map(h => ({ type: 'riser_63', count: 6, orient: 'h', h })),
      front: 150, step: 150,
    };
    t.layout = () => {
      const rows = t.rows.map(r => {
        const ty = SP.TYPES[r.type], hz = r.orient === 'h';
        return { ...r, pw: hz ? ty.w : ty.d, pd: hz ? ty.d : ty.w };
      });
      const totalD = rows.reduce((s, r) => s + r.pd, 0);
      const maxW = Math.max(0, ...rows.map(r => r.pw * r.count));
      const out = [];
      let y = -totalD / 2;
      rows.forEach(r => {
        const rowW = r.pw * r.count, ly = y + r.pd / 2;
        for (let k = 0; k < r.count; k++) {
          const lx = -rowW / 2 + r.pw * (k + 0.5);
          const p = SP.rotPt(t.cx + lx, t.cy + ly, t.cx, t.cy, t.rot);
          out.push(SP.makeObject(r.type, p.x, p.y, { rot: SP.normDeg(t.rot + (r.orient === 'h' ? 0 : 90)), h: r.h }));
        }
        y += r.pd;
      });
      return { objs: out, totalD, maxW };
    };
    t.getPreview = () => t.layout().objs;
    t.getHandles = () => {
      const L = t.layout(), p = SP.rotPt(t.cx, t.cy - L.totalD / 2 - 700, t.cx, t.cy, t.rot);
      return [{ id: 'rot', x: p.x, y: p.y, label: `${Math.round(SP.normDeg(t.rot))}°` }];
    };
    t.dragHandle = (id, p, e) => {
      let b = bearingOf(t.cx, t.cy, p.x, p.y);
      t.rot = e.shiftKey ? SP.round(b, 15) : Math.round(b);
    };
    t.hitBody = (x, y) => {
      const L = t.layout(), q = SP.rotPt(x, y, t.cx, t.cy, -t.rot);
      return Math.abs(q.x - t.cx) <= L.maxW / 2 && Math.abs(q.y - t.cy) <= L.totalD / 2;
    };
    t.moveBody = (dx, dy) => { t.cx += dx; t.cy += dy; };
    t.apply = () => {
      const objs = t.layout().objs;
      if (!objs.length) { SP.toast('山台の枚数が0です', 'warn'); return; }
      const n = objs.length;
      commitObjects(objs, 'riser', `山台 ${t.rows.length}列 ${n}枚`);
      SP.endTool();
      SP.toast(`山台 ${n}枚を配置しました（グループ）`);
    };
    t.buildPanel = el => {
      const opts = RISER_TYPES.map(k => `<option value="${k}">${esc(SP.TYPES[k].name.replace('山台 ', ''))}</option>`).join('');
      const hl = SP.RISER_HEIGHTS.map(h => `<option value="${h}">`).join('');
      el.innerHTML = `
        <p class="p-title">山台一括配置</p>
        <p class="p-sub">1列目が最後列（客席から遠い列）です。後列ほど高く組むと段差のある配置になります。</p>
        <label class="field">並列数（列）<input type="number" id="rs-n" min="1" max="10" value="${t.rows.length}"></label>
        <table class="rows-table" style="margin-top:8px"><colgroup><col style="width:16px"><col style="width:28%"><col style="width:15%"><col style="width:19%"><col></colgroup><thead><tr><th>列</th><th>種類</th><th>枚数</th><th>向き</th><th>段高</th></tr></thead><tbody id="rs-rows"></tbody></table>
        <datalist id="rs-heights">${hl}</datalist>
        <div class="p-sec"><h5>段高を後列から自動設定</h5>
          <div class="grid3">
            <label class="field">最前列（mm）<input type="number" data-k="front" step="50" value="${t.front}"></label>
            <label class="field">刻み（mm）<input type="number" data-k="step" step="50" value="${t.step}"></label>
            <button type="button" class="p-btn" id="rs-auto" style="align-self:end">適用</button>
          </div>
        </div>
        <div class="p-sec"><h5>位置と向き（原点基準）</h5>
          ${posFields(t, 'cx', 'cy', '中心')}
          <label class="field" style="margin-top:8px">角度（°）<input type="number" data-k="rot" step="1" value="${t.rot}"></label>
        </div>
        <p class="note" id="rs-info"></p>
        ${actionButtons()}`;
      const tbody = el.querySelector('#rs-rows');
      const drawRows = () => {
        tbody.innerHTML = t.rows.map((r, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td><select data-i="${i}" data-f="type">${opts}</select></td>
          <td><input type="number" min="0" max="40" data-i="${i}" data-f="count" value="${r.count}"></td>
          <td><select data-i="${i}" data-f="orient"><option value="h">横</option><option value="v">縦</option></select></td>
          <td><input type="number" min="0" step="50" list="rs-heights" data-i="${i}" data-f="h" value="${r.h}"></td></tr>`).join('');
        tbody.querySelectorAll('[data-f]').forEach(inp => {
          const r = t.rows[+inp.dataset.i], f = inp.dataset.f;
          inp.value = r[f];
          inp.addEventListener('input', () => { r[f] = inp.type === 'number' ? Math.max(0, Math.round(num(inp.value, r[f]))) : inp.value; SP.render(); t.refreshInfo(); });
        });
      };
      drawRows();
      el.querySelector('#rs-n').addEventListener('input', e => {
        const n = SP.clamp(Math.round(num(e.target.value, t.rows.length)), 1, 10);
        while (t.rows.length < n) { const last = t.rows[t.rows.length - 1] || { type: 'riser_63', count: 6, orient: 'h', h: 150 }; t.rows.push({ ...last }); }
        t.rows.length = n; drawRows(); SP.render(); t.refreshInfo();
      });
      el.querySelector('#rs-auto').onclick = () => {
        const n = t.rows.length;
        t.rows.forEach((r, i) => { r.h = Math.max(0, t.front + t.step * (n - 1 - i)); });
        drawRows(); SP.render(); t.refreshInfo();
      };
      bindInputs(el, t); wireActions(el, t);
      t.refreshInfo = () => {
        const L = t.layout(), byType = {};
        L.objs.forEach(o => { const k = `${SP.TYPES[o.type].name.replace('山台 ', '')} H${o.h}`; byType[k] = (byType[k] || 0) + 1; });
        el.querySelector('#rs-info').innerHTML = `合計 <b class="num">${L.objs.length}</b> 枚　幅 <span class="num">${SP.fmt(L.maxW)}</span> × 奥行 <span class="num">${SP.fmt(L.totalD)}</span> mm<br>` +
          Object.entries(byType).map(([k, v]) => `${esc(k)} × ${v}`).join('　');
      };
      t.refreshInfo();
    };
    return t;
  };

  /* =====================================================================
     円弧配置・吹奏楽テンプレート
     ===================================================================== */
  SP.ARC_TEMPLATES = {
    custom: { name: 'カスタム' },
    arc3: { name: '円弧 3列（6・10・15脚）', rows: '6\n10\n15', r1: 1800, gap: 1100, span: 150, mode: 'angle' },
    band: {
      name: '吹奏楽 標準（4列・45名）', r1: 2200, gap: 1150, span: 150, mode: 'angle', pitch: 750,
      rows: ['Picc,Fl,Fl,Fl,Ob,Ob,Cl,Cl,Cl',
        'Bsn,Bsn,E♭Cl,Cl,Cl,Cl,Cl,Cl,B.Cl,B.Cl,A.Sax,A.Sax',
        'Cl,Cl,Hr,Hr,Hr,Hr,T.Sax,B.Sax,Euph,Euph,Tuba,Tuba',
        'Tp,Tp,Tp,Tp,Tp,Tp,Tb,Tb,Tb,Tb,Tb,B.Tb'].join('\n'),
    },
    small: {
      name: '吹奏楽 小編成（3列・25名）', r1: 1900, gap: 1100, span: 140, mode: 'angle', pitch: 750,
      rows: ['Fl,Fl,Fl,Ob,Cl,Cl,Cl,Cl', 'Bsn,B.Cl,A.Sax,A.Sax,T.Sax,B.Sax,Hr,Hr,Euph', 'Tp,Tp,Tp,Tb,Tb,Tb,Tuba,Tuba'].join('\n'),
    },
  };
  SP.parseRows = text => String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    if (/^\d+$/.test(line)) return Array(Math.min(60, +line)).fill('');
    return line.split(/[,、，\s]+/).filter(Boolean);
  });

  SP.ArcTool = function (templateKey) {
    const pod = SP.findPodium();
    const base = pod ? { x: pod.x, y: pod.y } : SP.snapPt(SP.viewCenter(), true);
    const t = {
      kind: 'arc', hint: '円弧配置：丸いハンドルで中心・向き・広がり・列間隔を調整。「配置する」で確定',
      template: templateKey || 'arc3', cx: base.x, cy: base.y, dir: pod ? SP.normDeg(pod.rot - 180) : 0,
      r1: 1800, gap: 1100, span: 150, mode: 'angle', pitch: 700, rows: '6\n10\n15',
      stands: true, standDist: 420, chairType: 'chair', hasPodium: !!pod,
    };
    const applyTemplate = key => {
      const tp = SP.ARC_TEMPLATES[key]; if (!tp || !tp.rows) return;
      Object.assign(t, { r1: tp.r1, gap: tp.gap, span: tp.span, mode: tp.mode, pitch: tp.pitch || t.pitch, rows: tp.rows });
    };
    applyTemplate(t.template);

    t.rowAngles = (n, r) => {
      if (n === 1) return [0];
      if (t.mode === 'pitch') {
        const stepDeg = SP.deg(t.pitch / r);
        return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * stepDeg);
      }
      return Array.from({ length: n }, (_, i) => -t.span / 2 + t.span * i / (n - 1));
    };
    t.layout = () => {
      const rows = SP.parseRows(t.rows), out = [], info = [];
      rows.forEach((labels, ri) => {
        const r = t.r1 + t.gap * ri, angs = t.rowAngles(labels.length, r);
        angs.forEach((a, i) => {
          const p = onBearing(t.cx, t.cy, t.dir + a, r);
          const ch = SP.makeObject(t.chairType, p.x, p.y, { label: labels[i] || '' });
          ch.rot = SP.faceAngle(p.x, p.y, t.cx, t.cy);
          out.push(ch);
          if (t.stands) out.push(standFor(ch, t.standDist));
        });
        const pitch = labels.length > 1 ? r * SP.rad(Math.abs(angs[1] - angs[0])) : 0;
        info.push({ n: labels.length, r, pitch, spanDeg: labels.length > 1 ? Math.abs(angs[angs.length - 1] - angs[0]) : 0 });
      });
      return { objs: out, info, rows };
    };
    t.getPreview = () => t.layout().objs;
    t.outerR = () => t.r1 + t.gap * Math.max(0, SP.parseRows(t.rows).length - 1);
    t.getHandles = () => {
      const n = SP.parseRows(t.rows).length, ro = t.outerR() + 500;
      const hs = [
        { id: 'center', x: t.cx, y: t.cy, label: '中心', fill: '#efe8fa' },
        { id: 'axis', ...onBearing(t.cx, t.cy, t.dir, t.r1 - 350), label: `1列目 ${SP.fmt(t.r1)}mm` },
      ];
      if (n > 1) hs.push({ id: 'gap', ...onBearing(t.cx, t.cy, t.dir, t.outerR() + 350), label: `列間隔 ${SP.fmt(t.gap)}mm` });
      if (t.mode === 'angle') {
        hs.push({ id: 'spanL', ...onBearing(t.cx, t.cy, t.dir - t.span / 2, ro) });
        hs.push({ id: 'spanR', ...onBearing(t.cx, t.cy, t.dir + t.span / 2, ro), label: `${Math.round(t.span)}°` });
      }
      return hs;
    };
    t.drawGuides = (ctx, u) => {
      const ro = t.outerR() + 500;
      ctx.save();
      ctx.strokeStyle = 'rgba(91,63,143,.55)'; ctx.lineWidth = u; ctx.setLineDash([u * 5, u * 4]);
      ctx.beginPath(); const a = onBearing(t.cx, t.cy, t.dir, ro); ctx.moveTo(t.cx, t.cy); ctx.lineTo(a.x, a.y); ctx.stroke();
      SP.parseRows(t.rows).forEach((_, i) => {
        const r = t.r1 + t.gap * i, half = t.mode === 'angle' ? t.span / 2 : 100;
        ctx.beginPath(); ctx.arc(t.cx, t.cy, r, SP.rad(t.dir - half - 90), SP.rad(t.dir + half - 90)); ctx.stroke();
      });
      if (t.mode === 'angle') {
        [-1, 1].forEach(s => { const p = onBearing(t.cx, t.cy, t.dir + s * t.span / 2, ro); ctx.beginPath(); ctx.moveTo(t.cx, t.cy); ctx.lineTo(p.x, p.y); ctx.stroke(); });
      }
      ctx.restore();
    };
    t.dragHandle = (id, p, e) => {
      const b = bearingOf(t.cx, t.cy, p.x, p.y), dist = Math.hypot(p.x - t.cx, p.y - t.cy);
      if (id === 'center') { const q = SP.snapPt(p); t.cx = q.x; t.cy = q.y; }
      if (id === 'axis') { t.dir = e.shiftKey ? SP.round(b, 15) : Math.round(b); t.r1 = Math.max(600, SP.round(dist + 350, 50)); }
      if (id === 'gap') { const n = SP.parseRows(t.rows).length; t.gap = Math.max(500, SP.round((dist - 350 - t.r1) / Math.max(1, n - 1), 10)); }
      if (id === 'spanL' || id === 'spanR') t.span = SP.clamp(Math.round(Math.abs(SP.normDeg(b - t.dir)) * 2), 10, 350);
    };
    t.moveBody = () => {};
    t.onInput = k => {
      if (k === 'template') { applyTemplate(t.template); SP.refreshToolFields(t.panelEl, t); t.panelEl.querySelector('#arc-rows').value = t.rows; t.syncMode(); }
      if (k === 'mode') t.syncMode();
      if (k === 'rows' && t.template !== 'custom') { t.template = 'custom'; t.panelEl.querySelector('[data-k="template"]').value = 'custom'; }
    };
    t.apply = () => {
      const L = t.layout();
      if (!L.objs.length) { SP.toast('脚数が0です', 'warn'); return; }
      const chairs = L.objs.filter(o => o.type !== 'stand').length;
      commitObjects(L.objs, 'arc', `円弧配置 ${L.rows.length}列 ${chairs}脚`);
      SP.endTool();
      SP.toast(`椅子 ${chairs}脚${t.stands ? '・譜面台 ' + chairs + '台' : ''}を配置しました（グループ解除で個別に動かせます）`);
    };
    t.buildPanel = el => {
      t.panelEl = el;
      const tpl = Object.entries(SP.ARC_TEMPLATES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
      el.innerHTML = `
        <p class="p-title">円弧・吹奏楽配置</p>
        <p class="p-sub">指揮台を中心に、各列の椅子を円弧上へ並べます。椅子は自動で指揮台を向きます。</p>
        ${t.hasPodium ? '' : '<p class="note warn">指揮台がないため画面中央を中心にしています。先に指揮台を置くとそこが基準になります。</p>'}
        <label class="field">テンプレート<select data-k="template">${tpl}</select></label>
        <label class="field" style="margin-top:8px">各列の脚数または略称（1行＝1列、指揮者から見て左→右）
          <textarea id="arc-rows" data-k="rows" rows="5" spellcheck="false">${esc(t.rows)}</textarea></label>
        <div class="grid2" style="margin-top:8px">
          <label class="field">1列目までの距離（mm）<input type="number" data-k="r1" step="50" min="600" value="${t.r1}"></label>
          <label class="field">列間隔（mm）<input type="number" data-k="gap" step="50" min="500" value="${t.gap}"></label>
          <label class="field">並べ方<select data-k="mode"><option value="angle">角度で均等</option><option value="pitch">間隔を固定</option></select></label>
          <label class="field" id="arc-span-f">円弧角度（°）<input type="number" data-k="span" step="5" min="10" max="350" value="${t.span}"></label>
          <label class="field" id="arc-pitch-f">椅子の中心間隔（mm）<input type="number" data-k="pitch" step="10" min="400" value="${t.pitch}"></label>
          <label class="field">向き（°、0＝図面の上）<input type="number" data-k="dir" step="1" value="${t.dir}"></label>
        </div>
        <label class="chk" style="margin-top:10px"><input type="checkbox" data-k="stands" ${t.stands ? 'checked' : ''}> 各椅子の前に譜面台を配置</label>
        <label class="field" style="margin-top:6px">椅子から譜面台まで（mm）<input type="number" data-k="standDist" step="10" value="${t.standDist}"></label>
        <div class="p-sec"><h5>中心（原点基準）</h5>${posFields(t, 'cx', 'cy', '中心')}</div>
        <p class="note" id="arc-info"></p>
        ${actionButtons()}`;
      el.querySelector('[data-k="template"]').value = t.template;
      el.querySelector('[data-k="mode"]').value = t.mode;
      t.syncMode = () => {
        el.querySelector('#arc-span-f').hidden = t.mode !== 'angle';
        el.querySelector('#arc-pitch-f').hidden = t.mode !== 'pitch';
      };
      t.syncMode();
      bindInputs(el, t); wireActions(el, t);
      t.refreshInfo = () => {
        const L = t.layout(), chairW = SP.TYPES[t.chairType].w;
        const lines = L.info.map((r, i) => {
          const tight = r.n > 1 && r.pitch < chairW + 100;
          return `${i + 1}列目：<b class="num">${r.n}</b>脚　半径 <span class="num">${SP.fmt(r.r)}</span>　間隔 <span class="num">${SP.fmt(r.pitch)}</span>mm${t.mode === 'pitch' ? `　角度 <span class="num">${Math.round(r.spanDeg)}°</span>` : ''}${tight ? ' <span class="chip warn">狭い</span>' : ''}`;
        });
        const total = L.info.reduce((s, r) => s + r.n, 0);
        el.querySelector('#arc-info').innerHTML = `${lines.join('<br>')}<br>合計 <b class="num">${total}</b>脚${t.stands ? `・譜面台 <b class="num">${total}</b>台` : ''}`;
      };
      t.refreshInfo();
    };
    return t;
  };

  /* =====================================================================
     横一列
     ===================================================================== */
  SP.RowTool = function () {
    const c = SP.snapPt(SP.viewCenter(), true);
    const t = {
      kind: 'row', hint: '横一列：左の丸で開始位置、右の丸で並ぶ方向を調整。「配置する」で確定',
      sx: c.x - 1500, sy: c.y, rot: 0, count: 6, gap: 150, stands: true, standDist: 420, face: false, labels: '', chairType: 'chair',
    };
    t.pitch = () => SP.TYPES[t.chairType].w + t.gap;
    t.layout = () => {
      const out = [], n = SP.clamp(Math.round(t.count), 0, 80), r = SP.rad(t.rot), pod = SP.findPodium();
      const labels = t.labels.split(/[,、，\s]+/).filter(Boolean);
      for (let k = 0; k < n; k++) {
        const x = t.sx + Math.cos(r) * t.pitch() * k, y = t.sy + Math.sin(r) * t.pitch() * k;
        const ch = SP.makeObject(t.chairType, x, y, { rot: t.rot, label: labels[k] || '' });
        if (t.face && pod) ch.rot = SP.faceAngle(x, y, pod.x, pod.y);
        out.push(ch);
        if (t.stands) out.push(standFor(ch, t.standDist));
      }
      return out;
    };
    t.getPreview = t.layout;
    t.endPt = () => { const n = Math.max(1, t.count), r = SP.rad(t.rot), L = t.pitch() * (n - 1) + 500; return { x: t.sx + Math.cos(r) * L, y: t.sy + Math.sin(r) * L }; };
    t.getHandles = () => [
      { id: 'start', x: t.sx, y: t.sy, label: '開始', fill: '#efe8fa' },
      { id: 'end', ...t.endPt(), label: `${Math.round(SP.normDeg(t.rot))}°` },
    ];
    t.dragHandle = (id, p, e) => {
      if (id === 'start') { const q = SP.snapPt(p); t.sx = q.x; t.sy = q.y; }
      if (id === 'end') { const a = SP.deg(Math.atan2(p.y - t.sy, p.x - t.sx)); t.rot = SP.normDeg(e.shiftKey ? SP.round(a, 15) : Math.round(a)); }
    };
    t.hitBody = (x, y) => t.layout().some(o => SP.hitTest(o, x, y, 50));
    t.moveBody = (dx, dy) => { t.sx += dx; t.sy += dy; };
    t.apply = () => {
      const objs = t.layout();
      if (!objs.length) { SP.toast('脚数が0です', 'warn'); return; }
      const n = objs.filter(o => o.type !== 'stand').length;
      commitObjects(objs, 'row', `横一列 ${n}脚`);
      SP.endTool();
      SP.toast(`椅子 ${n}脚${t.stands ? '・譜面台 ' + n + '台' : ''}を配置しました`);
    };
    t.buildPanel = el => {
      el.innerHTML = `
        <p class="p-title">椅子を横一列に並べる</p>
        <p class="p-sub">開始位置の椅子から、向き（角度）に対して横方向へ並べます。</p>
        <div class="grid2">
          <label class="field">脚数<input type="number" data-k="count" min="1" max="80" value="${t.count}"></label>
          <label class="field">椅子同士の間隔（mm）<input type="number" data-k="gap" step="10" min="0" value="${t.gap}"></label>
          <label class="field">種類<select data-k="chairType"><option value="chair">椅子</option><option value="stool">スツール（高椅子）</option></select></label>
          <label class="field">向き（°）<input type="number" data-k="rot" step="1" value="${t.rot}"></label>
        </div>
        <div class="p-sec"><h5>開始位置（原点基準）</h5>${posFields(t, 'sx', 'sy', '開始')}</div>
        <label class="chk" style="margin-top:10px"><input type="checkbox" data-k="stands" ${t.stands ? 'checked' : ''}> 各椅子の前に譜面台を配置</label>
        <label class="field" style="margin-top:6px">椅子から譜面台まで（mm）<input type="number" data-k="standDist" step="10" value="${t.standDist}"></label>
        <label class="chk" style="margin-top:8px"><input type="checkbox" data-k="face" ${t.face ? 'checked' : ''}> 各椅子を指揮台へ向ける</label>
        <label class="field" style="margin-top:8px">略称（カンマ区切り、任意）<input type="text" data-k="labels" placeholder="例：Tp,Tp,Tp,Tb,Tb" value="${esc(t.labels)}"></label>
        <p class="note" id="row-info"></p>
        ${actionButtons()}`;
      el.querySelector('[data-k="chairType"]').value = t.chairType;
      bindInputs(el, t); wireActions(el, t);
      t.refreshInfo = () => {
        const n = Math.max(0, Math.round(t.count));
        el.querySelector('#row-info').innerHTML = `椅子 <b class="num">${n}</b>脚${t.stands ? `・譜面台 <b class="num">${n}</b>台` : ''}　中心間隔 <span class="num">${SP.fmt(t.pitch())}</span>mm　全長 <span class="num">${SP.fmt(t.pitch() * Math.max(0, n - 1) + SP.TYPES[t.chairType].w)}</span>mm`;
      };
      t.refreshInfo();
    };
    return t;
  };

  /* ---------- サンプル配置（初回確認用） ---------- */
  SP.buildSample = () => {
    const S = SP.state;
    const add = (type, x, y, extra) => { const o = SP.makeObject(type, x, y, extra); S.objects.push(o); return o; };
    add('text', 0, -9000, { label: 'サンプル配置（例）', d: 380 });
    const pod = add('podium', 0, -1000);
    add('cstand', 0, -1650);
    const rt = SP.RiserTool(); rt.cx = 0; rt.cy = -6900; rt.rows = [300, 150].map(h => ({ type: 'riser_63', count: 5, orient: 'h', h }));
    const risers = rt.layout().objs; S.objects.push(...risers); SP.makeGroup(risers, 'riser', '山台 2列10枚');
    const at = SP.ArcTool('arc3'); at.cx = pod.x; at.cy = pod.y; at.dir = 0;
    const arc = at.layout().objs;
    const lab = ['Fl', 'Fl', 'Ob', 'Ob', 'Cl', 'Cl', 'Cl', 'Cl', 'Cl', 'Cl', 'B.Cl', 'Bsn', 'A.Sax', 'A.Sax', 'T.Sax', 'B.Sax',
      'Hr', 'Hr', 'Hr', 'Hr', 'Tp', 'Tp', 'Tp', 'Tb', 'Tb', 'Tb', 'Euph', 'Euph', 'Tuba', 'Tuba', 'Tp'];
    arc.filter(o => o.type === 'chair').forEach((o, i) => { o.label = lab[i] || ''; });
    S.objects.push(...arc); SP.makeGroup(arc, 'arc', '円弧配置 3列 31脚');
    [['timp32', -3300], ['timp29', -2450], ['timp26', -1650], ['timp23', -900]].forEach(([k, x]) => add(k, x, -7300));
    add('bd', 1300, -7350); add('sd', 2700, -6450); add('cym', 3500, -6450);
    add('marimba', -6300, -6300, { rot: 90 }); add('glock', 5900, -7300, { rot: -90 });
    add('cb', 6200, -4300, { rot: SP.faceAngle(6200, -4300, pod.x, pod.y), label: 'Cb' });
    add('stool', 6900, -3700, { rot: SP.faceAngle(6900, -3700, pod.x, pod.y), label: 'Cb' });
    add('dim', 0, 400, { w: 16000, label: '間口 16,000' });
  };
})();
