/* ============================================================================
 *  main.js — Uygulama akışı: menü, sırayla iki tur, HUD, kazanan ekranı
 * ----------------------------------------------------------------------------
 *  Akış:  Menü (ilk oyuncu seçimi) -> Tur 1 -> Tur 2 (oyun sıfırlanır) -> Sonuçlar
 *  Her tur, PM.Round ile aynı haritalar, konumlar, yemekler, enerji topları,
 *  ayarlar ve aynı rastgele tohumla sıfırdan başlatılır.
 * ==========================================================================*/
(function () {
  'use strict';
  const PM = window.PM;
  const CFG = PM.CONFIG;
  const $ = (id) => document.getElementById(id);

  const NAMES = { human: 'İnsan', ai: 'Yapay Zeka' };
  const ICONS = { human: '👤', ai: '🤖' };
  const DIR_LABEL = { up: '↑ Yukarı', left: '← Sol', down: '↓ Aşağı', right: '→ Sağ' };

  const app = {
    first: 'human',
    levelChoice: 'all',
    order: [],
    roundIdx: 0,
    round: null,
    results: [],
    phase: 'menu',          // menu | intro | playing | levelClear | dying | roundOver | results
    paused: false,
    speed: 1,
    keyDir: null,
    acc: 0,
    last: 0,
    phaseTime: 0,
    agent: new PM.UtilityAgent(),
    renderer: new PM.Renderer($('board')),
    previewGame: null,
    lastTableUpdate: 0,
    tableDirty: false,
  };

  /* ------------------------------------------------------------------
   *  Yardımcılar
   * ----------------------------------------------------------------*/
  function fmtTime(frames) {
    const totalMs = Math.round((frames / CFG.FPS) * 1000);
    const m = Math.floor(totalMs / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const d = Math.floor((totalMs % 1000) / 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
  }
  const fmtNum = (n) => n.toLocaleString('tr-TR');
  const fmtU = (v) => {
    const r = Math.round(v);
    if (r === 0) return '0';
    return (r > 0 ? '+' : '') + fmtNum(r);
  };
  function setText(id, text) {
    const el = $(id);
    if (el.textContent !== String(text)) el.textContent = text;
  }
  const currentGame = () => (app.round ? app.round.game : app.previewGame);

  /* ------------------------------------------------------------------
   *  Kontrolcüler (her iki oyuncu aynı oyun motorunu ve kuralları kullanır)
   * ----------------------------------------------------------------*/
  function humanController(game) {
    const m = game.maze, pac = game.pac;
    if (app.keyDir && m.passOut(m.step(pac.tile, app.keyDir))) return app.keyDir;
    if (pac.dir && m.passOut(m.step(pac.tile, pac.dir))) return pac.dir;
    return null;
  }
  function aiController(game) {
    const d = app.agent.choose(game);
    app.tableDirty = true;
    return d;
  }

  /* ------------------------------------------------------------------
   *  Menü
   * ----------------------------------------------------------------*/
  function buildMenu() {
    const legend = $('ghostLegend');
    legend.innerHTML = '';
    for (const key of ['chaser', 'ambusher', 'patrol', 'random']) {
      const t = PM.GHOST_TYPES[key];
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:${t.color}"></span><b>${t.name}</b> — ${t.desc}`;
      legend.appendChild(li);
    }
    document.querySelectorAll('#firstChoice .choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#firstChoice .choice-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        app.first = btn.dataset.first;
      });
    });
    $('levelSelect').addEventListener('change', (e) => (app.levelChoice = e.target.value));
    $('btnStart').addEventListener('click', startMatch);
    $('btnAgain').addEventListener('click', showMenu);
  }

  function showMenu() {
    app.phase = 'menu';
    app.round = null;
    app.paused = false;
    hideOverlay();
    $('results').classList.add('hidden');
    $('menu').classList.remove('hidden');
    app.previewGame = new PM.Game(PM.LEVELS[0], CFG.RNG_SEED);
    app.renderer.setGame(app.previewGame);
    fitCanvas();
    setText('roundBadge', 'Menü');
    setText('playerName', '—');
    setText('levelName', PM.LEVELS[0].name);
    $('history').innerHTML = 'Henüz tamamlanan tur yok.';
    $('history').classList.add('muted');
    clearTable('Yapay zeka oynarken her hamlenin fayda hesabı burada görünür.');
  }

  /* ------------------------------------------------------------------
   *  Maç / tur akışı
   * ----------------------------------------------------------------*/
  function startMatch() {
    app.order = app.first === 'human' ? ['human', 'ai'] : ['ai', 'human'];
    app.results = [];
    app.roundIdx = 0;
    $('menu').classList.add('hidden');
    $('history').innerHTML = '';
    $('history').classList.remove('muted');
    startRound();
  }

  function levelList() {
    return app.levelChoice === 'all' ? PM.LEVELS.map((_, i) => i) : [Number(app.levelChoice)];
  }

  function startRound() {
    const player = app.order[app.roundIdx];
    // Oyun sıfırlanır: aynı seviyeler, aynı tohum (seed) => aynı başlangıç koşulları
    app.round = new PM.Round(player, levelList(), CFG.RNG_SEED);
    app.agent.reset();
    app.keyDir = null;
    app.paused = false;
    app.acc = 0;
    app.renderer.setGame(app.round.game);
    fitCanvas();
    updateHud(true);
    clearTable(player === 'ai' ? 'Ajan başlamak üzere…' : 'Bu turda insan oynuyor. Yapay zekanın fayda hesabı onun turunda görünür.');

    const second = app.roundIdx === 1;
    const desc = player === 'human'
      ? 'Ok tuşları veya <b>W A S D</b> ile oynayın. Tüm yemekleri toplayın, hayaletlere yakalanmayın.'
      : 'Fayda tabanlı ajan oynayacak. Sağdaki tabloda her hamlenin fayda hesabını izleyebilirsiniz.';
    showOverlay(`
      <div class="big-icon">${ICONS[player]}</div>
      <h3>Tur ${app.roundIdx + 1} / 2 · ${NAMES[player]}</h3>
      <p>${desc}</p>
      ${second ? '<p><b>Oyun sıfırlandı:</b> aynı harita, başlangıç konumları, yemekler, enerji topları ve ayarlar.</p>' : ''}
      <button class="btn primary wide" data-action="begin">Başla ▶ <small>(Enter)</small></button>
    `);
    app.phase = 'intro';
  }

  function beginPlay() {
    hideOverlay();
    app.phase = 'playing';
    app.acc = 0;
  }

  function onLevelCleared() {
    const r = app.round;
    if (r.hasNextLevel) {
      app.phase = 'levelClear';
      app.phaseTime = 0;
      showOverlay(`
        <div class="big-icon">⭐</div>
        <h3 class="title-level">${r.game.def.name} tamamlandı!</h3>
        <p>Toplam puan: <b>${fmtNum(r.score)}</b> · Süre: <b>${fmtTime(r.frames)}</b></p>
        <p>Sonraki seviye hazırlanıyor…</p>
      `);
    } else {
      r.advance();
      finishRound();
    }
  }

  function nextLevel() {
    app.round.advance();
    app.agent.reset();
    app.keyDir = null;
    app.renderer.setGame(app.round.game);
    fitCanvas();
    hideOverlay();
    app.phase = 'playing';
    app.acc = 0;
  }

  function finishRound() {
    const res = app.round.result();
    app.results.push(res);
    addHistory(res);
    app.phase = 'roundOver';
    const isLast = app.roundIdx === 1;
    const title = res.completed
      ? '<h3 class="title-win">OYUN TAMAMLANDI!</h3>'
      : '<h3 class="title-gameover">GAME OVER</h3>';
    const sub = res.completed
      ? 'Tüm yemekler toplandı.'
      : `Hayalete yakalandı (Seviye ${res.lastLevel}).`;
    const nextName = isLast ? '' : NAMES[app.order[1]];
    showOverlay(`
      <div class="big-icon">${ICONS[res.player]}</div>
      ${title}
      <p>${NAMES[res.player]} · ${sub}</p>
      <div class="kv">
        <span>Toplam puan</span><span>${fmtNum(res.score)}</span>
        <span>Süre</span><span>${fmtTime(res.frames)}</span>
        <span>Tamamlanan seviye</span><span>${res.levelsCleared} / ${res.totalLevels}</span>
        <span>Yenen yemek</span><span>${res.stats.food}</span>
        <span>Yakalanan hayalet</span><span>${res.stats.ghosts}</span>
      </div>
      <button class="btn primary wide" data-action="${isLast ? 'results' : 'next'}">
        ${isLast ? 'Sonuçları Gör 🏆' : `Sıradaki: ${nextName} ▶`} <small>(Enter)</small>
      </button>
    `);
  }

  function addHistory(res) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${ICONS[res.player]} <b>${NAMES[res.player]}</b></span>
      <span>${fmtNum(res.score)} puan · ${fmtTime(res.frames)} · ${res.completed ? '<span class="ok">tamamladı</span>' : `<span class="bad">yakalandı (Sv ${res.lastLevel})</span>`}</span>`;
    $('history').appendChild(row);
  }

  function showResults() {
    hideOverlay();
    app.phase = 'results';
    const [a, b] = app.results;
    const { winner, reason } = PM.decideWinner(a, b);
    $('winnerBanner').innerHTML = winner
      ? `<div class="w-title">🏆 Kazanan: ${NAMES[winner.player]}</div><div class="w-reason">${reason}</div>`
      : `<div class="w-title">🤝 BERABERLİK</div><div class="w-reason">${reason}</div>`;
    $('resultCards').innerHTML = app.results.map((r, i) => `
      <div class="rcard ${winner === r ? 'win' : ''}">
        <h3><span>${ICONS[r.player]} ${NAMES[r.player]} <small class="muted">(${i + 1}. tur)</small></span>${winner === r ? '<span class="badge">KAZANAN</span>' : ''}</h3>
        <div class="kv">
          <span>Oyunu tamamladı mı?</span><span class="${r.completed ? 'ok' : 'bad'}">${r.completed ? 'Evet ✔' : 'Hayır ✖'}</span>
          <span>Tamamlanan seviye</span><span>${r.levelsCleared} / ${r.totalLevels}</span>
          <span>Toplam puan</span><span>${fmtNum(r.score)}</span>
          <span>Süre</span><span>${fmtTime(r.frames)}</span>
          <span>Yenen yemek</span><span>${r.stats.food}</span>
          <span>Yenen enerji topu</span><span>${r.stats.pellets}</span>
          <span>Yakalanan hayalet</span><span>${r.stats.ghosts}</span>
          <span>Hareket sayısı</span><span>${r.stats.moves}</span>
        </div>
      </div>`).join('');
    $('results').classList.remove('hidden');
  }

  /* ------------------------------------------------------------------
   *  Kaplama (overlay)
   * ----------------------------------------------------------------*/
  function showOverlay(html) {
    $('overlayCard').innerHTML = html;
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() {
    $('overlay').classList.add('hidden');
  }
  function overlayAction(action) {
    if (action === 'begin' && app.phase === 'intro') beginPlay();
    else if (action === 'next' && app.phase === 'roundOver') { app.roundIdx = 1; startRound(); }
    else if (action === 'results' && app.phase === 'roundOver') showResults();
  }
  $('overlayCard').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) overlayAction(btn.dataset.action);
  });

  /* ------------------------------------------------------------------
   *  HUD ve fayda tablosu
   * ----------------------------------------------------------------*/
  function updateHud(force) {
    const r = app.round;
    if (!r) return;
    const g = r.game;
    setText('hudScore', fmtNum(r.score));
    setText('hudTime', fmtTime(r.frames));
    setText('hudFood', g.foodLeft);
    setText('hudPellets', g.pelletsLeft);
    setText('playerName', NAMES[r.player]);
    setText('playerIcon', ICONS[r.player]);
    setText('levelName', `${g.def.name}  (${r.pos + 1}/${r.levelIndices.length})`);
    setText('roundBadge', `Tur ${app.roundIdx + 1} / 2`);
    const pf = g.def.powerFrames;
    $('hudPowerBar').style.width = `${(100 * g.powerTimer) / pf}%`;
    setText('hudPowerText', g.powerTimer > 0 ? `${(g.powerTimer / CFG.FPS).toFixed(1)} sn` : 'pasif');
    if (force) setText('btnPause', '⏸ Duraklat');
  }

  function clearTable(msg) {
    $('utilBody').innerHTML = `<tr><td colspan="8" class="muted" style="text-align:left;padding:10px 3px">${msg}</td></tr>`;
  }

  function renderTable() {
    const dec = app.agent.lastDecision;
    if (!dec) return;
    $('utilBody').innerHTML = dec.options.map((o) => {
      if (!o.legal) return `<tr class="wall"><td>${DIR_LABEL[o.dir]}</td><td colspan="7" style="text-align:center">duvar</td></tr>`;
      const p = o.parts;
      return `<tr class="${o.dir === dec.chosen ? 'chosen' : ''}">
        <td>${DIR_LABEL[o.dir]}</td>
        <td>${fmtU(p.reward)}</td><td>${fmtU(p.food)}</td><td>${fmtU(p.ghost)}</td>
        <td>${fmtU(p.trap)}</td><td>${fmtU(p.power)}</td><td>${fmtU(p.cost)}</td>
        <td class="total">${fmtU(o.total)}</td></tr>`;
    }).join('');
  }

  /* ------------------------------------------------------------------
   *  Ana döngü
   * ----------------------------------------------------------------*/
  function loop(ts) {
    const dt = app.last ? Math.min(100, ts - app.last) : 16;
    app.last = ts;
    const r = app.round;

    if (r && app.phase === 'playing' && !app.paused) {
      const g = r.game;
      const speed = r.player === 'ai' ? app.speed : 1;
      const ctrl = r.player === 'ai' ? aiController : humanController;
      const stepMs = 1000 / CFG.FPS;
      app.acc += dt * speed;
      let steps = 0;
      while (app.acc >= stepMs && steps < 60) {
        app.acc -= stepMs;
        g.step(ctrl);
        steps++;
        if (g.status === 'dead' || g.status === 'cleared') { app.acc = 0; break; }
      }
      if (g.status === 'dead') { app.phase = 'dying'; app.phaseTime = 0; }
      else if (g.status === 'cleared') onLevelCleared();
    } else if (app.phase === 'dying') {
      app.phaseTime += dt;
      if (app.phaseTime > 1600) { app.round.advance(); finishRound(); }
    } else if (app.phase === 'levelClear') {
      app.phaseTime += dt;
      if (app.phaseTime > 2000) nextLevel();
    }

    const game = currentGame();
    if (game) {
      app.renderer.draw(game, {
        dt,
        paused: app.paused && app.phase === 'playing',
        deathProgress: game.status === 'dead' ? (app.phase === 'dying' ? app.phaseTime / 1100 : 1) : null,
      });
    }
    updateHud();
    if (app.tableDirty && ts - app.lastTableUpdate > 90) {
      app.tableDirty = false;
      app.lastTableUpdate = ts;
      renderTable();
    }
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------
   *  Girdi
   * ----------------------------------------------------------------*/
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', (e) => {
    if (!$('menu').classList.contains('hidden') || !$('results').classList.contains('hidden')) {
      if (e.code === 'Enter' && !$('menu').classList.contains('hidden')) startMatch();
      return;
    }
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault();
      if (app.round && app.round.player === 'human') app.keyDir = dir;
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      const btn = $('overlay').classList.contains('hidden') ? null : $('overlayCard').querySelector('[data-action]');
      if (btn) { e.preventDefault(); overlayAction(btn.dataset.action); return; }
    }
    if (e.code === 'KeyP' || e.code === 'Space') {
      e.preventDefault();
      togglePause();
    }
  });

  function togglePause() {
    if (app.phase !== 'playing') return;
    app.paused = !app.paused;
    setText('btnPause', app.paused ? '▶ Devam' : '⏸ Duraklat');
  }
  $('btnPause').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
  $('btnMenu').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (app.phase === 'menu') return;
    if (app.phase !== 'results' && !confirm('Mevcut oyun bitirilip ana menüye dönülsün mü?')) return;
    showMenu();
  });
  document.querySelectorAll('#speedBox button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#speedBox button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      b.blur();
      app.speed = Number(b.dataset.speed);
    });
  });

  /* Tuvali mevcut alana sığdır (en-boy oranını koruyarak) */
  function fitCanvas() {
    const rd = app.renderer;
    if (!rd.w) return;
    const card = document.querySelector('.board-card');
    const narrow = window.innerWidth <= 980;
    const W = card.clientWidth;
    const H = narrow ? window.innerHeight * 0.75 : card.clientHeight;
    const s = Math.min(W / rd.w, H / rd.h);
    rd.canvas.style.width = `${Math.floor(rd.w * s)}px`;
    rd.canvas.style.height = `${Math.floor(rd.h * s)}px`;
  }
  window.addEventListener('resize', fitCanvas);

  // Başlat
  buildMenu();
  showMenu();
  requestAnimationFrame(loop);
})();
