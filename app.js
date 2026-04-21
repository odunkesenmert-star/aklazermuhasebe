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
    faturalar: [],
    isEmirleri: [],
    fireler: [],
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
    if (!db.isEmirleri) {
        db.isEmirleri = [];
        saveDB();
    }
    if (!db.fireler) {
        db.fireler = [];
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
    // Only render what is visible or common
    renderAll();
}

// Global data guard
function getDBArray(key) {
    if (!db || !db[key]) return [];
    return Array.isArray(db[key]) ? db[key] : [];
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
        renderCariler();
        updateQuoteMaterials();
        
        document.getElementById('input-cari-adi').value = '';
        document.getElementById('input-cari-tel').value = '';
    } catch(e) {
        alert("Cari kaydedilirken hata oluştu: " + e.message);
    }
}

window.editCari = function(id) {
    const cari = db.cariler.find(c => c.id == id);
    if (!cari) return;
    
    document.getElementById('input-duzenle-id').value = cari.id;
    document.getElementById('input-duzenle-adi').value = cari.adi;
    document.getElementById('input-duzenle-tel').value = cari.tel;
    document.getElementById('input-duzenle-pasif').checked = !!cari.isPasif;
    
    openModal('modal-cari-duzenle');
}

window.updateCari = function() {
    try {
        const id = document.getElementById('input-duzenle-id').value;
        const adi = document.getElementById('input-duzenle-adi').value;
        const tel = document.getElementById('input-duzenle-tel').value;
        const isPasif = document.getElementById('input-duzenle-pasif').checked;
        
        if (!adi) return alert("Firma adı zorunludur!");
        
        const cari = db.cariler.find(c => c.id == id);
        if (cari) {
            if (isPasif && cari.bakiye !== 0) {
                return alert("Dikkat: Bu müşterinin aktif bir bakiyesi (borcu/alacağı) var! Hesap sıfırlanmadan pasife alamazsınız.");
            }

            const oldName = cari.adi;
            if (oldName !== adi) {
                (db.islemler || []).forEach(islem => {
                    if (islem.firma === oldName) {
                        islem.firma = adi;
                    }
                });
            }

            cari.adi = adi;
            cari.tel = tel;
            cari.isPasif = isPasif;
            saveDB();
            closeModal('modal-cari-duzenle');
            renderCariler();
            updateQuoteMaterials();
        }
    } catch(e) {
        alert("Cari güncellenirken hata oluştu: " + e.message);
    }
}

window.deleteCari = function(id) {
    if (!confirm("Bu müşteriyi silmek istediğinize emin misiniz?")) return;
    db.cariler = db.cariler.filter(c => c.id != id);
    saveDB();
    renderCariler();
    updateQuoteMaterials();
}

window.toggleStokCariSelect = function() {
    const sahibi = document.getElementById('input-stok-sahibi').value;
    const container = document.getElementById('stok-cari-container');
    const maliyetContainer = document.getElementById('stok-maliyet-container');
    
    if (sahibi === 'musteri') {
        container.style.display = 'block';
        maliyetContainer.style.display = 'none';
        document.getElementById('input-stok-maliyet').value = 0;
    } else {
        container.style.display = 'none';
        maliyetContainer.style.display = 'block';
    }
};

window.saveStok = function() {
    try {
        const sahibi = document.getElementById('input-stok-sahibi').value;
        const cariId = document.getElementById('input-stok-cari').value;
        const cinsi = document.getElementById('input-stok-cinsi').value;
        const mm = document.getElementById('input-stok-mm').value;
        const miktar = parseInt(document.getElementById('input-stok-miktar').value) || 0;
        const kg = parseFloat(document.getElementById('input-stok-kg').value);
        const en = document.getElementById('input-stok-en').value;
        const boy = document.getElementById('input-stok-boy').value;
        const maliyet = parseFloat(document.getElementById('input-stok-maliyet').value) || 0;

        if (!cinsi || isNaN(kg)) return alert("Lütfen Cinsi ve Ağırlık (KG) alanlarını doldurun!");
        if (sahibi === 'musteri' && !cariId) return alert("Lütfen bir müşteri seçin!");

        let sahibiText = "Biz";
        if (sahibi === 'musteri') {
            const cari = db.cariler.find(c => c.id == cariId);
            sahibiText = cari ? cari.adi : "Müşteri";
        }

        db.stoklar.push({
            id: Date.now(),
            kodu: `STK-${Date.now().toString().slice(-4)}`,
            cinsi: cinsi,
            mm: mm,
            ebat: `${en}x${boy}`,
            miktar: miktar,
            kg: kg,
            maliyet: maliyet,
            sahibi: sahibiText,
            sahibiTipi: sahibi,
            cariId: cariId,
            tarih: new Date().toLocaleDateString('tr-TR')
        });
        
        saveDB();
        closeModal('modal-stok');
        renderStoklar();
        
        // Reset form
        document.getElementById('input-stok-cinsi').value = '';
        document.getElementById('input-stok-mm').value = '';
        document.getElementById('input-stok-miktar').value = '';
        document.getElementById('input-stok-kg').value = '';
        document.getElementById('input-stok-en').value = '';
        document.getElementById('input-stok-boy').value = '';
        document.getElementById('input-stok-maliyet').value = '0';
    } catch(e) {
        alert("Stok kaydedilirken hata oluştu: " + e.message);
    }
}

window.openStokDuzenleModal = function(id) {
    const stok = db.stoklar.find(s => s.id === id);
    if (!stok) return;

    document.getElementById('input-duzenle-stok-id').value = stok.id;
    document.getElementById('input-duzenle-stok-cinsi').value = stok.cinsi;
    document.getElementById('input-duzenle-stok-mm').value = stok.mm || '';
    document.getElementById('input-duzenle-stok-miktar').value = stok.miktar;
    document.getElementById('input-duzenle-stok-ebat').value = stok.ebat || '';
    document.getElementById('input-duzenle-stok-maliyet').value = stok.maliyet || 0;

    const maliyetContainer = document.getElementById('duzenle-stok-maliyet-container');
    if (maliyetContainer) {
        maliyetContainer.style.display = stok.sahibiTipi === 'musteri' ? 'none' : 'block';
    }

    openModal('modal-stok-duzenle');
};

window.updateStok = function() {
    try {
        const id = parseInt(document.getElementById('input-duzenle-stok-id').value);
        const cinsi = document.getElementById('input-duzenle-stok-cinsi').value;
        const mm = document.getElementById('input-duzenle-stok-mm').value;
        const miktar = parseFloat(document.getElementById('input-duzenle-stok-miktar').value) || 0;
        const ebat = document.getElementById('input-duzenle-stok-ebat').value;
        const maliyet = parseFloat(document.getElementById('input-duzenle-stok-maliyet').value) || 0;

        const stok = db.stoklar.find(s => s.id === id);
        if (!stok) return;

        stok.cinsi = cinsi;
        stok.mm = mm;
        stok.miktar = miktar;
        stok.ebat = ebat;
        if (stok.sahibiTipi !== 'musteri') {
            stok.maliyet = maliyet;
        }

        saveDB();
        closeModal('modal-stok-duzenle');
        renderStoklar();
    } catch(e) {
        alert("Stok güncellenirken hata oluştu: " + e.message);
    }
};

window.deleteStok = function(id) {
    if (!confirm('Bu malzeme kaydı silinsin mi?')) return;
    db.stoklar = db.stoklar.filter(s => s.id !== id);
    saveDB();
    renderStoklar();
}

window.toggleFireCariSelect = function() {
    const sahibi = document.getElementById('input-fire-sahibi').value;
    const container = document.getElementById('fire-cari-container');
    container.style.display = sahibi === 'musteri' ? 'block' : 'none';
};

window.saveFire = function() {
    try {
        const sahibi = document.getElementById('input-fire-sahibi').value;
        const cariId = document.getElementById('input-fire-cari').value;
        const cinsi = document.getElementById('input-fire-cinsi').value;
        const mm = document.getElementById('input-fire-mm').value;
        const en = document.getElementById('input-fire-en').value;
        const boy = document.getElementById('input-fire-boy').value;

        if (!cinsi || !mm || !en || !boy) return alert("Lütfen tüm alanları doldurun!");
        if (sahibi === 'musteri' && !cariId) return alert("Lütfen müşteri seçin!");

        let sahibiText = "Biz";
        if (sahibi === 'musteri') {
            const cari = db.cariler.find(c => c.id == cariId);
            sahibiText = cari ? cari.adi : "Müşteri";
        }

        db.fireler.push({
            id: Date.now(),
            cinsi, mm, en, boy,
            sahibi: sahibiText,
            sahibiTipi: sahibi,
            cariId: cariId,
            tarih: new Date().toLocaleDateString('tr-TR')
        });

        saveDB();
        closeModal('modal-fire');
        renderFireler();
        
        // Reset
        document.getElementById('input-fire-cinsi').value = '';
        document.getElementById('input-fire-mm').value = '';
        document.getElementById('input-fire-en').value = '';
        document.getElementById('input-fire-boy').value = '';
    } catch(e) {
        alert("Fire kaydedilirken hata oluştu: " + e.message);
    }
}

