# 🌍 WORLD CHAOS · Geopolitics 3D

3–10 arkadaşın aynı yaşayan 3D şehirde ticaret, emlak, suç, siyaset ve savaşla birbirine girdiği tarayıcı + Android oyunu.

---

## ⚡ 1. Hemen oyna (bilgisayarda)

```bash
npm install
npm start
```

Tarayıcıda **http://localhost:3000** adresini aç → ekrana dokun → intro → **⚡ HIZLI OYNA**.

- **Test için 10 kat hızlı zaman:** `MS_PER_HOUR=500 npm start`
- **Telefondan aynı Wi-Fi ile bağlanmak:** Sunucu açılınca bilgisayarının IP adresini bul (Windows'ta `ipconfig`, Mac/Linux'ta `ifconfig`). Telefonun tarayıcısından `http://192.168.x.x:3000` adresini aç.
- **İnternetten oynamak:** Sunucuyu bir VPS'te çalıştır ya da bir tünel kullan (ör. `cloudflared tunnel --url http://localhost:3000`). Çıkan adresi arkadaşlarınla paylaş.

## 📱 2. Android APK

APK **sadece istemcidir**. Oyun dünyası `npm start` ile çalışan sunucuda yaşar, APK açılınca o sunucuya bağlanır. Sunucu adresini oyunda **⚙️ Ayarlar → Sunucu adresi** kısmından girersin ya da APK'ya gömersin.

### Yol A: Bilgisayara hiçbir şey kurmadan (GitHub Actions)

1. Bu klasörü bir GitHub deposuna yükle.
2. **Actions** sekmesinde **Android APK** iş akışını aç → **Run workflow**. İstersen sunucu adresini de gir.
3. Yaklaşık 5–8 dakika sonra **world-chaos-apk** dosyasını indir. İçindeki `app-debug.apk` dosyasını telefona at ve kur ("bilinmeyen kaynaklar" izni gerekir).

### Yol B: Kendi bilgisayarında (Android Studio + JDK 17)

```bash
npm install
SERVER_URL=http://192.168.1.20:3000 npm run build:mobile   # www/ hazırlanır
npx cap add android                                          # ilk sefer
npx cap sync android
npx cap open android                                         # Android Studio'da ▶ Run
```

> Yatay ekran için `android/app/src/main/AndroidManifest.xml` içindeki `<activity` satırına `android:screenOrientation="sensorLandscape"` ekle. HTTP sunucusu kullanıyorsan `<application` satırına `android:usesCleartextTraffic="true"` ekle. GitHub iş akışı bunları kendisi yapıyor.

## 🎮 3. Kontroller

| | Mobil | PC |
|---|---|---|
| Yürü | Sol alttaki joystick (dokunduğun yerde belirir) | WASD / oklar |
| Koş | 🏃 butonu | Shift |
| Kamera | Ekranı sürükle, iki parmakla zoom ve döndürme | Fareyle sürükle + tekerlek |
| İncele | Bir şeye dokun / 🔍 | Tıkla / E |
| Ordu / Mülkler / Şehir | Sağ alttaki butonlar | M / B / C |

## 🏰 Faz 1: Açık Dünya, Köyler, Teknoloji

- **Açık dünya:** 20×20 parsellik harita. Ova, orman, karlı dağ sıraları, kıvrılan bir nehir ve ortada tarafsız Merkez Kasaba var.
- **Kendi köyün:** Her oyuncu 3×3 parsellik köyünde başlar: Köy Konağı, evler, pazar, çiftlik, meyhane, boş arsalar ve 8 köylü. Köyde yaşayanların gelir vergisi sana gelir.
- **Toprak genişletme:** Haritadan (🗺️) ya da zemine dokunarak bir parsel seç → 🧭 **Kaşif Gönder** (kaşif atla gider ve rapor verir) → boşsa ve sınırına komşuysa 🚩 **Sınırı Ör**. Topraklar sınır çitiyle senin renginde çevrilir. Her yeni parsel daha pahalıdır.
- **Teknoloji ağacı (🔬):** Orta Çağ'dan 2026'ya 8 çağ ve 29 teknoloji. Her deneme %30 şansla tutar, tutmazsa para gider. Çağ ilerledikçe maliyet artar. Teknolojiler bina, birlik, füze ve reklam kanalı açar. Matbaa olmadan şehir haberlerini göremezsin; Telefon ile 📱 uygulaması açılır.
- **Reklam (📣):** Dükkanını incele → Reklam Ver. Tellal, gazete, radyo, TV, internet ve sosyal medya kanalları var. %40 ihtimalle müşteri akın eder.
- **Çağa göre ordu:** Kılıçlı asker, okçu, süvari, tüfekli asker, top bataryası, modern piyade, tank.
- **Kontrol:** PC'de ekrana tıklayınca fareyle bakış (Esc ile çık); mobilde sürükle ve pinch.

