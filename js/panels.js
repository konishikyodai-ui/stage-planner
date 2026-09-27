/* 左：シンボルライブラリ ／ 右：編集パネル・必要物一覧・レイヤー */
(function () {
  'use strict';
  const SP = window.SP;
  const $ = id => document.getElementById(id);
  const esc = s => SP.esc(s);
  const num = (v, def) => { const n = parseFloat(v); return isFinite(n) ? n : def; };
  let invScope = 'all';
  const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;

  /* ---------- ライブラリ ---------- */
  function buildLibrary() {
    const list = $('lib-list');
    list.innerHTML = '';
    SP.CATS.forEach(cat => {
      const types = Object.entries(SP.TYPES).filter(([, t]) => t.cat === cat.id);
      const sec = document.createElement('div');
      sec.className = 'lib-cat';
      sec.innerHTML = `<h4>${esc(cat.name)}</h4><div class="lib-grid"></div>`;
      const grid = sec.querySelector('.lib-grid');
      types.forEach(([key, t]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lib-item'; b.dataset.type = key;
        b.title = `${t.name}（${SP.fmt(t.w)}×${SP.fmt(t.d)}mm）`;
        const cv = document.createElement('canvas');
        b.appendChild(cv);
        b.insertAdjacentHTML('beforeend', `<span class="nm">${esc(t.name.replace('山台 ', ''))}</span><span class="sz">${t.shape === 'dim' ? '2点間' : `${SP.fmt(t.w)}×${SP.fmt(t.d)}`}</span>`);
        b.onclick = () => {
          if (SP.mode === 'place' && SP.placeType === key) { SP.setMode('select'); markLib(null); return; }
          SP.sel = new Set(); SP.emit('select');
          SP.setMode('place', key); markLib(key);
          if (isNarrow()) $('app').classList.remove('show-lib');   // 狭い画面では図面を見せる
        };
        grid.appendChild(b);
        SP.drawIcon(cv, key);
      });
      list.appendChild(sec);
    });
  }
  function markLib(key) { document.querySelectorAll('.lib-item').forEach(b => b.classList.toggle('active', b.dataset.type === key)); }

  function bindOptions() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('sp-opts') || 'null'); } catch (e) { return null; } })();
    if (saved) Object.assign(SP.opts, saved);
    const map = [['opt-continuous', 'continuous'], ['opt-autoface', 'autoFace'], ['opt-snap', 'snap']];
    const save = () => { try { localStorage.setItem('sp-opts', JSON.stringify(SP.opts)); } catch (e) { /* 保存できなくても動作は続ける */ } };
    map.forEach(([id, k]) => { const el = $(id); el.checked = !!SP.opts[k]; el.onchange = () => { SP.opts[k] = el.checked; save(); SP.render(); }; });
    const mm = $('opt-snapmm'); mm.value = String(SP.opts.snapMm);
    mm.onchange = () => { SP.opts.snapMm = +mm.value; save(); };
  }

  /* ---------- タブ ---------- */
  function bindTabs() {
    document.querySelectorAll('.tabbar button').forEach(b => {
      b.onclick = () => showTab(b.dataset.tab);
    });
  }
  function showTab(name) {
    document.querySelectorAll('.tabbar button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === name)));
    ['props', 'inv', 'layers'].forEach(n => { $('tab-' + n).hidden = n !== name; });
    if (name === 'inv') renderInventory();
    if (name === 'layers') renderLayers();
  }
  SP.showTab = showTab;

  /* ---------- 編集パネル ---------- */
  const panelFocused = () => { const a = document.activeElement; return a && $('tab-props').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };

  function fieldVal(o, f) {
    const org = SP.state.origin;
    switch (f) {
      case 'x': return Math.round(o.x - org.x);
      case 'y': return Math.round(o.y - org.y);
      case 'rot': return Math.round(SP.normDeg(o.rot) * 10) / 10;
      default: return o[f];
    }
  }
  function numField(label, f, val, step, extra) {
    return `<label class="field">${label}<input type="number" data-f="${f}" step="${step || 10}" value="${val}" ${extra || ''}></label>`;
  }
  function labelChips() {
    return `<div class="chips">${SP.PART_LABELS.map(l => `<button type="button" data-chip="${esc(l)}">${esc(l)}</button>`).join('')}<button type="button" data-chip="">消去</button></div>`;
  }

  function renderProps() {
    const el = $('tab-props');
    if (panelFocused()) { refreshPropValues(); return; }
    const objs = SP.selObjects();
    if (!objs.length) { el.innerHTML = propsNone(); bindNone(el); return; }
    if (objs.length === 1) { el.innerHTML = propsSingle(objs[0]); bindSingle(el, objs[0]); return; }
    el.innerHTML = propsMulti(objs); bindMulti(el, objs);
  }
  function refreshPropValues() {
    const objs = SP.selObjects();
    if (objs.length !== 1) return;
    $('tab-props').querySelectorAll('input[data-f]').forEach(inp => {
      if (inp === document.activeElement) return;
      const v = fieldVal(objs[0], inp.dataset.f);
      if (v !== undefined) inp.value = v;
    });
  }

  function propsNone() {
    const S = SP.state, n = S.objects.length;
    return `
      <p class="p-title">舞台図</p>
      <label class="field">図面名<input type="text" id="pp-name" value="${esc(S.name)}"></label>
      <p class="p-sub" style="margin-top:8px">配置物 <b class="num">${n}</b> 点　${S.scale.calibrated ? '縮尺登録済み' : (S.bg.src ? '<span style="color:var(--warn)">縮尺未設定</span>' : '図面なし')}</p>
      <div class="p-sec"><h5>操作</h5>
        <table class="kv small">
          <tr><th>配置</th><td>左のライブラリで選び、図面をクリック</td></tr>
          <tr><th>選択</th><td>クリック／ドラッグで範囲選択／Shift で追加</td></tr>
          <tr><th>グループ内の1点</th><td>Alt + クリック</td></tr>
          <tr><th>回転</th><td>選択枠上の丸をドラッグ／R・Shift+R で15°</td></tr>
          <tr><th>移動</th><td>ドラッグ／矢印キー 10mm（Shift 100mm）</td></tr>
          <tr><th>表示の移動</th><td>右ドラッグ／Space + ドラッグ</td></tr>
          <tr><th>拡大縮小</th><td>ホイール／F で全体表示</td></tr>
          <tr><th>複製・削除</th><td>Ctrl+D ／ Delete</td></tr>
          <tr><th>元に戻す</th><td>Ctrl+Z ／ Ctrl+Y</td></tr>
        </table>
      </div>`;
  }
  function bindNone(el) {
    const n = el.querySelector('#pp-name');
    n.onchange = () => { SP.state.name = n.value.trim() || '新しい舞台図'; SP.commit(); };
  }

  function propsSingle(o) {
    const t = SP.typeOf(o), g = o.groupId && SP.state.groups[o.groupId];
    const isRiser = t.shape === 'riser', isDim = t.shape === 'dim', isText = t.shape === 'text';
    let h = `<p class="p-title">${esc(t.name)}</p>`;
    h += g ? `<p class="p-sub">グループ「${esc(g.name)}」の1点（Alt+クリックで選択中）</p>` : `<p class="p-sub">${isDim ? '寸法線' : `規定寸法 ${SP.fmt(t.w)} × ${SP.fmt(t.d)} mm`}</p>`;
    if (t.label) h += `<label class="field">略称（椅子の円内に表示）<input type="text" id="pp-label" data-f="label" value="${esc(o.label)}" maxlength="8"></label>${labelChips()}`;
    if (isText) h += `<label class="field">テキスト<input type="text" id="pp-label" data-f="label" value="${esc(o.label)}"></label>`;
    if (isDim) h += `<label class="field">表示する文字（空欄なら長さ）<input type="text" id="pp-label" data-f="label" value="${esc(o.label)}"></label>`;
    if (t.shape === 'area') h += `<label class="field">名称<input type="text" id="pp-label" data-f="label" value="${esc(o.label)}"></label>`;
    if (isRiser) h += `<label class="field">表示名（任意）<input type="text" id="pp-label" data-f="label" value="${esc(o.label)}"></label>`;
    h += `<div class="p-sec"><h5>位置と向き（原点基準・mm）</h5><div class="grid2">
      ${numField('X 座標', 'x', fieldVal(o, 'x'))}${numField('Y 座標', 'y', fieldVal(o, 'y'))}
      ${numField('角度（°）', 'rot', fieldVal(o, 'rot'), 1)}
      ${isRiser ? numField('段高（mm）', 'h', o.h, 50, 'min="0" list="rs-heights-p"') : ''}
    </div></div>`;
    h += `<div class="p-sec"><h5>寸法（mm）</h5><div class="grid2">
      ${isDim ? numField('長さ', 'w', o.w, 10, 'min="1"') : isText ? numField('文字の高さ', 'd', o.d, 10, 'min="20"') :
        numField('幅 W', 'w', o.w, 10, 'min="1"') + numField('奥行 D', 'd', o.d, 10, 'min="1"')}
      ${!isRiser && !isDim && !isText && t.shape !== 'area' ? numField('高さ（3D）', 'h', o.h, 50, 'min="0"') : ''}
    </div></div>`;
    if (isRiser) h += `<datalist id="rs-heights-p">${SP.RISER_HEIGHTS.map(v => `<option value="${v}">`).join('')}</datalist>`;
    h += `<div class="btn-row">
      ${t.face ? '<button type="button" data-act="face">指揮台へ向ける</button>' : ''}
      ${t.shape === 'chair' || t.shape === 'stool' ? '<button type="button" data-act="seat">この席から見る</button>' : ''}
      <button type="button" data-act="dup">複製</button>
      ${g ? '<button type="button" data-act="ungroup">グループ解除</button>' : ''}
      <button type="button" data-act="del" class="danger">削除</button></div>`;
    return h;
  }
  function bindSingle(el, o) {
    el.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('change', () => {
        const f = inp.dataset.f, org = SP.state.origin;
        if (f === 'label') { o.label = inp.value.trim(); SP.fitTextBox(o); }
        else {
          let v = num(inp.value, null); if (v === null) return;
          if (f === 'x') v += org.x; if (f === 'y') v += org.y;
          if (f === 'w' || f === 'd') v = Math.max(1, v);
          if (f === 'h') v = Math.max(0, v);
          if (f === 'rot') v = SP.normDeg(v);
          o[f] = Math.round(v * 10) / 10;
          if (f === 'd') SP.fitTextBox(o);
        }
        SP.commit();
      });
    });
    el.querySelectorAll('[data-chip]').forEach(b => { b.onclick = () => { o.label = b.dataset.chip; SP.commit(); }; });
    bindActs(el);
  }

  function propsMulti(objs) {
    const gid = SP.selGroupId(), g = gid && SP.state.groups[gid];
    const counts = {};
    objs.forEach(o => { const n = SP.typeOf(o).name; counts[n] = (counts[n] || 0) + 1; });
    const b = SP.boundsOf(objs), org = SP.state.origin;
    const cx = Math.round((b.x0 + b.x1) / 2 - org.x), cy = Math.round((b.y0 + b.y1) / 2 - org.y);
    const anyLabel = objs.some(o => SP.typeOf(o).label), anyRiser = objs.some(o => SP.typeOf(o).shape === 'riser');
    const hasGroup = objs.some(o => o.groupId);
    let h = `<p class="p-title">${g ? 'グループ' : `${objs.length}点を選択`}</p>`;
    if (g) h += `<label class="field">グループ名<input type="text" id="pp-gname" value="${esc(g.name)}"></label>`;
    h += `<p class="p-sub" style="margin-top:6px">${Object.entries(counts).map(([k, v]) => `${esc(k)} <b class="num">${v}</b>`).join('　')}</p>`;
    h += `<div class="p-sec"><h5>全体の位置と回転（原点基準・mm）</h5><div class="grid2">
      <label class="field">中心 X<input type="number" id="pp-cx" step="10" value="${cx}"></label>
      <label class="field">中心 Y<input type="number" id="pp-cy" step="10" value="${cy}"></label>
      <label class="field">回転させる角度（°）<input type="number" id="pp-rotby" step="1" value="15"></label>
      <button type="button" class="p-btn" id="pp-rotgo" style="align-self:end">回転</button>
    </div><p class="muted small" style="margin:6px 0 0">幅 <span class="num">${SP.fmt(b.x1 - b.x0)}</span> × 奥行 <span class="num">${SP.fmt(b.y1 - b.y0)}</span> mm</p></div>`;
    if (anyLabel) h += `<div class="p-sec"><h5>略称をまとめて設定</h5><label class="field">略称<input type="text" id="pp-mlabel" maxlength="8" placeholder="例：Cl"></label>${labelChips()}</div>`;
    if (anyRiser) h += `<div class="p-sec"><h5>山台の段高をまとめて設定</h5><div class="grid2"><label class="field">段高（mm）<input type="number" id="pp-mh" step="50" min="0" list="rs-heights-m"></label></div><datalist id="rs-heights-m">${SP.RISER_HEIGHTS.map(v => `<option value="${v}">`).join('')}</datalist></div>`;
    h += `<div class="btn-row">
      <button type="button" data-act="face">指揮台へ向ける</button>
      ${hasGroup ? '<button type="button" data-act="ungroup">グループ解除</button>' : ''}
      ${!gid ? '<button type="button" data-act="group">グループ化</button>' : ''}
      <button type="button" data-act="dup">複製</button>
      <button type="button" data-act="del" class="danger">削除</button></div>`;
    return h;
  }
  function bindMulti(el, objs) {
    const gid = SP.selGroupId();
    const gn = el.querySelector('#pp-gname');
    if (gn) gn.onchange = () => { SP.state.groups[gid].name = gn.value.trim() || 'グループ'; SP.commit(); };
    const move = () => {
      const b = SP.boundsOf(objs), org = SP.state.origin;
      const tx = num(el.querySelector('#pp-cx').value, 0) + org.x, ty = num(el.querySelector('#pp-cy').value, 0) + org.y;
      const dx = Math.round(tx - (b.x0 + b.x1) / 2), dy = Math.round(ty - (b.y0 + b.y1) / 2);
      objs.forEach(o => { o.x += dx; o.y += dy; });
      SP.commit();
    };
    el.querySelector('#pp-cx').onchange = move;
    el.querySelector('#pp-cy').onchange = move;
    el.querySelector('#pp-rotgo').onclick = () => SP.rotateSel(num(el.querySelector('#pp-rotby').value, 0));
    const setLabel = v => { objs.forEach(o => { if (SP.typeOf(o).label) o.label = v; }); SP.commit(); };
    const ml = el.querySelector('#pp-mlabel');
    if (ml) ml.onchange = () => setLabel(ml.value.trim());
    el.querySelectorAll('[data-chip]').forEach(b => { b.onclick = () => setLabel(b.dataset.chip); });
    const mh = el.querySelector('#pp-mh');
    if (mh) mh.onchange = () => { const v = Math.max(0, num(mh.value, 0)); objs.forEach(o => { if (SP.typeOf(o).shape === 'riser') o.h = v; }); SP.commit(); };
    bindActs(el);
  }
  function bindActs(el) {
    const acts = {
      face: SP.faceSelToPodium, dup: SP.duplicateSel, del: SP.deleteSel, group: SP.groupSel, ungroup: SP.ungroupSel,
      seat: () => SP.open3D && SP.open3D('seat'),
    };
    el.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => acts[b.dataset.act] && acts[b.dataset.act](); });
  }

  /* ---------- 必要物一覧 ---------- */
  SP.inventoryObjects = scope => {
    const v = SP.viewRect();
    return SP.state.objects.filter(o => SP.layerVisible(o) &&
      (scope !== 'view' || (o.x >= v.x0 && o.x <= v.x1 && o.y >= v.y0 && o.y <= v.y1)));
  };
  function renderInventory() {
    const el = $('tab-inv');
    if (el.hidden) return;
    const inv = SP.inventory(SP.inventoryObjects(invScope));
    let rows = '', lastCat = null, total = 0;
    inv.list.forEach(r => {
      if (r.cat !== lastCat) { rows += `<tr class="cat"><td colspan="2">${esc(SP.CATS.find(c => c.id === r.cat).name)}</td></tr>`; lastCat = r.cat; }
      rows += `<tr><td>${esc(r.name)}</td><td class="q">${r.n}</td></tr>`;
      total += r.n;
    });
    const parts = inv.parts.length ? `<div class="p-sec"><h5>パート別（略称ごとの席数）</h5><table class="inv-table">${inv.parts.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="q">${v}</td></tr>`).join('')}
      <tr class="total"><td>計</td><td class="q">${inv.parts.reduce((s, p) => s + p[1], 0)}</td></tr></table></div>` : '';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
        <div class="seg" role="group" aria-label="集計範囲">
          <button type="button" data-scope="view" class="${invScope === 'view' ? 'on' : ''}">表示中</button>
          <button type="button" data-scope="all" class="${invScope === 'all' ? 'on' : ''}">すべて</button>
        </div>
        <span class="muted small">${invScope === 'view' ? '画面に映っている配置物' : '図面内の全配置物'}</span>
      </div>
      ${inv.list.length ? `<table class="inv-table" style="margin-top:10px"><thead><tr><th style="text-align:left">品名</th><th style="text-align:right">数量</th></tr></thead><tbody>${rows}
        <tr class="total"><td>合計</td><td class="q">${total}</td></tr></tbody></table>` : '<p class="note">数える配置物がありません。ライブラリから配置すると自動で集計されます。</p>'}
      ${parts}
      <div class="btn-row"><button type="button" id="inv-copy">表をコピー</button><button type="button" id="inv-csv">CSVで保存</button></div>`;
    el.querySelectorAll('[data-scope]').forEach(b => { b.onclick = () => { invScope = b.dataset.scope; renderInventory(); }; });
    const lines = [['区分', '品名', '数量'], ...inv.list.map(r => [SP.CATS.find(c => c.id === r.cat).name, r.name, r.n])];
    el.querySelector('#inv-copy').onclick = () => {
      const tsv = lines.map(l => l.join('\t')).join('\n');
      navigator.clipboard.writeText(tsv).then(() => SP.toast('必要物一覧をコピーしました（表計算ソフトに貼り付けできます）'),
        () => SP.toast('コピーできませんでした。CSVで保存してください', 'warn'));
    };
    el.querySelector('#inv-csv').onclick = () => {
      const csv = '﻿' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      SP.download(new Blob([csv], { type: 'text/csv' }), `${SP.state.name}_必要物一覧.csv`);
    };
  }
  SP.renderInventory = renderInventory;

  /* ---------- レイヤー ---------- */
  function renderLayers() {
    const el = $('tab-layers');
    if (el.hidden) return;
    if (el.contains(document.activeElement) && document.activeElement.type === 'range') return;
    const S = SP.state, b = S.bg, s = S.scale;
    const scaleInfo = s.calibrated
      ? `<table class="kv small"><tr><th>縮尺</th><td class="num">1px ＝ ${SP.fmt(s.mmPerPx, 3)} mm</td></tr>
          <tr><th>基準区間</th><td>${esc(s.refLabel || '')} <span class="num">${SP.fmt(s.refMm, 1)} mm</span></td></tr>
          <tr><th>図面の実寸</th><td class="num">${SP.fmt(b.w * s.mmPerPx)} × ${SP.fmt(b.h * s.mmPerPx)} mm</td></tr></table>`
      : `<p class="note ${b.src ? 'warn' : ''}">${b.src ? '縮尺が未設定です。実寸の分かっている2点を指定してください。' : '図面を読み込むと縮尺を合わせられます。図面なしでも mm で配置できます。'}</p>`;
    el.innerHTML = `
      <p class="p-title">背景図面</p>
      <p class="p-sub">${b.src ? `${esc(b.fileName || '図面')}${b.page ? `（${b.page}ページ）` : ''}　<span class="num">${b.w}×${b.h}px</span>` : '読み込まれていません'}</p>
      <div class="btn-row" style="margin-top:0"><button type="button" id="ly-load">図面読込</button>${b.src ? '<button type="button" id="ly-remove" class="danger">図面を外す</button>' : ''}</div>
      ${b.src ? `<div class="p-sec">
        <label class="chk"><input type="checkbox" id="ly-bgvis" ${b.visible ? 'checked' : ''}> 表示</label>
        <label class="chk"><input type="checkbox" id="ly-lock" ${b.locked ? 'checked' : ''}> ロック（解除すると図面をドラッグで位置合わせ）</label>
        <label class="field" style="margin-top:6px">図面の濃さ（透明度）<span class="range-row"><input type="range" id="ly-op" min="5" max="100" value="${Math.round(b.opacity * 100)}"><span class="num" id="ly-opv">${Math.round(b.opacity * 100)}%</span></span></label>
      </div>` : ''}
      <div class="p-sec"><h5>縮尺</h5>${scaleInfo}
        <div class="btn-row"><button type="button" id="ly-calib">縮尺合わせ</button><button type="button" id="ly-verify" ${s.calibrated ? '' : 'disabled'}>縮尺確認</button></div></div>
      <div class="p-sec"><h5>表示するもの</h5>
        <label class="chk"><input type="checkbox" data-layer="objects" ${S.layers.objects ? 'checked' : ''}> 配置物</label>
        <label class="chk"><input type="checkbox" data-layer="labels" ${S.layers.labels ? 'checked' : ''}> ラベル（略称・段高）</label>
        <label class="chk"><input type="checkbox" data-layer="notes" ${S.layers.notes ? 'checked' : ''}> 注釈（テキスト・寸法線・エリア）</label>
        <label class="chk"><input type="checkbox" data-layer="grid" ${S.layers.grid ? 'checked' : ''}> グリッド（1m ／ 太線 5m）</label>
      </div>
      <div class="p-sec"><h5>原点</h5>
        <p class="muted small" style="margin:0">座標はすべて原点からの mm で表示します。舞台センターの舞台端などに置くと便利です。</p>
        <div class="btn-row"><button type="button" id="ly-origin">原点を指定</button><button type="button" id="ly-origin0">図面の左上に戻す</button></div>
      </div>`;
    const on = (id, ev, fn) => { const x = el.querySelector('#' + id); if (x) x[ev] = fn; };
    on('ly-load', 'onclick', () => SP.pickBackground());
    on('ly-remove', 'onclick', () => SP.removeBackground());
    on('ly-bgvis', 'onchange', e => { b.visible = e.target.checked; SP.emit('bgchange'); });
    on('ly-lock', 'onchange', e => { b.locked = e.target.checked; SP.emit('bgchange'); if (!b.locked) SP.toast('図面のロックを解除しました。配置物のない所をドラッグすると図面が動きます'); });
    on('ly-op', 'oninput', e => { b.opacity = +e.target.value / 100; el.querySelector('#ly-opv').textContent = e.target.value + '%'; SP.render(); });
    on('ly-op', 'onchange', () => SP.emit('bgchange'));
    on('ly-calib', 'onclick', () => SP.startCalib());
    on('ly-verify', 'onclick', () => SP.startVerify());
    on('ly-origin', 'onclick', () => SP.setMode('origin'));
    on('ly-origin0', 'onclick', () => { S.origin = { x: 0, y: 0 }; SP.commit(); });
    el.querySelectorAll('[data-layer]').forEach(c => { c.onchange = () => { S.layers[c.dataset.layer] = c.checked; SP.commit(); }; });
  }
  SP.renderLayers = renderLayers;

  /* ---------- ツールパネル ---------- */
  function onTool() {
    const tp = $('tool-panel'), tabs = $('tabs'), t = SP.activeTool;
    if (t) { tp.hidden = false; tabs.hidden = true; t.buildPanel(tp); }
    else { tp.hidden = true; tabs.hidden = false; tp.innerHTML = ''; }
    // 狭い画面：ツール中は設定パネルを開き、終わったら閉じて図面を見せる
    if (isNarrow()) { $('app').classList.toggle('show-panel', !!t); $('app').classList.remove('show-lib'); }
    ['btn-riser', 'btn-arc', 'btn-row'].forEach(id => $(id).classList.toggle('active', !!t && t.kind === { 'btn-riser': 'riser', 'btn-arc': 'arc', 'btn-row': 'row' }[id]));
  }

  function onMode() {
    $('btn-calib').classList.toggle('active', SP.mode === 'calib');
    $('btn-verify').classList.toggle('active', SP.mode === 'verify');
    $('btn-origin').classList.toggle('active', SP.mode === 'origin');
    if (SP.mode !== 'place') markLib(null);
  }

  /* ---------- 選択中の操作バー（タッチ操作でもキーボードなしで回転・複製・削除） ---------- */
  function updateSelBar() {
    const bar = $('sel-bar'), n = SP.sel.size;
    bar.hidden = !(n && SP.mode === 'select');
    if (bar.hidden) return;
    const gid = SP.selGroupId();
    $('sel-count').textContent = gid ? `${SP.state.groups[gid].name}` : `${n}点選択`;
    bar.querySelector('[data-sa="face"]').hidden = !SP.selObjects().some(o => SP.typeOf(o).face);
  }
  function bindSelBar() {
    const acts = {
      rotL: () => SP.rotateSel(-15), rotR: () => SP.rotateSel(15), face: SP.faceSelToPodium,
      dup: SP.duplicateSel, del: SP.deleteSel,
      edit: () => { showTab('props'); if (isNarrow()) { $('app').classList.add('show-panel'); $('app').classList.remove('show-lib'); } },
    };
    $('sel-bar').querySelectorAll('[data-sa]').forEach(b => { b.onclick = () => acts[b.dataset.sa](); });
  }

  let invTimer = 0;
  SP.initPanels = () => {
    buildLibrary(); bindOptions(); bindTabs(); bindSelBar();
    ['select', 'change', 'mode', 'tool'].forEach(ev => SP.on(ev, updateSelBar));
    SP.on('select', renderProps);
    SP.on('change', () => { renderProps(); renderInventory(); renderLayers(); });
    SP.on('live', renderProps);
    SP.on('bgchange', renderLayers);
    SP.on('view', () => { if (invScope === 'view') { clearTimeout(invTimer); invTimer = setTimeout(renderInventory, 150); } });
    SP.on('tool', onTool);
    SP.on('toolchange', () => { if (SP.activeTool) SP.refreshToolFields($('tool-panel'), SP.activeTool); });
    SP.on('mode', onMode);
    SP.on('libclear', () => markLib(null));
    SP.on('focusLabel', () => { showTab('props'); const l = $('pp-label'); if (l) { l.focus(); l.select(); } });
    renderProps();
  };
})();
