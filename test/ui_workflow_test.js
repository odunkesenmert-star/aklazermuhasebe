const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const bulkIconActions = [...html.matchAll(/<button[^>]*class="[^"]*\bbulk-icon-action\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
assert.strictEqual(bulkIconActions.length, 20, 'Tüm on listede Excel ve yazdır ikon düğmeleri bulunmalı');
bulkIconActions.forEach(([button, content]) => {
    assert(button.includes('aria-label=') && button.includes('title='), 'İkon düğmelerinde erişilebilir açıklama eksik');
    assert(/^<i\b[^>]*><\/i>$/.test(content.trim()), 'Toplu liste düğmesinde görünür metin kalmamalı');
});

['Operasyon', 'Finans', 'Raporlar', 'Yönetim'].forEach(group => {
    assert(html.includes(`>${group}</span>`), `${group} menü grubu eksik`);
});

assert(html.includes('class="nav-item nav-item-home active"'), 'Sabit gösterge paneli bağlantısı eksik');
assert(html.includes('class="nav-section-toggle" aria-expanded="false"'), 'Açılıp kapanan menü başlığı eksik');
assert(html.includes('id="nav-group-badge-operations"'), 'Kapalı Operasyon uyarı rozeti eksik');
assert(html.includes('id="nav-badge-orders"'), 'Bekleyen iş rozeti eksik');
assert(html.includes('id="nav-badge-stock"'), 'Kritik stok rozeti eksik');
assert(html.includes('id="toast-region"'), 'Toast bildirim bölgesi eksik');
assert(html.includes('id="modal-confirm"'), 'Özel onay penceresi eksik');
assert(html.includes('id="history-linked-records"'), 'İş emri bağlı kayıt alanı eksik');
assert(html.includes('id="input-islem-payment-order-id"'), 'İş emri tahsilat bağlantısı eksik');
assert(html.includes('secondary-data-panel is-collapsed'), 'İkincil hareket panellerinin kapalı başlangıç durumu eksik');
assert(html.includes('secondary-panel-toggle'), 'İkincil hareket paneli açma düğmesi eksik');
assert(html.includes('accounts-toolbar workspace-toolbar'), 'Cari çalışma alanı gruplaması eksik');
assert(html.includes('workspace-primary-actions'), 'Birincil işlem grubu eksik');
assert(html.includes('workspace-list-row'), 'Liste araçları satırı eksik');
assert(html.includes('accounts-data-table'), 'Cari liste bilgi hiyerarşisi sınıfı eksik');
assert(html.includes('class="dashboard-command-bar"'), 'Gösterge paneli hızlı işlem alanı eksik');
assert(html.includes('class="stats-grid dashboard-kpi-grid"'), 'Dört sütunlu gösterge kartları eksik');
assert(html.includes('id="dashboard-status-chip"'), 'Gösterge paneli dinamik durum özeti eksik');
assert(html.includes('dashboard-kpi-income') && html.includes('dashboard-kpi-orders'), 'Anlamsal gösterge kartı yüzeyleri eksik');
assert(html.includes('Müşterilerden Toplam Alacağımız') && html.includes("openStatModal('alacak')"), 'Toplam alacak gösterge kartı eksik');
assert(html.includes('Firmalara Toplam Borcumuz') && html.includes("openStatModal('borc')"), 'Toplam borç gösterge kartı eksik');
assert(!html.includes('id="cari-total-alacak"') && !html.includes('id="cari-total-borc"'), 'Cari sayfasındaki eski toplam kartları kaldırılmalı');
assert(html.includes('id="stat-detail-summary"') && html.includes('id="stat-detail-search"'), 'Cari bakiye dağılım araçları eksik');
assert(html.includes('id="dashboard-alert-clear"'), 'Gösterge paneli temiz uyarı durumu eksik');
assert(html.includes('class="dashboard-health-chips"'), 'Sağlıklı durum rozetleri eksik');
assert(html.includes('id="dashboard-chart-a11y"'), 'Grafik ekran okuyucu özeti eksik');
assert(html.includes('role="tablist"') && html.includes('id="dashboard-tab-finance"'), 'Gösterge paneli hareket sekmeleri eksik');
assert(html.includes('<option value="cnc_plazma">CNC Plazma</option>'), 'CNC Plazma işlem tipi eksik');
assert(html.includes('id="quote-pricing-helper"'), 'Kilogram fiyatlandırma açıklaması eksik');
assert(html.includes('data-target="audit"') && html.includes('id="view-audit"'), 'Denetim geçmişi yönetim ekranı eksik');
assert(html.includes('id="audit-search"') && html.includes('id="audit-entity-filter"') && html.includes('id="audit-action-filter"'), 'Denetim arama ve filtreleri eksik');
assert(html.includes('data-report-date-panel="audit"') && html.includes('id="audit-tbody"'), 'Denetim tarih aralığı ve tablosu eksik');
assert(html.includes('id="settings-tab-update"') && html.includes('id="settings-panel-update"'), 'Sürüm kontrolü ayar ekranı eksik');

assert(app.includes('function showImpactSummary'), 'İşlem etki özeti altyapısı eksik');
assert(app.includes("{ label: 'Cari'"), 'Cari etki özeti eksik');
assert(app.includes("{ label: 'Kasa'"), 'Kasa etki özeti eksik');
assert(app.includes("{ label: 'Stok'"), 'Stok etki özeti eksik');
assert(app.includes('window.undoManualCashMovement') && app.includes('reverseCashMovement(movement.id'), 'Manuel kasa hareketi ters kayıt akışı eksik');
assert(app.includes('window.toggleKasaHesapStatus') && app.includes('window.deleteKasaHesap'), 'Kasa/banka düzenleme, pasife alma ve güvenli silme akışı eksik');
assert(app.includes('window.undoPaymentPlanSettlement') && app.includes("openPaymentPlanModal('', '${plan.id}')"), 'Vade planı düzenleme ve ödeme geri alma akışı eksik');
assert(app.includes("openFireModal('${f.id}')") && app.includes("existing ? 'Güncellendi' : 'Oluşturuldu'"), 'Fire/parça düzenleme akışı eksik');
assert(app.includes("openCekSenetModal('${record.id}')") && html.includes('id="input-ceksenet-id"'), 'Bekleyen çek/senet düzenleme akışı eksik');
assert(app.includes('function renderOrderLinkedRecords'), 'Bağlı kayıt düğmeleri eksik');
assert(app.includes('window.toggleNavGroup'), 'Sol menü akordeon davranışı eksik');
assert(app.includes('function openNavGroupForTarget'), 'Aktif menü grubunu açma davranışı eksik');
assert(app.includes('function enhanceFilterPanels'), 'Kompakt filtre paneli davranışı eksik');
assert(app.includes('function enhanceQuoteSections'), 'Teklif adımlarını açıp kapatma davranışı eksik');
assert(app.includes('const INNER_PAGE_LAYOUTS'), 'İç sayfa tasarım sistemi eksik');
assert(app.includes('function enhanceContentPageLayouts'), 'İç sayfa düzen dönüştürücüsü eksik');
assert(app.includes('function enhanceTableHeaderScopes'), 'Dinamik tablo başlığı erişilebilirliği eksik');
assert(app.includes('function enhanceModalLayout'), 'Ortak pencere düzeni eksik');
assert(app.includes('const MODAL_PRESENTATION'), 'Pencere başlık ve renk tasarım sistemi eksik');
assert(app.includes('function getModalFocusables'), 'Pencere klavye odak yönetimi eksik');
assert(!app.includes('.brand-header::before'), 'Yazdırılan belge logosunun üstünde dekoratif çizgi kalmamalı');
assert(app.includes("event.key !== 'Tab'"), 'Pencere odak döngüsü eksik');
assert(app.includes('function renderTableEmptyState'), 'Ortak tablo boş durum bileşeni eksik');
assert(app.includes('account-identity-button') && app.includes('account-balance-cell'), 'Cari kimlik ve bakiye satır düzeni eksik');
assert(app.includes('account-row-actions') && app.includes('account-action-delete'), 'Cari işlem düğmesi hiyerarşisi eksik');
assert(app.includes('LIST_PAGE_SIZE_OPTIONS') && app.includes('formatListPagination'), 'Yüksek kayıt hacmi sayfalama altyapısı eksik');
assert(app.includes('LIST_SORT_TABLES') && app.includes('enhanceSortableTableHeaders'), 'Sıralanabilir yoğun liste başlıkları eksik');
assert(app.includes('enhanceSortableTableHeaders();') && app.includes('aria-sort'), 'Sayfa geçişi sonrası sıralama erişilebilirliği eksik');
assert(app.includes('createHighVolumeSearch') && app.includes('stock-movements'), 'Yoğun liste arama ve hareket kapsamı eksik');
assert(app.includes("panel.classList.add('data-panel')"), 'Kompakt veri paneli sınıflandırması eksik');
assert(app.includes("classList.add('workspace-panel-toolbar')"), 'Panel araç çubuğu sınıflandırması eksik');
assert(app.includes("shell.className = 'table-scroll-shell'"), 'Erişilebilir tablo kaydırma kabuğu eksik');
assert(app.includes("th.setAttribute('scope', 'col')"), 'Tablo başlık kapsamı eksik');
assert(app.includes('window.toggleSecondaryPanel'), 'İkincil veri paneli davranışı eksik');
assert(app.includes('window.setDashboardActivityTab'), 'Gösterge paneli sekme davranışı eksik');
assert(app.includes("type === 'borc'") && app.includes('window.openAccountFromStat'), 'Borç dağılımı ve cari detay bağlantısı eksik');
assert(app.includes('window.filterStatDetails'), 'Finansal dağılım araması eksik');
assert(app.includes('window.handleDashboardActivityKey'), 'Gösterge paneli klavye sekme davranışı eksik');
assert(app.includes('cnc_plazma: Object.freeze') && app.includes("pricing: 'kg'"), 'CNC Plazma kilogram fiyatlandırma tanımı eksik');
assert(app.includes('window.renderAuditTrail') && app.includes('getFilteredAuditRecordsForReport'), 'Denetim geçmişi filtreleme ve render akışı eksik');
assert(app.includes("addAuditLog('Oluşturuldu', 'Cari'") && app.includes("addAuditLog('Güncellendi', 'Stok'"), 'Temel cari ve stok denetim kayıtları eksik');
assert(app.includes('window.checkForUpdates') && app.includes('scheduleAutomaticUpdateCheck'), 'Güvenli sürüm kontrolü akışı eksik');
assert(app.includes('id="btn-print-preview-whatsapp"') && app.includes('sharePrintPreviewOnWhatsApp'), 'Yazdırma önizlemesinde WhatsApp paylaşım düğmesi eksik');
assert(app.includes('quoteCari?.tel') && app.includes('customerCari?.tel'), 'Müşteri belgeleri WhatsApp telefonu bağlamını taşımıyor');
assert(app.includes('isKgPricedOperation(islemTipi)'), 'CNC Plazma teklif hesaplama yolu eksik');
assert(app.includes("privacyState.hidden = isStatsVisible"), 'Gösterge paneli finansal gizlilik kapsamı eksik');
assert(app.includes("type: 'line'"), 'Gelir gider eğilim grafiği çizgi grafiği olmalı');
assert(app.includes("matchMedia?.('(prefers-reduced-motion: reduce)')"), 'Grafik azaltılmış hareket tercihini izlemeli');
assert(app.includes("borderDash: [7, 5]"), 'Grafik serileri yalnız renkle ayırt edilmemeli');
assert(app.includes("type: 'quote'") && app.includes("type: 'payment'"), 'İş emri kayıt zinciri eksik');
assert(!/(^|[^A-Za-z0-9_])confirm\s*\(/m.test(app), 'Yerel confirm kullanımı kaldı');

assert(css.includes('.table-action-button'), 'Büyütülmüş tablo düğmesi stili eksik');
assert(css.includes('.account-action-secondary-group'), 'Cari düzenle ve sil ayırıcı grubu eksik');
assert(css.includes('.high-volume-list-toolbar'), '200+ kayıt için yoğun liste araç çubuğu eksik');
assert(css.includes('.list-page-size-control'), 'Sayfa kayıt kapasitesi seçimi stili eksik');
assert(css.includes('.btn.bulk-icon-action') && css.includes('width: 44px'), 'Kompakt toplu işlem düğmesi stili eksik');
assert(css.includes('.btn-danger'), 'Silme düğmesi stili eksik');
assert(css.includes('.order-linked-card'), 'Bağlı kayıt kartı stili eksik');
assert(css.includes('.filter-panel.is-collapsed'), 'Kompakt filtre paneli stili eksik');
assert(css.includes('.quote-form-section.is-collapsed'), 'Teklif adımı daraltma stili eksik');
assert(css.includes('.quote-pricing-helper'), 'Kilogram fiyatlandırma yardımcı metni stili eksik');
assert(css.includes('.audit-data-table') && css.includes('.audit-action-badge'), 'Denetim geçmişi yoğun tablo stili eksik');
assert(css.includes('.update-status-card') && css.includes('.update-actions'), 'Sürüm kontrolü durum stili eksik');
assert(css.includes('.btn-whatsapp') && css.includes('min-height: 44px'), 'WhatsApp paylaşım düğmesinin erişilebilir stili eksik');
assert(css.includes('.dashboard-insight-grid'), 'Gösterge paneli karar alanı stili eksik');
assert(css.includes('.dashboard-status-chip.has-alerts'), 'Dinamik öncelik durumu stili eksik');
assert(css.includes('.dashboard-health-chips'), 'Sağlıklı durum rozet stili eksik');
assert(css.includes('.stat-detail-summary') && css.includes('.stat-detail-table-shell'), 'Finansal dağılım penceresi stili eksik');
assert(css.includes('.dashboard-activity-tab.active'), 'Gösterge paneli etkin sekme stili eksik');
assert(css.includes('.content-page-intro'), 'Ortak iç sayfa başlığı stili eksik');
assert(css.includes('.content-surface'), 'Ortak iç sayfa yüzeyi eksik');
assert(css.includes('.workspace-primary-actions'), 'Birincil işlem hiyerarşisi stili eksik');
assert(css.includes('.workspace-list-row'), 'Liste araçları düzeni eksik');
assert(css.includes('.table-empty-content'), 'Kompakt tablo boş durum stili eksik');
assert(css.includes('.content-surface.data-panel'), 'Kompakt veri paneli stili eksik');
assert(css.includes('.table-scroll-shell:focus-visible'), 'Klavye erişimli tablo kabuğu stili eksik');
assert(css.includes('.pagination-bar'), 'Ortak sayfalama stili eksik');
assert(css.includes('.table-sort-button'), 'Sıralanabilir tablo başlığı stili eksik');
assert(html.includes('class="settings-tabs"') && html.includes('id="settings-panel-backup"'), 'Sekmeli geniş ayarlar çalışma alanı eksik');
assert(css.includes('.settings-modal') && css.includes('.settings-layout'), 'Ayarlar çalışma alanı stili eksik');
assert(css.includes('.modal-content.modal-shell'), 'Ortak pencere kabuğu stili eksik');
assert(css.includes('.modal-heading-icon') && css.includes('.modal-subtitle'), 'Pencere başlık hiyerarşisi stili eksik');
assert(css.includes('.modal-body') && css.includes('.modal-actions'), 'Sabit başlık, kaydırılan içerik ve işlem alanı ayrımı eksik');
assert(css.includes('#modal-gider .modal-body'), 'Kompakt gider formu düzeni eksik');
assert(html.includes('Gideri Kaydet') && html.includes('modal-impact-note'), 'Gider penceresi işlem özeti ve açık eylem metni eksik');
assert(!html.includes('📤') && !html.includes('📥') && !html.includes('🛒') && !html.includes('💸'), 'Form seçeneklerinde yapısal emoji kullanılmamalı');
['input-gider-tarih', 'input-gider-belge-no', 'input-gider-kdv-tipi', 'input-gider-cari',
    'input-duzenle-stok-sahibi', 'input-duzenle-stok-kg', 'input-duzenle-stok-en', 'input-duzenle-stok-boy',
    'input-fatura-tarih', 'input-fatura-vade', 'input-fatura-matrah', 'input-fatura-kdv-tutari', 'input-fatura-odeme-durumu',
    'input-fire-tur', 'input-fire-miktar', 'input-fire-kg', 'input-fire-is-emri', 'input-fire-ek',
    'input-ceksenet-kesideci', 'input-ceksenet-lehtar', 'input-ceksenet-seri', 'input-ceksenet-iban', 'input-ceksenet-ciro',
    'input-personel-bolum', 'input-personel-tc', 'input-personel-sgk', 'input-personel-ucret-tarih'
].forEach(id => assert(html.includes(`id="${id}"`), `${id} alanı eksik`));
assert(html.includes('class="modal-disclosure"'), 'İsteğe bağlı ayrıntılar için açılır form bölümü eksik');
assert(app.includes('function validateModalFields') && app.includes('function setFieldError'), 'Alan içi doğrulama altyapısı eksik');
assert(app.includes('function beginModalSubmit') && app.includes("button.dataset.submitting = 'true'"), 'Mükerrer kayıt kilidi eksik');
assert(app.includes('function requestCloseModal') && app.includes('isModalFormDirty'), 'Kaydedilmemiş değişiklik uyarısı eksik');
assert(app.includes('MAX_ATTACHMENT_SIZE') && app.includes('renderFileInputSummary'), 'Dosya sınırı ve seçilen dosya özeti eksik');
assert(app.includes("form.className = 'modal-form-element'"), 'Gerçek form ve Enter gönderim akışı eksik');
assert(css.includes('.field-error') && css.includes('.file-input-summary') && css.includes('.currency-input-preview'), 'Form güvenliği görsel stilleri eksik');
assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Azaltılmış hareket desteği eksik');
assert(css.includes('body {') && css.includes('user-select: none') && css.includes('[contenteditable="true"]'), 'Arayüz metin seçimi sınırı ve form alanı istisnası eksik');

console.log('UI workflow checks passed.');
