/* ============================================================================
 *  renderer.js — Canvas üzerinde çizim (harita, yemekler, Pacman, hayaletler)
 * ==========================================================================*/
(function (root) {
  'use strict';
  const PM = (root.PM = root.PM || {});
  const CFG = PM.CONFIG;
  const TILE = 30;

  const COLORS = {
    bg: '#060914',
    wallFill: '#0d1a45',
    wallEdge: '#3d7bff',
    wallGlow: 'rgba(61,123,255,0.55)',
    door: '#ff9ad5',
    food: '#ffe0b5',
    pellet: '#fff4c2',
    pac: '#ffd43b',
    frightened: '#3355ff',
    frightenedFace: '#ffd6e8',
    blink: '#f1f3f5',
  };
  const ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.wallLayer = null;
      this.floats = [];
      this.time = 0;
    }

    /* Yeni seviye: tuval boyutu ve duvar katmanı (bir kez çizilir) */
    setGame(game) {
      this.game = game;
      const m = game.maze;
      const dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
      this.dpr = dpr;
      this.w = m.w * TILE;
      this.h = m.h * TILE;
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
      this.canvas.style.aspectRatio = `${m.w} / ${m.h}`;
      this.floats = [];
      this.buildWalls(m);
    }

    buildWalls(m) {
      const c = document.createElement('canvas');
      c.width = this.w * this.dpr;
      c.height = this.h * this.dpr;
      const g = c.getContext('2d');
      g.scale(this.dpr, this.dpr);
      g.fillStyle = COLORS.bg;
      g.fillRect(0, 0, this.w, this.h);

      const isWall = (x, y) => x < 0 || y < 0 || x >= m.w || y >= m.h || m.wall[m.idx(x, y)];
      // Dolgu
      g.fillStyle = COLORS.wallFill;
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
          if (m.wall[m.idx(x, y)]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
      // Neon kenarlar: duvarın koridora bakan kenarları
      g.strokeStyle = COLORS.wallEdge;
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.shadowColor = COLORS.wallGlow;
      g.shadowBlur = 8;
      const inset = 3;
      g.beginPath();
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
          if (!m.wall[m.idx(x, y)]) continue;
          const px = x * TILE, py = y * TILE;
          const open = (dx, dy) => {
            const nx = x + dx, ny = y + dy;
            return nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && !m.wall[m.idx(nx, ny)] && !m.inside[m.idx(nx, ny)];
          };
          if (open(0, -1)) { g.moveTo(px, py + inset); g.lineTo(px + TILE, py + inset); }
          if (open(0, 1)) { g.moveTo(px, py + TILE - inset); g.lineTo(px + TILE, py + TILE - inset); }
          if (open(-1, 0)) { g.moveTo(px + inset, py); g.lineTo(px + inset, py + TILE); }
          if (open(1, 0)) { g.moveTo(px + TILE - inset, py); g.lineTo(px + TILE - inset, py + TILE); }
        }
      }
      g.stroke();
      // Dış çerçeve
      g.shadowBlur = 10;
      g.lineWidth = 3;
      g.strokeRect(TILE / 2, TILE / 2, this.w - TILE, this.h - TILE);
      g.shadowBlur = 0;
      // Kenar kesişimlerini temizlemek için duvar içlerini tekrar boya
      g.fillStyle = COLORS.wallFill;
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
          if (!m.wall[m.idx(x, y)]) continue;
          const all = !isWall(x, y - 1) || !isWall(x, y + 1) || !isWall(x - 1, y) || !isWall(x + 1, y);
          if (!all) g.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
        }
      }
      // Hayalet evi kapısı
      const dx = m.x(m.doorTile) * TILE, dy = m.y(m.doorTile) * TILE;
      g.fillStyle = COLORS.door;
      g.fillRect(dx - 2, dy + TILE / 2 - 2, TILE + 4, 4);
      this.wallLayer = c;
    }

    tileCenter(i) {
      const m = this.game.maze;
      return [m.x(i) * TILE + TILE / 2, m.y(i) * TILE + TILE / 2];
    }

    lerpPos(prev, cur, t) {
      const [ax, ay] = this.tileCenter(prev);
      const [bx, by] = this.tileCenter(cur);
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }

    /* Her animasyon karesinde çağrılır */
    draw(game, opts = {}) {
      const ctx = this.ctx;
      const m = game.maze;
      this.time += opts.dt || 16;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.drawImage(this.wallLayer, 0, 0, this.w, this.h);

      // Yemekler ve enerji topları
      const pulse = 0.75 + 0.25 * Math.sin(this.time / 160);
      for (let i = 0; i < m.n; i++) {
        const f = game.food[i];
        if (!f) continue;
        const [x, y] = this.tileCenter(i);
        if (f === 1) {
          ctx.fillStyle = COLORS.food;
          ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
        } else {
          ctx.save();
          ctx.shadowColor = COLORS.pellet;
          ctx.shadowBlur = 14 * pulse;
          ctx.fillStyle = COLORS.pellet;
          ctx.beginPath();
          ctx.arc(x, y, 7.5 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Hayaletler
      for (const g of game.ghosts) this.drawGhost(game, g);

      // Pacman
      this.drawPacman(game, opts.deathProgress);

      // Puan yazıları
      while (game.events.length) {
        const e = game.events.shift();
        const [x, y] = this.tileCenter(e.tile);
        this.floats.push({ x, y, text: e.text, life: 1, big: !!e.big });
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const f of this.floats) {
        f.life -= (opts.dt || 16) / 1100;
        f.y -= 0.35;
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.font = `800 ${f.big ? 16 : 13}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = f.big ? '#38e1e8' : '#ffd43b';
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      this.floats = this.floats.filter((f) => f.life > 0);

      // "HAZIR!" yazısı
      if (game.status === 'ready') {
        const [x, y] = this.tileCenter(m.homeTile + 2 * m.w);
        this.banner('HAZIR!', x, y, '#ffd43b');
      }
      if (opts.paused) this.banner('DURAKLATILDI', this.w / 2, this.h / 2, '#f8f9fa');
    }

    banner(text, x, y, color) {
      const ctx = this.ctx;
      ctx.font = '900 22px "Segoe UI", system-ui, sans-serif';
      const w = ctx.measureText(text).width + 34;
      ctx.fillStyle = 'rgba(6,9,20,0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 18, w, 36, 18);
      else ctx.rect(x - w / 2, y - 18, w, 36);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 1);
    }

    drawPacman(game, deathProgress) {
      const ctx = this.ctx;
      const pac = game.pac;
      const t = pac.moving ? Math.min(1, pac.timer / CFG.PACMAN_PERIOD) : 1;
      const [x, y] = this.lerpPos(pac.prev, pac.tile, t);
      const r = TILE * 0.43;
      let mouth;
      if (deathProgress != null) mouth = Math.PI * Math.min(1, deathProgress);
      else mouth = pac.moving ? (0.05 + 0.3 * Math.abs(Math.sin(this.time / 70))) * Math.PI : 0.18 * Math.PI;
      const ang = ANGLE[pac.facing] || 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.shadowColor = 'rgba(255,212,59,0.6)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = COLORS.pac;
      if (deathProgress == null || deathProgress < 1) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    drawGhost(game, g) {
      const ctx = this.ctx;
      const m = game.maze;
      const period = game.ghostPeriod(g);
      const t = g.moved || g.prev !== g.tile ? Math.min(1, g.timer / period) : 1;
      let [x, y] = g.prev !== g.tile ? this.lerpPos(g.prev, g.tile, t) : this.tileCenter(g.tile);
      if (g.state === 'house') y += Math.sin(this.time / 180 + g.id) * 3;
      const type = PM.GHOST_TYPES[g.type];
      const r = TILE * 0.44;
      const eaten = g.state === 'eaten';
      let body = type.color;
      let face = null;
      if (g.frightened) {
        const blink = game.powerTimer < 120 && Math.floor(game.powerTimer / 12) % 2 === 0;
        body = blink ? COLORS.blink : COLORS.frightened;
        face = blink ? '#e03131' : COLORS.frightenedFace;
      }
      ctx.save();
      ctx.translate(x, y);
      if (!eaten) {
        ctx.shadowColor = body;
        ctx.shadowBlur = 10;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, r, Math.PI, 0);
        ctx.lineTo(r, r * 0.85);
        const waves = 3;
        const phase = Math.floor(this.time / 140) % 2;
        for (let i = 0; i < waves; i++) {
          const x1 = r - ((i + 0.5) * 2 * r) / waves;
          const x2 = r - ((i + 1) * 2 * r) / waves;
          ctx.quadraticCurveTo(x1, r * (phase ? 0.45 : 0.6), x2, r * 0.85);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (face) {
        // Korkmuş yüz
        ctx.fillStyle = face;
        ctx.fillRect(-r * 0.4, -r * 0.35, r * 0.22, r * 0.22);
        ctx.fillRect(r * 0.18, -r * 0.35, r * 0.22, r * 0.22);
        ctx.strokeStyle = face;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
          const px = -r * 0.55 + (i * r * 1.1) / 4;
          const py = r * 0.3 + (i % 2 ? -r * 0.12 : 0);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else {
        // Gözler (bakış yönüne göre)
        const d = PM.DIRS[g.dir] || { x: 0, y: 0 };
        for (const ex of [-r * 0.36, r * 0.36]) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(ex, -r * 0.2, r * 0.25, r * 0.31, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1c3faa';
          ctx.beginPath();
          ctx.arc(ex + d.x * r * 0.12, -r * 0.2 + d.y * r * 0.14, r * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  PM.Renderer = Renderer;
  PM.TILE = TILE;
})(typeof window !== 'undefined' ? window : globalThis);