## ⚔️ Faz 2: Ülkeler, Savaş, Hava Kuvvetleri

- **Ülke kur:** Vahşi topraklarda doğarsın. Uygun bir yerde (sınırlardan, nehirden ve dağdan uzak) **🏳️ ÜLKE KUR**'a bas, ülkene isim ver ve sıfır teknolojiyle başla. Uygun olmayan bir yerdeysen oyun en yakın uygun yeri haritada işaretler.
- **NPC ülkeler (🤖):** Kuzey Krallığı, Doğu İmparatorluğu ve Batı Cumhuriyeti kendi başlarına araştırır, toprak alır, ev ve kışla kurar, ordu besler. Zamanla sana savaş açar; ileri çağlarda füze ve uçak gönderir.
- **Savaş ilanı:** Düşman toprağına ya da sarayına dokun → 📜 **Savaş Gerekçesi Hazırla** (3 dk, karşı taraf haber alır) → ⚔️ **Savaş İlan Et**. Askerler, füzeler ve uçaklar sadece savaşta olduğun ülkeye saldırır. Barış teklif edebilirsin.
- **Sivil kayıplar ve nüfus:** Askerler düşmanın sokaktaki sivillerini de vurur. Nüfus bir ülkenin gücüdür; artırmak için ev ve apartman inşa et (göçmenler boş evlere yerleşir). Sıralama nüfusa göredir.
- **Hava kuvvetleri (Hava Üssü):** ✈️ F-16 (füze bırakır), 🚁 taarruz helikopteri (hedefte dolaşıp tarar), 🎯 SİHA (hassas vuruş), 🦇 **B-2 Spirit** (nükleer bombayı bırakır, bomba 3 saniye düşer, ardından mantar bulutu).
- **Hava savunması:** Savaştığın ülkenin füzelerini ve uçaklarını otomatik vurur. B-2 hayalet olduğu için düşürme şansı sadece %15.
- **Harita:** 28×28 parsel, öncekinden 2 kat büyük.

## 🧳 Faz 3: Vatandaş Hayatı

- **Vatandaş olarak başla:** Rastgele bir NPC ülkede, sana ayrılmış bir evin önünde doğarsın. Ülke kurmadan **asker, teknoloji, toprak, savaş yok**. Sınırlardan uzak boş bir bölgeye yürüyünce **ÜLKE KUR** butonu belirir.
- **Hayatta kal:** 🍔 Tokluk, 💧 Su, ⚡ Enerji, ❤️ Can. Aç/susuz kalırsan canın azalır; enerji biterse bayılırsın; ölürsen cebindeki paranın bir kısmını kaybedip evinde/hastanede doğarsın.
- **Binaların içine gir:** Ev, market, kafe, restoran, bar, silah dükkanı, fabrika, karakol, banka, hastane, saray. Gece dükkanlar kapanır, içerideysen dışarı çıkarılırsın.
- **Ev:** Buzdolabı (marketten aldıklarını koy, ye, iç), ocak (çay / Türk kahvesi demle, misafirlere ikram), kanepe + TV (canlı haberler), yatak (uyu). Kapıyı misafirlere açabilirsin; ev sahibi içerideyken arkadaşın gelirse kapı çalınır.
- **İş:** Kapıdan işe gir → içeride **Mesaiye Başla** → sarı işaretli göreve git → **Görevi Yap**. Her görev prim, her saat maaş. Görevler mesleğe göre değişir (raf dizme, paspas, kasa, bulaşık, kokteyl, makine, rapor, muayene...).
- **Polis:** Mesaideyken arada bir soygun ihbarı düşer. Kırmızı halkalı soyguncuyu kovala, yaklaş ve **🚔 Tutukla** (ödül + çalınan para iade).
- **Dövüş:** Yumruk, bıçak, tabanca, tüfek. NPC'lere veya oyunculara saldırabilirsin; masuma saldırırsan aranırsın.
- **🎙️ Sesli sohbet:** Mikrofonu aç, ~45 m içindeki (aynı odadaki) oyuncular seni duyar. Ses mesafeye göre kısılır, sağ/sol kulaktan gelir.
- **Kamera:** ➕/➖ butonları, iki parmakla sıkıştır ya da fare tekerleği; omuz üstü yakın görüşe kadar inebilir. NPC'ler artık yürüyen insan hızında, kolları ve bacakları sallanarak yürür. Yeni insan modeli: yüz, saç modelleri, eklemli kollar ve bacaklar.
- **PC kısayolları:** Sol tık saldır · E etkileşim · Q silah değiştir · V mikrofon · I çanta · +/- zoom.