window.deleteFire = function(id) {
    if (!confirm('Bu fire kaydı silinsin mi?')) return;
    db.fireler = db.fireler.filter(f => f.id !== id);
    saveDB();
    renderFireler();
}

function renderFireler() {
    try {
        const tbody = document.getElementById('scraps-tbody');
        if (!tbody) return;

        const fireler = getDBArray('fireler');
        tbody.innerHTML = fireler.length ? [...fireler].reverse().map(f => `
            <tr>
                <td>${f.cinsi || '-'}</td>
                <td>${f.mm || '-'} mm</td>
                <td>${f.en || '-'}x${f.boy || '-'}</td>
                <td><span class="badge ${f.sahibiTipi === 'musteri' ? 'info' : 'success'}">${f.sahibi || 'Biz'}</span></td>
                <td>${f.tarih || '-'}</td>
                <td>
                    <button class="btn btn-outline" style="padding:4px 8px; font-size:12px;" onclick="deleteFire(${f.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Kayıt bulunamadı.</td></tr>';
    } catch(e) {
        console.error("renderFireler error:", e);
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
        const aciklama = document.getElementById('input-islem-aciklama')?.value || '';
        const faturaNo = document.getElementById('input-islem-fatura-no')?.value || '';
        const tutar = parseFloat(document.getElementById('input-islem-tutar').value);

        if (isNaN(tutar) || tutar <= 0) return alert("Geçerli bir tutar girin!");
        if (tip === 'fatura_kes' && !faturaNo.trim()) return alert("Fatura kesmek için Fatura No girmek zorunludur!");

        const cari = db.cariler.find(c => c.id === cariId);
        if(!cari) return alert("Cari bulunamadı!");

        let isSuccess = false;
        let tipText = '';
        let bakiyeArtisi = 0;
        let isGelir = false;

        if (tip === 'tahsilat') {
            tipText = 'Tahsilat (Gelen)';
            bakiyeArtisi = -tutar;
            isSuccess = true;
            isGelir = true;
        } else if (tip === 'fatura_kes') {
            tipText = `Fatura Kesildi (${faturaNo})`;
            bakiyeArtisi = 0; // Fatura sadece evrak kaydı, borç zaten teslimatta eklendi
            isSuccess = false;
            isGelir = false;
        } else if (tip === 'mal_alimi') {
            tipText = 'Mal Alımı';
            bakiyeArtisi = -tutar;
            isSuccess = false;
            isGelir = false;
        } else if (tip === 'odeme_yaptik') {
            tipText = 'Ödeme Yaptık (Çıkan)';
            bakiyeArtisi = tutar;
            isSuccess = true;
            isGelir = false;
        }

        cari.bakiye += bakiyeArtisi;
        
        if (cari.bakiye > 0) cari.durum = 'Müşteri Borçlu';
        else if (cari.bakiye < 0) cari.durum = 'Müşteri Alacaklı';
        else cari.durum = 'Temiz';

        db.islemler.push({
            id: Date.now(),
            tarih: new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' }),
            firma: firmaAdi,
            tip: tipText,
            aciklama: aciklama,
            faturaNo: faturaNo,
            tutar: tutar,
            isSuccess: isSuccess,
            isGelir: isGelir
        });

        saveDB();
        closeModal('modal-islem');
        const aciklamaEl = document.getElementById('input-islem-aciklama');
        if (aciklamaEl) aciklamaEl.value = '';
        const faturaNoEl = document.getElementById('input-islem-fatura-no');
        if (faturaNoEl) faturaNoEl.value = '';
        document.getElementById('input-islem-tutar').value = '';
    } catch(e) {
        alert("İşlem kaydedilirken hata oluştu: " + e.message);
    }
}

window.switchDetayTab = function(tab) {
    document.getElementById('detay-tab-ekstre-content').style.display = tab === 'ekstre' ? 'block' : 'none';
    document.getElementById('detay-tab-stok-content').style.display = tab === 'stok' ? 'block' : 'none';
    document.getElementById('btn-tab-ekstre').classList.toggle('active', tab === 'ekstre');
    document.getElementById('btn-tab-stok').classList.toggle('active', tab === 'stok');
};

window.openDetayModal = function(id) {
    const cari = db.cariler.find(c => c.id === id);
    if (!cari) return;

    document.getElementById('detay-title').textContent = `${cari.adi} - Cari Detay`;
    document.getElementById('detay-bakiye').textContent = formatCurrency(cari.bakiye);
    
    // Status Badge
    const badgeContainer = document.getElementById('detay-badge-container');
    let durumClass = 'success';
    if (cari.bakiye < 0) durumClass = 'warning';
    else if (cari.bakiye > 0) durumClass = 'info';
    badgeContainer.innerHTML = `<span class="badge ${durumClass}" style="padding:8px 16px; font-size:14px;">${cari.durum}</span>`;

    // Transactions
    const tbody = document.getElementById('detay-tbody');
    tbody.innerHTML = '';
    const islemler = db.islemler.filter(i => i.firma === cari.adi);
    islemler.reverse().forEach(islem => {
        // Tahsilat = yeşil (ödeme geldi), Fatura = sarı (borç oluştu), Mal alımı = kırmızı, Ödeme yaptık = mavi
        let colorClass = 'text-alert';
        if (islem.isSuccess && islem.isGelir) colorClass = 'text-success'; // Tahsilat
        else if (!islem.isSuccess && !islem.isGelir && islem.tip.includes('Fatura')) colorClass = 'text-warning'; // Fatura
        else if (islem.isSuccess && !islem.isGelir) colorClass = 'text-info'; // Ödeme yaptık
        
        const islemSign = islem.tip.includes('Tahsilat') ? '-' : 
                          (islem.tip.includes('Fatura') ? '+' : 
                          (islem.tip.includes('Mal') ? '-' : '+'));
        
        tbody.innerHTML += `<tr>
            <td>${islem.tarih}</td>
            <td><strong>${islem.tip}</strong>${islem.aciklama ? `<br><span style="font-size:11px; color:var(--text-muted);">${islem.aciklama}</span>` : ''}</td>
            <td class="${colorClass}" style="text-align:right; font-weight:600;">${islemSign}${formatCurrency(islem.tutar)}</td>
        </tr>`;
    });

    // Consignment Stocks
    const stokTbody = document.getElementById('detay-stok-tbody');
    stokTbody.innerHTML = '';
    const carininStoklari = db.stoklar.filter(s => s.cariId == id);
    if (carininStoklari.length === 0) {
        stokTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Bu müşteriye ait emanet malzeme bulunmuyor.</td></tr>';
    } else {
        carininStoklari.forEach(s => {
            stokTbody.innerHTML += `<tr>
                <td>${s.kodu}</td>
                <td>${s.cinsi}</td>
                <td>${s.mm} mm</td>
                <td><strong>${s.miktar} Plaka</strong></td>
            </tr>`;
        });
    }

    switchDetayTab('ekstre');
    openModal('modal-cari-detay');
}

window.openStatModal = function(type) {
    const title = document.getElementById('stat-detail-title');
    const thead = document.getElementById('stat-detail-thead');
    const tbody = document.getElementById('stat-detail-tbody');
    if (!title || !thead || !tbody) return;

    if (type === 'gelir') {
        title.textContent = 'Toplam Gelir Detayları';
        thead.innerHTML = '<tr><th>Tarih</th><th>Firma</th><th>İşlem</th><th>Tutar</th></tr>';
        const gelirler = (db.islemler || []).filter(i => i.isGelir).reverse();
        tbody.innerHTML = gelirler.map(i => `
            <tr><td>${i.tarih}</td><td>${i.firma}</td><td>${i.tip}</td><td class="text-info">${formatCurrency(i.tutar)}</td></tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Gelir kaydı bulunamadı.</td></tr>';
    } else if (type === 'alacak') {
        title.textContent = 'Bekleyen Alacaklar Listesi';
        thead.innerHTML = '<tr><th>Müşteri Adı</th><th>Telefon</th><th>Borç Tutarı</th></tr>';
        const borclular = (db.cariler || []).filter(c => c.bakiye < 0);
        tbody.innerHTML = borclular.map(c => `
            <tr><td>${c.adi}</td><td>${c.tel}</td><td class="text-alert">${formatCurrency(Math.abs(c.bakiye))}</td></tr>
        `).join('') || '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Bekleyen alacak bulunmuyor.</td></tr>';
    } else if (type === 'teklif') {
        title.textContent = 'Onaylanan ve Bekleyen İşler';
        thead.innerHTML = '<tr><th>Müşteri</th><th>İş Tanımı</th><th>Tutar</th><th>Durum</th></tr>';
        const aktifIsler = (db.isEmirleri || []).filter(o => o.durum !== 'Teslim Edildi').reverse();
        tbody.innerHTML = aktifIsler.map(o => `
            <tr><td>${o.customerName}</td><td>${o.description || '-'}</td><td>${formatCurrency(o.total)}</td><td><span class="badge warning">${o.durum}</span></td></tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Aktif iş bulunmuyor.</td></tr>';
    } else if (type === 'teslimat_hepsi') {
        title.textContent = 'Tüm Teslim Edilen İşler';
        thead.innerHTML = '<tr><th>Müşteri</th><th>İş Tanımı</th><th>Tarih</th><th>Tutar</th></tr>';
        const teslimler = (db.isEmirleri || []).filter(o => o.durum === 'Teslim Edildi').reverse();
        tbody.innerHTML = teslimler.map(o => `
            <tr><td>${o.customerName}</td><td>${o.description || '-'}</td><td>${o.tarih}</td><td>${formatCurrency(o.total)}</td></tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Henüz teslimat yapılmamış.</td></tr>';
    }
    
    openModal('modal-stat-detail');
}



let cariTabFilter = 'tuumu';

window.setCariTab = function(tab) {
    cariTabFilter = tab;
    // Update button styles
    ['tumumu', 'alacakli', 'borclu'].forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            btn.className = t === tab ? 'btn btn-primary' : 'btn btn-outline';
        }
    });
    renderCariler();
};

