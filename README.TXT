AK LAZER ERP
============

AK LAZER ERP; teklif, iş emri, cari, stok, fatura, kasa/banka,
çek-senet, gider, personel ve raporlama işlemlerini tek uygulamada
yöneten masaüstü yazılımıdır.


FORMAT ÖNCESİ VERİ YEDEKLEME
============================

Bilgisayara format atmadan veya yeni bir bilgisayara geçmeden önce
işletme verileri mutlaka harici diske ya da bulut depolamaya
kopyalanmalıdır. Bilgisayarın kendi diskinde kalan otomatik yedekler
format sırasında silinir.

En kolay yöntem:

1. Uygulamada Yönetim > Ayarlar > Yedekleme bölümünü açın.
2. Yedek Dosyası Oluştur düğmesine basın.
3. Oluşturulan .json dosyasını USB disk, harici disk, iCloud Drive
   veya başka bir güvenli konuma kaydedin.
4. Varsa AkLazerBelgeler klasörünü de aynı harici konuma kopyalayın.
5. Yedeğin açılabildiğini ve dosya boyutunun sıfır olmadığını kontrol
   etmeden bilgisayara format atmayın.


MACOS VERİ KONUMLARI
====================

Ana veritabanı:
~/Library/Application Support/prolazer-erp/ak-lazer-db.json

Otomatik yedekler:
~/Documents/AkLazerYedek

Geri yükleme ve sıfırlama öncesindeki güvenlik yedekleri:
~/Documents/AkLazerYedek/Guvenlik

Uygulamaya eklenen PDF ve görseller:
~/Documents/AkLazerBelgeler

Gizli Library klasörüne ulaşmak için Finder'da Git > Klasöre Git
menüsünü açın veya Command + Shift + G tuşlarına basın ve yolu
yapıştırın.


WINDOWS VERİ KONUMLARI
======================

Ana veritabanı:
%APPDATA%\prolazer-erp\ak-lazer-db.json

Otomatik yedekler:
%USERPROFILE%\Documents\AkLazerYedek

Geri yükleme ve sıfırlama öncesindeki güvenlik yedekleri:
%USERPROFILE%\Documents\AkLazerYedek\Guvenlik

Uygulamaya eklenen PDF ve görseller:
%USERPROFILE%\Documents\AkLazerBelgeler

Bu yolları açmak için Dosya Gezgini adres çubuğuna ilgili yolu
yazın ve Enter tuşuna basın.


ÖNEMLİ AYRIM
=============

- .json yedeği; cari, stok, teklif, iş emri, fatura, ödeme ve diğer
  işletme kayıtlarını taşır.
- PDF ve görsel gibi fiziksel belge dosyaları JSON içine gömülmez.
  Bu nedenle AkLazerBelgeler klasörü ayrıca korunmalıdır.
- Git geçmişi uygulamanın kaynak kodunu korur; işletme kayıtlarını
  veya belge eklerini içermez.
- Son 60 otomatik yedek ve son 20 güvenlik yedeği ayrı ayrı tutulur.
  Manuel olarak kaydedilen yedekler bu temizliğe dahil edilmez.


FORMAT SONRASI GERİ YÜKLEME
===========================

1. AK LAZER ERP'nin güncel kurulumunu yükleyin.
2. Varsa yedeklenen AkLazerBelgeler klasörünü tekrar Belgeler
   klasörünün içine koyun.
3. Uygulamada Yönetim > Ayarlar > Yedekleme bölümünü açın.
4. Yedekten Geri Yükle düğmesine basın.
5. Harici diskteki .json yedek dosyasını seçin ve iki aşamalı onayı
   tamamlayın.
6. Uygulama yeniden açıldığında cari, stok, iş emri, fatura ve kasa
   toplamlarını kontrol edin.


GÜVENLİ YEDEKLEME KURALI
========================

Önemli işletme verileri için en az iki ayrı kopya bulundurun:

- Bir kopya harici USB veya diskte
- Bir kopya farklı bir fiziksel konumda veya güvenilir bulut
  depolamada

Yalnızca bilgisayarın kendi diskindeki AkLazerYedek klasörüne
güvenmeyin.


GELİŞTİRME VE KONTROL
=====================

Bağımlılık kurulumu:
npm ci

Tüm testler:
npm test

Yerel macOS kontrol paketi:
npm run build:mac

Apple Developer ID ve noter bilgileri bulunan resmi dağıtım ortamı:
npm run build:mac:release

Sürümleme ve dağıtım kuralları VERSIONING.md dosyasındadır.