## 🏴 Fetih: Kukla Devlet ve İlhak

Savaştığın ülkenin **sarayının 60 m çevresine en az 3 asker** sok (savunan asker kalmasın) ya da sarayı yık. Sonra saraya/topraklarına dokun:
- **🎎 Kukla Devlet:** Ülke yaşar ama her sabah hazinesinin %15'ini sana öder, sana savaş açamaz. Bağımsızlığını satın alabilir (₺15.000 × çağ) ya da sen serbest bırakabilirsin.
- **🏴 İlhak:** Tüm parseller, binalar ve nüfus senin olur; ordusu dağılır, lideri senin vatandaşın olur (sonra yeniden ülke kurabilir).
NPC ülkeler de bunu yapar: insan oyuncuyu kukla yapar, birbirlerini çoğunlukla ilhak eder.

## 💾 Kalıcı Dünyalar (Supabase)

Dünyalar her dakika ve sunucu kapanırken Supabase'e kaydedilir; boş dünya 10 dk sonra bellekten çıkar ("💤 Uyuyor") ve biri girince geri yüklenir. Sunucu uyurken geçen zaman (en fazla 5 oyun günü) hızlıca simüle edilir. **🌐 Sunucuya Katıl** ekranında tüm dünyalar listelenir; aynı telefondan dönen oyuncu aynı karakterle devam eder.

Render → Environment:
- `SUPABASE_URL` = `https://pwkmxlqgvjjuyhicxnfj.supabase.co`
- `SUPABASE_SECRET_KEY` = Supabase → Project Settings → API Keys → **secret** anahtar (`sb_secret_...`)

Bu iki değişken yoksa oyun eskisi gibi sadece bellekte çalışır.

## 🧩 4. Neler var?

**Dünya:** 64 parsellik şehir. Merkezde saray, çevresinde emniyet, banka ve hastane, dışarıda fabrikalar ve cezaevi. 16 farklı bina tipinin her biri ayrı modelle çiziliyor: kiremit çatılı ev, balkonlu apartman, havuzlu villa, otoparklı market, çizgili tenteli kafe, neonlu bar, alt türüne göre silolu / tanklı / bacalı fabrika, kubbeli saray, kuleli cezaevi ve dönen radarlı hava savunma.

**Atmosfer:** Gün-gece döngüsü var: gün doğumu, gece yanan pencereler, sokak lambaları ve yıldızlar. Fabrika bacaları tütüyor, polis lambaları yanıp sönüyor. Arka planda prosedürel müzik çalıyor ve ruh hali menü / barış / savaş arasında değişiyor. Dosyası olmayan sentezlenmiş sesler kullanılıyor.

**Yaşayan NPC'ler:** Her NPC'nin açlığı, mutluluğu, kişiliği, cüzdanı, evi ve işi var. Vardiyaya bir saat erken çıkıyor, çok acıkırsa mola veriyor, evde buzdolabından yiyor. Market ya da restoran seçerken **fiyat + mesafe** hesaplıyor (fakirler fiyata, zenginler mesafeye bakıyor). Akşam bara gidiyor, zenginler telefon alıyor. Parası biten, mutsuz ve kanuna saygısı düşük NPC gece soygun yapıyor. Çok mutsuz olan şehri terk ediyor, şehir mutluysa göç alıyor.

