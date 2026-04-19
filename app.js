window.onerror = function(msg, url, line, col, error) {
   const errDiv = document.createElement('div');
   errDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:9999;padding:20px;font-size:16px;box-shadow: 0 4px 6px rgba(0,0,0,0.3);';
   errDiv.innerHTML = `<strong>Kritik Hata:</strong> ${msg} <br><small>Satır: ${line}</small><br><button onclick="this.parentElement.remove()" style="margin-top:10px;padding:5px 10px;color:black;">Kapat</button>`;
   document.body.appendChild(errDiv);
};

// --- Database & Local Storage Logic ---
const DB_KEY = 'ProLazerDB';

const defaultDB = {
    cariler: [
        { id: 1, kodu: 'C-001', adi: 'ABC Makine Sanayi', tel: '0532 111 2233', bakiye: -45200, durum: 'Borçlu' },
        { id: 2, kodu: 'C-002', adi: 'Çelik Otomotiv', tel: '0555 999 8877', bakiye: 0, durum: 'Temiz' }
    ],
    stoklar: [
        { id: 1, kodu: 'STK-01', cinsi: '2mm DKP Sac', miktar: 45, maliyet: 500 },
        { id: 2, kodu: 'STK-02', cinsi: '5mm Paslanmaz', miktar: 2, maliyet: 1200 }
    ],
    islemler: [
        { id: 1, tarih: '19.04.2026', firma: 'ABC Makine Sanayi', tip: 'Tahsilat', tutar: 15000, isSuccess: true },
        { id: 2, tarih: '18.04.2026', firma: 'Çelik Otomotiv', tip: 'Fatura Kesildi', tutar: 8450, isSuccess: false }
    ],
    teklifler: [],
    giderler: [],
    ayarlar: { firmaAdi: 'Lazer Fason Kesim', telefon: '', adres: '' }
};

let db;
try {
    db = JSON.parse(localStorage.getItem(DB_KEY));
    if (!db || typeof db !== 'object' || !db.cariler || !db.stoklar || !db.islemler || !db.teklifler) {
        db = defaultDB;
        saveDB();
    }
    if (!db.ayarlar) {
        db.ayarlar = defaultDB.ayarlar;
        saveDB();
    }
    if (!db.giderler) {
        db.giderler = [];
        saveDB();
    }
} catch (e) {
    db = defaultDB;
    saveDB();
}

function saveDB() {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch(e) {
        console.error('Storage error', e);
    }
    renderAll();
}

