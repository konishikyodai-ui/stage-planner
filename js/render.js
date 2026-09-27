/* 描画：画面・出力・アイコンで共通のシーン描画 */
(function () {
  'use strict';
  const SP = window.SP;
  const C = SP.COLORS = {
    paper: '#fcfcfa', ink: '#23272c',
    chairFill: '#ffffff', chairStroke: '#2a2f35', back: '#2a2f35',
    stand: '#3a414c',
    podiumFill: '#e8e0f3', podiumStroke: '#5b3f8f',
    riserStroke: '#8a6a3f', riserText: '#5e4424',
    percFill: '#e2ecf2', percStroke: '#32607a', head: '#fbfdfe',
    malletFill: '#f4e8d6', malletStroke: '#7a5a2e', bar: '#b88c58',
    instFill: '#f2e5e5', instStroke: '#7c4545',
    note: '#5b3f8f', dim: '#c0392b',
    sel: '#2f6fd6', ghost: '#5b3f8f',
  };

  const lerpHex = (a, b, t) => {
    const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  SP.riserFill = h => lerpHex('#f8f1e5', '#d3ae78', SP.clamp((h || 0) / 900, 0, 1));

  function fitFont(ctx, text, size, maxW) {
    ctx.font = `${size}px ${SP.FONT}`;
    const mw = ctx.measureText(text).width;
    if (mw > maxW && mw > 0) { size = size * maxW / mw; ctx.font = `${size}px ${SP.FONT}`; }
    return size;
  }
  // 配置物の回転を打ち消して正立した文字を描く
  function uprightText(ctx, o, text, size, maxW, color, halo, dy) {
    if (!text) return;
    ctx.save();
    ctx.rotate(-SP.rad(o.rot));
    const s = fitFont(ctx, text, size, maxW);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (halo) { ctx.lineWidth = s * 0.22; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, dy || 0); }
    ctx.fillStyle = color; ctx.fillText(text, 0, dy || 0);
    ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0.1), 0, Math.PI * 2); }
  function fs(ctx, fill, stroke) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }

  /* ctx はワールド座標（mm）。px = 1デバイスピクセルあたりの mm（線幅用） */
  SP.drawObject = function (ctx, o, px, opt) {
    opt = opt || {};
    const t = SP.typeOf(o), lw = (opt.lw || 1.2) * px, labels = opt.labels !== false;
    const w = o.w, d = o.d, hw = w / 2, hd = d / 2, m = Math.min(w, Math.max(d, 1));
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(SP.rad(o.rot));
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const short = labels ? (o.label || t.short || '') : '';

    switch (t.shape) {
      case 'chair': {
        const r = m / 2;
        circle(ctx, 0, d * 0.06, r * 0.82); fs(ctx, C.chairFill, C.chairStroke);
        rrect(ctx, -hw * 0.8, -hd, w * 0.8, d * 0.13, d * 0.04); fs(ctx, C.back);
        if (labels && o.label) uprightText(ctx, o, o.label, r * 0.62, r * 1.45, C.ink, false, 0);
        break;
      }
      case 'stool': {
        const r = m / 2;
        circle(ctx, 0, 0, r * 0.92); fs(ctx, C.chairFill, C.chairStroke);
        circle(ctx, 0, 0, r * 0.72); ctx.setLineDash([lw * 3, lw * 3]); fs(ctx, null, C.chairStroke); ctx.setLineDash([]);
        if (labels && o.label) uprightText(ctx, o, o.label, r * 0.6, r * 1.3, C.ink, false, 0);
        break;
      }
      case 'bench':
        rrect(ctx, -hw, -hd, w, d, d * 0.15); fs(ctx, C.chairFill, C.chairStroke);
        rrect(ctx, -hw * 0.85, -hd * 0.55, w * 0.85, d * 0.55, d * 0.1); fs(ctx, null, C.chairStroke);
        break;
      case 'stand':
        rrect(ctx, -hw, -hd, w, Math.max(d, 30), Math.max(d, 30) / 2); fs(ctx, C.stand);
        circle(ctx, 0, -hd - Math.max(d, 30) * 0.7, Math.max(d, 30) * 0.35); fs(ctx, C.stand);
        break;
      case 'podium':
        ctx.beginPath(); ctx.rect(-hw, -hd, w, d); ctx.lineWidth = lw * 1.6; fs(ctx, C.podiumFill, C.podiumStroke);
        ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.rect(-hw + m * 0.07, -hd + m * 0.07, w - m * 0.14, d - m * 0.14); fs(ctx, null, C.podiumStroke);
        ctx.beginPath(); ctx.moveTo(-m * 0.12, hd - m * 0.2); ctx.lineTo(m * 0.12, hd - m * 0.2); ctx.lineTo(0, hd - m * 0.08); ctx.closePath(); fs(ctx, C.podiumStroke);
        if (labels) uprightText(ctx, o, o.label || '指揮', m * 0.22, w * 0.7, C.podiumStroke, false, 0);
        break;
      case 'riser': {
        ctx.beginPath(); ctx.rect(-hw, -hd, w, d); fs(ctx, SP.riserFill(o.h), C.riserStroke);
        const ins = Math.min(40, m * 0.05);
        ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.rect(-hw + ins, -hd + ins, w - ins * 2, d - ins * 2); fs(ctx, null, C.riserStroke);
        if (labels) uprightText(ctx, o, (o.label ? o.label + ' ' : '') + 'H' + (o.h || 0), m * 0.17, w * 0.8, C.riserText, false, 0);
        break;
      }
      case 'mallet': {
        ctx.beginPath();
        ctx.moveTo(-hw, -hd); ctx.lineTo(hw, -hd * 0.62); ctx.lineTo(hw, hd * 0.62); ctx.lineTo(-hw, hd); ctx.closePath();
        fs(ctx, C.malletFill, C.malletStroke);
        const n = SP.clamp(Math.round(w / 85), 8, 36);
        ctx.lineWidth = lw * 0.6; ctx.strokeStyle = C.bar; ctx.beginPath();
        for (let i = 1; i < n; i++) {
          const x = -hw + w * i / n, k = 1 - 0.38 * (i / n);
          ctx.moveTo(x, -hd * k * 0.86); ctx.lineTo(x, hd * k * 0.86);
        }
        ctx.stroke();
        uprightText(ctx, o, short, m * 0.3, w * 0.6, C.malletStroke, true, 0);
        break;
      }
      case 'chimes': {
        ctx.beginPath(); ctx.rect(-hw, -hd, w, d); fs(ctx, C.malletFill, C.malletStroke);
        const n = 9;
        for (let i = 0; i < n; i++) { circle(ctx, -hw + w * (i + 0.5) / n, -hd * 0.3, Math.min(w / n, d) * 0.28); fs(ctx, '#fff', C.malletStroke); }
        uprightText(ctx, o, short, m * 0.28, w * 0.6, C.malletStroke, true, hd * 0.4);
        break;
      }
      case 'timp': {
        const r = m / 2;
        circle(ctx, 0, 0, r); fs(ctx, C.percFill, C.percStroke);
        ctx.lineWidth = lw * 0.6; circle(ctx, 0, 0, r * 0.86); fs(ctx, C.head, C.percStroke);
        uprightText(ctx, o, short, r * 0.55, r * 1.5, C.percStroke, false, 0);
        break;
      }
      case 'drum': {
        const r = m / 2;
        circle(ctx, 0, 0, r * 0.92); fs(ctx, C.percFill, C.percStroke);
        circle(ctx, 0, 0, r * 0.7); fs(ctx, C.head, C.percStroke);
        uprightText(ctx, o, short, r * 0.45, r * 1.25, C.percStroke, false, 0);
        break;
      }
      case 'bd':
        ctx.setLineDash([lw * 4, lw * 3]); ctx.beginPath(); ctx.rect(-hw, -hd, w, d); fs(ctx, null, C.percStroke); ctx.setLineDash([]);
        rrect(ctx, -hw * 0.9, -hd * 0.5, w * 0.9, d * 0.5, d * 0.08); fs(ctx, C.percFill, C.percStroke);
        ctx.beginPath(); ctx.moveTo(-hw * 0.72, -hd * 0.5); ctx.lineTo(-hw * 0.72, hd * 0.5); ctx.moveTo(hw * 0.72, -hd * 0.5); ctx.lineTo(hw * 0.72, hd * 0.5); ctx.stroke();
        uprightText(ctx, o, short, m * 0.3, w * 0.55, C.percStroke, true, 0);
        break;
      case 'cym': {
        const r = m / 2;
        circle(ctx, 0, 0, r * 0.95); fs(ctx, '#f5eed5', '#94782a');
        circle(ctx, 0, 0, r * 0.2); fs(ctx, '#e3d49b', '#94782a');
        uprightText(ctx, o, short, r * 0.42, r * 1.4, '#6d561c', true, r * 0.52);
        break;
      }
      case 'tamtam':
        ctx.beginPath(); ctx.rect(-hw, -hd, w, d); ctx.lineWidth = lw * 0.8; fs(ctx, null, C.percStroke);
        ctx.beginPath(); ctx.ellipse(0, 0, hw * 0.8, Math.max(hd * 0.18, 20), 0, 0, Math.PI * 2); fs(ctx, '#f0e6c8', '#94782a');
        uprightText(ctx, o, short, m * 0.35, w * 0.4, C.percStroke, true, hd * 0.55);
        break;
      case 'drumset':
        rrect(ctx, -hw, -hd, w, d, m * 0.1); ctx.setLineDash([lw * 4, lw * 3]); fs(ctx, 'rgba(226,236,242,.45)', C.percStroke); ctx.setLineDash([]);
        [[0, -0.3, 0.26], [-0.45, 0.05, 0.14], [0.35, 0.1, 0.15], [-0.15, -0.55, 0.11], [0.2, -0.55, 0.11]].forEach(([x, y, r]) => {
          circle(ctx, x * hw, y * hd, r * m); fs(ctx, C.head, C.percStroke);
        });
        [[-0.78, -0.55, 0.16], [0.78, -0.5, 0.18], [-0.8, 0.35, 0.12]].forEach(([x, y, r]) => {
          circle(ctx, x * hw, y * hd, r * m); fs(ctx, '#f5eed5', '#94782a');
        });
        circle(ctx, 0, hd * 0.6, m * 0.12); fs(ctx, C.chairFill, C.chairStroke);
        uprightText(ctx, o, short, m * 0.14, w * 0.3, C.percStroke, true, hd * 0.2);
        break;
      case 'table':
        ctx.beginPath(); ctx.rect(-hw, -hd, w, d); fs(ctx, '#eef1f3', C.percStroke);
        uprightText(ctx, o, short, m * 0.4, w * 0.7, C.percStroke, false, 0);
        break;
      case 'cb':
        // 上から見たコントラバス：下側の胴（大）・上側の胴（小）・ネック
        ctx.beginPath(); ctx.moveTo(0, -hd * 0.42); ctx.lineTo(0, -hd); ctx.lineWidth = lw * 2.4; fs(ctx, null, C.instStroke);
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.ellipse(0, -hd * 0.2, hw * 0.46, hd * 0.26, 0, 0, Math.PI * 2); fs(ctx, C.instFill, C.instStroke);
        ctx.beginPath(); ctx.ellipse(0, hd * 0.32, hw * 0.6, hd * 0.36, 0, 0, Math.PI * 2); fs(ctx, C.instFill, C.instStroke);
        if (labels && o.label) uprightText(ctx, o, o.label, m * 0.32, w * 0.9, C.instStroke, false, 0);
        break;
      case 'piano':
        ctx.beginPath();
        ctx.moveTo(-hw, hd); ctx.lineTo(hw, hd); ctx.lineTo(hw, hd * 0.25);
        ctx.bezierCurveTo(hw * 0.95, -hd * 0.25, hw * 0.1, -hd * 0.3, -hw * 0.1, -hd * 0.8);
        ctx.quadraticCurveTo(-hw * 0.3, -hd, -hw * 0.6, -hd); ctx.lineTo(-hw, -hd); ctx.closePath();
        fs(ctx, '#2c2c30', '#111');
        ctx.beginPath(); ctx.rect(-hw, hd - Math.min(160, d * 0.08), w, Math.min(160, d * 0.08)); fs(ctx, '#fafafa', '#111');
        uprightText(ctx, o, short, m * 0.2, w * 0.5, '#ffffff', false, 0);
        break;
      case 'harp':
        ctx.beginPath(); ctx.moveTo(-hw, hd); ctx.lineTo(hw * 0.7, -hd); ctx.lineTo(hw, -hd * 0.6); ctx.lineTo(-hw * 0.6, hd); ctx.closePath();
        fs(ctx, C.instFill, C.instStroke);
        uprightText(ctx, o, short, m * 0.4, w * 0.6, C.instStroke, true, 0);
        break;
      case 'text':
        ctx.font = `${d}px ${SP.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink; ctx.fillText(o.label || '', 0, 0);
        break;
      case 'dim': {
        const tick = SP.clamp(w * 0.03, 60, 220);
        ctx.strokeStyle = C.dim; ctx.fillStyle = C.dim;
        ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0);
        ctx.moveTo(-hw, -tick); ctx.lineTo(-hw, tick); ctx.moveTo(hw, -tick); ctx.lineTo(hw, tick);
        ctx.moveTo(-hw - tick * 0.6, tick * 0.6); ctx.lineTo(-hw + tick * 0.6, -tick * 0.6);
        ctx.moveTo(hw - tick * 0.6, tick * 0.6); ctx.lineTo(hw + tick * 0.6, -tick * 0.6);
        ctx.stroke();
        const txt = o.label || SP.fmt(w);
        const size = SP.clamp(w * 0.06, 110, 320);
        ctx.save();
        const r = SP.normDeg(o.rot);
        if (r > 90 || r <= -90) ctx.rotate(Math.PI);
        ctx.font = `${size}px ${SP.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = size * 0.2; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(txt, 0, -size * 0.15);
        ctx.fillText(txt, 0, -size * 0.15);
        ctx.restore();
        break;
      }
      case 'area': {
        ctx.beginPath(); ctx.rect(-hw, -hd, w, d);
        ctx.fillStyle = 'rgba(91,63,143,.06)'; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(91,63,143,.28)'; ctx.lineWidth = lw * 0.6; ctx.beginPath();
        const step = SP.clamp(m / 8, 120, 400);
        for (let x = -hw - d; x < hw; x += step) { ctx.moveTo(x, hd); ctx.lineTo(x + d, -hd); }
        ctx.stroke(); ctx.restore();
        ctx.setLineDash([lw * 6, lw * 4]); ctx.beginPath(); ctx.rect(-hw, -hd, w, d); fs(ctx, null, C.note); ctx.setLineDash([]);
        if (o.label) uprightText(ctx, o, o.label, SP.clamp(m * 0.12, 120, 450), w * 0.8, C.note, true, 0);
        break;
      }
      default:
        ctx.beginPath(); ctx.rect(-hw, -hd, w, d); fs(ctx, '#eee', C.ink);
    }
    ctx.restore();
  };

  function drawGrid(ctx, T, px) {
    const st = SP.state, ox = st.origin.x, oy = st.origin.y;
    const x0 = T.x, y0 = T.y, x1 = T.x + T.W / T.zoom, y1 = T.y + T.H / T.zoom;
    const pass = (step, alpha, width) => {
      if (step * T.zoom < 7) return;
      ctx.strokeStyle = `rgba(40,45,60,${alpha})`; ctx.lineWidth = width * px; ctx.beginPath();
      for (let x = Math.ceil((x0 - ox) / step) * step + ox; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.ceil((y0 - oy) / step) * step + oy; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    };
    pass(1000, 0.07, 1);
    pass(5000, 0.13, 1.2);
  }

  /* T: { zoom: デバイスpx/mm, x, y: 左上のワールド座標, W, H: デバイスpx }
     opt: { bg, objects, labels, notes, grid, lw, exclude:Set } */
  SP.drawScene = function (ctx, T, opt) {
    const st = SP.state, px = 1 / T.zoom;
    ctx.setTransform(T.zoom, 0, 0, T.zoom, -T.x * T.zoom, -T.y * T.zoom);
    if (opt.bg && st.bg.visible && SP.bgImg && SP.bgImg.complete) {
      const r = SP.bgRect();
      ctx.save();
      ctx.globalAlpha = st.bg.opacity;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(SP.bgImg, r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    if (opt.grid) drawGrid(ctx, T, px);
    const vx0 = T.x, vy0 = T.y, vx1 = T.x + T.W / T.zoom, vy1 = T.y + T.H / T.zoom;
    SP.sortedObjects(st.objects).forEach(o => {
      const t = SP.typeOf(o), isNote = t.layer === 0 || t.layer === 3;
      if (isNote ? !opt.notes : !opt.objects) return;
      if (opt.exclude && opt.exclude.has(o.id)) return;
      const R = Math.max(o.w, o.d) * 0.75 + 400;
      if (o.x + R < vx0 || o.x - R > vx1 || o.y + R < vy0 || o.y - R > vy1) return;
      SP.drawObject(ctx, o, px, { lw: opt.lw, labels: opt.labels });
    });
  };

  /* ライブラリ用アイコン */
  SP.drawIcon = function (canvas, type) {
    const t = SP.TYPES[type], dpr = 2, W = 64 * dpr, H = 40 * dpr;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const o = { id: 'icon', type, x: 0, y: 0, rot: 0, w: t.w, d: t.d, h: t.h, label: '' };
    if (type === 'text') o.label = 'Aa';
    if (type === 'area') o.label = '';
    const bw = t.shape === 'dim' ? t.w : t.w, bd = t.shape === 'dim' ? t.w * 0.35 : (t.shape === 'stand' ? t.d * 4 : t.d);
    const z = Math.min((W - 10) / bw, (H - 10) / bd);
    ctx.setTransform(z, 0, 0, z, W / 2, H / 2 + (t.shape === 'stand' ? t.d * z : 0));
    if (type === 'text') { o.d = 400; ctx.font = `400px ${SP.FONT}`; }
    SP.drawObject(ctx, o, 1 / z, { lw: 1.4, labels: true });
  };
})();
