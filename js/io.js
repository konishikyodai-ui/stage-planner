/* 図面読込（画像 / PDF）・縮尺合わせ・保存・自動保存・PDF/PNG 出力 */
(function () {
  'use strict';
  const SP = window.SP;
  const $ = id => document.getElementById(id);
  // オフラインでも動くようにライブラリは vendor/ に同梱（pdf.js 3.11.174）
  const PDFJS = 'vendor/pdf.min.js';
  const PDFJS_WORKER = 'vendor/pdf.worker.min.js';
  const safeName = s => String(s || '舞台図').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);

  /* =============== 背景図面 =============== */
  SP.pickBackground = () => $('file-bg').click();

  function setBackground(src, fileName, page) {
    const img = new Image();
    img.onload = () => {
      const S = SP.state;
      S.bg = { ...S.bg, src, w: img.naturalWidth, h: img.naturalHeight, x: 0, y: 0, fileName, page: page || null, visible: true, locked: true };
      S.scale = { mmPerPx: null, calibrated: false, p1: null, p2: null, refMm: null, refLabel: '' };
      SP.bgImg = img;
      SP.commit(); SP.emit('bgchange');
      SP.fitView(); SP.updateEmpty();
      SP.toast('図面を読み込みました。次に「縮尺合わせ」で長さの分かっている2点を指定してください');
      const b = $('btn-calib'); b.classList.add('active'); setTimeout(() => { if (SP.mode !== 'calib') b.classList.remove('active'); }, 2400);
    };
    img.onerror = () => SP.toast('画像を読み込めませんでした。PNG / JPEG / PDF を選んでください', 'bad');
    img.src = src;
  }
  SP.removeBackground = async () => {
    if (!await SP.confirm('図面を外しますか？', '配置物はそのまま残ります。縮尺の登録も解除されます。', '外す')) return;
    SP.state.bg = { ...SP.newState().bg };
    SP.state.scale = { ...SP.newState().scale };
    SP.bgImg = null;
    SP.commit(); SP.emit('bgchange'); SP.updateEmpty();
  };

  function loadImageFile(file) {
    const r = new FileReader();
    r.onload = () => setBackground(r.result, file.name, null);
    r.readAsDataURL(file);
  }

  async function loadPdfFile(file) {
    const dlg = $('dlg-pdf'), box = $('pdf-pages'), st = $('pdf-status');
    box.innerHTML = ''; st.textContent = 'PDFを読み込んでいます…';
    let cancelled = false;
    $('pdf-cancel').onclick = () => { cancelled = true; dlg.close(); };
    dlg.onclose = () => { cancelled = true; };
    dlg.showModal();
    try {
      await SP.loadScript(PDFJS);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      st.textContent = `${pdf.numPages}ページあります。舞台平面図が載っているページをクリックしてください。`;
      for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
        const page = await pdf.getPage(i);
        const vp1 = page.getViewport({ scale: 1 }), s = 180 / Math.max(vp1.width, vp1.height);
        const vp = page.getViewport({ scale: s * 2 });
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        cv.style.width = Math.ceil(vp.width / 2) + 'px';
        const tile = document.createElement('button');
        tile.type = 'button'; tile.className = 'pdf-page';
        tile.appendChild(cv);
        tile.insertAdjacentHTML('beforeend', `<span class="small">${i}ページ</span>`);
        tile.onclick = () => choosePdfPage(pdf, i, file.name);
        box.appendChild(tile);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      }
    } catch (e) {
      st.textContent = 'PDFを読み込めませんでした：' + (e && e.message ? e.message : e);
    }
  }
  async function choosePdfPage(pdf, i, name) {
    const st = $('pdf-status');
    st.textContent = `${i}ページを高解像度で描画しています…`;
    try {
      const page = await pdf.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const s = Math.min(8, 5000 / Math.max(vp1.width, vp1.height));
      const vp = page.getViewport({ scale: s });
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      $('dlg-pdf').close();
      setBackground(cv.toDataURL('image/png'), name, i);
    } catch (e) { st.textContent = 'ページを描画できませんでした：' + e.message; }
  }
  function handleBgFile(file) {
    if (!file) return;
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) loadPdfFile(file);
    else if (/^image\//.test(file.type)) loadImageFile(file);
    else SP.toast('PNG / JPEG / PDF のファイルを選んでください', 'warn');
  }

  /* =============== 縮尺合わせ・確認 =============== */
  const PRESETS = () => [
    ['1尺', SP.SHAKU], ['3尺', SP.SHAKU * 3], ['半間', SP.KEN / 2], ['1間', SP.KEN], ['2間', SP.KEN * 2], ['3間', SP.KEN * 3],
    ['5間', SP.KEN * 5], ['1m', 1000], ['5m', 5000], ['10m', 10000],
  ];
  SP.startCalib = () => {
    if (!SP.state.bg.src) { SP.toast('先に図面を読み込んでください', 'warn'); return; }
    SP.setMode('calib');
  };
  SP.startVerify = () => {
    if (!SP.state.scale.calibrated) { SP.toast('先に縮尺合わせをしてください', 'warn'); return; }
    SP.setMode('verify');
  };
  SP.onCalibPoints = (pts, mode) => {
    const dpx = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (dpx < 2) { SP.toast('2点が近すぎます。離れた2点を選んでください', 'warn'); SP.setMode(mode); return; }
    if (mode === 'calib') openCalib(pts, dpx); else showVerify(dpx);
  };

  function openCalib(pts, dpx) {
    const dlg = $('dlg-calib'), inp = $('calib-mm'), pre = $('calib-presets');
    let label = '';
    $('calib-px').textContent = SP.fmt(dpx, 1);
    pre.innerHTML = PRESETS().map(([l, mm], i) => `<button type="button" data-i="${i}">${l}<small>${SP.fmt(mm)}mm</small></button>`).join('');
    const upd = () => {
      const mm = parseFloat(inp.value), b = SP.state.bg;
      $('calib-preview').textContent = mm > 0
        ? `→ 1px ＝ ${SP.fmt(mm / dpx, 3)} mm　図面全体の実寸は約 ${SP.fmt(b.w * mm / dpx / 1000, 1)} m × ${SP.fmt(b.h * mm / dpx / 1000, 1)} m`
        : '実寸を入力してください';
      pre.querySelectorAll('button').forEach(x => x.classList.toggle('on', PRESETS()[+x.dataset.i][0] === label));
    };
    pre.querySelectorAll('button').forEach(b => {
      b.onclick = () => { const [l, mm] = PRESETS()[+b.dataset.i]; label = l; inp.value = Math.round(mm * 10) / 10; upd(); };
    });
    inp.value = SP.state.scale.refMm ? Math.round(SP.state.scale.refMm * 10) / 10 : '';
    label = SP.state.scale.refLabel || '';
    inp.oninput = () => { label = ''; upd(); };
    upd();
    const close = next => { dlg.onclose = null; if (dlg.open) dlg.close(); SP.setMode(next); };
    $('calib-retry').onclick = () => close('calib');
    $('calib-cancel').onclick = () => close('select');
    dlg.onclose = () => { dlg.onclose = null; SP.setMode('select'); };
    dlg.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const mm = parseFloat(inp.value);
      if (!(mm > 0)) { inp.focus(); return; }
      SP.state.scale = { mmPerPx: mm / dpx, calibrated: true, p1: pts[0], p2: pts[1], refMm: mm, refLabel: label || 'mm直接入力' };
      SP.commit(); SP.emit('bgchange');
      close('select');
      SP.fitView();
      SP.toast(`縮尺を登録しました：1px ＝ ${SP.fmt(mm / dpx, 3)} mm`);
    };
    dlg.showModal();
    setTimeout(() => inp.focus(), 30);
  }

  function showVerify(dpx) {
    const s = SP.state.scale, meas = dpx * s.mmPerPx, err = (meas - s.refMm) / s.refMm * 100, dlg = $('dlg-verify');
    $('vf-ref').textContent = `${SP.fmt(s.refMm, 1)} mm（${s.refLabel}）`;
    $('vf-meas').textContent = `${SP.fmt(meas, 1)} mm`;
    $('vf-err').textContent = `${err >= 0 ? '+' : '−'}${SP.fmt(Math.abs(err), 2)}%`;
    const chip = $('vf-chip'), a = Math.abs(err);
    chip.className = 'chip ' + (a <= 0.5 ? 'ok' : a <= 2 ? 'warn' : 'bad');
    chip.textContent = a <= 0.5 ? '良好' : a <= 2 ? '許容範囲' : '縮尺合わせをやり直してください';
    $('vf-scale').textContent = `1px ＝ ${SP.fmt(s.mmPerPx, 3)} mm`;
    const close = next => { dlg.onclose = null; if (dlg.open) dlg.close(); SP.setMode(next); };
    $('vf-again').onclick = () => close('verify');
    $('vf-close').onclick = () => close('select');
    dlg.onclose = () => { dlg.onclose = null; SP.setMode('select'); };
    dlg.showModal();
  }

  /* =============== プロジェクト =============== */
  SP.saveProject = () => {
    const data = JSON.stringify({ ...SP.state, savedAt: new Date().toISOString() });
    SP.download(new Blob([data], { type: 'application/json' }), `${safeName(SP.state.name)}.stage.json`);
    SP.toast('プロジェクトファイルを書き出しました。別の端末でも「開く」から続きを編集できます');
  };
  SP.loadState = (obj, silent) => {
    const base = SP.newState();
    const s = { ...base, ...obj, bg: { ...base.bg, ...(obj.bg || {}) }, scale: { ...base.scale, ...(obj.scale || {}) }, layers: { ...base.layers, ...(obj.layers || {}) }, origin: { ...base.origin, ...(obj.origin || {}) } };
    s.objects = Array.isArray(s.objects) ? s.objects.filter(o => o && SP.TYPES[o.type]) : [];
    s.groups = s.groups || {};
    delete s.savedAt;
    SP.state = s; SP.sel = new Set(); SP.bgImg = null;
    if (SP.activeTool) SP.endTool();
    if (s.bg.src) { const img = new Image(); img.onload = () => { SP.bgImg = img; SP.render(); }; img.src = s.bg.src; }
    SP.cleanGroups(); SP.resetHistory();
    SP.emit('change'); SP.emit('select'); SP.emit('bgchange');
    SP.fitView(); SP.updateEmpty();
    if (!silent) SP.toast(`「${s.name}」を開きました`);
  };
  function openProjectFile(file) {
    file.text().then(txt => {
      let obj;
      try { obj = JSON.parse(txt); } catch (e) { SP.toast('プロジェクトファイルを読めませんでした（JSON形式ではありません）', 'bad'); return; }
      if (!obj || obj.app !== 'stage-planner' || !Array.isArray(obj.objects)) { SP.toast('このアプリで保存したプロジェクトファイル（.stage.json）を選んでください', 'bad'); return; }
      SP.loadState(obj);
    });
  }

  /* =============== 自動保存（IndexedDB） =============== */
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open('stage-planner', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const idbPut = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const idbGet = async k => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  let saveTimer = 0, savedBgSrc;
  const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 700); }
  async function doSave() {
    const S = SP.state, meta = JSON.stringify({ ...S, bg: { ...S.bg, src: null } });
    try {
      await idbPut('autosave', meta);
      if (savedBgSrc !== S.bg.src) { await idbPut('autosave-bg', S.bg.src || ''); savedBgSrc = S.bg.src; }
      $('st-save').textContent = `ブラウザに自動保存 ${hhmm()}`;
    } catch (e) {
      try { localStorage.setItem('sp-autosave', meta); $('st-save').textContent = `自動保存（図面は除く） ${hhmm()}`; }
      catch (e2) { $('st-save').textContent = '自動保存できません。「ファイル保存」を使ってください'; }
    }
  }
  SP.restoreAutosave = async () => {
    let meta = null, bg = '';
    try { meta = await idbGet('autosave'); bg = await idbGet('autosave-bg'); } catch (e) { /* IndexedDB が使えない環境 */ }
    if (!meta) { try { meta = localStorage.getItem('sp-autosave'); } catch (e) { meta = null; } }
    if (!meta) return false;
    try {
      const obj = JSON.parse(meta);
      if (bg) obj.bg.src = bg;
      savedBgSrc = obj.bg.src;
      SP.loadState(obj, true);
      $('st-save').textContent = '前回の作業を復元しました';
      return true;
    } catch (e) { return false; }
  };

  /* =============== 出力 =============== */
  const PAPER = { A4: [210, 297], A3: [297, 420] };
  const exSet = () => ({
    format: $('ex-format').value, paper: $('ex-paper').value, orient: $('ex-orient').value,
    scale: $('ex-scale').value, range: $('ex-range').value,
    bg: $('ex-bg').checked, obj: $('ex-obj').checked, label: $('ex-label').checked, note: $('ex-note').checked, grid: $('ex-grid').checked, inv: $('ex-inv').checked,
    title: $('ex-title').value, sub: $('ex-note-text').value,
  });
  function extentOf(set) {
    const objs = SP.state.objects.filter(o => { const t = SP.typeOf(o); return (t.layer === 0 || t.layer === 3) ? set.note : set.obj; });
    const ob = SP.boundsOf(objs), hasBg = SP.state.bg.src && set.bg;
    const bgB = hasBg ? (r => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }))(SP.bgRect()) : null;
    let e = set.range === 'view' ? SP.viewRect() : set.range === 'bg' ? (bgB || ob) : (ob || bgB);
    if (!e) e = SP.viewRect();
    if (set.range === 'objects' && ob) { const m = 600; e = { x0: e.x0 - m, y0: e.y0 - m, x1: e.x1 + m, y1: e.y1 + m }; }
    return e;
  }
  function layoutPage(set) {
    const [a, b] = PAPER[set.paper];
    const pw = set.orient === 'landscape' ? b : a, ph = set.orient === 'landscape' ? a : b;
    const area = { x: 10, y: 10, w: pw - 20, h: ph - 20 - 16 };
    const ext = extentOf(set), ew = Math.max(ext.x1 - ext.x0, 100), eh = Math.max(ext.y1 - ext.y0, 100);
    let s, denom;
    if (set.scale === 'fit') { s = Math.min(area.w / ew, area.h / eh); denom = 1 / s; }
    else { denom = +set.scale; s = 1 / denom; }
    return { pw, ph, area, ext, ew, eh, s, denom, fits: ew * s <= area.w + 0.5 && eh * s <= area.h + 0.5 };
  }
  function renderPage(set, k) {
    const L = layoutPage(set), A = L.area;
    const cv = document.createElement('canvas');
    cv.width = Math.round(L.pw * k); cv.height = Math.round(L.ph * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(A.x * k, A.y * k, A.w * k, A.h * k); ctx.clip();
    const zoom = L.s * k, cx = (L.ext.x0 + L.ext.x1) / 2, cy = (L.ext.y0 + L.ext.y1) / 2;
    const T = { zoom, x: cx - (A.x + A.w / 2) * k / zoom, y: cy - (A.y + A.h / 2) * k / zoom, W: cv.width, H: cv.height };
    SP.drawScene(ctx, T, { bg: set.bg, objects: set.obj, labels: set.label, notes: set.note, grid: set.grid, lw: 0.18 * k });
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const mm = v => v * k;
    ctx.strokeStyle = '#222'; ctx.lineWidth = mm(0.35); ctx.strokeRect(mm(A.x), mm(A.y), mm(A.w), mm(A.h));
    // 表題欄
    const ty = A.y + A.h;
    ctx.lineWidth = mm(0.25); ctx.strokeRect(mm(A.x), mm(ty), mm(A.w), mm(16));
    ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `bold ${mm(5)}px ${SP.FONT}`; ctx.fillText(set.title || SP.state.name, mm(A.x + 4), mm(ty + 6));
    ctx.font = `${mm(2.8)}px ${SP.FONT}`; ctx.fillStyle = '#444'; ctx.fillText(set.sub || '', mm(A.x + 4), mm(ty + 12));
    const scaleTxt = `縮尺 1:${SP.fmt(L.denom)}${set.scale === 'fit' ? '（用紙に合わせる）' : ''}　${set.paper}・${set.orient === 'landscape' ? '横' : '縦'}`;
    ctx.textAlign = 'right'; ctx.fillStyle = '#111'; ctx.font = `${mm(3)}px ${SP.FONT}`;
    ctx.fillText(scaleTxt, mm(A.x + A.w - 4), mm(ty + 5));
    // スケールバー
    const cands = [500, 1000, 2000, 5000, 10000, 20000, 50000];
    let Lw = cands[0]; cands.forEach(c => { if (c * L.s <= 45) Lw = c; });
    const barW = Lw * L.s, bx = A.x + A.w - 6 - barW, by = ty + 10.5, seg = 4;
    for (let i = 0; i < seg; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#111';
      ctx.fillRect(mm(bx + barW * i / seg), mm(by), mm(barW / seg), mm(1.4));
    }
    ctx.strokeStyle = '#111'; ctx.lineWidth = mm(0.2); ctx.strokeRect(mm(bx), mm(by), mm(barW), mm(1.4));
    ctx.font = `${mm(2.2)}px ${SP.FONT}`; ctx.fillStyle = '#111'; ctx.textAlign = 'center';
    ctx.fillText('0', mm(bx), mm(by + 3.2)); ctx.fillText(`${Lw / 1000}m`, mm(bx + barW), mm(by + 3.2));
    // 必要物一覧
    if (set.inv) {
      const inv = SP.inventory(SP.state.objects.filter(o => set.obj)).list;
      if (inv.length) {
        const lh = 3.6, w = 62, h = 7 + inv.length * lh, x = A.x + A.w - w - 3, y = A.y + 3;
        ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(mm(x), mm(y), mm(w), mm(h));
        ctx.strokeStyle = '#333'; ctx.lineWidth = mm(0.2); ctx.strokeRect(mm(x), mm(y), mm(w), mm(h));
        ctx.fillStyle = '#111'; ctx.font = `bold ${mm(2.8)}px ${SP.FONT}`; ctx.textAlign = 'left';
        ctx.fillText('必要物一覧', mm(x + 2.5), mm(y + 3.6));
        ctx.font = `${mm(2.5)}px ${SP.FONT}`;
        inv.forEach((r, i) => {
          const yy = y + 7.6 + i * lh;
          ctx.textAlign = 'left'; ctx.fillText(r.name, mm(x + 2.5), mm(yy));
          ctx.textAlign = 'right'; ctx.fillText(String(r.n), mm(x + w - 2.5), mm(yy));
        });
      }
    }
    return { cv, L };
  }
  function updateExport() {
    const set = exSet(), pv = $('ex-preview');
    const L = layoutPage(set), k = Math.min(520 / L.pw, 520 / L.ph);
    const { cv } = renderPage(set, k * 1.5);
    pv.width = cv.width; pv.height = cv.height;
    pv.getContext('2d').drawImage(cv, 0, 0);
    pv.style.width = Math.round(cv.width / 1.5) + 'px';
    const info = $('ex-info');
    info.innerHTML = `縮尺 1:${SP.fmt(L.denom)} で 約 ${SP.fmt(L.ew / 1000, 1)} m × ${SP.fmt(L.eh / 1000, 1)} m の範囲を出力します。` +
      (L.fits ? '' : '<br><span style="color:var(--warn)">この縮尺では用紙に収まらず、はみ出した部分は切れます。A3・1:100・「用紙に合わせる」のいずれかで収まります。</span>');
  }
  SP.openExport = () => {
    $('ex-title').value = SP.state.name;
    if (!$('ex-note-text').value) $('ex-note-text').value = `作成日 ${SP.today()}　筑波大学吹奏楽団`;
    $('ex-bg').disabled = !SP.state.bg.src;
    $('dlg-export').showModal();
    updateExport();
  };
  function doExport() {
    const set = exSet(), dpi = 200, k = dpi / 25.4;
    const { cv, L } = renderPage(set, k);
    const base = `${safeName(set.title || SP.state.name)}_${set.paper}${set.orient === 'landscape' ? '横' : '縦'}_1-${Math.round(L.denom)}`;
    if (set.format === 'png') {
      cv.toBlob(b => { SP.download(b, base + '.png'); SP.toast('PNGを書き出しました'); }, 'image/png');
    } else {
      const blob = makePdf(cv.toDataURL('image/jpeg', 0.93), cv.width, cv.height, L.pw, L.ph);
      SP.download(blob, base + '.pdf');
      SP.toast(`PDFを書き出しました（${set.paper}・1:${SP.fmt(L.denom)}）`);
    }
  }
  // JPEG 1枚を貼った最小構成の PDF を組み立てる
  function makePdf(jpegUrl, iw, ih, pwMm, phMm) {
    const bin = atob(jpegUrl.split(',')[1]), img = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
    const W = (pwMm * 72 / 25.4).toFixed(2), H = (phMm * 72 / 25.4).toFixed(2);
    const enc = new TextEncoder(), parts = [], off = [];
    let len = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, fn) => { off[n] = len; push(`${n} 0 obj\n`); fn(); push('\nendobj\n'); };
    push('%PDF-1.4\n');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream'); });
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    const xref = len;
    push('xref\n0 6\n0000000000 65535 f \n' + [1, 2, 3, 4, 5].map(n => String(off[n]).padStart(10, '0') + ' 00000 n \n').join('') +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* =============== 初期化 =============== */
  let emptyDismissed = false;
  SP.updateEmpty = () => { $('empty').hidden = !!(SP.state.bg.src || SP.state.objects.length || emptyDismissed); };

  SP.initIO = () => {
    $('file-bg').onchange = e => { handleBgFile(e.target.files[0]); e.target.value = ''; };
    $('file-project').onchange = e => { const f = e.target.files[0]; if (f) openProjectFile(f); e.target.value = ''; };
    $('empty-bg').onclick = SP.pickBackground;
    $('empty-sample').onclick = () => { SP.buildSample(); SP.state.name = 'サンプル配置'; SP.commit(); SP.updateEmpty(); SP.fitView(); SP.toast('サンプル配置を開きました。自由に動かして試せます'); };
    $('empty-blank').onclick = () => { emptyDismissed = true; SP.updateEmpty(); };
    ['ex-format', 'ex-paper', 'ex-orient', 'ex-scale', 'ex-range', 'ex-bg', 'ex-obj', 'ex-label', 'ex-note', 'ex-grid', 'ex-inv', 'ex-title', 'ex-note-text']
      .forEach(id => $(id).addEventListener(/text/.test($(id).type) ? 'input' : 'change', updateExport));
    $('ex-cancel').onclick = () => $('dlg-export').close();
    $('ex-go').onclick = doExport;
    // ドラッグ＆ドロップ
    const center = $('center');
    center.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    center.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer.files[0]; if (!f) return;
      if (/\.json$/i.test(f.name)) openProjectFile(f); else handleBgFile(f);
    });
    SP.on('change', scheduleSave);
    SP.on('bgchange', scheduleSave);
    SP.on('change', SP.updateEmpty);
  };
  SP.openProjectPicker = () => $('file-project').click();
  SP.handleBgFile = handleBgFile;
  SP.makePdf = makePdf;
})();
