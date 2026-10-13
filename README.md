# ⚡ TRAC STUDIOS — Bilişim Bölümü Oyun Portalı

Okulda bilişim derslerinde, boş derslerde ve teneffüslerde canımız sıkıldığında arkadaşlarımızla oynamak için hazırlanmış web tabanlı oyun portalı.

---

## 🎮 Oyun Listesi (Toplam 8 Oyun)

### 🌐 Çok Oyunculu (Online) Oyunlar:
1. **⛏️ Voxelcraft 3D Online (Minecraft Tarzı)**:
   - Tarayıcıda çalışan tek dosyalık 3D Minecraft deneyimi.
   - **WebRTC (PeerJS) P2P Oda Sistemi**: Arkadaşınızla aynı dünyada buluşun, blok kırın/koyun, eşzamanlı hareket edin.
   - **3D Karakterler & İsimlikler**: Diğer oyuncuları 3D modelleri ve başlarının üzerindeki isimliklerle görürsünüz.
   - **Oyun İçi Sohbet (Chat)**: `T` veya `Enter` tuşuna basarak sınıftaki arkadaşlarınızla mesajlaşın!
   - **Oda Linki Paylaşımı**: Tek tıkla oda linkini kopyalayıp arkadaşınıza atabilirsiniz.

2. **⚔️ Suroi.io 2D Battle Royale**:
   - Surviv.io tarzı efsane 2D Battle Royale.
   - Takım (Party) koduyla arkadaşlarınızla aynı takıma girin veya solo oynayın!
   - Canlı küresel sunucularda ganimet toplayın, savaşın ve hayatta kalan son kişi olun.

3. **🎯 FPS2 3D Online Shooter (1v1 & Solo Bot)**:
   - Tarayıcıda çalışan efsane 3D First-Person Shooter!
   - **WebRTC P2P 1v1**: Arkadaşınla oda koduyla bağlanıp 1v1 kapışabilirsin.
   - **Solo vs Bot AI**: Yanında arkadaşın yoksa akıllı yapay zeka botlarına karşı tek başına oynayabilirsin.
   - Saldırı tüfeği, Desert Eagle, Sniper tüfeği, bomba ve araç kullanma!
   - Oyun içi sohbet (`T` / `Enter`) ve oda linki paylaşımı.

4. **🔫 Counter-Strike 3D Online (CS2 Deneyimi & Poligon)**:
   - Three.js motoruyla geliştirilmiş efsane 3D FPS CS deneyimi!
   - **WebRTC P2P Çok Oyunculu**: Arkadaşınla oda kodu oluşturup 1v1 veya takım maçı atabilirsin.
   - **Antrenman / Poligon Modu**: Sunucusuz doğrudan haritaya girip AK-47, AWP, USP ile hedef botları vurabilirsin.
   - **1-Tık LAN Sunucu Desteği**: Okul laboratuvarında `start_cs_server.bat` dosyasına çift tıklayarak kendi bilgisayarını dedicated sunucu yapabilirsin!

### 🕹️ Tek Oyunculu Oyunlar:
5. **🌌 Neon Neon Dodge & Survival RPG**: Geniş neon evreninde refleks testi, düşmanlardan kaçış ve RPG geliştirmeleri.
6. **🏎️ Otoban Hız Yarışı**: Mehmet Aras Ayna yapımı tek kişilik araba oyunu. Trafikte makas atın ve hız rekorları kırın!
7. **🚀 Cyber Flap**: Neon siber roketi engellerin arasından geçirdiğiniz bağımlılık yapan arcade oyunu.
8. **🧱 Cyber Brick Breaker**: Retro neon tuğla kırma ve kombo oyunu.

---

## 🏫 Bilişim Sınıfı Özel Özellikleri:
- **🤫 Öğretmen Geldi Modu (Panic Button)**: Klavyede `H` tuşuna bastığınızda veya sağ üstteki butona tıkladığınızda ekran anında sahte bir Visual Studio Code / Python ödev ekranına dönüşür! Geri dönmek için tekrar `H` veya `Esc` tuşuna basmanız yeterlidir.
- **🚀 Hızlı Oda Katılımı**: Ana sayfadaki arama kutusuna arkadaşınızın verdiği oda kodunu yazarak (Voxelcraft, FPS2 veya CS) tek tıkla odaya bağlanabilirsiniz.
- **📱 Responsive & Tiyatro Modu**: Oyunları hem site içerisinde tiyatro modunda oynayabilir, hem de tam ekran yeni sekmede açabilirsiniz.

---

## 🚀 Vercel'e Nasıl Yüklenir?

Bu proje **%100 statik (sunucusuz)** olarak tasarlanmıştır. Herhangi bir backend veya veritabanı kurulumu gerektirmez.

### Yöntem 1: GitHub & Vercel Dashboard (En Kolay)
1. Bu klasörü bir GitHub deposuna yükleyin (Push edin).
2. [vercel.com](https://vercel.com) adresine gidin.
3. **"Add New Project"** butonuna tıklayın ve GitHub deponuzu seçin.
4. Framework Preset olarak **Other** seçin ve **Deploy** butonuna basın!
5. Birkaç saniye içinde siteniz `https://projeniz.vercel.app` adresinde yayında olacaktır!

### Yöntem 2: Vercel CLI ile
```bash
npm install -g vercel
vercel
```

---

## 💻 Yerel Olarak Çalıştırma (Localhost)
Klasör içindeki `index.html` dosyasını doğrudan tarayıcıda çift tıklayarak açabilir veya bir yerel sunucu başlatabilirsiniz:

```bash
# Python ile:
python -m http.server 3000

# veya Node.js ile:
npx serve .
```
Ardından tarayıcınızdan `http://localhost:3000` adresine gidin.
