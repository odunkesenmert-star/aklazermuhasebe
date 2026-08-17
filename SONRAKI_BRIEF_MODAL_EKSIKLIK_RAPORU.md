# AK LAZER ERP — Açılır Pencere Eksiklik Raporu

Sürüm incelemesi: **v1.3.30**
Kapsam: Kayıt ekleme, düzenleme, detay ve onay pencereleri

Bu dosya, v1.3.30'da uygulanan ortak pencere görünümünden ayrı olarak sonraki briefte ele alınması gereken işlevsel geliştirmeleri listeler.

## Öncelik 1 — Veri doğruluğu ve günlük kullanım

### Gider kaydı

- Kullanıcı işlem tarihi seçemiyor; kayıt her zaman bilgisayarın o anki tarihiyle oluşuyor.
- Kategori boş bırakılabiliyor. Kategori zorunlu olmalı veya açıkça “Diğer”e yönlendirilmelidir.
- Mevcut gider kaydı düzenlenemiyor; yalnızca silinebiliyor.
- Fiş/fatura numarası, belge eki ve tedarikçi/cari bağlantısı bulunmuyor.
- KDV dahil/hariç tutar ve KDV oranı ayrı izlenemiyor.

Önerilen kabul ölçütü: Geçmiş tarihli gider girilebilmeli; kategori, tutar ve kasa alanları satır altında doğrulanmalı; gider düzenleme ve belge eki desteklenmelidir.

### Stok ekleme ve düzenleme tutarlılığı

- Yeni malzemede sahip, ağırlık, en ve boy alanları bulunurken düzenleme penceresinde aynı alanların tamamı yok.
- Düzenleme ekranı ölçüyü tek bir “ebat” metnine çeviriyor; yeni kayıt ekranı en ve boyu ayrı tutuyor.
- Müşteri malzemesinin sahibi sonradan güvenli biçimde değiştirilemiyor.

Önerilen kabul ölçütü: Ekleme ve düzenleme pencereleri aynı veri modelini kullanmalı; ağırlık, sahiplik ve ölçüler veri kaybı olmadan güncellenmelidir.

### Fatura kaydı

- Fatura tarihi, vade tarihi ve ödeme durumu ayrı alanlar olarak tutulmuyor.
- Matrah, KDV oranı, KDV tutarı ve genel toplam ayrıştırılmıyor.
- Seri/sıra veya tedarikçi vergi bilgisi için alan bulunmuyor.

Önerilen kabul ölçütü: Faturanın belge tarihi, vadesi, vergi kırılımı ve ödeme durumu raporlanabilir alanlar olmalıdır.

### Cari kartı

- Cari kart yalnızca firma adı ve telefon içeriyor.
- Cari türü, yetkili kişi, e-posta, adres, vergi dairesi/numarası, varsayılan vade ve IBAN alanları eksik.

Önerilen kabul ölçütü: Tek seferlik hızlı kayıt korunmalı; ayrıntılı alanlar “Ek bilgiler” altında isteğe bağlı açılmalıdır.

## Öncelik 2 — Operasyon bağlantıları

### Fire / parça kaydı

- Miktar, ağırlık, kayıt nedeni ve bağlı iş emri seçilemiyor.
- Fire, kullanılabilir parça ve hurda ayrımı açık bir durum alanıyla tutulmuyor.
- Fotoğraf veya ölçü krokisi eki bulunmuyor.

### Çek / senet

- Keşideci, lehtar, seri numarası, hesap/IBAN, ciro durumu ve teslim alan bilgileri ayrı alanlar değil.
- Durum değişikliklerinde tarihçe görünümü ve belge bazlı işlem izi kullanıcıya sunulmuyor.

### Personel ve puantaj

- Personel kartında bölüm, işe giriş/çıkış nedeni, SGK/kimlik bilgileri ve ücret geçerlilik tarihi yok.
- Puantajda çalışma günü üst sınırı ve dönem bazlı çakışma kontrolü kullanıcıya alan seviyesinde gösterilmiyor.

## Öncelik 3 — Bütün pencerelerde ortak kullanım güvenliği

- Alan hataları hâlâ çoğunlukla toast ile bildiriliyor; hata ilgili alanın altında gösterilmeli ve ilk hatalı alana odaklanılmalıdır.
- Kaydetme sırasında düğme kilidi/yükleniyor durumu bulunmuyor; hızlı çift tıklama mükerrer kayıt riski oluşturabilir.
- Değişiklik yapılmış pencere kapatılırken kaydedilmemiş veri uyarısı yok.
- Dosya yükleme alanlarında boyut sınırı, seçilen dosya özeti, önizleme ve kaldırma işlemi görünür değil.
- Para alanlarında yazarken binlik ayırıcı ve Türkçe para biçimi gösterilmiyor.
- Uzun formlar gerçek `form`/`submit` akışı kullanmadığı için Enter ile gönderim ve tarayıcı doğrulaması tutarlı değil.

## Sonraki brief için önerilen sıra

1. Gider tarihi, düzenleme, belge eki ve kategori doğrulaması
2. Stok ekleme/düzenleme alanlarının eşitlenmesi
3. Fatura tarih–vade–KDV veri modeli
4. Alan altı doğrulama ve mükerrer gönderim kilidi
5. Cari kartın açılır “Ek bilgiler” bölümü
6. Fire ve çek/senet bağlantı alanları
