# Sürümleme Kuralı

Kullanıcıya sunulan her yeni güncellemede yama sürümü bir artırılır.

- `1.3.1` sonrasındaki güncelleme: `1.3.2`
- `1.3.2` sonrasındaki güncelleme: `1.3.3`

Kurulum hazırlanmadan önce `package.json`, `package-lock.json` ve uygulama içindeki yedek sürüm metni aynı sürümde olmalıdır.

## macOS dağıtım akışı

- Yerel kontrol paketi: `npm run build:mac` (ad-hoc imza; yalnızca bu bilgisayardaki kontrol ve kurulum için)
- Müşteriye dağıtılacak imzalı ve noter onaylı paket: `npm run build:mac:release`

Dağıtım komutu, Apple Developer ID imzalama bilgisi ile noter kimlik bilgilerinin ortamda bulunmasını zorunlu tutar. Böylece yanlışlıkla imzasız bir paket “resmî kurulum” olarak yayımlanamaz.

Desteklenen imzalama değişkenleri:

- `CSC_LINK` ve gerekiyorsa `CSC_KEY_PASSWORD`, veya
- `CSC_NAME` (`Developer ID Application` sertifikası)

Desteklenen noter kimlik yöntemleri:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, veya
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, veya
- `APPLE_KEYCHAIN_PROFILE` ve gerekiyorsa `APPLE_KEYCHAIN`