const formatCurrency = (num) => {
    return `₺${(num || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
};

window.openModal = function(id) {
    const el = document.getElementById(id);
    if(el) el.classList.add('active');
}

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
}

window.saveCari = function() {
    try {
        const adi = document.getElementById('input-cari-adi').value;
        const tel = document.getElementById('input-cari-tel').value;
        if (!adi) return alert("Firma adı zorunludur!");

        db.cariler.push({
            id: Date.now(),
            kodu: `C-00${db.cariler.length + 1}`,
            adi: adi,
            tel: tel || '-',
            bakiye: 0,
            durum: 'Temiz'
        });
        saveDB();
        closeModal('modal-cari');
        
        document.getElementById('input-cari-adi').value = '';
        document.getElementById('input-cari-tel').value = '';
    } catch(e) {
        alert("Cari kaydedilirken hata oluştu: " + e.message);
    }
}

window.saveStok = function() {
    try {
        const cinsi = document.getElementById('input-stok-cinsi').value;
        const miktar = parseInt(document.getElementById('input-stok-miktar').value);
        const maliyet = parseFloat(document.getElementById('input-stok-maliyet').value);

        if (!cinsi || isNaN(miktar) || isNaN(maliyet)) return alert("Lütfen tüm alanları doldurun!");

        db.stoklar.push({
            id: Date.now(),
            kodu: `STK-0${db.stoklar.length + 1}`,
            cinsi: cinsi,
            miktar: miktar,
            maliyet: maliyet
        });
        saveDB();
        closeModal('modal-stok');

        document.getElementById('input-stok-cinsi').value = '';
        document.getElementById('input-stok-miktar').value = '';
        document.getElementById('input-stok-maliyet').value = '';
    } catch(e) {
        alert("Stok kaydedilirken hata oluştu: " + e.message);
    }
}

window.openAyarlarModal = function() {
    document.getElementById('input-ayar-firma').value = db.ayarlar.firmaAdi || '';
    document.getElementById('input-ayar-tel').value = db.ayarlar.telefon || '';
    document.getElementById('input-ayar-adres').value = db.ayarlar.adres || '';
    openModal('modal-ayarlar');
}

window.saveAyarlar = function() {
    const firmaAdi = document.getElementById('input-ayar-firma').value || 'Firma Adı';
    const tel = document.getElementById('input-ayar-tel').value || '';
    const adres = document.getElementById('input-ayar-adres').value || '';

    db.ayarlar = { firmaAdi, telefon: tel, adres };
    saveDB();
    closeModal('modal-ayarlar');
}

window.openIslemModal = function(id, adi) {
    document.getElementById('input-islem-cari-id').value = id;
    document.getElementById('input-islem-firma-adi').value = adi;
    document.getElementById('modal-islem-title').textContent = adi + " - İşlem Ekle";
    document.getElementById('input-islem-tutar').value = '';
    openModal('modal-islem');
}

window.saveIslem = function() {
    try {
        const cariId = parseInt(document.getElementById('input-islem-cari-id').value);
        const firmaAdi = document.getElementById('input-islem-firma-adi').value;
        const tip = document.getElementById('input-islem-tipi').value;
        const tutar = parseFloat(document.getElementById('input-islem-tutar').value);

        if (isNaN(tutar) || tutar <= 0) return alert("Geçerli bir tutar girin!");

        const cari = db.cariler.find(c => c.id === cariId);
        if(!cari) return alert("Cari bulunamadı!");

        let isSuccess = false;
        let tipText = '';
        let bakiyeArtisi = 0;
        let isGelir = false;

        if (tip === 'tahsilat') {
            tipText = 'Tahsilat (Gelen)';
            bakiyeArtisi = tutar; 
            isSuccess = true;
            isGelir = true;
        } else if (tip === 'fatura_kes') {
            tipText = 'Fatura Kestik';
            bakiyeArtisi = -tutar; 
            isSuccess = false;
            isGelir = true;
        } else if (tip === 'mal_alimi') {
            tipText = 'Mal Alımı';
            bakiyeArtisi = tutar; 
            isSuccess = false;
            isGelir = false;
        } else if (tip === 'odeme_yaptik') {
            tipText = 'Ödeme Yaptık (Çıkan)';
            bakiyeArtisi = -tutar; 
            isSuccess = true;
            isGelir = false;
        }

        cari.bakiye += bakiyeArtisi;
        
        if (cari.bakiye < 0) cari.durum = 'Borçlu';
        else if (cari.bakiye > 0) cari.durum = 'Alacaklı';
        else cari.durum = 'Temiz';

        db.islemler.push({
            id: Date.now(),
            tarih: new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' }),
            firma: firmaAdi,
            tip: tipText,
            tutar: tutar,
            isSuccess: isSuccess,
            isGelir: isGelir
        });

        saveDB();
        closeModal('modal-islem');
    } catch(e) {
        alert("İşlem kaydedilirken hata oluştu: " + e.message);
    }
}

window.openDetayModal = function(id) {
    const cari = db.cariler.find(c => c.id === id);
    if (!cari) return;

    document.getElementById('detay-title').textContent = cari.adi + " - Hesap Ekstresi";
    
    let bakiyeClass = cari.bakiye < 0 ? 'text-alert' : 'text-success';
    document.getElementById('detay-bakiye').className = bakiyeClass;
    document.getElementById('detay-bakiye').textContent = formatCurrency(cari.bakiye);

    const tbody = document.getElementById('detay-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const cariIslemleri = (db.islemler || []).filter(i => i.firma === cari.adi).reverse();
    if (cariIslemleri.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Henüz işlem bulunmuyor.</td></tr>';
    } else {
        cariIslemleri.forEach(islem => {
            let tipClass = islem.isSuccess ? 'success' : 'warning';
            tbody.innerHTML += `<tr>
                <td>${islem.tarih}</td>
                <td><span class="badge ${tipClass}">${islem.tip}</span></td>
                <td>${formatCurrency(islem.tutar)}</td>
            </tr>`;
        });
    }

    openModal('modal-cari-detay');
}

window.openCariDuzenleModal = function(id) {
    const cari = db.cariler.find(c => c.id === id);
    if (!cari) return;
    document.getElementById('input-duzenle-id').value = cari.id;
    document.getElementById('input-duzenle-adi').value = cari.adi;
    document.getElementById('input-duzenle-tel').value = cari.tel;
    openModal('modal-cari-duzenle');
}

window.updateCari = function() {
    try {
        const id = parseInt(document.getElementById('input-duzenle-id').value);
        const adi = document.getElementById('input-duzenle-adi').value;
        const tel = document.getElementById('input-duzenle-tel').value;

        if (!adi) return alert("Firma adı boş olamaz!");

        const cari = db.cariler.find(c => c.id === id);
        if (!cari) return alert("Cari bulunamadı!");

        const oldName = cari.adi;
        (db.islemler || []).forEach(islem => {
            if (islem.firma === oldName) {
                islem.firma = adi;
            }
        });

        cari.adi = adi;
        cari.tel = tel || '-';
        
        saveDB();
        closeModal('modal-cari-duzenle');
    } catch(e) {
        alert("Güncelleme sırasında hata oluştu: " + e.message);
    }
}

function renderCariler() {
    const tbody = document.querySelector('#view-accounts tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    db.cariler.forEach(cari => {
        if (cari.bakiye < 0) cari.durum = 'Borçlu';
        else if (cari.bakiye > 0) cari.durum = 'Alacaklı';
        else cari.durum = 'Temiz';

        let durumClass = 'success';
        if (cari.bakiye < 0) durumClass = 'warning';
        else if (cari.bakiye > 0) durumClass = 'info';

        let bakiyeClass = cari.bakiye < 0 ? 'text-alert' : (cari.bakiye > 0 ? 'text-info' : 'text-success');
        tbody.innerHTML += `<tr>
            <td>${cari.kodu}</td><td>${cari.adi}</td><td>${cari.tel}</td>
            <td class="${bakiyeClass}">${formatCurrency(cari.bakiye)}</td>
            <td><span class="badge ${durumClass}">${cari.durum}</span></td>
            <td>
                <button class="btn btn-outline" style="padding:4px 8px; font-size:12px; margin-right:4px;" title="Düzenle" onclick="openCariDuzenleModal(${cari.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-outline" style="padding:4px 8px; font-size:12px; margin-right:4px;" title="Detay" onclick="openDetayModal(${cari.id})"><i class="fa-solid fa-file-lines"></i></button>
                <button class="btn btn-primary" style="padding:4px 8px; font-size:12px;" title="İşlem Ekle" onclick="openIslemModal(${cari.id}, '${cari.adi}')"><i class="fa-solid fa-plus"></i> İşlem</button>
            </td>
        </tr>`;
    });

    const selectCustomer = document.getElementById('quote-customer');
    if (selectCustomer) {
        selectCustomer.innerHTML = '<option value="">Seçiniz...</option>';
        db.cariler.forEach(cari => {
            selectCustomer.innerHTML += `<option value="${cari.id}">${cari.adi}</option>`;
        });
    }
}

function renderStoklar() {
    const tbody = document.querySelector('#view-inventory tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    db.stoklar.forEach(stok => {
        let durum = stok.miktar < 5 ? '<span class="badge error">Kritik</span>' : '<span class="badge success">Yeterli</span>';
        tbody.innerHTML += `<tr>
            <td>${stok.kodu}</td><td>${stok.cinsi}</td><td>${stok.miktar} Plaka</td>
            <td>${formatCurrency(stok.maliyet)}</td><td>${durum}</td>
        </tr>`;
    });

    const selectMaterial = document.getElementById('quote-material');
    if (selectMaterial) {
        selectMaterial.innerHTML = '<option value="0">Malzeme Müşteriden (Sıfır Maliyet)</option>';
        db.stoklar.forEach(stok => {
            selectMaterial.innerHTML += `<option value="${stok.maliyet}">${stok.cinsi} - ${formatCurrency(stok.maliyet)}/plaka</option>`;
        });
    }
}

let isStatsVisible = false;

function renderDashboard() {
    try {
        const toplamGelir = (db.islemler || []).filter(i => {
            if (i.isGelir !== undefined) return i.isGelir;
            return i.isSuccess || i.tip === 'Fatura Kesildi';
        }).reduce((acc, curr) => acc + curr.tutar, 0) + 110400;
        const bekleyenAlacak = Math.abs((db.cariler || []).reduce((acc, curr) => acc + (curr.bakiye < 0 ? curr.bakiye : 0), 0));

        const stats = document.querySelectorAll('.stat-value');
        if (stats && stats.length >= 3) {
            stats[0].textContent = isStatsVisible ? formatCurrency(toplamGelir) : '***';
            stats[1].textContent = isStatsVisible ? formatCurrency(bekleyenAlacak) : '***';
            stats[2].textContent = isStatsVisible ? ((db.teklifler || []).length + 24) : '***';
        }

        const tbody = document.querySelector('#view-dashboard tbody');
        if (tbody) {
            tbody.innerHTML = '';
            (db.islemler || []).slice(-5).reverse().forEach(islem => {
                let tipClass = islem.isSuccess ? 'success' : 'warning';
                tbody.innerHTML += `<tr>
                    <td>${islem.tarih}</td><td>${islem.firma}</td>
                    <td><span class="badge ${tipClass}">${islem.tip}</span></td>
                    <td>${formatCurrency(islem.tutar)}</td>
                </tr>`;
            });
        }
    } catch (e) {
        console.error("Dashboard render error:", e);
    }
}

function renderHeader() {
    const firmaSpan = document.getElementById('header-firma-adi');
    const avatarImg = document.getElementById('header-avatar');
    if (firmaSpan && db.ayarlar) {
        firmaSpan.textContent = db.ayarlar.firmaAdi;
    }
    if (avatarImg && db.ayarlar) {
        const ad = encodeURIComponent(db.ayarlar.firmaAdi);
        avatarImg.src = `https://ui-avatars.com/api/?name=${ad}&background=E63946&color=fff`;
    }
}

