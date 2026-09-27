/* 起動とツールバー */
(function () {
  'use strict';
  const SP = window.SP;
  const $ = id => document.getElementById(id);

  function updateUndo() {
    $('btn-undo').disabled = !SP.canUndo();
    $('btn-redo').disabled = !SP.canRedo();
  }

  async function init() {
    SP.initEditor();
    SP.initPanels();
    SP.initIO();
    SP.init3D();

    const on = (id, fn) => { $(id).onclick = fn; };
    on('btn-new', async () => {
      const ok = await SP.confirm('新しい舞台図を作りますか？', '今の内容はブラウザの自動保存から消えます。残したい場合は先に「ファイル保存」してください。', '新規作成');
      if (ok) { SP.loadState(SP.newState(), true); SP.toast('新しい舞台図を作りました'); }
    });
    on('btn-open', SP.openProjectPicker);
    on('btn-save', SP.saveProject);
    on('btn-bg', SP.pickBackground);
    on('btn-calib', () => SP.mode === 'calib' ? SP.setMode('select') : SP.startCalib());
    on('btn-verify', () => SP.mode === 'verify' ? SP.setMode('select') : SP.startVerify());
    on('btn-origin', () => SP.setMode(SP.mode === 'origin' ? 'select' : 'origin'));
    on('btn-riser', () => SP.startTool(SP.RiserTool()));
    on('btn-arc', () => SP.startTool(SP.ArcTool('arc3')));
    on('btn-row', () => SP.startTool(SP.RowTool()));
    on('btn-undo', SP.undo);
    on('btn-redo', SP.redo);
    on('btn-fit', SP.fitView);
    on('btn-3d', () => SP.open3D());
    on('btn-export', SP.openExport);
    on('btn-toggle-lib', () => { $('app').classList.toggle('show-lib'); $('app').classList.remove('show-panel'); });
    on('btn-toggle-panel', () => { $('app').classList.toggle('show-panel'); $('app').classList.remove('show-lib'); });
    SP.on('change', updateUndo);
    SP.on('history', updateUndo);

    const restored = await SP.restoreAutosave();
    if (!restored) { SP.resetHistory(); SP.fitView(); SP.updateEmpty(); }
    updateUndo();
    SP.render();
    registerOffline();
  }

  // オフライン対応：Webで公開したとき（http/https）だけ Service Worker でアプリ一式をキャッシュする。
  // ファイルを直接開いた場合（file://）は同梱ライブラリだけでそのまま動く。
  function registerOffline() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (!navigator.serviceWorker.controller) {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => { if (w.state === 'activated') SP.toast('オフラインでも使えるようになりました（次回から電波がなくても起動できます）'); });
        });
      }
    }).catch(() => { /* 登録できなくてもオンラインでは普通に動く */ });
  }
  init();
})();