HIZLI SATIŞ (1.5.4)
==================
Ana sayfadaki Hızlı Satış veya Finans > Hızlı Satış bölümünü kullanın.
Açıklama, KDV dahil tutar ve tahsilat hesabı seçin. Müşteri adı isteğe
bağlıdır. Stoktan malzeme düş bölümünde işletmeye ait malzeme seçilebilir.

Satışın tamamı tek seferde tahsil edilir. Veresiye ve kısmi ödeme için
ayrı cari hesabı açın. Satış Özeti, uygulama içi bir çıktıdır.

Geçmişteki Düzelt ve İptal düğmeleri cari, kasa ve stok etkilerini birlikte
geri alır. Eski kayıtlar Tüm geçmiş filtresinde saklanır.


SAC KESİMİ VE KALAN PARÇALAR (1.5.7)
===================================
Stok satırındaki Kesim / Kalan veya iş emrindeki Kesim / Kalan Parça
düğmesini kullanın. Kaynak sacı, kullanılan plaka adedini ve kesime giren
toplam KG bilgisini kontrol edin. Kalan her farklı ölçüyü mm ve adet
olarak ekleyin. Kullanılabilir parça yoksa parça satırlarını kaldırın.

Kalan parçalar ayrı stok koduyla oluşur; sonraki teklif ve iş emirlerinde
ölçüleriyle seçilebilir. Ağırlık alan oranıyla hesaplanır; KG alış fiyatı sabit kalır.
Hurda ağırlığı isteğe bağlıdır ve ayrı kaydedilir. Mevcut eski bağımsız
Fire / Parça kayıtları kendiliğinden stoğa dönüştürülmez.

Bağlı iş emrinde plaka daha önce düşülmüşse adet yeniden düşülmez.
Geri alma Kalan Parça / Hurda > Kesim Geçmişi bölümündedir. Kullanılmış
veya başka işe ayrılmış parçalar varsa önce bu bağlantılar geri alınmalıdır.
Teslim edilmiş işin stok düşümü kesim geri alınırken korunur.

HIZLI SATIŞTA ÖLÇÜYLE KESİM
Stoktan malzeme düş bölümünde malzemeyi seçin. Malzeme kullanımı: Ölçüyle kes. Kullanılan plaka adedini ve her plakadan kesilen dikdörtgenin en/boy ölçülerini mm olarak girin. Düz kenar kesimi için kalanları hesapla düğmesi köşeden kesim önerir. Gerçek kalan ölçülerini kontrol edin; kesim payı otomatik eklenmez. Satış ve kalan parçalar birlikte kaydedilir. Satışı iptal etmek veya düzeltmek için kalan parçalar başka işte kullanılmamış olmalıdır.

OTOMATİK SAC AĞIRLIĞI
En × boy × kalınlık (mm) × adet × yoğunluk (kg/m³) / 1.000.000.000. Karbon çeliği 7850, paslanmaz için yaklaşık 7900, alüminyum için yaklaşık 2700 kullanılır. Alaşıma ve toleranslara göre değişebilir. Kayıtlı pozitif KG varsa ölçü hesabından önce bu değer esas alınır. Yeni malzeme girişinde Ölçülerden KG hesapla ve kullan düğmesi vardır. Hızlı satışta kesime giren, kesilen bölüm ve kalan KG gösterilir; tartılan kalan toplamı ayrıca girilebilir. Birden çok kalan parça varsa tartım toplamı alanlarına göre paylaştırılır. Sıfır KG ile kayıtlı sacın hesaplanan ağırlığı satışla birlikte bir stok hareketi olarak eklenir; iptal sonrası kaynak stoğa döner ve Tahmini etiketi korunur. Kesilen bölüm tahmini delik ve kesim kaybını ayrıca düşmez.
Yoğunluk kaynakları:
https://www.ssab.com/en/support/product-material-data/steel/20-questions
https://otke-cdn.outokumpu.com/-/media/files/sustainability/epd-cold-rolled-stainless-steel.pdf
https://www.hydro.com/globalassets/08-about-hydro/hydro-worldwide/estonia/hydro-standardprofiilid-laost.pdf

