/* ============================================================================
 *  agent.js — FAYDA TABANLI RASYONEL AJAN (Utility-Based Rational Agent)
 * ============================================================================
 *
 *  ÇALIŞMA PRENSİBİ
 *  ----------------
 *  Pacman'in her adımında ajan şunları yapar:
 *    1) Geçerli hareketleri bulur (yukarı/sol/aşağı/sağ; duvar olmayanlar).
 *    2) Her hareket a için olası sonuç durumunu s' oluşturur:
 *         - Pacman'in yeni karesi, o karede yenecek yemek/enerji topu/hayalet,
 *         - hayaletlerin (hız ve konumlarına göre) yeni kareye ulaşma süreleri,
 *         - bu kareden kaçış alanı, en yakın yemeğe uzaklık vb.
 *    3) Bu sonucu FAYDA FONKSİYONU U(s') ile puanlar.
 *    4) En yüksek faydalı hareketi seçer:   a* = argmax_a  U(s'_a)
 *  Rastgele hareket veya sabit bir yol KULLANILMAZ; her karar o anki duruma göre
 *  yeniden hesaplanır.
 *
 *  Ajanın kullandığı ortak bilgi — VARIŞ HARİTASI:
 *    Her kare t için varış[t] = herhangi bir tehlikeli hayaletin t'ye EN ERKEN
 *    ulaşabileceği an (Pacman adımı cinsinden). Hayaletin gerçek hızı, bir sonraki
 *    adımına kalan süre, evde bekleme süresi ve korkmuşsa enerjinin bitiş anı
 *    hesaba katılır. Pacman k. adımda bulunacağı bir kareyi ancak k < varış[t]
 *    ise "güvenli" sayar (hayalet gelmeden o kareyi terk eder).
 *
 *  FAYDA FONKSİYONU
 *  ----------------
 *    U(s') =  R_anlık                    (1) anlık ödül
 *           + U_yemek                    (2) yemeğe ulaşma           (≤ 0)
 *           + U_hayalet                  (3) hayalet riski           (≤ 0)
 *           + U_kaçış                    (3b) kaçış analizi / tuzak  (≤ 0)
 *           + U_enerji                   (4) enerji etkisi           (≤ 0)
 *           + U_maliyet                  (5) hareket maliyeti        (≤ 0)
 *  (Arayüzdeki "Yapay zekanın kararı" tablosu bu 6 bileşeni ve toplamı gösterir.)
 *
 *  (1) R_anlık  [ağırlık 1]
 *        Hareketin oyundaki gerçek puan karşılığı:
 *        yemek +10, enerji topu +50, korkmuş hayalet +200/400/800/1600.
 *
 *  (2) Yemeğe ulaşma  [W_YEMEK = 3, YEMEK_GÜVENSİZ = 30]
 *        d = yeni kareden, yalnızca GÜVENLİ karelerden geçen yolla en yakın
 *            yemeğe BFS mesafesi (yeni karede yemek varsa d = 0).
 *        Güvenli yoldan yemek yoksa: d = normal BFS mesafesi + 30 (ceza).
 *        U_yemek = −3 · d   → her 1 kare yaklaşma +3 fayda.
 *        Kuş uçuşu değil, duvarları hesaba katan gerçek yol uzunluğu kullanılır.
 *
 *  (3) Hayalet riski — yalnızca TEHLİKELİ hayaletler (normal, evden çıkan,
 *      etkisi bitmek üzere olan korkmuş hayalet); d = hayaletin yeni kareye yol
 *      mesafesi:
 *        hayalet zaten yeni karede             →  −10000  (kesin GAME OVER)
 *        hayalet, Pacman kareden çıkmadan gelir →  −2000
 *        d ≤ 8                                 →  −W_HAYALET · ((9 − d) / 8)²   [W_HAYALET = 40]
 *        d > 8                                 →  0
 *      Kare (²) şeklinde artan ceza: uzak hayalet az, yakın hayalet çok önemlidir.
 *
 *  (3b) Kaçış analizi (ileri bakış)  [UFUK = 12 adım, TABAN = 500, ADIM = 100]
 *        Bu hamleden sonra Pacman, geri dönmeden ilerleyerek 12 adım boyunca hep
 *        güvenli karelere basabilir mi? (Belleğe alınmış derinlik öncelikli arama.)
 *        En kötü durum varsayılır: hayaletler kaçış yolunu kesebilir (pusu dahil).
 *        s = hayatta kalınabilen adım sayısı;  s < 12 ise
 *        U_kaçış = −(500 + 100 · (12 − s))
 *        Böylece ajan çıkmaz yollara ve iki hayalet arasına sıkışmaktan kaçınır.
 *        Güvenli şekilde ulaşılan enerji topu kaçış sayılır.
 *
 *  (4) Enerji etkisi
 *      a) Avlanma  [W_AV = 6]: enerji etkinken, etki bitmeden yetişilebilecek en
 *         yakın korkmuş hayalete mesafe:  −6 · d_av   (yemekten 2 kat önemli)
 *      b) Enerji topuna yönelme  [W_ENERJİ = 6]:
 *         tehlike = (8 − d_enYakınHayalet) / 8   (0..1; hayalet yakınsa büyür)
 *         U = −6 · tehlike · d_enerjiTopu
 *         Hayalet uzaktayken enerji topu boşa harcanmaz; hayalet yaklaşınca ajan
 *         hem kurtulmak hem de hayalet avlayıp puan almak için enerji topuna koşar.
 *
 *  (5) Hareket maliyeti
 *        her hareket                          −1   (oyun kuralı)
 *        geri dönüş (önceki yönün tersi)      −2   → gereksiz ileri-geri salınımı önler
 *        yakın zamanda ziyaret edilen kare    −1 · ziyaretSayısı (zamanla söner)
 *                                                  → döngüye girmeyi önler
 *
 *  AĞIRLIKLARIN MANTIĞI
 *    Hayatta kalma (−10000, −2000, kaçış cezası ≥ 500) her şeyden önce gelir;
 *    sonra hayalet yakınlığı, ardından puan getiren hedefler (hayalet avı > yemek),
 *    en son hareket maliyetleri. Eşit faydada mevcut yönde devam edilir.
 *    Ağırlıklar, arayüzsüz yüzlerce simülasyon oyunu ile denenerek seçilmiştir.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const PM = (root.PM = root.PM || {});
  const CFG = PM.CONFIG;
  const DIR_LIST = PM.DIR_LIST;
  const OPPOSITE = PM.OPPOSITE;
  const INF = PM.INF;

  // ----------------------------- AĞIRLIKLAR --------------------------------
  const W = {
    FOOD: 3,          // (2) yemeğe her 1 kare yaklaşma
    FOOD_UNSAFE: 30,  // (2) güvenli yoldan yemek yoksa mesafeye eklenen ceza (kare)
    DEATH: 10000,     // (3) hayaletle aynı kare
    NEAR: 2000,       // (3) hayalet 1 kare uzakta
    GHOST: 40,        // (3) yakın hayalet cezası katsayısı
    GHOST_RANGE: 8,   // (3) hayalet riskinin hissedildiği mesafe
    HORIZON: 12,      // (3b) ileri bakış derinliği (Pacman adımı)
    GHOST_SPEED: 1.0, // varış haritası: hayalet periyot çarpanı (<1 => hayaleti daha hızlı varsay)
    TRAP_BASE: 500,   // (3b) kaçış yolu olmayan hamlenin sabit cezası
    TRAP: 100,        // (3b) yakalanmaya kalan her eksik adım için ek ceza
    HUNT: 6,          // (4a) korkmuş hayalete her 1 kare yaklaşma
    PELLET: 6,        // (4b) tehlike anında enerji topuna yaklaşma
    PELLET_RANGE: 8,  // (4b) tehlike hissedilen mesafe
    REVERSE: 2,       // (5) geri dönüş cezası
    VISIT: 1,         // (5) tekrar ziyaret cezası
  };
  PM.AGENT_WEIGHTS = W;

  class UtilityAgent {
    constructor() { this.reset(); }

    reset() {
      this.visits = null;
      this.lastDecision = null;
    }

    /* Ana karar fonksiyonu: en yüksek faydalı yönü döndürür. */
    choose(game) {
      const m = game.maze, pac = game.pac;
      if (!this.visits || this.visits.length !== m.n) this.visits = new Float32Array(m.n);
      for (let i = 0; i < m.n; i++) this.visits[i] *= 0.97; // ziyaret hafızası zamanla söner
      this.visits[pac.tile] += 1;

      const ctx = this.analyze(game);
      const options = [];
      let best = null;
      for (const dir of DIR_LIST) {
        const n = m.step(pac.tile, dir);
        if (!m.passOut(n)) { options.push({ dir, legal: false }); continue; }
        const parts = this.evaluate(game, ctx, dir, n);
        const total = parts.reward + parts.food + parts.ghost + parts.trap + parts.power + parts.cost;
        const opt = { dir, legal: true, parts, total };
        options.push(opt);
        // En yüksek fayda; eşitlikte mevcut yönde devam
        if (!best || total > best.total + 1e-9 || (Math.abs(total - best.total) <= 1e-9 && dir === pac.dir)) {
          best = opt;
        }
      }
      this.lastDecision = { options, chosen: best ? best.dir : null };
      return best ? best.dir : null;
    }

    /* Hayaletleri sınıflandır: tehlikeli / yenebilir, varış süreleri vb. */
    analyze(game) {
      const m = game.maze;
      const P = CFG.PACMAN_PERIOD;
      const powerSteps = game.powerTimer / P; // enerji etkisinin kalan süresi (Pacman adımı)
      const dangerous = [];
      const edible = [];
      for (const g of game.ghosts) {
        if (g.state === 'eaten') continue;
        const scared = g.state === 'active' && g.frightened && game.powered;
        if (scared) edible.push(g);              // şu an yenebilir
        if (scared && powerSteps >= 4) continue; // etki bitmek üzere değilse zararsız
        // Tehlikeli hayalet: ev içindekiler kapıdan geçebildiği için dAll ile ölçülür.
        // Varış zamanı (kare): bekleme + ilk adıma kalan süre + (mesafe−1)·periyot
        const viaDoor = g.state !== 'active';
        const period = game.def.ghostPeriod;
        let delay = 0, first = Math.max(0, period - g.timer);
        if (g.state === 'house') delay = Math.max(0, g.releaseAt - game.frame);
        if (scared) { delay = game.powerTimer; first = period; }
        const dist = (t) => (viaDoor ? m.dAll(g.tile, t) : m.dOut(g.tile, t));
        dangerous.push({
          g, scared, delay,
          dist,
          arrive: (t) => { const d = dist(t); return (delay + (d === 0 ? 0 : first + (d - 1) * period)) / P; },
          extraTiles: Math.round(delay / period),
        });
      }
      // Mevcut konuma en yakın tehlikeli hayalet (enerji topu ihtiyacını ölçmek için)
      let nearestDanger = INF;
      for (const d of dangerous) nearestDanger = Math.min(nearestDanger, d.dist(game.pac.tile) + d.extraTiles);

      // Hedef listeleri (önceden çıkar: hızlı arama için)
      const foods = [], pellets = [];
      for (let i = 0; i < m.n; i++) {
        if (game.food[i] === 1) foods.push(i);
        else if (game.food[i] === 2) pellets.push(i);
      }

      // VARIŞ HARİTASI: her kareye herhangi bir hayaletin EN ERKEN ulaşabileceği
      // an (Pacman adımı cinsinden). Hayaletin gerçek hızı, evde bekleme süresi
      // ve korkmuşsa enerji etkisinin bitişi hesaba katılır. Kaçış analizinde
      // (3b) kullanılır. En kötü durum varsayımıdır: hayalet, Pacman'in kaçacağı
      // yolu tahmin edip kesebilir (pusu dahil).
      const arrival = new Float32Array(m.n).fill(Infinity);
      for (const g of game.ghosts) {
        if (g.state === 'eaten') continue;
        const viaDoor = g.state !== 'active';
        const period = game.def.ghostPeriod * W.GHOST_SPEED;
        let delay = 0, first = Math.max(0, period - g.timer);
        if (g.state === 'house') delay = Math.max(0, g.releaseAt - game.frame);
        if (g.state === 'active' && g.frightened) { delay = game.powerTimer; first = period; }
        for (let t = 0; t < m.n; t++) {
          const d = viaDoor ? m.dAll(g.tile, t) : m.dOut(g.tile, t);
          if (d >= INF) continue;
          const frames = delay + (d === 0 ? 0 : first + (d - 1) * period);
          const steps = frames / P;
          if (steps < arrival[t]) arrival[t] = steps;
        }
      }
      return { powerSteps, dangerous, edible, nearestDanger, foods, pellets, arrival };
    }

    /* Bir hareketin sonuç durumunu fayda bileşenlerine göre değerlendir. */
    evaluate(game, ctx, dir, n) {
      const m = game.maze, pac = game.pac;
      const parts = { reward: 0, food: 0, ghost: 0, trap: 0, power: 0, cost: 0 };

      // (1) ANLIK ÖDÜL ------------------------------------------------------
      if (game.food[n] === 1) parts.reward += CFG.SCORE.FOOD;
      if (game.food[n] === 2) parts.reward += CFG.SCORE.POWER;
      let combo = game.ghostCombo;
      for (const g of ctx.edible) {
        if (g.tile === n) {
          parts.reward += CFG.SCORE.GHOST_BASE * Math.pow(2, Math.min(combo, 3));
          combo++;
        }
      }

      // (2) YEMEĞE ULAŞMA ---------------------------------------------------
      // Önce GÜVENLİ yoldan (her karesine hayaletten önce varılan) en yakın yemek
      // aranır. Güvenli yemek yoksa normal mesafe + ek ceza kullanılır.
      let dFood = this.safeFoodDistance(game, ctx, n);
      if (dFood < 0) {
        dFood = INF;
        for (const f of ctx.foods) { const d = m.dOut(n, f); if (d < dFood) dFood = d; }
        if (ctx.foods.length === 0) dFood = 0;
        else dFood += W.FOOD_UNSAFE;
      }
      parts.food = -W.FOOD * dFood;

      // (3) HAYALET RİSKİ ---------------------------------------------------
      // Zamanlama dikkate alınır: hayalet 1 kare uzakta olsa bile Pacman o kareyi
      // hayalet gelmeden terk edebiliyorsa "kesin yakalanma" sayılmaz.
      let closest = INF;
      for (const d of ctx.dangerous) {
        const raw = d.dist(n);
        if (raw >= INF) continue;
        const dist = raw + d.extraTiles;
        closest = Math.min(closest, dist);
        if (raw === 0 && d.delay === 0) parts.ghost -= W.DEATH;   // aynı kare
        else if (raw === 0 && d.scared) continue;                // korkmuş: yenir
        else if (d.arrive(n) <= 1) parts.ghost -= W.NEAR;        // Pacman kaçamadan gelir
        else if (dist <= W.GHOST_RANGE) {
          const k = (W.GHOST_RANGE + 1 - dist) / W.GHOST_RANGE;
          parts.ghost -= W.GHOST * k * k;
        }
      }

      // (3b) KAÇIŞ ANALİZİ / TUZAK -----------------------------------------
      if (closest <= W.HORIZON * 2) {
        const steps = this.escapeSteps(game, ctx, dir, n);
        if (steps < W.HORIZON) parts.trap = -(W.TRAP_BASE + W.TRAP * (W.HORIZON - steps));
      }

      // (4) ENERJİ ETKİSİ ---------------------------------------------------
      // (4a) avlanma: etki bitmeden yetişilebilecek en yakın korkmuş hayalet
      let dHunt = INF;
      for (const g of ctx.edible) {
        const d = m.dOut(n, g.tile);
        if (d + 1 < ctx.powerSteps - 1 && d < dHunt) dHunt = d;
      }
      if (dHunt < INF) parts.power -= W.HUNT * dHunt;
      // (4b) tehlike anında enerji topuna yönelme
      if (!game.powered && ctx.pellets.length && ctx.nearestDanger < W.PELLET_RANGE) {
        const danger = (W.PELLET_RANGE - ctx.nearestDanger) / W.PELLET_RANGE;
        let dPel = INF;
        for (const p of ctx.pellets) dPel = Math.min(dPel, m.dOut(n, p));
        parts.power -= W.PELLET * danger * dPel;
      }

      // (5) HAREKET MALİYETİ ------------------------------------------------
      parts.cost += CFG.SCORE.MOVE;                          // her hareket −1
      if (pac.dir && dir === OPPOSITE[pac.dir]) parts.cost -= W.REVERSE;
      parts.cost -= W.VISIT * this.visits[n];

      return parts;
    }

    /* (2) için: güvenli yoldan en yakın yemeğe mesafe (BFS). Pacman k. adımda
     * v karesindedir; v ancak k < varış[v] ise (hayaletten önce) kullanılabilir.
     * Bulunamazsa −1 döner. */
    safeFoodDistance(game, ctx, n) {
      const m = game.maze, arr = ctx.arrival;
      if (!(1 < arr[n])) return -1;
      if (game.food[n] === 1) return 0;
      const seen = new Uint8Array(m.n);
      seen[n] = 1;
      let frontier = [n];
      for (let d = 1; frontier.length && d <= 60; d++) {
        const next = [];
        for (const u of frontier) {
          for (let j = 0; j < 4; j++) {
            const v = m.nb[u * 4 + j];
            if (v < 0 || seen[v] || !m.passOut(v)) continue;
            seen[v] = 1;
            if (!(d + 1 < arr[v])) continue;
            if (game.food[v] === 1) return d;
            next.push(v);
          }
        }
        frontier = next;
      }
      return -1;
    }

    /* ------------------------------------------------------------------
     *  KAÇIŞ ANALİZİ (ileri bakış / lookahead)
     *  Pacman 'dir' yönüyle 'n' karesine geçerse, sonraki HORIZON adım boyunca
     *  GERİ DÖNMEDEN ilerleyerek (çıkmaz yol hariç) her adımda güvenli bir kareye
     *  basabilir mi?   S(kare, k, yön):
     *     k ≥ varış[kare]          → yakalanır, k−1 adım dayanılmıştır
     *     k = HORIZON / enerji topu → kurtulmuştur (HORIZON)
     *     aksi halde               → max S(komşu, k+1, yeni yön)
     *  (kare, k, yön) üçlüsü belleğe alınır, böylece arama çok hızlıdır.
     *  Geri dönüşün yasak olması, koridorda "bekleyerek" tuzağın geç fark
     *  edilmesini engeller: koridorun iki ucu da kesilmişse hemen anlaşılır.
     *  Dönüş: hayatta kalınabilen adım sayısı (0..HORIZON).
     * ----------------------------------------------------------------*/
    escapeSteps(game, ctx, dir, n) {
      const m = game.maze;
      const H = W.HORIZON;
      const arr = ctx.arrival;
      // memo[(k * n + tile) * 4 + yönIndeksi] = sonuç + 1   (0 = hesaplanmadı)
      const memo = ctx.escapeMemo || (ctx.escapeMemo = new Int8Array((H + 2) * m.n * 4));
      const dirIndex = { up: 0, left: 1, down: 2, right: 3 };
      const S = (tile, k, d) => {
        if (!(k < arr[tile])) return k - 1;          // hayalet daha önce varabilir
        if (k >= H || game.food[tile] === 2) return H; // ufka ulaşıldı / enerji topu
        const key = (k * m.n + tile) * 4 + dirIndex[d];
        if (memo[key]) return memo[key] - 1;
        let best = k;
        let any = false;
        for (const nd of PM.DIR_LIST) {
          if (nd === OPPOSITE[d]) continue;            // ilerleme zorunlu: geri dönüş yok
          const v = m.step(tile, nd);
          if (!m.passOut(v)) continue;
          any = true;
          const s = S(v, k + 1, nd);
          if (s > best) best = s;
          if (best >= H) break;
        }
        if (!any) { // çıkmaz yol: geri dönmek zorunda
          const s = S(m.step(tile, OPPOSITE[d]), k + 1, OPPOSITE[d]);
          if (s > best) best = s;
        }
        memo[key] = best + 1;
        return best;
      };
      return Math.max(0, S(n, 1, dir));
    }
  }

  PM.UtilityAgent = UtilityAgent;
})(typeof window !== 'undefined' ? window : globalThis);
