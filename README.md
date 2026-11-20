# Pacman · İnsan vs Fayda Tabanlı Yapay Zeka

Grafik arayüzlü Pacman oyunu ve oyunu bağımsız olarak oynayan **fayda tabanlı rasyonel ajan** (utility-based rational agent).

## Nasıl çalıştırılır?

1. ZIP dosyasını bir klasöre çıkarın (sağ tık → **Tümünü ayıkla**).
2. Çıkan klasördeki **`index.html` dosyasına çift tıklayın.** Oyun varsayılan tarayıcıda (Chrome, Edge, Firefox) açılır.

- Kurulum, kütüphane, internet bağlantısı veya ek program **gerekmez**.
- Dil: JavaScript (HTML5 Canvas). Harici kütüphane kullanılmamıştır.

## Oynanış

1. Açılış ekranında **önce kimin oynayacağını** seçin (İnsan / Yapay Zeka) ve *Oyunu Başlat*'a basın.
2. İlk oyuncu oynar. Ardından oyun **sıfırlanır** ve ikinci oyuncu **aynı harita, aynı başlangıç konumları, aynı yemek ve enerji topları, aynı ayarlar ve aynı rastgele tohum (seed)** ile oynar.
3. İki tur bitince sonuç ekranında iki oyuncunun sonuçları ve kazanan gösterilir.

| Tuş | İşlev |
|---|---|
| `↑ ↓ ← →` veya `W A S D` | Hareket (yalnızca 4 yön) |
| `P` veya `Space` | Duraklat / devam |
| `Enter` | Ekrandaki butonu onayla |

Yapay zeka turunda sağdaki **1× / 2× / 4×** düğmeleri yalnızca izleme hızını değiştirir; **süre oyun zamanıyla** (60 kare = 1 sn) ölçüldüğü için sonucu etkilemez.

## Kurallar ve puanlama

| Olay | Puan |
|---|---|
| Her hareket | **−1** |
| Yemek | **+10** |
| Enerji topu | **+50** |
| Enerji etkisindeyken hayalet yakalamak | **+200, +400, +800, +1600** (aynı enerji süresinde art arda) |
| Normal hayalete çarpmak | **GAME OVER** |

- Engellerden geçilemez; hareketler yalnızca sağ, sol, yukarı, aşağı.
- Bir seviyedeki **tüm yemekler** toplanınca seviye tamamlanır; tüm seviyeler bitince oyun tamamlanır.
- Ekranda harita, karakterler, güncel puan, süre, kalan yemek sayısı, enerji topu sayısı ve enerji süresi gösterilir.

### Seviyeler (giderek zorlaşır)

| Seviye | Hayalet | Hayalet hızı (Pacman = 1) | Enerji süresi | Engel düzeni |
|---|---|---|---|---|
| 1 · Kolay | 2 | 0.69 | 8 sn | geniş döngüler, çıkmaz yol yok |
| 2 · Orta | 3 | 0.75 | 6 sn | daha uzun koridorlar, 4 çıkmaz yol |
| 3 · Zor | 4 | 0.82 | 5 sn | labirent düzeni, 6 çıkmaz yol |

Tüm yemeklerin erişilebilir olduğu, oyun açılışında BFS ile otomatik kontrol edilir (`Maze.validate`).

### Hayalet stratejileri

- **Avcı** (kırmızı): labirent içi en kısa yoldan (BFS) Pacman'i kovalar.
- **Pusucu** (pembe): Pacman'in gittiği yönde 4 kare ilerisini hedefler.
- **Devriye** (camgöbeği): köşeler arasında dolaşır, Pacman 7 kareden yakınsa kovalar.
- **Gezgin** (turuncu): kavşaklarda rastgele yön seçer.
- Hayaletler dönüşümlü olarak *dağılma* (köşeye gitme) ve *kovalama* modlarında hareket eder; enerji topu yenince korkar, yavaşlar ve yenebilir hale gelir.

### Kazanan belirleme

1. Oyunu tamamlama durumu → 2. Toplam puan → 3. Eşitlikte daha kısa süre → 4. Hepsi eşitse **beraberlik**.

## Yapay zeka (fayda tabanlı ajan)

Ajan her adımda geçerli hareketlerin olası sonuçlarını **fayda fonksiyonu** ile puanlar ve en yüksek faydalı hareketi seçer:

```
U(s') = R_anlık + U_yemek + U_hayalet + U_kaçış + U_enerji + U_maliyet
a*    = argmax_a U(s'_a)
```

| Bileşen | Ne ölçer? |
|---|---|
| Anlık ödül | Hareketin gerçek puanı (yemek, enerji topu, hayalet) |
| Yemek | Hayaletlerden önce ulaşılabilen en yakın yemeğe yol mesafesi |
| Hayalet riski | Tehlikeli hayaletlerin yakınlığı ve yakalama zamanlaması |
| Kaçış analizi | 12 adımlık ileri bakış: bu hamleden sonra sıkışmadan kaçılabilir mi? |
| Enerji | Korkmuş hayaletleri avlama, tehlikede enerji topuna yönelme |
| Hareket maliyeti | −1 / hamle, geri dönüş ve aynı yerde dolaşma cezası |

Bileşenler, formüller ve ağırlıkların gerekçesi **`js/agent.js`** dosyasının başındaki yorumlarda ayrıntılı olarak açıklanmıştır. Oyun sırasında sağdaki **"Yapay zekanın kararı"** tablosu her yön için bileşen değerlerini ve toplam faydayı canlı gösterir.

## Dosyalar

```
index.html        Oyun sayfası (çift tıklayın)
css/style.css     Arayüz stilleri
js/config.js      Ayarlar ve puanlama
js/levels.js      Seviye haritaları ve hayalet tipleri
js/engine.js      Oyun motoru: kurallar, çarpışma, hayalet stratejileri, tur ve kazanan
js/agent.js       Fayda tabanlı yapay zeka ajanı
js/renderer.js    Canvas çizimi
js/main.js        Menü, tur akışı, HUD ve sonuç ekranı
```