KG MALİYET DÜZELTMESİ
Stok alış fiyatı TL/kg olarak tutulur. Kalan parçanın KG fiyatı değişmez. Toplam stok maliyeti kayıtlı KG × KG alış fiyatıdır. Tekliflerde plaka başına malzeme bedeli, plakanın KG değeri × KG fiyatıyla hesaplanır; hammadde satışındaki KG satış fiyatı ayrı kalır. Eski kaynak stoklara girilmiş fiyatlar kullanıcının belirttiği üzere KG fiyatı olarak korunur; eski kalan parçaların fiyatları kaynak stok zincirinden düzeltilir. Önceki fiyatlar geçiş bilgisi içinde saklanır. Kaynağı bulunamayan parçalar kontrol uyarısıyla gösterilir. Kaydedilmiş teklif/fatura/satış tutarları ve kesinleşmiş maliyetler geriye dönük değiştirilmez.

TEDARİKÇİDEN KG İLE SAC LEVHA ALIMI (1.5.12)
Cariler > tedarikçi > İşlem Ekle > Sac Levha Aldık (KG ve Stok Girişi). Sac cinsi, kalınlık, en/boy, plaka adedi, toplam KG ve KDV hariç KG alış fiyatını girin. Tartım varsa toplam KG alanına yazın; yoksa Ölçülerden tahmini KG hesapla düğmesini kullanabilirsiniz. KDV %0 veya %20 seçilir. Ödenmedi, kısmi veya tam ödeme seçeneğiyle stok, tedarikçi borcu ve varsa kasa çıkışı birlikte kaydedilir. Aynı alımı ayrıca stok veya mal alımı olarak tekrar girmeyin. Düzeltme ve geri alma cari işlem geçmişindedir; kullanılan veya işe ayrılmış stok varsa önce bağlı işlemler geri alınmalıdır. Sadece cari borcu daha önce kaydedilmiş alışlarda bu seçeneği tekrar kullanmayın; mevcut borcu koruyup Stoklar > Yeni Malzeme Girişi üzerinden yalnızca fiziksel stok girin.

ÇOK KALEMLİ SAC ALIMI (1.5.13)
Farklı kalınlık / ölçü ekle düğmesiyle aynı alışa farklı sac kalemleri eklenir. Her kalemin cinsi, kalınlığı, en/boyu, adedi, kendi toplam KG değeri, KG fiyatı ve KDV oranı ayrıdır. Tarih, tedarikçi, belge ve ödeme alışın tamamı için ortaktır. Her kalem ayrı stok koduyla oluşur; cari borcu ve varsa kasa çıkışı toplam üzerinden bir kez işlenir. Bir kalem kullanıldıysa alımın tamamını geri almadan önce bağlı kullanım geri alınmalıdır. Önceki tek kalemli alımlar korunur.

BELGEDEKİ / ANLAŞILAN ALIŞ TOPLAMI (1.5.14)
Sac alımında Alış toplamı seçeneğinden Belgedeki / anlaşılan toplamı gir seçilir. Tedarikçiye toplam borç alanına KDV dahil alışın tamamı yazılır; mevcut cari toplam bakiyesi veya yalnızca ödenecek kalan yazılmaz. 47.287, 47.287,00 ve 47287 aynı şekilde 47.287 TL olarak okunur. Borç ve kısmi/tam ödeme bu tutarı esas alır. Kalemlerin hesaplanan tutarları ve aradaki fark ayrı saklanır; KG, plaka adedi, girilen KG fiyatları ve stok maliyetleri kendiliğinden değiştirilmez. Fark otomatik iskonto veya KDV düzeltmesi sayılmaz; belgeye göre kalem fiyatı/KDV değişecekse ilgili alanları ayrıca düzeltin.

DOĞRUDAN TOPLAM TL GİRİŞİ (1.5.15)
Sac alımında Kaydedilecek toplam alış tutarı alanı artık doğrudan düzenlenebilir. Bir veya birden fazla kalem için bu alana 47.287 veya 47287 yazabilirsiniz. Ayrı bir seçenek seçmeniz gerekmez. Yazınca belge toplamı esas alınır; kalemler ve ödeme bilgisi değişse de girdiğiniz toplam korunur. KG hesabındaki tutarı kullan düğmesi hesaplanan toplamı geri getirir. Normal cari tahsilat ve ödeme tutar alanı önceki davranışını korur.

HIZLI SATIŞ MALZEME LİSTESİ (1.5.16)
Adedi ve KG değeri birlikte sıfır olan eski stoklar yeni hızlı satışta listelenmez. Seçeneklerde kalınlık ve ölçüyle birlikte mevcut plaka adedi ve KG açıkça görünür. Son stoğu tüketen eski satışın düzeltmesinde kendi malzemesi seçilebilir; geri alma ve düzeltme korunur.