window.navigateTo = function(page, tab) {
    const navItem = document.querySelector(`[data-target="${page}"]`);
    if (navItem) navItem.click();
    if (tab) {
        setTimeout(() => setCariTab(tab), 100);
    }
};

window.updateIslemTipiInfo = function() {
    const tip = document.getElementById('input-islem-tipi')?.value;
    const infoEl = document.getElementById('islem-tipi-info');
    const faturaContainer = document.getElementById('fatura-no-container');
    if (!infoEl) return;
    const msgs = {
        'tahsilat': '🟢 Müşteri size ödeme yaptı. Müşterinin borcu azalacak.',
        'fatura_kes': '🟡 Müşteriye fatura kesildi. Müşterinin size olan borcu artacak.',
        'mal_alimi': '🔴 Firmadan mal/hizmet aldınız. Siz o firmaya borçlandınız.',
        'odeme_yaptik': '🟢 Firmaya ödeme yaptınız. O firmaya olan borcunuz kapandı.'
    };
    infoEl.textContent = msgs[tip] || '';
    infoEl.style.color = (tip === 'mal_alimi' || tip === 'fatura_kes') ? 'var(--warning)' : 'var(--success)';
    // Fatura no alanını sadece fatura_kes için göster
    if (faturaContainer) {
        faturaContainer.style.display = (tip === 'fatura_kes') ? 'block' : 'none';
    }
};

function renderCariler() {
    const tbody = document.getElementById('accounts-tbody');
    if (!tbody) return;
    
    const cariler = getDBArray('cariler');
    const search = document.getElementById('cari-search')?.value.toLowerCase() || '';
    
    let filtered = cariler.filter(c => 
        c.adi.toLowerCase().includes(search) || 
        c.kodu.toLowerCase().includes(search)
    );

    // Tab filtresi
    if (cariTabFilter === 'alacakli') {
        filtered = filtered.filter(c => c.bakiye > 0); // Bize borçlular
    } else if (cariTabFilter === 'borclu') {
        filtered = filtered.filter(c => c.bakiye < 0); // Biz borçluyuz
    }

    // Alacak / Borç toplamını hesapla
    const toplamAlacak = cariler.reduce((a, c) => a + (c.bakiye > 0 ? c.bakiye : 0), 0);
    const toplamBorc = cariler.reduce((a, c) => a + (c.bakiye < 0 ? Math.abs(c.bakiye) : 0), 0);
    const alacakEl = document.getElementById('cari-total-alacak');
    const borcEl = document.getElementById('cari-total-borc');
    if (alacakEl) alacakEl.textContent = formatCurrency(toplamAlacak);
    if (borcEl) borcEl.textContent = formatCurrency(toplamBorc);

    tbody.innerHTML = filtered.map(c => {
        const escapedAdi = (c.adi || '').replace(/"/g, '&amp;quot;').replace(/'/g, '\\&#39;');
        return `
        <tr>
            <td style="width:100px;"><span class="badge" style="background:rgba(230, 57, 70, 0.2); color:var(--primary); border:1px solid var(--primary);">${c.kodu}</span></td>
            <td style="cursor:pointer; color:var(--primary); transition: opacity 0.2s;" onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1" onclick="openCariDetay(${c.id})"><strong>${c.adi}</strong></td>
            <td style="color:var(--text-muted);">${c.telefon || '-'}</td>
            <td class="${c.bakiye < 0 ? 'text-error' : 'text-success'}" style="font-weight:600; text-align:right;">${formatCurrency(Math.abs(c.bakiye))} <span style="font-size:10px; opacity:0.7;">${c.bakiye > 0 ? '(Bize Borçlu)' : (c.bakiye < 0 ? '(Biz Borçluyuz)' : '')}</span></td>
            <td style="text-align:center;">
                ${c.isPasif ? '<span class="badge warning" style="opacity:0.7;">Pasif</span>' : 
                `<span class="status-pill ${c.bakiye === 0 ? 'completed' : (c.bakiye > 0 ? 'pending' : 'error')}">${c.bakiye === 0 ? 'Temiz' : (c.bakiye > 0 ? 'Alacaklı' : 'Borçlumuz')}</span>`}
            </td>
            <td style="text-align:right;">
                <button class="btn btn-outline" style="padding:4px 8px; margin-right:4px; font-size:12px;" onclick="openIslemModal(${c.id}, '${c.adi.replace(/'/g, ' ')}')"><i class="fa-solid fa-plus"></i> İşlem</button>
                <button class="btn btn-outline" style="padding:4px 8px;" onclick="editCari('${c.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn btn-outline" style="padding:4px 8px; color:var(--primary);" onclick="deleteCari('${c.id}')"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `}).join('') || `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">Bu filtrede cari kaydı bulunamadı.</td></tr>`;

    // Populate all customer dropdowns
    const aktifCariler = cariler.filter(c => !c.isPasif);
    const options = '<option value="">Seçiniz...</option>' + 
        '<option value="internal" style="font-weight:bold; color:var(--primary);">--- Kendi İşletmem (Firma İçi Üretim) ---</option>' +
        aktifCariler.map(c => `<option value="${c.id}">${c.adi} (${c.kodu})</option>`).join('');
    
    ['quote-customer', 'input-stok-cari', 'input-fire-cari', 'input-fatura-firma'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentVal = el.value;
            el.innerHTML = options;
            if (currentVal && cariler.some(c => c.id == currentVal)) {
                el.value = currentVal;
            }
        }
    });
}