function renderExpenses() {
    const tbody = document.getElementById('expenses-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const giderler = db.giderler || [];
    if (giderler.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Henüz gider kaydı yok.</td></tr>';
    } else {
        [...giderler].reverse().forEach(g => {
            const katBadge = getCategoryBadge(g.kategori);
            tbody.innerHTML += `<tr>
                <td>${g.tarih}</td>
                <td>${katBadge}</td>
                <td>${g.aciklama || '-'}</td>
                <td class="text-alert">${formatCurrency(g.tutar)}</td>
                <td><button class="btn btn-outline" style="padding:4px 8px;font-size:12px;" onclick="deleteGider(${g.id})"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        });
    }

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const ayGider = giderler.filter(g => {
        const parts = g.tarih.split('.');
        if (parts.length < 3) return false;
        const d = new Date(parts[2], parts[1] - 1, parts[0]);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).reduce((acc, g) => acc + g.tutar, 0);

    const personelGider = giderler.filter(g => g.kategori === 'Personel').reduce((acc, g) => acc + g.tutar, 0);
    const toplamGider = giderler.reduce((acc, g) => acc + g.tutar, 0);

    const statMonth = document.getElementById('expense-stat-month');
    const statPersonel = document.getElementById('expense-stat-personel');
    const statTotal = document.getElementById('expense-stat-total');
    if (statMonth) statMonth.textContent = formatCurrency(ayGider);
    if (statPersonel) statPersonel.textContent = formatCurrency(personelGider);
    if (statTotal) statTotal.textContent = formatCurrency(toplamGider);
}

function getCategoryBadge(kategori) {
    const icons = {
        'Personel': 'fa-user',
        'Elektrik': 'fa-bolt',
        'Su': 'fa-droplet',
        'Doğalgaz': 'fa-fire',
        'Kira': 'fa-building',
        'Muhasebe': 'fa-calculator',
        'Yakıt': 'fa-gas-pump',
        'Bakım': 'fa-wrench',
        'Vergi': 'fa-file-invoice',
        'Diğer': 'fa-tag'
    };
    const icon = icons[kategori] || 'fa-tag';
    return `<span class="badge warning"><i class="fa-solid ${icon}"></i> ${kategori}</span>`;
}

window.saveGider = function() {
    try {
        const kategori = document.getElementById('input-gider-kategori').value;
        const aciklama = document.getElementById('input-gider-aciklama').value;
        const tutar = parseFloat(document.getElementById('input-gider-tutar').value);

        if (isNaN(tutar) || tutar <= 0) return alert('Geçerli bir tutar girin!');

        db.giderler.push({
            id: Date.now(),
            tarih: new Date().toLocaleDateString('tr-TR'),
            kategori,
            aciklama,
            tutar
        });
        saveDB();
        closeModal('modal-gider');
        document.getElementById('input-gider-aciklama').value = '';
        document.getElementById('input-gider-tutar').value = '';
    } catch(e) {
        alert('Gider kaydedilirken hata oluştu: ' + e.message);
    }
}

window.deleteGider = function(id) {
    if (!confirm('Bu gider kaydı silinsin mi?')) return;
    db.giderler = db.giderler.filter(g => g.id !== id);
    saveDB();
}

function renderAll() {
    if (document.readyState === 'loading') {
        // Document not fully loaded, skip DOM updates until DOMContentLoaded
        return;
    }
    renderHeader();
    renderCariler();
    renderStoklar();
    renderDashboard();
    renderExpenses();
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const cariBtn = document.querySelector('#view-accounts .btn-primary');
        if(cariBtn) cariBtn.onclick = () => openModal('modal-cari');

        const stokBtn = document.querySelector('#view-inventory .btn-primary');
        if(stokBtn) stokBtn.onclick = () => openModal('modal-stok');

        const expenseBtn = document.getElementById('btn-add-expense');
        if(expenseBtn) expenseBtn.addEventListener('click', () => openModal('modal-gider'));

        const btnToggleStats = document.getElementById('btn-toggle-stats');
        if(btnToggleStats) {
            btnToggleStats.addEventListener('click', () => {
                isStatsVisible = !isStatsVisible;
                btnToggleStats.innerHTML = isStatsVisible 
                    ? '<i class="fa-solid fa-eye"></i> Gizle' 
                    : '<i class="fa-solid fa-eye-slash"></i> Göster';
                renderDashboard();
            });
        }

        const navItems = document.querySelectorAll('.nav-item');
        const views = document.querySelectorAll('.view');
        const pageTitle = document.getElementById('page-title');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                if (pageTitle) {
                    const span = item.querySelector('span');
                    if (span) pageTitle.textContent = span.textContent;
                }
                const target = item.getAttribute('data-target');
                views.forEach(view => {
                    view.classList.remove('active');
                    if (view.id === `view-${target}`) view.classList.add('active');
                });
            });
        });

        const btnCalculate = document.getElementById('btn-calculate');
        if(btnCalculate) {
            btnCalculate.addEventListener('click', () => {
                const inputMinutes = document.getElementById('quote-minutes');
                const inputRate = document.getElementById('quote-rate');
                const selectMaterial = document.getElementById('quote-material');
                const inputMaterialQty = document.getElementById('quote-material-qty');

                const minutes = parseFloat(inputMinutes ? inputMinutes.value : 0) || 0;
                const rate = parseFloat(inputRate ? inputRate.value : 0) || 0;
                const materialCostPerUnit = parseFloat(selectMaterial ? selectMaterial.value : 0) || 0;
                const materialQty = parseFloat(inputMaterialQty ? inputMaterialQty.value : 1) || 1;

                const cutCost = minutes * rate;
                const totalMaterialCost = materialCostPerUnit * materialQty;
                const subTotal = cutCost + totalMaterialCost;
                const tax = subTotal * 0.20;
                const grandTotal = subTotal + tax;

                document.getElementById('summary-cut').textContent = formatCurrency(cutCost);
                document.getElementById('summary-mat').textContent = formatCurrency(totalMaterialCost);
                document.getElementById('summary-sub').textContent = formatCurrency(subTotal);
                document.getElementById('summary-tax').textContent = formatCurrency(tax);
                document.getElementById('summary-total').textContent = formatCurrency(grandTotal);

                const totalEl = document.getElementById('summary-total');
                if (totalEl) {
                    totalEl.style.transform = 'scale(1.1)';
                    setTimeout(() => totalEl.style.transform = 'scale(1)', 200);
                }
            });
        }

        renderAll();
    } catch (e) {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:9999;padding:20px;';
        errDiv.textContent = `Initialization Error: ${e.message}`;
        document.body.appendChild(errDiv);
    }
});