SABİT STOK KODU (1.5.17)
- Kesilen sacın kalan parçaları ilk stok kodunu korur. Farklı ebatlar aynı kod altında Parça 1, Parça 2 olarak izlenir.
- Kesim yeni STK numarası tüketmez; eski kalan parçalar kaynak stok koduna bağlanır. Adet, KG, maliyet ve cari tutarlar korunur.
- Teklif seçiminde tükenmiş saclar gizlenir; kayıtlı teklifin malzeme bağlantısı korunur.
- Sac alımı düzeltildiğinde mevcut kalemlerin stok kodları korunur. Yeni eklenen kaleme yeni kod verilir.

ANLAŞILIR KAYIT KODLARI (1.5.18)
- Saclar kalınlığa göre ayrı sıra izler: STK-8MM-01, STK-10MM-01, STK-1.5MM-01. Kalan parçalar kaynak kodunu korur.
- Yeni cari kodları CAR-0001; iş emirleri EMR-yıl-0001; hızlı satışlar SAT-yıl-0001; kesimler KES-yıl-0001; hesap hareketleri HRK-yıl-0001 olur.
- Teklif/fatura/çek/senet/ödeme planı numaraları kendi ön eki ve yıl sırasıyla devam eder. Önceki belge numaraları korunur.
- Mevcut stok ve cari kodları güvenlik yedeğinden sonra dönüştürülür. Ayarlar > Kayıt Kodları altında eski/yeni eşleştirmeleri ve sıradaki kodlar görünür.
- Eski kodla stok/cari arama çalışır. Silinen veya düzeltmeyle ayrılan kodlar yeniden verilmez.
- Kalınlık düzeltmesinde oluşacak kod kayıt öncesinde gösterilir. Ölçü/adet/KG/cari bağlantıları kimlikle korunur.

1.5.19 — Hızlı satışta kalan sac koruması
- Ölçüyle kesimde köşeden düz kesim için kalan ölçüler otomatik hesaplanır ve aynı stok kodunun altında saklanır.
- Gerçek ölçüler elle girilebilir. Kısmi kesimde boş kalan listesiyle kayıt engellenir; kalan yoksa ayrıca seçilmelidir.
- Kesilen ölçü, malzeme veya adet değişince otomatik kalanlar yenilenir. Kayıt ve iptal stok, KG ve tahsilatla birlikte kontrol edilir.

1.5.20 — Stok ve işlem bütünlüğü kontrolü
- Ana sacların adetle satış ve iş emri tesliminde KG ağırlığı da orantılı düşer; iptal ve düzeltmeler iki değeri birlikte geri alır.
- Ölçülü sacın KG ile tam plaka satışında adet de güncellenir. Kısmi kullanım ölçüyle kesim üzerinden kaydedilir.
- İş emri rezervasyonları plaka ve KG arasında birlikte korunur; onay beklerken değişen stok yeniden kontrol edilir.
- Hesap Kontrolü artık stok hareket zincirini, plaka/KG bağlantılarını, tahmini ağırlık uyumunu ve eksik kalan parça kayıtlarını da denetler.

1.5.21 — Stok geçmişi ve satış uyarısı
- Elle stok girişi, düzenleme ve silmede KG değişikliği de stok hareketlerine yazılır. KG, iş emirlerine ayrılan miktarın altına düşürülemez.
- Hızlı satışta malzeme bölümü açık gelir; malzeme seçilmezse özet "stok miktarı değişmeyecek" uyarısı gösterir, seçilirse düşülecek miktarı yazar.
- Stok listesinde iş emirlerine ayrılan KG ve kullanılabilir KG görünür. Aynı satışın plaka ve KG hareketleri aynı tarihle kaydedilir.
- Hesap Kontrolü, ilk girişi hareket geçmişinde olmayan eski stokları inceleme olarak listeler.

1.5.22 — Denetim düzeltmeleri
- Fatura silindiğinde, cari borcu faturayla işlenmiş iş emri yeniden "cariye yansıtılmadı" olur; tekrar faturada borç doğru işlenir, iptalde bakiye eksiye düşmez.
- Çek/senet tahsilatı geri alındığında veya silindiğinde orijinal cari hareketi geri alınmış olarak işaretlenir; cari geçmişinden ikinci kez geri alınamaz.
- Belge eklerinin arşiv yolu, kayıt sonrası değişen veri kopyasında da korunur (sac alımı ekleri dahil).
- Yeni tahsilat, ödeme, mal alımı ve fatura kesme işlemlerinde işlem tarihi seçilebilir; ileri tarih engellenir. Düzeltmeler yapıldığı günün kaydı olarak kalır.
- Otomatik yedeklerde son 60 kayda ek olarak son 90 günün her günü ve son 24 ayın her ayı için bir yedek saklanır.
- Stok kartı düzenlenirken bekleyen iş emirlerinin plaka/KG ayrımı yeni değerlerle kontrol edilir.
- Hesap Kontrolü, iş emri cari etkisi ile yansıtma durumu uyuşmayan kayıtları listeler.

