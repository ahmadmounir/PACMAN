/* ============================================================================
 *  config.js — Genel oyun ayarları ve puanlama kuralları
 * ----------------------------------------------------------------------------
 *  Bu değerler İNSAN ve YAPAY ZEKA oyuncusu için birebir aynıdır.
 *  (Proje kılavuzu: "Kurallar her iki oyuncu için aynı olmalıdır.")
 * ==========================================================================*/
(function (root) {
  'use strict';
  const PM = (root.PM = root.PM || {});

  PM.CONFIG = {
    // Oyun mantığı saniyede 60 "kare" (frame) ilerler. Süre ölçümü bu karelerle
    // yapılır; böylece süre, bilgisayarın hızından ve duraklatmadan etkilenmez.
    FPS: 60,

    // Pacman her 9 karede bir kare (tile) ilerler  (~6.7 kare/sn).
    PACMAN_PERIOD: 9,

    // Seviye başında gösterilen "HAZIR!" süresi (kare). Süreye DAHİL DEĞİLDİR.
    READY_FRAMES: 90,

    // Hayaletlerin rastgele kararları için sabit tohum (seed).
    // Her iki oyuncu aynı tohumla başlar => aynı başlangıç koşulları.
    RNG_SEED: 20251121,

    // ---------------------------- PUANLAMA ----------------------------------
    SCORE: {
      MOVE: -1,         // Her hareket (bir kare ilerleme) negatif puan
      FOOD: 10,         // Yemek
      POWER: 50,        // Enerji topu
      GHOST_BASE: 200,  // Enerji etkisindeyken hayalet yakalama.
                        // Aynı enerji süresinde art arda yakalananlar katlanır:
                        // 200, 400, 800, 1600
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