window.openCariDetay = function(id) {
    const cari = db.cariler.find(c => c.id == id);
    if (!cari) return;

    document.getElementById('ekstre-cari-adi').textContent = cari.adi;
    document.getElementById('ekstre-cari-kodu').textContent = cari.kodu;
    
    const bakiyeEl = document.getElementById('ekstre-bakiye-deger');
    bakiyeEl.textContent = formatCurrency(cari.bakiye);
    bakiyeEl.className = 'stat-value ' + (cari.bakiye < 0 ? 'text-error' : 'text-success');

    // Aggregate transactions
    let history = [];

    // 1. Finansal İşlemler (Tahsilat / Ödeme vb.)
    (db.islemler || []).filter(i => i.cariId == id || i.firma === cari.adi).forEach(islem => {
        history.push({
            tarih: islem.tarih,
            tarihObj: parseTRDate(islem.tarih),
            tip: islem.tip,
            aciklama: islem.aciklama || 'Finansal İşlem',
            tutar: islem.isGelir ? islem.tutar : -islem.tutar,
            isGelir: islem.isGelir
        });
    });

    // 2. İş Emirleri / Satışlar
    (db.isEmirleri || []).filter(o => o.customerId == id).forEach(order => {
        history.push({
            tarih: order.tarih,
            tarihObj: parseTRDate(order.tarih),
            tip: 'İş Emri (Satış)',
            aciklama: order.description || 'Lazer Kesim',
            tutar: -order.total, // Debt to customer
            isGelir: false // Debt increases negative balance (our receivables)
        });
    });

    // 3. Stok Malzeme Girişleri
    (db.stoklar || []).filter(s => s.sahibiTipi === 'musteri' && s.cariId == id).forEach(stok => {
        history.push({
            tarih: stok.tarih || 'Tarihsiz',
            tarihObj: stok.tarih ? parseTRDate(stok.tarih) : new Date(0), // Push to top if no date
            tip: 'Malzeme Geldi',
            aciklama: `${stok.miktar} adet ${stok.cinsi} (${stok.ebat})`,
            tutar: 0,
            isGelir: null
        });
    });

    // Sort by date (oldest to newest)
    history.sort((a, b) => b.tarihObj - a.tarihObj);

    const tbody = document.getElementById('ekstre-tbody');
    tbody.innerHTML = history.map(h => `
        <tr>
            <td>${h.tarih}</td>
            <td><span class="badge ${h.tutar === 0 ? 'pending' : (h.tutar > 0 ? 'success' : 'warning')}">${h.tip}</span></td>
            <td>${h.aciklama}</td>
            <td style="text-align:right; font-weight:600; color:${h.tutar === 0 ? 'var(--text-muted)' : (h.tutar > 0 ? 'var(--success)' : 'var(--alert)')}">
                ${h.tutar === 0 ? '-' : formatCurrency(Math.abs(h.tutar))} ${h.tutar > 0 ? '(+)' : (h.tutar < 0 ? '(-)' : '')}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px;">Geçmiş hareket bulunamadı.</td></tr>';

    openModal('modal-cari-ekstre');
}

// Helper for DD.MM.YYYY
function parseTRDate(dateStr) {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('.');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date(dateStr);
}

window.updateQuoteMaterials = function() {
    const customerId = document.getElementById('quote-customer').value;
    const selectMaterial = document.getElementById('quote-material');
    if (!selectMaterial) return;

    selectMaterial.innerHTML = '<option value="0">Malzeme Müşteriden (Sıfır Maliyet)</option>';
    
    // Add our materials
    db.stoklar.filter(s => s.sahibiTipi === 'biz').forEach(stok => {
        selectMaterial.innerHTML += `<option value="${stok.id}">[BİZ] ${stok.cinsi} (${stok.mm}mm) - ${formatCurrency(stok.maliyet)}/plaka</option>`;
    });

    // Add this customer's materials
    if (customerId) {
        db.stoklar.filter(s => s.sahibiTipi === 'musteri' && s.cariId == customerId).forEach(stok => {
            selectMaterial.innerHTML += `<option value="${stok.id}">[EMANET] ${stok.cinsi} (${stok.mm}mm) - Mevcut: ${stok.miktar} Adet/Plaka</option>`;
        });
    }
};

function renderStoklar() {
    try {
        const tbody = document.getElementById('inventory-tbody');
        if (!tbody) return;

        const searchInput = document.getElementById('stok-search');
        const searchVal = (searchInput ? searchInput.value : '').toLowerCase();

        const stoklar = getDBArray('stoklar');
        const filteredStoklar = stoklar.filter(s => 
            (s.cinsi || '').toLowerCase().includes(searchVal) || 
            (s.kodu || '').toLowerCase().includes(searchVal)
        );

        tbody.innerHTML = filteredStoklar.map(stok => `
            <tr>
                <td style="width:80px;"><span class="badge" style="background:rgba(69, 123, 157, 0.2); color:var(--secondary); border:1px solid var(--secondary);">${stok.kodu || '-'}</span></td>
                <td><strong>${stok.cinsi || '-'}</strong></td>
                <td style="text-align:center;">${stok.mm || '-'} mm</td>
                <td style="color:var(--text-muted);">${stok.ebat || '-'}</td>
                <td style="text-align:center;"><strong style="color:var(--text-main);">${stok.miktar || 0}</strong></td>
                <td style="text-align:center;"><span style="color:var(--success); font-weight:600;">${stok.kg || 0} KG</span></td>
                <td style="text-align:center;"><span class="badge ${stok.sahibiTipi === 'musteri' ? 'info' : 'success'}">${stok.sahibi || 'Biz'}</span></td>
                <td style="text-align:right; font-weight:600;">${stok.sahibiTipi === 'musteri' ? '-' : formatCurrency(stok.maliyet)}</td>
                <td style="text-align:right;">
                    <button class="btn btn-outline" style="padding:4px 8px;" onclick="openStokDuzenleModal(${stok.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-outline" style="padding:4px 8px; color:var(--primary);" onclick="deleteStok(${stok.id})"><i class="fa-solid fa-trash-can"></i></button>
            </tr>
        `).join('') || '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">Stok kaydı bulunamadı.</td></tr>';
    } catch(e) {
        console.error("renderStoklar error:", e);
    }
}

let isStatsVisible = false;

window.toggleStats = function() {
    isStatsVisible = !isStatsVisible;
    const btn = document.getElementById('btn-toggle-stats');
    if (btn) {
        btn.innerHTML = isStatsVisible 
            ? '<i class="fa-solid fa-eye"></i> Gizle' 
            : '<i class="fa-solid fa-eye-slash"></i> Göster';
    }
    renderDashboard();
};

function renderDashboard() {
    try {
        const incomeTransactions = (db.islemler || []).filter(i => i.isGelir);
        const toplamGelir = incomeTransactions.reduce((acc, curr) => acc + curr.tutar, 0) + 110400; // 110400 is base dummy income
        
        const bekleyenAlacak = (db.cariler || []).reduce((acc, curr) => acc + (curr.bakiye > 0 ? curr.bakiye : 0), 0);
        const toplamBorc = (db.cariler || []).reduce((acc, curr) => acc + (curr.bakiye < 0 ? Math.abs(curr.bakiye) : 0), 0);
        const onayliIslerCount = (db.isEmirleri || []).filter(o => o.durum === 'Onaylandı' || o.durum === 'Beklemede' || o.durum === 'Üretimde').length;
        const tekliflerCount = (db.teklifler || []).length;

        const elIncome = document.getElementById('dash-stat-income');
        const elReceivables = document.getElementById('dash-stat-receivables');
        const elOrders = document.getElementById('dash-stat-orders');
        const elDebt = document.getElementById('dash-stat-debt');

        if (elIncome) elIncome.textContent = isStatsVisible ? formatCurrency(toplamGelir) : '***';
        if (elReceivables) elReceivables.textContent = isStatsVisible ? formatCurrency(bekleyenAlacak) : '***';
        if (elOrders) elOrders.textContent = isStatsVisible ? (onayliIslerCount + tekliflerCount) : '***';
        if (elDebt) elDebt.textContent = isStatsVisible ? formatCurrency(toplamBorc) : '***';

        updateDashboardChart();

        // Finansal İşlemler
        const tbody = document.getElementById('dashboard-tbody');
        if (tbody) {
            tbody.innerHTML = (db.islemler || []).slice(-5).reverse().map(islem => `
                <tr>
                    <td>${islem.tarih}</td>
                    <td>${islem.firma}</td>
                    <td><span class="badge ${islem.isSuccess ? 'success' : 'warning'}">${islem.tip}</span></td>
                    <td class="${islem.isGelir ? 'text-info' : 'text-alert'}">${formatCurrency(islem.tutar)}</td>
                </tr>
            `).join('');
        }

        // Bekleyen İş Emirleri
        const pendingTbody = document.getElementById('dashboard-pending-tbody');
        if (pendingTbody) {
            const pendingOrders = (db.isEmirleri || []).filter(o => o.durum === 'Beklemede' || o.durum === 'Üretimde').slice(0, 5);
            pendingTbody.innerHTML = pendingOrders.length ? pendingOrders.map(o => `
                <tr>
                    <td>${o.customerName}</td>
                    <td>${o.description || '-'}</td>
                    <td><span class="badge warning">${o.durum}</span></td>
                </tr>
            `).join('') : '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Bekleyen iş yok.</td></tr>';
        }

        // Son Teslim Edilenler
        const deliveredTbody = document.getElementById('dashboard-delivered-tbody');
        if (deliveredTbody) {
            const deliveredOrders = (db.isEmirleri || []).filter(o => o.durum === 'Teslim Edildi').slice(-5).reverse();
            deliveredTbody.innerHTML = deliveredOrders.length ? deliveredOrders.map(o => `
                <tr>
                    <td>${o.customerName}</td>
                    <td>${o.description || '-'}</td>
                    <td>${o.tarih}</td>
                </tr>
            `).join('') : '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Teslimat yok.</td></tr>';
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
    try {
        const tbody = document.getElementById('expenses-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const giderler = getDBArray('giderler');
        if (giderler.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Henüz gider kaydı yok.</td></tr>';
        } else {
            [...giderler].reverse().forEach(g => {
                const katBadge = getCategoryBadge(g.kategori);
                tbody.innerHTML += `<tr>
                    <td>${g.tarih || '-'}</td>
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
            if(!g.tarih) return false;
            const parts = g.tarih.split('.');
            if (parts.length < 3) return false;
            const d = new Date(parts[2], parts[1] - 1, parts[0]);
            return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        }).reduce((acc, g) => acc + (g.tutar || 0), 0);

        const personelGider = giderler.filter(g => g.kategori === 'Personel').reduce((acc, g) => acc + (g.tutar || 0), 0);
        const toplamGider = giderler.reduce((acc, g) => acc + (g.tutar || 0), 0);

        const statMonth = document.getElementById('expense-stat-month');
        const statPersonel = document.getElementById('expense-stat-personel');
        const statTotal = document.getElementById('expense-stat-total');
        if (statMonth) statMonth.textContent = formatCurrency(ayGider);
        if (statPersonel) statPersonel.textContent = formatCurrency(personelGider);
        if (statTotal) statTotal.textContent = formatCurrency(toplamGider);
    } catch(e) {
        console.error("renderExpenses error:", e);
    }
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