1.5.23 — İkinci denetim düzeltmeleri
- Çek/senet, aktif bir kasa/banka hesabı olmadan tahsil edildi/ödendi olarak kapatılamaz; cari ve kasa etkisi yazılamazsa kayıt eski haline döner. Hesap Kontrolü etkisiz kapanmış belgeleri listeler.
- Pasif kasa/banka hesabına yeni hareket veya ters kayıt yazılmaz; gider, maaş, çek, vade, hızlı satış ve cari işlem akışları nedeni açıklayarak durur. Formlar önceki seçimden kalan pasif hesabı göstermez.
- Maaş kaydı o dönemin baz ücretini saklar; bordro ve sonraki düzenlemeler sonradan yapılan zamdan etkilenmez.
- Aynı personel için aynı döneme ikinci maaş kaydı düzenlemeyle de açılamaz.
- İş emrine dönüşmüş teklifin durumu değiştirilemez; reddedilen teklif önce Revize edilmeden iş emrine çevrilemez.
- Hızlı satış ve sac alımında ileri tarih engellenir.
- Excel çıktısındaki tutarlar sayı olarak aktarılır ve toplanabilir.

1.5.24 — Yeni belge tasarımı
- Fiyat teklifi, fatura, iş emri dökümü, cari ekstre, satış özeti, maaş bordrosu ve liste çıktıları yeni ortak tasarıma geçti: belge bilgileri kutusu, kart düzeni, miktar / birim fiyat sütunlu kalem tablosu ve "Yalnız ..." tutar yazısı.
- Ayarlar: firma e-posta, web, vergi dairesi ve vergi no alanları; yeni "Belge Ayarları" sekmesinde banka / IBAN ve teklif varsayılanları (geçerlilik günü, teslim süresi, teslim şekli, ödeme şekli, hazırlayan, ek koşullar).
- Teklif formu: "Teslim ve Ödeme" bölümü; teklif belgesinde son geçerlilik tarihi, koşullar, ödeme bilgileri ve müşteri onay alanı.
- Fatura kalem dökümü fatura anında dondurulur; iş emri dökümü atölye bilgilerini, ekstre mutabakat metnini, bordro T.C. / SGK ve mesai ayrıntısını içerir.
- Telefonu girilmemiş carilerde "-" basılmaz; açıklama boşsa iş başlığı tekrarlanmaz. Tahsil edilmiş satış özetinde IBAN gösterilmez.

1.5.25 — Müşteriye göre malzeme satış fiyatı
- Teklifte işletme stoğundan sac seçilince "Malzeme Satış Fiyatı (₺/KG)" alanı açılır; malzeme bedeli alış maliyeti yerine bu fiyattan hesaplanır.
- Öneri: aynı müşteriye aynı malzeme (cins + kalınlık) için verilen son teklif fiyatı; yoksa alış maliyeti + Ayarlar'daki "Malzeme Kâr Oranı (%)". Firma içi işlerde maliyet önerilir.
- Alanın altında maliyet, kâr oranı ve önerinin kaynağı gösterilir; maliyetin altındaki fiyat uyarı verir. Hammadde satışında KG fiyatı da aynı şekilde önerilir.
- İş emri kârlılığı malzemeyi gerçek alış maliyetinden hesaplamaya devam eder. Yazdırılan teklifte malzeme KG'si ve KG fiyatı görünür.

1.5.26 — Malzemeyi KG ile fiyatlandırma
- Teklifte "Kullanılacak Plaka (Stoktan)" yalnızca stok ayırır; malzeme bedeli "Satılan Malzeme (KG)" × "Malzeme Satış Fiyatı (₺/KG)" ile hesaplanır.
- KG alanı seçilen plakaların tam ağırlığıyla dolu gelir; parça ağırlığı yazıldığında o kullanılır ve plaka adedi değişse de korunur. Malzeme değişince tam ağırlığa döner.
- Bilgi satırı KG × fiyat hesabını ve plaka ağırlığını gösterir; yazdırılan teklifte malzeme satırı KG ve KG fiyatıyla basılır. Eski teklifler aynı tutarla yüklenir.
