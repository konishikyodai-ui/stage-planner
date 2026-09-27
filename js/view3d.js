/* 3D 確認：俯瞰（回転・拡大）／この席から見る。three.js は開いたときに読み込む */
(function () {
  'use strict';
  const SP = window.SP;
  const $ = id => document.getElementById(id);
  const THREE_URL = 'vendor/three.min.js';   // three.js r128（同梱）
  const M = mm => mm / 1000;
  const SEAT_TYPES = ['chair', 'stool', 'pchair', 'cb', 'podium'];
  let T3, R = null, mode = 'orbit', seatId = null, raf = 0, drag = null;
  const orbit = { tx: 0, ty: 0.6, tz: 0, r: 20, th: 0, ph: 0.95 };
  const look = { x: 0, y: 1.1, z: 0, yaw: 0, pitch: -0.12 };

  const SECTION_COLORS = [
    [/^(Picc|Fl|Ob|E\.H|Bsn|E♭Cl|Cl|A\.Cl|B\.Cl|S\.Sax|A\.Sax|T\.Sax|B\.Sax)/, 0x6d8fb8],
    [/^(Tp|Cor|Hr|Tb|B\.Tb|Euph|Tuba)/, 0xc2903f],
    [/^(Cb|Perc|Hp|Pf)/, 0x8c7aa6],
  ];
  const sectionColor = label => { for (const [re, c] of SECTION_COLORS) if (re.test(label || '')) return c; return 0x8f9aa6; };

  function mat(color, opts) { return new T3.MeshLambertMaterial({ color, ...(opts || {}) }); }
  function box(w, h, d, color, x, y, z) { const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), mat(color)); m.position.set(x || 0, y || 0, z || 0); return m; }
  function cyl(rt, rb, h, color, x, y, z, seg) { const m = new T3.Mesh(new T3.CylinderGeometry(rt, rb, h, seg || 24), mat(color)); m.position.set(x || 0, y || 0, z || 0); return m; }
  function textSprite(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.font = `bold 56px ${SP.FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(248, x.measureText(text).width + 36);
    x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath();
    if (x.roundRect) x.roundRect(128 - w / 2, 14, w, 68, 20); else x.rect(128 - w / 2, 14, w, 68);
    x.fill(); x.fillStyle = color || '#23272c'; x.fillText(text, 128, 50);
    const s = new T3.Sprite(new T3.SpriteMaterial({ map: new T3.CanvasTexture(c), depthTest: false }));
    s.scale.set(0.5, 0.19, 1); s.renderOrder = 10;
    return s;
  }
  function sphere(r, color, x, y, z) { const m = new T3.Mesh(new T3.SphereGeometry(r, 16, 12), mat(color)); m.position.set(x, y, z); return m; }
  function avatar(color, standing) {
    const g = new T3.Group(), skin = 0xd9d0c5;
    if (standing) {
      g.add(cyl(0.16, 0.19, 0.75, color, 0, 1.1, 0));
      g.add(box(0.3, 0.75, 0.18, 0x55606c, 0, 0.38, 0));
      g.add(sphere(0.11, skin, 0, 1.6, 0));
    } else {
      g.add(cyl(0.16, 0.19, 0.55, color, 0, 0.78, -0.06));
      g.add(box(0.3, 0.12, 0.42, 0x55606c, 0, 0.52, 0.12));
      g.add(box(0.28, 0.45, 0.12, 0x55606c, 0, 0.25, 0.32));
      g.add(sphere(0.11, skin, 0, 1.18, -0.04));
    }
    return g;
  }

  function buildObject(o, opt) {
    const t = SP.typeOf(o), g = new T3.Group();
    const w = M(o.w), d = M(Math.max(o.d, 1)), h = M(o.h || 0);
    const legs = (hh, ww, dd, col) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => g.add(box(0.03, hh, 0.03, col || 0x8d949b, sx * (ww / 2 - 0.03), hh / 2, sz * (dd / 2 - 0.03))));
    let head = null;   // ラベル・アバターの基準の高さ
    switch (t.shape) {
      case 'riser': {
        const hh = Math.max(h, 0.02), b = box(w, hh, d, new T3.Color(SP.riserFill(o.h)).getHex(), 0, hh / 2, 0);
        g.add(b);
        const e = new T3.LineSegments(new T3.EdgesGeometry(b.geometry), new T3.LineBasicMaterial({ color: 0x8a6a3f }));
        e.position.copy(b.position); g.add(e);
        break;
      }
      case 'chair':
        g.add(box(w * 0.88, 0.05, d * 0.85, 0x3b4a5c, 0, h, 0.01));
        g.add(box(w * 0.88, 0.42, 0.04, 0x3b4a5c, 0, h + 0.24, -d / 2 + 0.04));
        legs(h, w * 0.85, d * 0.8);
        head = h; break;
      case 'stool':
        g.add(cyl(w * 0.42, w * 0.42, 0.05, 0x3b4a5c, 0, h, 0));
        g.add(cyl(0.025, 0.025, h, 0x8d949b, 0, h / 2, 0));
        head = h; break;
      case 'bench':
        g.add(box(w, 0.08, d, 0x222222, 0, h, 0)); legs(h, w, d, 0x222222); head = h; break;
      case 'stand':
        g.add(cyl(0.012, 0.012, h, 0x2d3239, 0, h / 2, -d / 2));
        { const desk = box(w, 0.34, 0.015, 0x2d3239, 0, h, 0); desk.rotation.x = 0.35; g.add(desk); }
        break;
      case 'podium':
        g.add(box(w, Math.max(h, 0.02), d, 0xd9cfee, 0, Math.max(h, 0.02) / 2, 0)); head = h; break;
      case 'timp': {
        const r = w / 2;
        g.add(cyl(r, r * 0.55, 0.5, 0xb87333, 0, 0.45, 0));
        g.add(cyl(r * 0.97, r * 0.97, 0.012, 0xf2efe6, 0, 0.705, 0));
        break;
      }
      case 'drum':
        g.add(cyl(w * 0.35, w * 0.35, 0.15, 0x9fb4c2, 0, 0.62, 0)); g.add(cyl(0.012, 0.012, 0.55, 0x8d949b, 0, 0.28, 0)); break;
      case 'bd': {
        const c = cyl(0.45, 0.45, d * 0.55, 0xe7e2d6, 0, 0.6, 0); c.rotation.x = Math.PI / 2; g.add(c);
        g.add(box(w, 0.05, 0.05, 0x5a5f66, 0, 0.12, 0)); break;
      }
      case 'cym':
        g.add(cyl(0.012, 0.012, 0.9, 0x8d949b, 0, 0.45, 0)); g.add(cyl(w * 0.45, w * 0.45, 0.01, 0xd4b24c, 0, 0.9, 0)); break;
      case 'tamtam': {
        g.add(box(0.05, 1.7, 0.05, 0x3d3a36, -w / 2 + 0.05, 0.85, 0)); g.add(box(0.05, 1.7, 0.05, 0x3d3a36, w / 2 - 0.05, 0.85, 0));
        g.add(box(w, 0.05, 0.05, 0x3d3a36, 0, 1.68, 0));
        const disc = cyl(w * 0.38, w * 0.38, 0.02, 0xc8a24a, 0, 0.95, 0); disc.rotation.x = Math.PI / 2; g.add(disc);
        break;
      }
      case 'drumset':
        [[0, -0.3, 0.28, 0.35], [-0.45, 0.05, 0.18, 0.62], [0.35, 0.1, 0.2, 0.55], [-0.15, -0.55, 0.13, 0.75], [0.2, -0.55, 0.13, 0.75]].forEach(([x, z, r, y]) => g.add(cyl(r, r, 0.2, 0x9fb4c2, x * w / 2, y, z * d / 2)));
        [[-0.78, -0.55, 1.0], [0.78, -0.5, 1.05]].forEach(([x, z, y]) => g.add(cyl(0.2, 0.2, 0.01, 0xd4b24c, x * w / 2, y, z * d / 2)));
        break;
      case 'mallet':
        g.add(box(w, 0.06, d * 0.8, 0xb8895a, 0, h, 0)); legs(h, w * 0.95, d * 0.7, 0x5a5f66); break;
      case 'chimes':
        g.add(box(w, 0.05, 0.05, 0x5a5f66, 0, h, 0)); g.add(box(0.05, h, 0.05, 0x5a5f66, -w / 2, h / 2, 0)); g.add(box(0.05, h, 0.05, 0x5a5f66, w / 2, h / 2, 0));
        for (let i = 0; i < 9; i++) g.add(cyl(0.018, 0.018, 1.2 - i * 0.05, 0xd4b24c, -w / 2 + w * (i + 0.5) / 9, h - 0.65 + i * 0.025, 0, 8));
        break;
      case 'table': g.add(box(w, 0.04, d, 0x6b737c, 0, h, 0)); legs(h, w, d); break;
      case 'cb': {
        const body = cyl(0.3, 0.34, 1.1, 0x7b3f1f, 0, 0.62, 0.05, 20); body.scale.z = 0.45; g.add(body);
        g.add(box(0.05, 0.75, 0.05, 0x2b1a10, 0, 1.5, 0.05));
        head = 0; break;
      }
      case 'piano':
        g.add(box(w, 0.32, d, 0x1b1b1d, 0, 0.84, 0)); g.add(box(w, 0.05, 0.16, 0xf5f5f5, 0, 0.72, d / 2 - 0.08)); legs(0.68, w * 0.9, d * 0.8, 0x1b1b1d); break;
      case 'harp': g.add(box(0.12, h, 0.8 * d, 0xc79a5b, 0, h / 2, 0)); break;
      case 'area': {
        const p = new T3.Mesh(new T3.PlaneGeometry(w, d), new T3.MeshBasicMaterial({ color: 0x5b3f8f, transparent: true, opacity: 0.16, depthWrite: false }));
        p.rotation.x = -Math.PI / 2; p.position.y = 0.004; g.add(p); break;
      }
      case 'text': case 'dim': return null;
      default: g.add(box(w, Math.max(h, 0.05), d, 0xaaaaaa, 0, Math.max(h, 0.05) / 2, 0));
    }
    // アバターとラベル
    const hidden = mode === 'seat' && o.id === seatId;
    if (opt.avatars && !hidden) {
      if (t.shape === 'chair' || t.shape === 'stool' || t.shape === 'bench') {
        const a = avatar(sectionColor(o.label), false); a.position.y = head - 0.45; g.add(a);
      } else if (t.shape === 'cb') {
        const a = avatar(sectionColor('Cb'), true); a.position.z = -0.45; g.add(a);
      } else if (t.shape === 'podium') {
        const a = avatar(0x2d2a36, true); a.position.y = head; g.add(a);
      }
    }
    if (opt.labels && o.label && t.label && !hidden) {
      const s = textSprite(o.label); s.position.set(0, (head || 0) + (opt.avatars ? 1.0 : 0.35), 0); g.add(s);
    }
    return g;
  }

  function disposeTree(obj) {
    obj.traverse(n => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); }
    });
  }

  function build() {
    if (R.root) { R.scene.remove(R.root); disposeTree(R.root); }
    const root = R.root = new T3.Group();
    const S = SP.state, opt = { avatars: $('v3-avatar').checked, labels: $('v3-labels').checked };
    const objs = S.objects.filter(SP.layerVisible);
    let b = SP.boundsOf(objs);
    const br = S.bg.src ? SP.bgRect() : null;
    if (br) b = b ? { x0: Math.min(b.x0, br.x), y0: Math.min(b.y0, br.y), x1: Math.max(b.x1, br.x + br.w), y1: Math.max(b.y1, br.y + br.h) } : { x0: br.x, y0: br.y, x1: br.x + br.w, y1: br.y + br.h };
    if (!b) b = { x0: -8000, y0: -10000, x1: 8000, y1: 2000 };
    R.bounds = b;
    const m = 3000, fw = M(b.x1 - b.x0 + m * 2), fd = M(b.y1 - b.y0 + m * 2);
    const floor = new T3.Mesh(new T3.PlaneGeometry(fw, fd), mat(0xc9b99c));
    floor.rotation.x = -Math.PI / 2; floor.position.set(M((b.x0 + b.x1) / 2), 0, M((b.y0 + b.y1) / 2));
    root.add(floor);
    if (br && SP.bgImg && S.bg.visible) {
      const c = document.createElement('canvas'), k = Math.min(1, 4096 / Math.max(S.bg.w, S.bg.h));
      c.width = Math.round(S.bg.w * k); c.height = Math.round(S.bg.h * k);
      const x = c.getContext('2d');
      x.fillStyle = '#ddd2bd'; x.fillRect(0, 0, c.width, c.height);
      x.globalAlpha = Math.max(0.35, S.bg.opacity); x.drawImage(SP.bgImg, 0, 0, c.width, c.height);
      const tex = new T3.CanvasTexture(c);
      tex.anisotropy = R.renderer.capabilities.getMaxAnisotropy();
      const p = new T3.Mesh(new T3.PlaneGeometry(M(br.w), M(br.h)), new T3.MeshLambertMaterial({ map: tex }));
      p.rotation.x = -Math.PI / 2; p.position.set(M(br.x + br.w / 2), 0.002, M(br.y + br.h / 2));
      root.add(p);
    }
    // 座席視点では、その席の譜面台（正面 700mm 以内）を描かない
    const seat = mode === 'seat' && SP.byId(seatId);
    const ownStand = o => seat && o.type === 'stand' && Math.hypot(o.x - seat.x, o.y - seat.y) < 700;
    objs.forEach(o => {
      if (ownStand(o)) return;
      const g = buildObject(o, opt);
      if (!g) return;
      const base = SP.typeOf(o).shape === 'riser' ? 0 : M(SP.floorHeightAt(o.x, o.y, o.id));
      g.position.set(M(o.x), base, M(o.y));
      g.rotation.y = -SP.rad(o.rot);
      root.add(g);
    });
    R.scene.add(root);
  }

  function init() {
    if (R) return;
    T3 = window.THREE;
    const host = $('v3-canvas');
    const renderer = new T3.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(renderer.domElement);
    const scene = new T3.Scene();
    scene.background = new T3.Color(0xdfe3e8);
    scene.add(new T3.HemisphereLight(0xffffff, 0x7d786c, 0.72));
    const sun = new T3.DirectionalLight(0xffffff, 0.42); sun.position.set(6, 14, 9); scene.add(sun);
    const camera = new T3.PerspectiveCamera(55, 1, 0.05, 600);
    R = { renderer, scene, camera, root: null };
    new ResizeObserver(resize).observe(host);
    const el = renderer.domElement;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.style.touchAction = 'none';
    const touches = new Map();
    let pinch = null;
    const pinchGeom = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    el.addEventListener('pointerdown', e => {
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) { drag = null; const g = pinchGeom(); pinch = { d: g.d, mx: g.mx, my: g.my }; return; }
      }
      drag = { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey };
    });
    const endTouch = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; drag = null; };
    el.addEventListener('pointerup', endTouch);
    el.addEventListener('pointercancel', endTouch);
    el.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size >= 2) {
        // 2本指：ピンチで拡大縮小、平行移動で表示の移動
        const g = pinchGeom(), k = pinch.d / g.d, dx = g.mx - pinch.mx, dy = g.my - pinch.my;
        if (mode === 'seat') { R.camera.fov = SP.clamp(R.camera.fov * k, 20, 90); R.camera.updateProjectionMatrix(); }
        else {
          orbit.r = SP.clamp(orbit.r * k, 1.5, 250);
          const s = orbit.r * 0.0016, rx = Math.cos(orbit.th), rz = -Math.sin(orbit.th), fx = -Math.sin(orbit.th), fz = -Math.cos(orbit.th);
          orbit.tx += (-dx * rx + dy * fx) * s; orbit.tz += (-dx * rz + dy * fz) * s;
        }
        pinch = { d: g.d, mx: g.mx, my: g.my };
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (mode === 'seat') { look.yaw -= dx * 0.004; look.pitch = SP.clamp(look.pitch - dy * 0.004, -1.2, 1.2); }
      else if (drag.btn === 2 || drag.btn === 1 || drag.shift) {
        const s = orbit.r * 0.0016;
        const rx = Math.cos(orbit.th), rz = -Math.sin(orbit.th), fx = -Math.sin(orbit.th), fz = -Math.cos(orbit.th);
        orbit.tx += (-dx * rx + dy * fx) * s; orbit.tz += (-dx * rz + dy * fz) * s;
      } else { orbit.th -= dx * 0.006; orbit.ph = SP.clamp(orbit.ph - dy * 0.005, 0.08, 1.52); }
    });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      if (mode === 'seat') { R.camera.fov = SP.clamp(R.camera.fov * Math.exp(e.deltaY * 0.001), 20, 90); R.camera.updateProjectionMatrix(); }
      else orbit.r = SP.clamp(orbit.r * Math.exp(e.deltaY * 0.0012), 1.5, 250);
    }, { passive: false });
  }
  function resize() {
    const host = $('v3-canvas'), w = host.clientWidth, h = host.clientHeight;
    if (!R || !w || !h) return;
    R.renderer.setSize(w, h, false);
    R.renderer.domElement.style.width = '100%'; R.renderer.domElement.style.height = '100%';
    R.camera.aspect = w / h; R.camera.updateProjectionMatrix();
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    const cam = R.camera;
    if (mode === 'seat') {
      cam.position.set(look.x, look.y, look.z);
      cam.lookAt(look.x + Math.sin(look.yaw) * Math.cos(look.pitch), look.y + Math.sin(look.pitch), look.z + Math.cos(look.yaw) * Math.cos(look.pitch));
    } else {
      cam.position.set(orbit.tx + orbit.r * Math.sin(orbit.ph) * Math.sin(orbit.th), orbit.ty + orbit.r * Math.cos(orbit.ph), orbit.tz + orbit.r * Math.sin(orbit.ph) * Math.cos(orbit.th));
      cam.lookAt(orbit.tx, orbit.ty, orbit.tz);
    }
    R.renderer.render(R.scene, cam);
  }

  function eyeHeight() {
    const v = $('v3-eye').value;
    return v === 'custom' ? SP.clamp(parseFloat($('v3-eye-custom').value) || 1300, 200, 3000) : +v;
  }
  function enterOrbit(reset) {
    mode = 'orbit'; seatId = null;
    R.camera.fov = 55; R.camera.updateProjectionMatrix();
    if (reset) {
      const b = R.bounds;
      orbit.tx = M((b.x0 + b.x1) / 2); orbit.tz = M((b.y0 + b.y1) / 2); orbit.ty = 0.6;
      orbit.r = Math.max(8, M(Math.max(b.x1 - b.x0, b.y1 - b.y0)) * 1.05); orbit.th = 0; orbit.ph = 0.95;
    }
    $('v3-orbit').classList.add('on'); $('v3-seat').classList.remove('on');
    $('v3-msg').textContent = '俯瞰表示：客席側から見ています';
    build();
  }
  function enterSeat(o) {
    mode = 'seat'; seatId = o.id;
    const t = SP.typeOf(o), base = t.shape === 'podium' ? M(o.h || 0) : M(SP.floorHeightAt(o.x, o.y, o.id));
    const f = SP.frontVec(o.rot);
    look.x = M(o.x) - f.x * 0.05; look.z = M(o.y) - f.y * 0.05; look.y = base + M(eyeHeight());
    look.yaw = Math.atan2(f.x, f.y); look.pitch = -0.12;
    R.camera.fov = 70; R.camera.updateProjectionMatrix();
    $('v3-seat').classList.add('on'); $('v3-orbit').classList.remove('on');
    const lbl = o.label ? `「${o.label}」の席` : `${t.name}`;
    $('v3-msg').textContent = `${lbl}から見ています（目の高さ ${SP.fmt(eyeHeight())}mm${base ? `＋${t.shape === 'podium' ? '指揮台' : '山台'} ${SP.fmt(base * 1000)}mm` : ''}）`;
    build();
  }
  function seatFromSelection() {
    const objs = SP.selObjects().filter(o => SEAT_TYPES.includes(o.type));
    return objs.length === 1 ? objs[0] : (SP.sel.size === 1 ? null : objs[0] || null);
  }

  SP.open3D = async want => {
    const seat = want === 'seat' ? seatFromSelection() : null;
    if (want === 'seat' && !seat) { SP.toast('2D画面で椅子を1脚選択してから「この席から見る」を押してください', 'warn'); return; }
    $('view3d').hidden = false;
    $('v3-msg').textContent = '3D表示を準備しています…';
    try { await SP.loadScript(THREE_URL); }
    catch (e) { $('v3-msg').textContent = e.message; return; }
    init(); resize(); build();
    if (seat) enterSeat(seat); else enterOrbit(true);
    cancelAnimationFrame(raf); tick();
  };
  function close3D() {
    $('view3d').hidden = true;
    cancelAnimationFrame(raf); raf = 0;
    if (mode === 'seat' && seatId && SP.byId(seatId)) { SP.sel = new Set([seatId]); SP.emit('select'); }
  }

  SP.init3D = () => {
    $('v3-close').onclick = close3D;
    $('v3-orbit').onclick = () => R && enterOrbit(mode !== 'orbit');
    $('v3-seat').onclick = () => {
      if (!R) return;
      const s = seatFromSelection() || (seatId && SP.byId(seatId));
      if (!s) { $('v3-msg').textContent = '2D編集に戻って椅子を1脚選択してから押してください'; return; }
      enterSeat(s);
    };
    $('v3-eye').onchange = () => {
      $('v3-eye-custom').hidden = $('v3-eye').value !== 'custom';
      if (mode === 'seat' && seatId && SP.byId(seatId)) enterSeat(SP.byId(seatId));
    };
    $('v3-eye-custom').onchange = () => { if (mode === 'seat' && seatId && SP.byId(seatId)) enterSeat(SP.byId(seatId)); };
    $('v3-avatar').onchange = () => R && build();
    $('v3-labels').onchange = () => R && build();
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('view3d').hidden) close3D(); });
  };
})();
