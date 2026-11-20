/* ============================================================================
 *  engine.js — Oyun motoru (kurallar, hareket, çarpışma, hayalet stratejileri)
 * ----------------------------------------------------------------------------
 *  Bu dosya grafik arayüzden bağımsızdır: hem tarayıcıda hem de Node.js ile
 *  (arayüzsüz test/simülasyon) çalışabilir.
 *
 *  Zaman modeli:
 *    Oyun 60 kare/sn'lik sabit adımlarla ilerler. Pacman her PACMAN_PERIOD
 *    karede, hayaletler kendi periyotlarında bir kare (tile) ilerler.
 *    Süre = oynanan kare sayısı / 60  (duraklatma ve "HAZIR" süresi hariç).
 * ==========================================================================*/
(function (root) {
  'use strict';
  const PM = (root.PM = root.PM || {});
  const CFG = PM.CONFIG;

  // Yalnızca 4 yön vardır: yukarı, sol, aşağı, sağ (çapraz hareket yok).
  const DIRS = {
    up: { x: 0, y: -1 },
    left: { x: -1, y: 0 },
    down: { x: 0, y: 1 },
    right: { x: 1, y: 0 },
  };
  const DIR_LIST = ['up', 'left', 'down', 'right'];
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const INF = 30000;

  PM.DIRS = DIRS;
  PM.DIR_LIST = DIR_LIST;
  PM.OPPOSITE = OPPOSITE;
  PM.INF = INF;

  /* Tohumlu (seed) rastgele sayı üreteci — mulberry32.
   * Aynı tohum => aynı sayı dizisi. İki oyuncu için adil başlangıç sağlar. */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  PM.makeRng = makeRng;

  /* ==========================================================================
   *  Maze — harita, geçilebilirlik ve önceden hesaplanmış BFS mesafeleri
   * ========================================================================*/
  class Maze {
    constructor(lines) {
      this.h = lines.length;
      this.w = lines[0].length;
      this.n = this.w * this.h;
      this.wall = new Uint8Array(this.n);
      this.door = new Uint8Array(this.n);
      this.foodStart = [];
      this.pelletStart = [];
      this.ghostStarts = [];
      this.pacStart = -1;
      this.doorTile = -1;

      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const c = lines[y][x];
          const i = this.idx(x, y);
          if (c === '#') this.wall[i] = 1;
          else if (c === '-') { this.door[i] = 1; this.doorTile = i; }
          else if (c === '.') this.foodStart.push(i);
          else if (c === 'o') this.pelletStart.push(i);
          else if (c === 'P') this.pacStart = i;
          else if (c === 'G') this.ghostStarts.push(i);
        }
      }
      // Kapının hemen üstü: evden çıkış noktası; hemen altı: eve dönüş noktası.
      this.exitTile = this.doorTile - this.w;
      this.homeTile = this.doorTile + this.w;

      // Komşuluk tablosu: nb[i*4 + k] = DIR_LIST[k] yönündeki komşu (yoksa -1)
      this.nb = new Int16Array(this.n * 4).fill(-1);
      for (let i = 0; i < this.n; i++) {
        const x = i % this.w, y = (i / this.w) | 0;
        DIR_LIST.forEach((d, k) => {
          const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
          if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h) this.nb[i * 4 + k] = this.idx(nx, ny);
        });
      }

      // İki graf için tüm-çiftler BFS mesafeleri (harita küçük olduğu için hızlıdır):
      //  distOut: kapı kapalı  -> Pacman ve dışarıdaki hayaletler
      //  distAll: kapı açık    -> evden çıkan / eve dönen hayaletler
      this.distOut = this.allPairs((i) => !this.wall[i] && !this.door[i]);
      this.distAll = this.allPairs((i) => !this.wall[i]);

      // Ev içi kareler: Pacman'in başlangıcından (kapı kapalıyken) ulaşılamayan zeminler.
      this.inside = new Uint8Array(this.n);
      for (let i = 0; i < this.n; i++) {
        if (!this.wall[i] && this.distOut[this.pacStart * this.n + i] >= INF) this.inside[i] = 1;
      }

      // Dağılma (scatter) hedefleri: haritanın dört köşesine en yakın yürünebilir kareler.
      const corners = [[this.w - 2, 1], [1, 1], [this.w - 2, this.h - 2], [1, this.h - 2]];
      this.corners = corners.map(([cx, cy]) => {
        let best = -1, bd = Infinity;
        for (let i = 0; i < this.n; i++) {
          if (!this.passOut(i) || this.inside[i]) continue;
          const d = Math.abs((i % this.w) - cx) + Math.abs(((i / this.w) | 0) - cy);
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      });

      this.validate();
    }

    idx(x, y) { return y * this.w + x; }
    x(i) { return i % this.w; }
    y(i) { return (i / this.w) | 0; }
    step(i, dir) { return this.nb[i * 4 + DIR_LIST.indexOf(dir)]; }
    passOut(i) { return i >= 0 && !this.wall[i] && !this.door[i]; }
    passAll(i) { return i >= 0 && !this.wall[i]; }
    dOut(a, b) { return this.distOut[a * this.n + b]; }
    dAll(a, b) { return this.distAll[a * this.n + b]; }

    allPairs(passable) {
      const n = this.n;
      const dist = new Int16Array(n * n).fill(INF);
      const queue = new Int16Array(n);
      for (let s = 0; s < n; s++) {
        if (!passable(s)) continue;
        const base = s * n;
        dist[base + s] = 0;
        let head = 0, tail = 0;
        queue[tail++] = s;
        while (head < tail) {
          const u = queue[head++];
          const du = dist[base + u];
          for (let k = 0; k < 4; k++) {
            const v = this.nb[u * 4 + k];
            if (v >= 0 && passable(v) && dist[base + v] === INF) {
              dist[base + v] = du + 1;
              queue[tail++] = v;
            }
          }
        }
      }
      return dist;
    }

    /* Kılavuz: "Tüm yemekler erişilebilir olmalıdır." -> BFS ile doğrulama */
    validate() {
      const bad = [...this.foodStart, ...this.pelletStart].filter((i) => this.dOut(this.pacStart, i) >= INF);
      if (bad.length) throw new Error('Haritada erişilemeyen yemek var: ' + bad.join(','));
      if (this.pacStart < 0 || this.doorTile < 0) throw new Error('Harita eksik (P veya kapı yok)');
    }
  }
  PM.Maze = Maze;

  /* ==========================================================================
   *  Game — tek bir seviyenin oynanışı
   * ========================================================================*/
  // Hayalet stratejilerine göre rastgelelik oranı (kavşakta rastgele yön seçme olasılığı)
  const RANDOMNESS = { chaser: 0.05, ambusher: 0.1, patrol: 0.1, random: 1.0 };
  // Hedefe uzaklık ölçütü: 'bfs' = labirent içi yol, 'euclid' = kuş uçuşu
  const GHOST_METRIC = { chaser: 'bfs', ambusher: 'euclid', patrol: 'euclid', random: 'euclid' };
  // Strateji -> dağılma köşesi (0: sağ üst, 1: sol üst, 2: sağ alt, 3: sol alt)
  const CORNER_OF = { chaser: 0, ambusher: 1, patrol: 2, random: 3 };

  class Game {
    constructor(levelDef, seed) {
      this.def = levelDef;
      this.maze = new Maze(levelDef.map);
      this.rng = makeRng(seed);
      const m = this.maze;

      // Yemek durumu: 1 = yemek, 2 = enerji topu, 0 = boş
      this.food = new Uint8Array(m.n);
      m.foodStart.forEach((i) => (this.food[i] = 1));
      m.pelletStart.forEach((i) => (this.food[i] = 2));
      this.foodLeft = m.foodStart.length;
      this.pelletsLeft = m.pelletStart.length;
      this.totalFood = m.foodStart.length;

      this.pac = {
        tile: m.pacStart, prev: m.pacStart,
        dir: null, nextDir: null,
        timer: CFG.PACMAN_PERIOD - 1, moving: false, facing: 'left',
      };

      this.ghosts = m.ghostStarts.map((tile, i) => {
        const type = levelDef.ghosts[i] || 'random';
        return {
          id: i, type, tile, prev: tile, startTile: tile,
          dir: 'left', forceReverse: false, moved: false,
          state: m.inside[tile] ? 'house' : 'active',
          frightened: false, timer: 0,
          releaseAt: (levelDef.releaseFrames && levelDef.releaseFrames[i]) || 0,
          corner: m.corners[CORNER_OF[type] % 4],
          patrolIdx: CORNER_OF[type] % 4,
        };
      });

      this.score = 0;
      this.frame = 0;               // oynanan kare sayısı (süre ölçümü)
      this.readyFrames = CFG.READY_FRAMES;
      this.status = 'ready';        // ready | playing | dead | cleared
      this.powerTimer = 0;
      this.ghostCombo = 0;
      this.modeIndex = 0;
      this.modeTimer = 0;
      this.mode = levelDef.schedule[0][0];
      this.events = [];             // arayüz için olaylar (puan yazıları vb.)
      this.stats = { moves: 0, food: 0, pellets: 0, ghosts: 0 };
    }

    get powered() { return this.powerTimer > 0; }

    /* Pacman'in bu karede geçebileceği yönler */
    legalDirs(tile) {
      return DIR_LIST.filter((d) => this.maze.passOut(this.maze.step(tile, d)));
    }

    ghostPeriod(g) {
      if (g.state === 'eaten') return 4;
      if (g.frightened) return this.def.frightPeriod;
      return this.def.ghostPeriod;
    }

    /* ------------------------------------------------------------------
     *  Bir kare (frame) ilerlet.
     *  controller(game) -> Pacman'in bu adımdaki yönü ('up'|'down'|'left'|'right'|null)
     * ----------------------------------------------------------------*/
    step(controller) {
      if (this.status === 'ready') {
        if (--this.readyFrames <= 0) this.status = 'playing';
        return;
      }
      if (this.status !== 'playing') return;
      this.frame++;
      const m = this.maze;

      // ---------------- 1) Pacman hareketi ----------------
      const pac = this.pac;
      let pacFrom = -1, pacTo = -1;
      pac.timer++;
      if (pac.timer >= CFG.PACMAN_PERIOD) {
        const dir = controller(this);
        const next = dir ? m.step(pac.tile, dir) : -1;
        if (next >= 0 && m.passOut(next)) {
          pac.prev = pac.tile;
          pac.tile = next;
          pac.dir = dir;
          pac.facing = dir;
          pac.timer = 0;
          pac.moving = true;
          pacFrom = pac.prev;
          pacTo = next;
          this.score += CFG.SCORE.MOVE; // her hareket: negatif puan
          this.stats.moves++;
          this.eatAt(next);
          if (this.foodLeft === 0) { this.status = 'cleared'; return; }
        } else {
          // Duvara dayandı: hareket yok, puan kesilmez; bir sonraki karede tekrar dener.
          pac.prev = pac.tile;
          pac.moving = false;
          pac.timer = CFG.PACMAN_PERIOD;
        }
        if (this.checkCollisions(-1, -1)) return;
      }

      // ---------------- 2) Hayalet hareketleri ----------------
      for (const g of this.ghosts) {
        g.moved = false;
        if (g.state === 'house') {
          if (this.frame >= g.releaseAt) { g.state = 'leaving'; g.timer = 0; }
          else continue;
        }
        g.timer++;
        if (g.timer >= this.ghostPeriod(g)) {
          g.timer = 0;
          this.moveGhost(g);
        }
      }
      if (this.checkCollisions(pacFrom, pacTo)) return;

      // ---------------- 3) Zamanlayıcılar ----------------
      if (this.powerTimer > 0) {
        if (--this.powerTimer === 0) {
          this.ghosts.forEach((g) => (g.frightened = false));
          this.ghostCombo = 0;
        }
      } else {
        // Dağılma/kovalama modları (enerji etkisi sırasında durur)
        this.modeTimer++;
        const [, len] = this.def.schedule[this.modeIndex];
        if (this.modeTimer >= len && this.modeIndex < this.def.schedule.length - 1) {
          this.modeIndex++;
          this.modeTimer = 0;
          this.mode = this.def.schedule[this.modeIndex][0];
          this.ghosts.forEach((g) => { if (g.state === 'active') g.forceReverse = true; });
        }
      }
    }

    eatAt(tile) {
      const f = this.food[tile];
      if (f === 1) {
        this.food[tile] = 0;
        this.foodLeft--;
        this.score += CFG.SCORE.FOOD;
        this.stats.food++;
      } else if (f === 2) {
        this.food[tile] = 0;
        this.pelletsLeft--;
        this.score += CFG.SCORE.POWER;
        this.stats.pellets++;
        this.events.push({ type: 'points', tile, text: '+' + CFG.SCORE.POWER });
        // Enerji etkisi: dışarıdaki hayaletler korkar, geri döner ve yenebilir hale gelir
        this.powerTimer = this.def.powerFrames;
        this.ghostCombo = 0;
        this.ghosts.forEach((g) => {
          if (g.state === 'active') { g.frightened = true; g.forceReverse = true; }
        });
      }
    }

    /* Aynı kareye düşme veya karşılıklı yer değiştirme (içinden geçme) = çarpışma */
    checkCollisions(pacFrom, pacTo) {
      const pac = this.pac;
      for (const g of this.ghosts) {
        if (g.state !== 'active' && g.state !== 'leaving') continue;
        const same = g.tile === pac.tile;
        const swap = pacFrom >= 0 && g.moved && g.prev === pacTo && g.tile === pacFrom;
        if (!same && !swap) continue;
        if (g.frightened) {
          const pts = CFG.SCORE.GHOST_BASE * Math.pow(2, Math.min(this.ghostCombo, 3));
          this.ghostCombo++;
          this.score += pts;
          this.stats.ghosts++;
          g.state = 'eaten';
          g.frightened = false;
          g.timer = 0;
          this.events.push({ type: 'points', tile: g.tile, text: '+' + pts, big: true });
        } else {
          this.status = 'dead'; // Normal durumda hayalete çarpmak = OYUN BİTTİ
          return true;
        }
      }
      return false;
    }

    /* ------------------------------------------------------------------
     *  Hayalet hareketi
     * ----------------------------------------------------------------*/
    moveGhost(g) {
      const m = this.maze;
      let dir = null;
      if (g.state === 'leaving') {
        dir = this.dirToward(g.tile, m.exitTile, true);
      } else if (g.state === 'eaten') {
        dir = this.dirToward(g.tile, m.homeTile, true);
      } else {
        dir = this.chooseActiveDir(g);
      }
      if (!dir) return;
      const next = m.step(g.tile, dir);
      g.prev = g.tile;
      g.tile = next;
      g.dir = dir;
      g.moved = true;

      if (g.state === 'leaving' && g.tile === m.exitTile) {
        g.state = 'active';
        g.dir = this.rng() < 0.5 ? 'left' : 'right';
      } else if (g.state === 'eaten' && g.tile === m.homeTile) {
        g.state = 'house';
        g.releaseAt = this.frame + 60; // 1 sn sonra tekrar çıkar
      }
    }

    /* Hedefe olan BFS mesafesini en çok azaltan yön (ev içinde/kapıdan geçiş için) */
    dirToward(from, target, viaDoor) {
      const m = this.maze;
      let best = null, bd = INF + 1;
      for (const d of DIR_LIST) {
        const n = m.step(from, d);
        if (!(viaDoor ? m.passAll(n) : m.passOut(n))) continue;
        const dist = viaDoor ? m.dAll(n, target) : m.dOut(n, target);
        if (dist < bd) { bd = dist; best = d; }
      }
      return best;
    }

    /* Dışarıdaki hayaletin yön seçimi.
     * Kural: hayaletler geri dönemez (çıkmaz yol veya mod değişimi hariç). */
    chooseActiveDir(g) {
      const m = this.maze;
      if (g.forceReverse) {
        g.forceReverse = false;
        const r = OPPOSITE[g.dir];
        if (m.passOut(m.step(g.tile, r))) return r;
      }
      const options = DIR_LIST.filter((d) => d !== OPPOSITE[g.dir] && m.passOut(m.step(g.tile, d)));
      if (options.length === 0) return OPPOSITE[g.dir]; // çıkmaz yol
      if (options.length === 1) return options[0];

      // Korkmuş hayalet: rastgele kaçışır
      if (g.frightened) return options[Math.floor(this.rng() * options.length)];

      if (this.rng() < RANDOMNESS[g.type]) return options[Math.floor(this.rng() * options.length)];

      // Hedefe uzaklık ölçütü: Avcı labirent içi gerçek yol mesafesini (BFS),
      // diğerleri kuş uçuşu mesafeyi kullanır (daha az "mükemmel" takip).
      const target = this.ghostTarget(g);
      const useBfs = (PM.GHOST_METRIC || GHOST_METRIC)[g.type] === 'bfs';
      const tx = m.x(target), ty = m.y(target);
      let best = options[0], bd = Infinity;
      for (const d of options) {
        const n = m.step(g.tile, d);
        const dist = useBfs ? m.dOut(n, target) : (m.x(n) - tx) ** 2 + (m.y(n) - ty) ** 2;
        if (dist < bd) { bd = dist; best = d; }
      }
      return best;
    }

    /* Hayalet stratejileri (hedef kare seçimi) */
    ghostTarget(g) {
      const m = this.maze, pac = this.pac;
      if (this.mode === 'scatter' && g.type !== 'patrol') return g.corner;
      switch (g.type) {
        case 'chaser': // Avcı: doğrudan Pacman'in bulunduğu kare
          return pac.tile;
        case 'ambusher': { // Pusucu: Pacman'in gittiği yönde 4 kare ileri
          let t = pac.tile;
          if (pac.dir) {
            for (let k = 0; k < 4; k++) {
              const n = m.step(t, pac.dir);
              if (!m.passOut(n)) break;
              t = n;
            }
          }
          return t;
        }
        case 'patrol': { // Devriye: yakınsa kovala, değilse köşeler arasında dolaş
          if (this.mode === 'chase' && m.dOut(g.tile, pac.tile) <= 7) return pac.tile;
          if (g.tile === m.corners[g.patrolIdx]) g.patrolIdx = (g.patrolIdx + 1) % 4;
          return m.corners[g.patrolIdx];
        }
        default:
          return pac.tile;
      }
    }
  }
  PM.Game = Game;

  /* ==========================================================================
   *  Round — bir oyuncunun turu (seviyeler sırayla oynanır, puan/süre birikir)
   *  Her tur aynı ayarlarla sıfırdan başlar: aynı harita, konumlar, yemekler,
   *  enerji topları ve aynı rastgele tohum.
   * ========================================================================*/
  class Round {
    constructor(player, levelIndices, seed) {
      this.player = player;            // 'human' | 'ai'
      this.levelIndices = levelIndices;
      this.seed = seed;
      this.pos = 0;
      this.doneScore = 0;
      this.doneFrames = 0;
      this.doneStats = { moves: 0, food: 0, pellets: 0, ghosts: 0 };
      this.levelsCleared = 0;
      this.finished = false;
      this.completed = false;
      this.game = this.makeGame();
    }
    makeGame() {
      const idx = this.levelIndices[this.pos];
      return new Game(PM.LEVELS[idx], this.seed + idx * 7919);
    }
    get levelDef() { return this.game.def; }
    get score() { return this.doneScore + this.game.score; }
    get frames() { return this.doneFrames + this.game.frame; }
    get stats() {
      const s = { ...this.doneStats };
      for (const k in s) s[k] += this.game.stats[k];
      return s;
    }
    get hasNextLevel() { return this.pos < this.levelIndices.length - 1; }

    /* Seviye bittiğinde çağrılır. true => sıradaki seviye yüklendi */
    advance() {
      const g = this.game;
      if (g.status === 'cleared') this.levelsCleared++;
      if (g.status === 'cleared' && this.hasNextLevel) {
        this.doneScore += g.score;
        this.doneFrames += g.frame;
        for (const k in this.doneStats) this.doneStats[k] += g.stats[k];
        this.pos++;
        this.game = this.makeGame();
        return true;
      }
      this.finished = true;
      this.completed = g.status === 'cleared';
      return false;
    }

    result() {
      return {
        player: this.player,
        completed: this.completed,
        levelsCleared: this.levelsCleared,
        totalLevels: this.levelIndices.length,
        lastLevel: this.game.def.id,
        score: this.score,
        frames: this.frames,
        stats: this.stats,
      };
    }
  }
  PM.Round = Round;

  /* ==========================================================================
   *  Kazanan belirleme (kılavuzdaki sıra ile):
   *    1) Oyunu tamamlama durumu  2) Toplam puan  3) Daha kısa süre  4) Beraberlik
   * ========================================================================*/
  PM.decideWinner = function (a, b) {
    if (a.completed !== b.completed) {
      return { winner: a.completed ? a : b, reason: 'Oyunu tamamlayan oyuncu kazanır.' };
    }
    if (a.score !== b.score) {
      return { winner: a.score > b.score ? a : b, reason: 'Tamamlama durumu eşit; toplam puanı yüksek olan kazanır.' };
    }
    if (a.frames !== b.frames) {
      return { winner: a.frames < b.frames ? a : b, reason: 'Tamamlama durumu ve puan eşit; süresi kısa olan kazanır.' };
    }
    return { winner: null, reason: 'Tüm ölçütler eşit: BERABERLİK.' };
  };
})(typeof window !== 'undefined' ? window : globalThis);
