# AK LAZER ERP

AK LAZER ERP; teklif, iş emri, cari, stok, fatura, kasa/banka, çek-senet, gider, personel ve raporlama işlemlerini tek uygulamada yöneten masaüstü yazılımıdır.

## Format Öncesi Veri Yedekleme

Bilgisayara format atmadan veya yeni bir bilgisayara geçmeden önce işletme verileri mutlaka harici diske ya da bulut depolamaya kopyalanmalıdır. Bilgisayarın kendi diskinde kalan otomatik yedekler format sırasında silinir.

### En kolay yöntem

1. Uygulamada **Yönetim → Ayarlar → Yedekleme** bölümünü açın.
2. **Yedek Dosyası Oluştur** düğmesine basın.
3. Oluşturulan `.json` dosyasını USB disk, harici disk, iCloud Drive veya başka bir güvenli konuma kaydedin.
4. Varsa `AkLazerBelgeler` klasörünü de aynı harici konuma kopyalayın.
5. Yedeğin açılabildiğini ve dosya boyutunun sıfır olmadığını kontrol etmeden bilgisayara format atmayın.

### macOS veri konumları

- Ana veritabanı:

  `~/Library/Application Support/prolazer-erp/ak-lazer-db.json`
- Otomatik yedekler:

  `~/Documents/AkLazerYedek`
- Uygulamaya eklenen PDF ve görseller:

  `~/Documents/AkLazerBelgeler`

Gizli `Library` klasörüne ulaşmak için Finder'da **Git → Klasöre Git** menüsünü açın veya `Command + Shift + G` tuşlarına basın ve yolu yapıştırın.

### Önemli ayrım

- `.json` yedeği; cari, stok, teklif, iş emri, fatura, ödeme ve diğer işletme kayıtlarını taşır.
- PDF ve görsel gibi fiziksel belge dosyaları JSON içine gömülmez. Bu nedenle `AkLazerBelgeler` klasörü ayrıca korunmalıdır.
- Git geçmişi uygulamanın kaynak kodunu korur; işletme kayıtlarını veya belge eklerini içermez.

## Format Sonrası Geri Yükleme

1. AK LAZER ERP'nin güncel kurulumunu yükleyin.
2. Varsa yedeklenen `AkLazerBelgeler` klasörünü tekrar `Belgeler` klasörünün içine koyun.
3. Uygulamada **Yönetim → Ayarlar → Yedekleme** bölümünü açın.
4. **Yedekten Geri Yükle** düğmesine basın.
5. Harici diskteki `.json` yedek dosyasını seçin ve iki aşamalı onayı tamamlayın.
6. Uygulama yeniden açıldığında cari, stok, iş emri, fatura ve kasa toplamlarını kontrol edin.

## Güvenli Yedekleme Kuralı

Önemli işletme verileri için en az iki ayrı kopya bulundurun:

- Bir kopya harici USB/diskte
- Bir kopya farklı bir fiziksel konumda veya güvenilir bulut depolamada

Yalnızca bilgisayarın kendi diskindeki `AkLazerYedek` klasörüne güvenmeyin.

## Geliştirme ve Kontrol

```bash
npm ci
npm test
```

Yerel macOS kontrol paketi:

```bash
npm run build:mac
```

Apple Developer ID ve noter bilgileri bulunan resmî dağıtım ortamı:

```bash
npm run build:mac:release
```

Sürümleme ve dağıtım kuralları için [VERSIONING.md](VERSIONING.md) dosyasına bakın.