window.saveQuote = function() {
    const quoteData = getQuoteData();
    if (!quoteData) return;
    
    db.teklifler.push({
        id: Date.now(),
        tarih: new Date().toLocaleDateString('tr-TR'),
        ...quoteData
    });
    saveDB();
    alert("Teklif kaydedildi.");
}

window.approveQuoteAsOrder = function() {
    const quoteData = getQuoteData();
    if (!quoteData) return;

    const orderId = `EMR-${Date.now().toString().slice(-6)}`;
    db.isEmirleri.push({
        id: Date.now(),
        orderNo: orderId,
        tarih: new Date().toLocaleDateString('tr-TR'),
        ...quoteData,
        durum: 'Beklemede'
    });
    saveDB();
    alert(`İş Emri Oluşturuldu: ${orderId}`);
}

function getQuoteData() {
    const islemTipi = document.getElementById('quote-type') ? document.getElementById('quote-type').value : 'lazer';
    const customerId = document.getElementById('quote-customer').value;
    const description = document.getElementById('quote-description').value;
    const minutes = parseFloat(document.getElementById('quote-minutes').value) || 0;
    const rate = parseFloat(document.getElementById('quote-rate').value) || 0;
    
    const kgAmount = parseFloat(document.getElementById('quote-kg-amount')?.value) || 0;
    const kgPrice = parseFloat(document.getElementById('quote-kg-price')?.value) || 0;
    
    const materialSelect = document.getElementById('quote-material');
    const stokId = materialSelect ? materialSelect.value : "0";
    const stokQty = parseFloat(document.getElementById('quote-material-qty').value) || 0;

    const stok = db.stoklar.find(s => s.id == stokId);
    const materialCostPerUnit = stok ? (stok.sahibiTipi === 'biz' ? stok.maliyet : 0) : 0;
    
    let operationCost = 0;
    let totalMaterialCost = 0;

    if (islemTipi === 'lazer') {
        operationCost = minutes * rate;
        totalMaterialCost = materialCostPerUnit * stokQty;
    } else if (islemTipi === 'bukum') {
        operationCost = kgAmount * kgPrice;
        totalMaterialCost = materialCostPerUnit * stokQty;
    } else if (islemTipi === 'hammadde') {
        operationCost = 0;
        totalMaterialCost = kgAmount * kgPrice;
    }

    const discountPercent = parseFloat(document.getElementById('quote-discount').value) || 0;
    const taxRate = parseFloat(document.getElementById('quote-tax-rate').value) || 20;

    const subTotalBeforeDiscount = operationCost + totalMaterialCost;
    const discountAmount = subTotalBeforeDiscount * (discountPercent / 100);
    const subTotal = subTotalBeforeDiscount - discountAmount;
    
    const tax = subTotal * (taxRate / 100);
    const total = subTotal + tax;
    const materialCost = totalMaterialCost;

    if (!customerId) {
        alert("Lütfen müşteri seçin!");
        return null;
    }
    
    let customerName = "Bilinmeyen Müşteri";
    if (customerId === 'internal') {
        customerName = "Kendi İşletmem (Firma İçi Üretim)";
    } else {
        const cari = db.cariler.find(c => c.id == customerId);
        if (cari) customerName = cari.adi;
    }

    return {
        islemTipi,
        customerId,
        customerName: customerName,
        description,
        minutes,
        rate,
        kgAmount,
        kgPrice,
        stokId,
        stokQty,
        materialCost,
        discountPercent,
        discountAmount,
        taxRate: parseFloat(document.getElementById('quote-tax-rate').value) || 20,
        total
    };
}

window.loadQuote = function(id) {
    const quote = db.teklifler.find(q => q.id === id);
    if (!quote) return;

    document.getElementById('quote-customer').value = quote.customerId;
    document.getElementById('quote-description').value = quote.description || '';
    document.getElementById('quote-minutes').value = quote.minutes || 0;
    document.getElementById('quote-rate').value = quote.rate || 120;
    
    // Update materials dropdown first
    updateQuoteMaterials();
    document.getElementById('quote-material').value = quote.stokId || "0";
    document.getElementById('quote-material-qty').value = quote.stokQty || 1;
    document.getElementById('quote-discount').value = quote.discountPercent || 0;
    document.getElementById('quote-tax-rate').value = quote.taxRate || 20;
    
    // Auto calculate to update the UI
    document.getElementById('btn-calculate').click();
    
    // Switch to Quotation view if not already
    const quoteNavItem = Array.from(document.querySelectorAll('.nav-item')).find(n => n.getAttribute('data-target') === 'quotation');
    if (quoteNavItem) quoteNavItem.click();
}

function renderQuoteHistory() {
    const list = document.getElementById('quote-history-list');
    if (!list) return;
    
    const quotes = db.teklifler || [];
    if (quotes.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Henüz kaydedilen teklif yok.</p>';
        return;
    }
    
    list.innerHTML = [...quotes].reverse().map(q => {
        const tipLabel = q.islemTipi === 'bukum' ? 'Büküm' : (q.islemTipi === 'hammadde' ? 'Hammadde' : 'Lazer');
        return `
        <div class="glass-panel quote-history-item" style="padding:12px; margin-bottom:8px; font-size:13px; cursor:pointer;" onclick="showQuoteDetail(${q.id})">
            <div class="flex-between">
                <strong>${q.customerName}</strong>
                <span>${q.tarih}</span>
            </div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top:2px;">
                <span class="badge ${q.islemTipi === 'bukum' ? 'primary' : (q.islemTipi === 'hammadde' ? 'success' : '')}" style="font-size:10px; margin-right:4px;">${tipLabel}</span>
                ${q.description || 'İş Tanımı Yok'}
            </div>
            <div class="flex-between" style="margin-top:4px;">
                <span class="text-primary" style="font-weight:bold;">${formatCurrency(q.total)}</span>
                ${q.discountPercent > 0 ? `<span class="badge warning" style="font-size:10px;">%${q.discountPercent} İndirim</span>` : ''}
            </div>
        </div>
    `}).join('');
}

window.showQuoteDetail = function(id) {
    const q = (db.teklifler || []).find(t => t.id === id);
    if (!q) return;
    
    const tipLabel = q.islemTipi === 'bukum' ? 'Büküm' : (q.islemTipi === 'hammadde' ? 'Hammadde Satışı' : 'Lazer Kesim');
    
    let detailRows = '';
    detailRows += `<tr><td style="color:var(--text-muted);">Müşteri</td><td><strong>${q.customerName}</strong></td></tr>`;
    detailRows += `<tr><td style="color:var(--text-muted);">Tarih</td><td>${q.tarih}</td></tr>`;
    detailRows += `<tr><td style="color:var(--text-muted);">İşlem Tipi</td><td><span class="badge ${q.islemTipi === 'bukum' ? 'primary' : (q.islemTipi === 'hammadde' ? 'success' : '')}">${tipLabel}</span></td></tr>`;
    
    if (q.description) {
        detailRows += `<tr><td style="color:var(--text-muted);">İş Açıklaması</td><td>${q.description}</td></tr>`;
    }
    
    if (q.islemTipi === 'lazer') {
        detailRows += `<tr><td style="color:var(--text-muted);">Kesim Süresi</td><td>${q.minutes || 0} dakika</td></tr>`;
        detailRows += `<tr><td style="color:var(--text-muted);">Dakika Ücreti</td><td>${formatCurrency(q.rate || 0)}</td></tr>`;
    } else {
        detailRows += `<tr><td style="color:var(--text-muted);">Ağırlık</td><td>${q.kgAmount || 0} KG</td></tr>`;
        detailRows += `<tr><td style="color:var(--text-muted);">KG Birim Fiyatı</td><td>${formatCurrency(q.kgPrice || 0)}</td></tr>`;
    }
    
    if (q.stokId && q.stokId !== "0") {
        const stok = db.stoklar.find(s => s.id == q.stokId);
        if (stok) {
            detailRows += `<tr><td style="color:var(--text-muted);">Malzeme</td><td>${stok.cinsi} (${stok.mm}mm) — ${q.stokQty || 0} Adet/Plaka</td></tr>`;
        }
    }
    
    detailRows += `<tr><td style="color:var(--text-muted);">Malzeme Bedeli</td><td>${formatCurrency(q.materialCost || 0)}</td></tr>`;
    
    if (q.discountPercent > 0) {
        detailRows += `<tr><td style="color:var(--text-muted);">İndirim</td><td>%${q.discountPercent} (${formatCurrency(q.discountAmount || 0)})</td></tr>`;
    }
    
    detailRows += `<tr><td style="color:var(--text-muted);">KDV Oranı</td><td>%${q.taxRate || 20}</td></tr>`;
    detailRows += `<tr style="border-top:2px solid var(--border);"><td style="font-weight:700; font-size:15px; padding-top:8px;">TOPLAM</td><td style="font-weight:700; font-size:18px; color:var(--success); padding-top:8px;">${formatCurrency(q.total)}</td></tr>`;
    
    const html = `
        <div class="modal-content glass-panel" style="max-width:550px;">
            <div class="flex-between mb-4">
                <h3>Teklif Detayı</h3>
                <button class="btn-close" onclick="closeModal('modal-quote-detail')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <table class="data-table" style="width:100%;">
                <tbody>${detailRows}</tbody>
            </table>
            <div style="display:flex; gap:8px; margin-top:16px;">
                <button class="btn btn-outline" style="flex:1;" onclick="loadQuote(${q.id}); closeModal('modal-quote-detail');">
                    <i class="fa-solid fa-pen"></i> Forma Yükle
                </button>
            </div>
        </div>`;
    
    let modal = document.getElementById('modal-quote-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-quote-detail';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.classList.add('active');
    modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('active'); };
}

