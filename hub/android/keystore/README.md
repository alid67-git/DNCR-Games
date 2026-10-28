# Hub APK imza

`dncr-hub.jks` — sideload hub APK’leri için sabit sertifika.

Amaç: her derlemede aynı imza → telefonda **üzerine güncelleme** çalışır.
(Android debug.keystore makineye özel olduğu için eski sürümlerde paket çakışması oluşuyordu.)

Bu anahtar yalnızca GitHub Releases sideload dağıtımı içindir; Play Store için ayrı production keystore kullanın.