**Ekonomi (gerçek dünya gibi):**
- Fabrika → kamyon → dükkan → müşteri zinciri. Kamyonlar haritada gerçekten yol alıyor, yolda vurulursa mal kayboluyor.
- Dükkan sahibi fiyatı kendisi belirliyor. Panelde toptan fiyatı, kâr marjını, dünkü satışı ve stoğu görüyor. Otomatik ya da elle sipariş verebiliyor.
- NPC patronlar fiyatlarını talebe göre ayarlıyor: stok biterse zam yapıyor, satamazsa indirim.
- Maaş ödeyemeyen işletmenin çalışanlarının morali bozuluyor, sonunda işten çıkarma geliyor. Batmak üzere olan şirkete patronu sermaye koyuyor.
- Boş kadrolar işsizlerle doluyor (İŞKUR'da bekleyenler öncelikli). İşsizlere işsizlik maaşı ödeniyor.

**Emlak:** Tapu sistemi var. Arsa alıp üstüne 16 seçenekten birini inşa ediyorsun; inşaat iskele ve vinçle saat saat yükseliyor. Kiracılardan günlük kira toplanıyor, kirasını iki gün ödemeyen icrayla çıkarılıyor ve evsiz kalırsa parkta yatıyor. İlana çıkardığın mülkü zengin NPC'ler satın alabiliyor. Emlak değerleri suç ve radyasyonla düşüyor.

**İş:** Herhangi bir işyerinde "Burada Çalış" deyip mesai saatlerinde kapıda durarak saatlik maaş alabilirsin.

**Suç ve hukuk:** Soygun yaparsan aranma seviyen (⭐) artıyor ve polis NPC'ler olay yerine koşuyor. Yakalanırsan cezaevine ışınlanır ve para cezası ödersin. Kefaletle çıkabilirsin.

**Siyaset:** Her 3 günde bir belediye seçimi yapılıyor. NPC'ler mutluluklarına göre oy veriyor, işvereni oldukları adaydan yana eğilim gösteriyor. Aday olup kampanyaya para basabilirsin. Kazanırsan vergileri ve işsizlik maaşını sen belirlersin. Hazineden "örtülü ödenek" de çekebilirsin ama skandal patlarsa halk öfkelenir.

**Savaş:** Kışla kurup piyade mangası ve tank üretebilirsin. Birlikler yollardan ilerliyor; menzildeki düşman birliklerine ve binalarına kendiliğinden ateş açıyor (mermi izleri ve namlu alevi görünüyor). Füze Rampasından taktik, balistik ya da nükleer füze fırlatabilirsin. Hava Savunma Sistemi gelen füzeyi havada vurmaya çalışır: ıskalarsa ikinci sistem devreye girer. Nükleer fırlatışta herkese alarm gidiyor, sirenler çalıyor ve geri sayım başlıyor. Ardından beyaz flaş, şok dalgası ve mantar bulutu geliyor, bölge 48 saat radyasyonlu kalıyor.

**Çok oyunculu:** Şifreli ya da açık odalar ve 5 harfli davet kodu var. Telefon uykuya girse ya da bağlantı kopsa da aynı karakterle geri dönüyorsun. Mülklerin çevrimdışıyken korunuyor. Servet sıralaması da var.

## 🛠 5. Geliştirme

- Mimari, tick sırası ve ağ protokolü için `docs/ARCHITECTURE.md` dosyasına bak.
- Tüm veri modelleri (ülke, banka, borsa, tech tree, jet dahil) `docs/STATE_SCHEMA.md` dosyasında.
- Denge ayarlarının hepsi `server/config.js` dosyasında.
- Yeni bir eylem eklemek için `server/actions/index.js` dosyasına bir handler, `InspectService` içine bir buton yazman yeterli; istemci kendiliğinden çalışır.

**Sıradaki adım önerileri:** dünyayı diske kaydetmek (sunucu yeniden başlayınca dünya sıfırlanmasın), banka ve kredi, darbe mekaniği (NPC generallere rüşvet), ülke kurma ve sınırlar, tech tree, jetler ve hayalet uçak.