function renderOrders() {
    try {
        const tbody = document.getElementById('orders-tbody');
        if (!tbody) return;
        
        updateNotifications(); // Update bell badge
        
        const orders = getDBArray('isEmirleri');
        tbody.innerHTML = orders.length ? [...orders].reverse().map(o => `
            <tr>
                <td style="width:100px;"><span class="badge" style="background:rgba(233, 196, 106, 0.2); color:var(--warning); border:1px solid var(--warning); cursor:pointer; text-decoration:underline;" onclick="openOrderHistory(${o.id})" title="Tarihçeyi Gör">${o.orderNo || '-'}</span></td>
                <td><strong>${o.customerName || '-'}</strong></td>
                <td style="color:var(--text-muted); font-size:13px;">
                    <span class="badge ${o.islemTipi === 'bukum' ? 'primary' : (o.islemTipi === 'hammadde' ? 'success' : '')}" style="margin-right:6px; font-size:10px;">${o.islemTipi === 'bukum' ? 'Büküm' : (o.islemTipi === 'hammadde' ? 'H. Satış' : 'Lazer')}</span>
                    ${o.islemTipi === 'hammadde' ? `${o.kgAmount || 0} KG Satış` : (o.description || '-')}
                </td>
                <td style="text-align:right; font-weight:600; color:var(--success);">${formatCurrency(o.total)}</td>
                <td style="text-align:center;"><span class="badge ${o.durum === 'Teslim Edildi' ? 'success' : 'warning'}">${o.durum || 'Beklemede'}</span></td>
                <td style="text-align:right;">
                    <button class="btn btn-outline" style="padding:4px 10px; font-size:12px; font-weight:600;" onclick="openOrderStatusModal(${o.id})">Durumu Değiştir</button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">Henüz iş emri kaydı yok.</td></tr>';
    } catch(e) {
        console.error("renderOrders error:", e);
    }
}

window.openOrderStatusModal = function(id) {
    const order = db.isEmirleri.find(o => o.id === id);
    if (!order) return;
    document.getElementById('input-order-id').value = id;
    document.getElementById('input-order-status').value = order.durum;
    openModal('modal-order-status');
}

window.openOrderHistory = function(id) {
    const order = db.isEmirleri.find(o => o.id === id);
    if (!order) return;

    document.getElementById('history-order-no').textContent = order.orderNo;
    document.getElementById('history-customer-name').textContent = order.customerName || 'Bilinmeyen Müşteri';

    const matInfoContainer = document.getElementById('history-material-info');
    const matDetailsText = document.getElementById('history-material-details');
    
    let infoText = '';
    
    if (order.islemTipi === 'bukum' || order.islemTipi === 'hammadde') {
        infoText += `<span style="display:inline-block; margin-bottom:6px; color:var(--success);">İşlem Hacmi: <strong>${order.kgAmount || 0} KG</strong> (Birim: ${formatCurrency(order.kgPrice || 0)})</span><br>`;
    }
    
    if (order.stokId && order.stokId !== "0") {
        const stok = db.stoklar.find(s => s.id == order.stokId);
        if (stok) {
            infoText += `<span style="color:var(--primary);">${stok.cinsi} (${stok.mm}mm)</span> &nbsp;&mdash;&nbsp; Ebat: ${stok.ebat} &nbsp;&mdash;&nbsp; Düşülecek Stok: <strong style="color:var(--warning);">${order.stokQty} Adet/Plaka</strong> ${stok.sahibiTipi === 'musteri' ? '<span class="badge" style="background:rgba(233,196,106,0.2); color:var(--warning);">Emanet</span>' : ''}`;
        }
    }
    
    if (infoText !== '') {
        matDetailsText.innerHTML = infoText;
        matInfoContainer.style.display = 'block';
    } else {
        matInfoContainer.style.display = 'none';
    }

    let historyHTML = '';
    
    if (order.statusHistory && order.statusHistory.length > 0) {
        historyHTML = order.statusHistory.map(h => `
            <tr>
                <td style="color:var(--text-muted);">${h.date}</td>
                <td><span class="badge ${h.status === 'Beklemede' ? 'warning' : (h.status === 'Üretimde' ? 'primary' : (h.status === 'Teslim Edildi' ? 'success' : 'alert'))}">${h.status}</span></td>
            </tr>
        `).join('');
    } else {
        // Fallback for old orders without history tracking
        historyHTML = `
            <tr>
                <td style="color:var(--text-muted);">${order.tarih}</td>
                <td><span class="badge warning">Oluşturuldu (Beklemede)</span></td>
            </tr>
            <tr>
                <td style="color:var(--text-muted);">${new Date().toLocaleDateString('tr-TR')}</td>
                <td><span class="badge ${order.durum === 'Beklemede' ? 'warning' : (order.durum === 'Üretimde' ? 'primary' : (order.durum === 'Teslim Edildi' ? 'success' : 'alert'))}">${order.durum} (Güncel)</span></td>
            </tr>
        `;
    }

    document.getElementById('history-tbody').innerHTML = historyHTML;
    openModal('modal-order-history');
}

window.updateOrderStatus = function() {
    const id = parseInt(document.getElementById('input-order-id').value);
    const newStatus = document.getElementById('input-order-status').value;
    const order = db.isEmirleri.find(o => o.id === id);
    
    if (order) {
        const oldStatus = order.durum;
        
        if (oldStatus !== newStatus) {
            order.durum = newStatus;
            
            if (!order.statusHistory) {
                // Initialize history for old orders before appending
                order.statusHistory = [{
                    status: oldStatus,
                    date: order.tarih + ' 00:00'
                }];
            }
            
            order.statusHistory.push({
                status: newStatus,
                date: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})
            });
        }
        
        // Üretimde veya Teslim Edildi'ye geçerken bakiyeyi cariye yansıt (sadece ilk seferde)
        const bakiyeYansitilacakDurumlar = ['Üretimde', 'Teslim Edildi'];
        const dahaOnceBakiyeYansitildiMi = order.bakiyeCariyeYansitildi === true;
        
        if (bakiyeYansitilacakDurumlar.includes(newStatus) && !dahaOnceBakiyeYansitildiMi && oldStatus !== newStatus) {
            const confirmInvoice = confirm(`İş "${newStatus}" olarak işaretlendi.\n\nMüşterinin (${order.customerName}) cari hesabına ${formatCurrency(order.total)} borç eklensin mi?\n\n(Veresiye yazılacaksa TAMAM'a tıklayın)`);
            if (confirmInvoice) {
                if (order.customerId !== 'internal') {
                    const firmaAdi = order.customerName;
                    const tutar = order.total;
                    const cari = db.cariler.find(c => c.adi === firmaAdi);
                    if (cari) {
                        cari.bakiye += tutar;
                        if (cari.bakiye > 0) cari.durum = 'Müşteri Borçlu';
                        else if (cari.bakiye < 0) cari.durum = 'Müşteri Alacaklı';
                        else cari.durum = 'Temiz';

                        db.islemler.push({
                            id: Date.now(),
                            tarih: new Date().toLocaleDateString('tr-TR'),
                            firma: firmaAdi,
                            tip: `İş Emri Borçlandırma (${order.orderNo})`,
                            aciklama: `Durum: ${newStatus}`,
                            tutar: tutar,
                            isSuccess: false,
                            isGelir: false
                        });
                    }
                }
                order.bakiyeCariyeYansitildi = true; // Tekrar bakiye eklenmesini engelle
            }
        }

        // Stok düşürme sadece Teslim Edildi'de
        if (newStatus === 'Teslim Edildi' && oldStatus !== 'Teslim Edildi') {
            if (order.stokId && order.stokId !== "0") {
                const stok = db.stoklar.find(s => s.id == order.stokId);
                if (stok) {
                    stok.miktar -= (order.stokQty || 0);
                    if (stok.miktar < 0) stok.miktar = 0;
                }
            }
        }
        saveDB();
        renderStoklar();
        closeModal('modal-order-status');
    }
}

let dashboardChart = null;
function updateDashboardChart() {
    const ctx = document.getElementById('dashboard-chart');
    if (!ctx) return;

    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const currentMonth = new Date().getMonth();
    const labels = months.slice(0, currentMonth + 1);

    const incomeData = new Array(labels.length).fill(0);
    const expenseData = new Array(labels.length).fill(0);

    // Initial dummy data to make it look good
    incomeData[currentMonth] = 110400; 

    db.islemler.forEach(i => {
        if (!i.tarih) return;
        const parts = i.tarih.split('.');
        if (parts.length < 3) return;
        const date = new Date(parts.reverse().join('-'));
        const m = date.getMonth();
        if (!isNaN(m) && m <= currentMonth && i.isGelir) incomeData[m] += i.tutar;
    });

    const giderler = getDBArray('giderler');
    giderler.forEach(g => {
        if (!g.tarih) return;
        const parts = g.tarih.split('.');
        if (parts.length < 3) return;
        const date = new Date(parts.reverse().join('-'));
        const m = date.getMonth();
        if (!isNaN(m) && m <= currentMonth) expenseData[m] += g.tutar;
    });

    if (dashboardChart) dashboardChart.destroy();
    
    try {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded yet');
            return;
        }
        dashboardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Gelir', data: incomeData, backgroundColor: '#2a9d8f' },
                    { label: 'Gider', data: expenseData, backgroundColor: '#e63946' }
                ]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    } catch (err) {
        console.error("Chart Rendering Error:", err);
    }
}

