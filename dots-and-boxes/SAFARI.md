# iPhone Safari’de oyna

Uygulama ekstra kurulum gerektirmez — Safari’de açılan web oyunudur.

**İnternet şart değil.** Oyun ve yapay zeka cihazda çalışır; bilgisayardaki yerel sunucuya aynı Wi‑Fi ile bağlanman yeterli (dış ağ / mobil veri gerekmez).

## Aynı Wi‑Fi (en kolay)

1. Bilgisayarda:
   ```bash
   cd dots-and-boxes
   npm install
   npm start
   ```
2. Terminalde çıkan **LAN** adresini kopyala (örn. `http://192.168.1.42:3857`).
3. iPhone’da **Safari** → adres çubuğuna yapıştır → Git.
4. (İsteğe bağlı) **Paylaş → Ana Ekrana Ekle** — tam ekran uygulama gibi açılır.

> Not: iPhone ile bilgisayar **aynı Wi‑Fi**’de olmalı. Misafir ağı / AP izolasyonu LAN’ı kesebilir.

## Ana Ekrana Ekle (önerilir)

Safari → **Paylaş (□↑)** → **Ana Ekrana Ekle** → Ekle.

Sonra ana ekrandaki ikondan aç; üstteki Safari çubuğu gizlenir.

## Sorun giderme

| Sorun | Çözüm |
|-------|--------|
| Sayfa açılmıyor | Aynı Wi‑Fi? Adres `http://` ile mi? Firewall port 3857’yi engelliyor mu? |
| Çizgiye dokununca olmuyor | Tahtayı biraz yaklaştır / kenarın ortasına dokun; güncel sürüm dokunmayı geniş tutar |
| Yazılar küçük / zoom | Ana Ekrana Ekle ile açmayı dene |
| Fontlar yüklenmiyor | İnternet kesikse sistem fontuna düşer; oyun yine çalışır |
