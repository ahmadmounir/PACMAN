/* ============================================================================
 *  levels.js — Seviye (level) tanımları
 * ----------------------------------------------------------------------------
 *  Harita karakterleri:
 *    #  duvar / engel (geçilemez)
 *    .  yemek
 *    o  enerji topu
 *    P  Pacman başlangıç konumu
 *    G  hayalet başlangıç konumu (okunma sırasına göre ghosts[] listesiyle eşleşir)
 *    -  hayalet evinin kapısı (sadece hayaletler geçebilir)
 *    (boşluk) boş zemin
 *
 *  Zorluk seviyeden seviyeye artar:
 *    - Engel düzeni: Seviye 1'de çıkmaz yol yoktur, geniş döngüler vardır.
 *      Seviye 2 ve 3'te daha uzun koridorlar ve çıkmaz yollar (tuzaklar) bulunur.
 *    - Hayalet sayısı: 2 -> 3 -> 4
 *    - Hayalet hızı artar, enerji topunun etki süresi kısalır.
 *  Tüm yemeklerin Pacman'in başlangıç noktasından erişilebilir olduğu oyun
 *  açılışında BFS ile ayrıca kontrol edilir (engine.js -> Maze.validate).
 * ==========================================================================*/
(function (root) {
  'use strict';
  const PM = (root.PM = root.PM || {});

  /* Hayalet stratejileri (engine.js içindeki ghostTarget fonksiyonunda uygulanır) */
  PM.GHOST_TYPES = {
    chaser:   { name: 'Avcı',    color: '#ff4b5c', desc: "En kısa yoldan Pacman'i kovalar" },
    ambusher: { name: 'Pusucu',  color: '#ff8ad6', desc: "Pacman'in 4 kare önünü hedefleyip pusu kurar" },
    patrol:   { name: 'Devriye', color: '#38e1e8', desc: 'Köşeler arasında devriye gezer; Pacman 7 kareden yakınsa kovalar' },
    random:   { name: 'Gezgin',  color: '#ffa53d', desc: 'Kavşaklarda rastgele yön seçer' },
  };

  // Hayalet modları: "scatter" (köşeye dağılma) ve "chase" (kovalama) dönüşümlü.
  // Değerler kare (frame) cinsindendir; 60 kare = 1 saniye.
  const SCHEDULE = [
    ['scatter', 5 * 60], ['chase', 20 * 60],
    ['scatter', 5 * 60], ['chase', 20 * 60],
    ['scatter', 4 * 60], ['chase', Infinity],
  ];

  PM.LEVELS = [
    {
      id: 1,
      name: 'Seviye 1 · Kolay',
      ghosts: ['chaser', 'random'],
      ghostPeriod: 13,        // hayalet 13 karede 1 kare ilerler (Pacman: 9)
      frightPeriod: 18,       // korkmuş hayalet daha yavaş
      powerFrames: 8 * 60,    // enerji etkisi 8 saniye
      releaseFrames: [0, 3 * 60],
      schedule: SCHEDULE,
      map: [
        '###################',
        '#o.......#.......o#',
        '#.##.###.#.###.##.#',
        '#.................#',
        '#.##.#.#####.#.##.#',
        '#....#...#...#....#',
        '####.###.#.###.####',
        '#........G........#',
        '#.###.###-###.###.#',
        '#.###.#  G  #.###.#',
        '#.###.#######.###.#',
        '#.................#',
        '#.##.###.#.###.##.#',
        '#....#...#...#....#',
        '#.##.#.#####.#.##.#',
        '#........P........#',
        '#.##.###.#.###.##.#',
        '#o.......#.......o#',
        '###################',
      ],
    },
    {
      id: 2,
      name: 'Seviye 2 · Orta',
      ghosts: ['chaser', 'ambusher', 'random'],
      ghostPeriod: 12,
      frightPeriod: 18,
      powerFrames: 6 * 60,    // enerji etkisi 6 saniye
      releaseFrames: [0, 2 * 60, 5 * 60],
      schedule: SCHEDULE,
      map: [
        '###################',
        '#o...#.......#...o#',
        '#.#.##.#####.##.#.#',
        '#.#.............#.#',
        '#.###.##.#.##.###.#',
        '#.....#.....#.....#',
        '###.#.#.###.#.#.###',
        '#...#....G....#...#',
        '#.#.#.###-###.#.#.#',
        '#.#...# G G #...#.#',
        '#.###.#######.###.#',
        '#...#.........#...#',
        '#.#.#.##.#.##.#.#.#',
        '#.#...#.....#...#.#',
        '#.###.#.###.#.###.#',
        '#.....#..P..#.....#',
        '###.#.##.#.##.#.###',
        '#...#....#....#...#',
        '#.#####.###.#####.#',
        '#o.......#.......o#',
        '###################',
      ],
    },
    {
      id: 3,
      name: 'Seviye 3 · Zor',
      ghosts: ['chaser', 'ambusher', 'patrol', 'random'],
      ghostPeriod: 11,
      frightPeriod: 17,
      powerFrames: 5 * 60,    // enerji etkisi 5 saniye
      releaseFrames: [0, 2 * 60, 4 * 60, 7 * 60],
      schedule: SCHEDULE,
      map: [
        '###################',
        '#o..#....#....#..o#',
        '#.#.#.##.#.##.#.#.#',
        '#.#...#.....#...#.#',
        '#.####.#.#.#.####.#',
        '#......#.#.#......#',
        '###.##.#...#.##.###',
        '#...#....G....#...#',
        '#.#.#.###-###.#.#.#',
        '#.#...# GGG #...#.#',
        '#.#.#.#######.#.#.#',
        '#...#.........#...#',
        '###.#.###.###.#.###',
        '#.....#.....#.....#',
        '#.###.#.###.#.###.#',
        '#...#....P....#...#',
        '#.#.#.##.#.##.#.#.#',
        '#.#...#..#..#...#.#',
        '#.#.###.###.###.#.#',
        '#o.......#.......o#',
        '###################',
      ],
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