function renderAll() {
    if (document.readyState === 'loading') return;
    
    const tasks = [
        { name: 'Header', fn: renderHeader },
        { name: 'Cariler', fn: renderCariler },
        { name: 'Stoklar', fn: renderStoklar },
        { name: 'Fireler', fn: renderFireler },
        { name: 'Dashboard', fn: renderDashboard },
        { name: 'Expenses', fn: renderExpenses },
        { name: 'Orders', fn: renderOrders },
        { name: 'QuoteHistory', fn: renderQuoteHistory }
    ];

    tasks.forEach(task => {
        try {
            task.fn();
        } catch (err) {
            console.error(`Render Error [${task.name}]:`, err);
        }
    });
}

function addLog(msg) {
    const el = document.getElementById('debug-log');
    if (el) el.innerHTML = `<div>> ${msg}</div>`;
    console.log(msg);
}


window.switchView = function(target) {
    if (!target) target = 'dashboard';
    addLog("Görünüm Değişiyor: " + target);
    
    try {
        const views = document.querySelectorAll('.view');
        const navItems = document.querySelectorAll('.nav-item');
        const pageTitle = document.getElementById('page-title');

        // Sidebar Update
        navItems.forEach(nav => {
            nav.classList.remove('active');
            if (nav.getAttribute('data-target') === target) {
                nav.classList.add('active');
                if (pageTitle) {
                    const span = nav.querySelector('span');
                    if (span) pageTitle.textContent = span.textContent;
                }
            }
        });

        // View Update - Absolute Force Show
        views.forEach(v => {
            v.classList.remove('active');
            v.style.display = 'none';
            if (v.id === 'view-' + target) {
                v.classList.add('active');
                v.style.display = 'flex';
                v.style.flexDirection = 'column';
            }
        });

        // Data Rendering
        setTimeout(() => {
            try {
                switch(target) {
                    case 'dashboard': renderDashboard(); break;
                    case 'quotation': renderCariler(); updateQuoteMaterials(); renderQuoteHistory(); break;
                    case 'accounts': renderCariler(); break;
                    case 'inventory': renderStoklar(); break;
                    case 'orders': renderOrders(); break;
                    case 'scraps': renderFireler(); break;
                    case 'expenses': renderExpenses(); break;
                    case 'invoices': renderInvoices(); break;
                }
                renderHeader();
                addLog(`Modül Yüklendi: ${target}`);
            } catch (err) {
                console.error("Rendering Error:", err);
            }
        }, 30);

    } catch (e) {
        console.error("SwitchView Error:", e);
    }
};

window.onhashchange = () => {
    const hash = window.location.hash.substring(1) || 'dashboard';
    switchView(hash);
    
    // Initial badge update
    setTimeout(updateNotifications, 500);
}

window.updateNotifications = function() {
    const orders = getDBArray('isEmirleri').filter(o => o.durum === 'Beklemede');
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    
    if (orders.length > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = orders.length;
    } else {
        badge.style.display = 'none';
    }
};

window.openNotifications = function() {
    const orders = getDBArray('isEmirleri').filter(o => o.durum === 'Beklemede');
    const list = document.getElementById('notification-list');
    if (!list) return;
    
    if (orders.length === 0) {
        list.innerHTML = '<li style="padding: 15px; text-align: center; color: var(--text-muted);">Bekleyen iş emri bulunmuyor.</li>';
    } else {
        list.innerHTML = orders.map(o => `
            <li style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" onclick="closeModal('modal-notifications'); location.hash='orders'; switchView('orders'); setTimeout(() => openOrderHistory(${o.id}), 100);">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong style="color:var(--warning); text-decoration:underline;">${o.orderNo}</strong>
                    <span style="font-size:12px; color:var(--text-muted);">${o.tarih}</span>
                </div>
                <div style="font-size:14px; font-weight:500; color:var(--primary);">${o.customerName || 'Bilinmeyen Müşteri'}</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${o.description || '-'}</div>
            </li>
        `).join('');
    }
    openModal('modal-notifications');
};;

window.updateQuoteTypeUI = function() {
    const type = document.getElementById('quote-type').value;
    const lazerFields = document.getElementById('quote-lazer-fields');
    const kgFields = document.getElementById('quote-kg-fields');
    const descContainer = document.getElementById('quote-desc-container');
    const cutLabel = document.getElementById('summary-cut-label');
    
    if (type === 'lazer') {
        lazerFields.style.display = 'flex';
        kgFields.style.display = 'none';
        descContainer.style.display = 'block';
        cutLabel.textContent = 'Kesim Bedeli:';
        document.getElementById('summary-cut-container').style.display = 'flex';
    } else if (type === 'bukum') {
        lazerFields.style.display = 'none';
        kgFields.style.display = 'flex';
        descContainer.style.display = 'block';
        document.getElementById('label-kg-amount').textContent = 'Bükülecek Ağırlık (KG)';
        document.getElementById('label-kg-price').textContent = 'KG Büküm Ücreti (₺)';
        cutLabel.textContent = 'Büküm Bedeli:';
        document.getElementById('summary-cut-container').style.display = 'flex';
    } else if (type === 'hammadde') {
        lazerFields.style.display = 'none';
        kgFields.style.display = 'flex';
        descContainer.style.display = 'none';
        document.getElementById('label-kg-amount').textContent = 'Satılacak Ağırlık (KG)';
        document.getElementById('label-kg-price').textContent = 'KG Satış Fiyatı (₺)';
        document.getElementById('summary-cut-container').style.display = 'none';
    }
    calculateQuote();
};

window.calculateQuote = function() {
    const type = document.getElementById('quote-type') ? document.getElementById('quote-type').value : 'lazer';
    
    const inputMinutes = document.getElementById('quote-minutes');
    const inputRate = document.getElementById('quote-rate');
    const inputKgAmount = document.getElementById('quote-kg-amount');
    const inputKgPrice = document.getElementById('quote-kg-price');
    
    const selectMaterial = document.getElementById('quote-material');
    const inputMaterialQty = document.getElementById('quote-material-qty');
    const inputDiscount = document.getElementById('quote-discount');
    const selectTax = document.getElementById('quote-tax-rate');

    const stokId = selectMaterial ? selectMaterial.value : "0";
    const stok = db.stoklar.find(s => s.id == stokId);
    
    const materialCostPerUnit = stok ? (stok.sahibiTipi === 'biz' ? stok.maliyet : 0) : 0;
    const materialQty = parseFloat(inputMaterialQty ? inputMaterialQty.value : 1) || 1;
    const discountPercent = parseFloat(inputDiscount ? inputDiscount.value : 0) || 0;
    const taxRate = parseFloat(selectTax ? selectTax.value : 20) / 100;

    let operationCost = 0;
    let totalMaterialCost = 0;

    if (type === 'lazer') {
        const minutes = parseFloat(inputMinutes ? inputMinutes.value : 0) || 0;
        const rate = parseFloat(inputRate ? inputRate.value : 0) || 0;
        operationCost = minutes * rate;
        totalMaterialCost = materialCostPerUnit * materialQty;
    } else if (type === 'bukum') {
        const kg = parseFloat(inputKgAmount ? inputKgAmount.value : 0) || 0;
        const kgPrice = parseFloat(inputKgPrice ? inputKgPrice.value : 0) || 0;
        operationCost = kg * kgPrice;
        totalMaterialCost = materialCostPerUnit * materialQty;
    } else if (type === 'hammadde') {
        const kg = parseFloat(inputKgAmount ? inputKgAmount.value : 0) || 0;
        const kgPrice = parseFloat(inputKgPrice ? inputKgPrice.value : 0) || 0;
        operationCost = 0; // No separate operation cost
        totalMaterialCost = kg * kgPrice; // Total is based on weight sold
    }

    const subTotalBeforeDiscount = operationCost + totalMaterialCost;
    const discountAmount = subTotalBeforeDiscount * (discountPercent / 100);
    const subTotal = subTotalBeforeDiscount - discountAmount;
    
    const tax = subTotal * taxRate;
    const grandTotal = subTotal + tax;

    if(document.getElementById('summary-cut')) document.getElementById('summary-cut').textContent = formatCurrency(operationCost);
    if(document.getElementById('summary-mat')) document.getElementById('summary-mat').textContent = formatCurrency(totalMaterialCost);
    if(document.getElementById('summary-discount')) document.getElementById('summary-discount').textContent = formatCurrency(discountAmount);
    if(document.getElementById('summary-sub')) document.getElementById('summary-sub').textContent = formatCurrency(subTotal);
    if(document.getElementById('summary-tax')) document.getElementById('summary-tax').textContent = formatCurrency(tax);
    if(document.getElementById('summary-total')) document.getElementById('summary-total').textContent = formatCurrency(grandTotal);
};

// (saveQuote and approveQuoteAsOrder are defined earlier in the file via getQuoteData)

// ========== FATURALAR MODÜLÜ ==========

let invoiceTabFilter = 'kesilen';

window.setInvoiceTab = function(tab) {
    invoiceTabFilter = tab;
    const btnKesilen = document.getElementById('inv-tab-kesilen');
    const btnAlinan = document.getElementById('inv-tab-alinan');
    if (btnKesilen) btnKesilen.className = tab === 'kesilen' ? 'btn btn-primary' : 'btn btn-outline';
    if (btnAlinan) btnAlinan.className = tab === 'alinan' ? 'btn btn-primary' : 'btn btn-outline';
    renderInvoices();
};

function renderInvoices() {
    const tbody = document.getElementById('invoices-tbody');
    if (!tbody) return;

    if (!db.faturalar) db.faturalar = [];
    const faturalar = db.faturalar;

    const kesilen = faturalar.filter(f => f.tur === 'kesilen');
    const alinan = faturalar.filter(f => f.tur === 'alinan');

    const toplamKesilen = kesilen.reduce((a, f) => a + (f.tutar || 0), 0);
    const toplamAlinan = alinan.reduce((a, f) => a + (f.tutar || 0), 0);

    const elKesilen = document.getElementById('inv-total-kesilen');
    const elAlinan = document.getElementById('inv-total-alinan');
    if (elKesilen) elKesilen.textContent = formatCurrency(toplamKesilen);
    if (elAlinan) elAlinan.textContent = formatCurrency(toplamAlinan);

    const filtered = invoiceTabFilter === 'kesilen' ? kesilen : alinan;

    tbody.innerHTML = filtered.length ? [...filtered].reverse().map(f => `
        <tr style="cursor:pointer;" onclick="showFaturaDetail(${f.id})">
            <td><span class="badge" style="background:rgba(69,123,157,0.2); color:var(--secondary); border:1px solid var(--secondary);">${f.faturaNo}</span></td>
            <td style="color:var(--text-muted);">${f.tarih}</td>
            <td><strong>${f.firma}</strong></td>
            <td style="color:var(--text-muted); font-size:13px;">${f.aciklama || '-'}</td>
            <td style="text-align:right; font-weight:600; color:${f.tur === 'kesilen' ? 'var(--success)' : 'var(--alert)'};">${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar)}</td>
            <td style="text-align:right;">
                <button class="btn btn-outline" style="padding:4px 8px; color:var(--primary);" onclick="event.stopPropagation(); deleteFatura(${f.id})"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `).join('') : `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">${invoiceTabFilter === 'kesilen' ? 'Henüz kesilen fatura yok.' : 'Henüz alınan fatura yok.'}</td></tr>`;
}

window.showFaturaDetail = function(id) {
    const f = (db.faturalar || []).find(x => x.id === id);
    if (!f) return;

    const turLabel = f.tur === 'kesilen' ? 'Kesilen Fatura' : 'Alınan Fatura';
    const turIcon = f.tur === 'kesilen' ? '📤' : '📥';
    const turColor = f.tur === 'kesilen' ? 'var(--success)' : 'var(--alert)';

    const html = `
        <div class="modal-content glass-panel" style="max-width:500px;">
            <div class="flex-between mb-4">
                <h3>${turIcon} Fatura Detayı</h3>
                <button class="btn-close" onclick="closeModal('modal-fatura-detail')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <table class="data-table" style="width:100%;">
                <tbody>
                    <tr><td style="color:var(--text-muted); width:140px;">Fatura Türü</td><td><span class="badge ${f.tur === 'kesilen' ? 'success' : ''}" style="${f.tur === 'alinan' ? 'background:rgba(230,57,70,0.2); color:var(--alert); border:1px solid var(--alert);' : ''}">${turLabel}</span></td></tr>
                    <tr><td style="color:var(--text-muted);">Fatura No</td><td><strong>${f.faturaNo}</strong></td></tr>
                    <tr><td style="color:var(--text-muted);">Tarih</td><td>${f.tarih}</td></tr>
                    <tr><td style="color:var(--text-muted);">Firma / Müşteri</td><td><strong>${f.firma}</strong></td></tr>
                    <tr><td style="color:var(--text-muted);">Açıklama</td><td>${f.aciklama || '-'}</td></tr>
                    <tr style="border-top:2px solid var(--border);">
                        <td style="font-weight:700; font-size:15px; padding-top:10px;">TUTAR</td>
                        <td style="font-weight:700; font-size:20px; color:${turColor}; padding-top:10px;">${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar)}</td>
                    </tr>
                </tbody>
            </table>
            <div style="margin-top:16px; display:flex; gap:8px;">
                <button class="btn btn-outline" style="flex:1; color:var(--alert);" onclick="if(confirm('Bu fatura silinsin mi?')){deleteFatura(${f.id}); closeModal('modal-fatura-detail');}">
                    <i class="fa-solid fa-trash-can"></i> Sil
                </button>
            </div>
        </div>`;

    let modal = document.getElementById('modal-fatura-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-fatura-detail';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.classList.add('active');
    modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('active'); };
};

window.openFaturaModal = function() {
    const turSelect = document.getElementById('input-fatura-tur');
    const turContainer = turSelect?.closest('.form-group');
    if (turSelect) {
        turSelect.value = invoiceTabFilter; // Aktif sekmeye göre otomatik ayarla
    }
    if (turContainer) {
        turContainer.style.display = 'none'; // Tür seçiciyi gizle
    }
    // Modal başlığını güncelle
    const title = document.querySelector('#modal-fatura h3');
    if (title) {
        title.textContent = invoiceTabFilter === 'kesilen' ? 'Yeni Kesilen Fatura Ekle' : 'Yeni Alınan Fatura Ekle';
    }
    openModal('modal-fatura');
};

window.saveFatura = function() {
    try {
        const tur = document.getElementById('input-fatura-tur').value;
        const faturaNo = document.getElementById('input-fatura-no').value.trim();
        const firmaSelect = document.getElementById('input-fatura-firma');
        const firmaId = firmaSelect.value;
        const firma = firmaSelect.options[firmaSelect.selectedIndex]?.text || '';
        const aciklama = document.getElementById('input-fatura-aciklama').value.trim();
        const tutar = parseFloat(document.getElementById('input-fatura-tutar').value);

        if (!faturaNo) return alert('Fatura No zorunludur!');
        if (!firmaId) return alert('Firma seçimi zorunludur!');
        if (isNaN(tutar) || tutar <= 0) return alert('Geçerli bir tutar girin!');

        if (!db.faturalar) db.faturalar = [];
        db.faturalar.push({
            id: Date.now(),
            tur: tur,
            faturaNo: faturaNo,
            firma: firma,
            aciklama: aciklama,
            tutar: tutar,
            tarih: new Date().toLocaleDateString('tr-TR')
        });

        saveDB();
        closeModal('modal-fatura');
        renderInvoices();

        // Formu temizle
        document.getElementById('input-fatura-no').value = '';
        document.getElementById('input-fatura-firma').value = '';
        document.getElementById('input-fatura-aciklama').value = '';
        document.getElementById('input-fatura-tutar').value = '';

        alert('Fatura başarıyla kaydedildi.');
    } catch(e) {
        alert('Fatura kaydedilirken hata oluştu: ' + e.message);
    }
};

window.deleteFatura = function(id) {
    if (!confirm('Bu fatura kaydı silinsin mi?')) return;
    db.faturalar = (db.faturalar || []).filter(f => f.id !== id);
    saveDB();
    renderInvoices();
};

document.addEventListener('DOMContentLoaded', () => {
    try {
        addLog("Uygulama başlatıldı.");
        const hash = window.location.hash.substring(1) || 'dashboard';
        switchView(hash);
    } catch (e) {
        console.error("Initialization Error:", e);
    }
});
