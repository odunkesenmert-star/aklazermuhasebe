const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('./index.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", url: "http://localhost" });

// Mock localStorage
let storage = {};
Object.defineProperty(dom.window, 'localStorage', {
  value: {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => storage[k] = v,
    clear: () => storage = {}
  },
  configurable: true
});

// Mock alert
dom.window.alert = (msg) => console.log('ALERT:', msg);
dom.window.confirm = () => true;

// Load app.js code
const appCode = fs.readFileSync('./app.js', 'utf-8');
const script = dom.window.document.createElement("script");
script.textContent = appCode;
dom.window.document.body.appendChild(script);

setTimeout(() => {
    console.log("--- STARTING TESTS ---");
    let failures = 0;
    const assert = (condition, message) => {
        if (condition) {
            console.log("SAFE:", message);
        } else {
            failures++;
            console.log("BUG FOUND:", message);
        }
    };

    // Test 1: XSS via Customer Name
    console.log("Test 1: XSS Check");
    dom.window.document.getElementById('input-cari-adi').value = "<script>console.log('XSS_SUCCESS')</script><img src=x onerror=console.log('XSS_IMG')>";
    dom.window.document.getElementById('input-cari-tel').value = "123";
    dom.window.saveCari();
    
    // Force render
    dom.window.renderCariler();
    const tbody = dom.window.document.getElementById('accounts-tbody').innerHTML;
    if (tbody.includes("<script>") || tbody.includes("<img")) {
        failures++;
        console.log("VULNERABILITY FOUND: XSS is possible via innerHTML!");
    } else {
        console.log("SAFE: No XSS");
    }

    const maliciousCari = dom.window.eval('db.cariler[0]');
    maliciousCari.bakiye = 250;
    dom.window.eval(`db.cariler.push({ id: 100, kodu: 'C-NEG', adi: 'Borçlu Cari', tel: '555', bakiye: -50, durum: 'Biz Borçluyuz' })`);
    dom.window.openStatModal('alacak');
    const statBody = dom.window.document.getElementById('stat-detail-tbody').innerHTML;
    assert(!statBody.includes('<script>') && !statBody.includes('<img'), 'Dashboard detail escapes malicious customer fields.');
    assert(dom.window.eval('window.currentStatData.length === 1 && window.currentStatData[0].bakiye > 0'), 'Receivables detail lists positive customer balances, matching the dashboard total.');

    dom.window.openStatModal('borc');
    const debtStatBody = dom.window.document.getElementById('stat-detail-tbody').innerHTML;
    assert(!debtStatBody.includes('<script>') && !debtStatBody.includes('<img'), 'Dashboard payable detail escapes customer fields.');
    assert(dom.window.eval('window.currentStatData.length === 1 && window.currentStatData[0].bakiye < 0'), 'Payables detail lists negative customer balances, matching the dashboard total.');
    assert(dom.window.document.getElementById('stat-detail-summary-total').textContent.includes('50'), 'Payables detail summarizes the payable amount.');

    dom.window.eval(`db.isEmirleri = [{
        id: 202,
        orderNo: 'EMR-XSS',
        tarih: '<img src=x onerror=window.__xss=1>',
        customerName: '<img src=x onerror=window.__xss=1>',
        description: '<script>window.__xss=1</script>',
        total: 100,
        durum: '<img src=x onerror=window.__xss=1>',
        statusHistory: [{ date: '<img src=x>', status: '<script>window.__xss=1</script>' }]
    }]`);
    dom.window.openStatModal('teklif');
    dom.window.openOrderHistory(202);
    dom.window.renderOrders();
    const orderDetailHTML = dom.window.document.getElementById('stat-detail-tbody').innerHTML +
        dom.window.document.getElementById('history-tbody').innerHTML +
        dom.window.document.getElementById('orders-tbody').innerHTML;
    assert(!orderDetailHTML.includes('<script>') && !orderDetailHTML.includes('<img'), 'Dashboard, order list and order-history details escape imported work-order fields.');

    // Test 2: Crash via missing keys in DB
    console.log("Test 2: Corrupt DB Crash Check");
    let corruptDB = { ...JSON.parse(storage['AkLazerDB']) };
    delete corruptDB.islemler; // Remove critical array
    storage['AkLazerDB'] = JSON.stringify(corruptDB);
    
    try {
        dom.window.renderDashboard();
        console.log("SAFE: Dashboard handled corrupt DB gracefully.");
    } catch(e) {
        failures++;
        console.log("CRASH FOUND: Dashboard crashed on missing DB key:", e.message);
    }

    // Test 3: Accounting flow from order status to customer account
    console.log("Test 3: Work order balance reflection");
    const db = dom.window.eval('db');
    db.cariler = [{ id: 101, kodu: 'T-001', adi: 'Test Cari', tel: '555', bakiye: 0, durum: 'Temiz' }];
    db.islemler = [];
    db.isEmirleri = [{
        id: 201,
        orderNo: 'EMR-TEST',
        tarih: '20.06.2026',
        customerId: 101,
        customerName: 'Eski Test Cari Adı',
        description: 'Test iş emri',
        total: 1500,
        durum: 'Beklemede'
    }];
    dom.window.document.getElementById('input-order-id').value = '201';
    dom.window.document.getElementById('input-order-status').value = 'Teslim Edildi';
    dom.window.updateOrderStatus();
    assert(db.cariler[0].bakiye === 1500, "Delivered work order increases customer balance by ID, even if the stored name changed.");
    assert(db.isEmirleri[0].bakiyeCariyeYansitildi === true, "Work order is marked as reflected only after a real customer movement.");
    assert(db.islemler.some(i => i.orderId === 201 && i.cariId === 101), "Work order creates a linked customer transaction.");

    // Test 4: Manual customer invoice transaction updates balance
    console.log("Test 4: Manual invoice transaction balance");
    dom.window.document.getElementById('input-islem-cari-id').value = '101';
    dom.window.document.getElementById('input-islem-firma-adi').value = 'Test Cari';
    dom.window.document.getElementById('input-islem-tipi').value = 'fatura_kes';
    dom.window.document.getElementById('input-islem-fatura-no').value = 'FT-TEST';
    dom.window.document.getElementById('input-islem-tutar').value = '250';
    dom.window.saveIslem();
    assert(db.cariler[0].bakiye === 1750, "Manual 'Fatura Kesildi' increases the customer balance.");
    assert(db.faturalar.some(f => f.faturaNo === 'FT-TEST' && f.tur === 'kesilen'), "Manual customer invoice appears in the invoices module.");

    // Test 5: Collection helper shows and fills the customer's full debt
    console.log("Test 5: Tahsilat full amount helper");
    dom.window.openIslemModal(101, 'Test Cari');
    dom.window.document.getElementById('input-islem-tipi').value = 'tahsilat';
    dom.window.updateIslemTipiInfo();
    assert(dom.window.document.getElementById('tahsilat-summary').style.display === 'block', "Tahsilat summary is visible for customer collections.");
    assert(dom.window.document.getElementById('tahsilat-current-balance').textContent.includes('1.750,00'), "Tahsilat summary shows the customer's current debt.");
    dom.window.fillFullTahsilatAmount();
    assert(parseFloat(dom.window.document.getElementById('input-islem-tutar').value) === 1750, "Full collection button fills the entire customer debt.");
    assert(dom.window.document.getElementById('tahsilat-remaining-balance').textContent.includes('0,00'), "Full collection preview shows zero remaining debt.");

    // Test 6: Invoice module updates and reverses customer balance
    console.log("Test 6: Invoice module balance reflection");
    dom.window.renderCariler();
    dom.window.document.getElementById('input-fatura-tur').value = 'kesilen';
    dom.window.document.getElementById('input-fatura-no').value = 'FT-MODUL';
    dom.window.document.getElementById('input-fatura-firma').value = '101';
    dom.window.document.getElementById('input-fatura-aciklama').value = 'Modül testi';
    dom.window.document.getElementById('input-fatura-tutar').value = '100';
    dom.window.saveFatura();
    const fatura = db.faturalar.find(f => f.faturaNo === 'FT-MODUL');
    assert(db.cariler[0].bakiye === 1850, "Saved outgoing invoice increases the customer balance.");
    dom.window.deleteFatura(fatura.id);
    assert(db.cariler[0].bakiye === 1750, "Deleted outgoing invoice reverses its customer balance effect.");

    // Test 7: Invoice for an already delivered/reflected order must not double-charge
    console.log("Test 7: Delivered order invoice does not double-charge");
    db.cariler[0].bakiye = 6000;
    db.islemler = [];
    db.isEmirleri = [{
        id: 301,
        orderNo: 'EMR-6000',
        tarih: '20.06.2026',
        customerId: 101,
        customerName: 'Test Cari',
        description: 'Teslim edilmiş 6000 TL iş',
        total: 6000,
        durum: 'Teslim Edildi',
        bakiyeCariyeYansitildi: true
    }];
    dom.window.openIslemModal(101, 'Test Cari');
    dom.window.document.getElementById('input-islem-tipi').value = 'fatura_kes';
    dom.window.updateIslemTipiInfo();
    dom.window.document.getElementById('input-islem-order-id').value = '301';
    dom.window.applySelectedOrderToInvoice();
    assert(parseFloat(dom.window.document.getElementById('input-islem-tutar').value) === 6000, "Selecting a delivered order auto-fills the invoice amount.");
    dom.window.document.getElementById('input-islem-fatura-no').value = 'FT-6000';
    dom.window.saveIslem();
    assert(db.cariler[0].bakiye === 6000, "Invoice for an already reflected delivered order does not increase balance again.");
    assert(db.isEmirleri[0].faturaKesildi === true, "Linked delivered order is marked as invoiced.");
    const linkedInvoice = db.faturalar.find(f => f.faturaNo === 'FT-6000');
    assert(!!linkedInvoice, "Linked delivered order invoice appears in the invoices module.");
    assert(linkedInvoice.cariBakiyeDegisimi === 0, "Linked delivered order invoice records zero additional balance effect.");
    dom.window.printInvoiceDocument(linkedInvoice.id);
    const invoicePreview = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(invoicePreview.includes('Fatura Belgesi'), "Linked invoice can be printed as an in-app invoice document.");
    assert(invoicePreview.includes('FT-6000') && invoicePreview.includes('Test Cari'), "Invoice document shows invoice number and customer.");

    // Test 7b: Invoices module also links delivered orders without a duplicate debt
    console.log("Test 7b: Invoices module linked work-order flow");
    db.isEmirleri.push({
        id: 302,
        orderNo: 'EMR-MODUL-6000',
        tarih: '21.06.2026',
        customerId: 101,
        customerName: 'Test Cari',
        description: 'Faturalar modülü teslim işi',
        total: 6000,
        durum: 'Teslim Edildi',
        bakiyeCariyeYansitildi: true
    });
    dom.window.renderCariler();
    dom.window.document.getElementById('input-fatura-tur').value = 'kesilen';
    dom.window.document.getElementById('input-fatura-firma').value = '101';
    dom.window.populateInvoiceOrderOptions();
    dom.window.document.getElementById('input-fatura-order').value = '302';
    dom.window.applyInvoiceOrderSelection();
    assert(parseFloat(dom.window.document.getElementById('input-fatura-tutar').value) === 6000, "Invoices module fills the amount from the selected delivered work order.");
    assert(dom.window.document.getElementById('input-fatura-tutar').readOnly === true, "Linked work-order amount cannot be changed manually.");
    dom.window.document.getElementById('input-fatura-no').value = 'FT-MODUL-6000';
    dom.window.saveFatura();
    const moduleLinkedInvoice = db.faturalar.find(f => f.faturaNo === 'FT-MODUL-6000');
    assert(db.cariler[0].bakiye === 6000, "Invoices module does not add a delivered sale to the customer balance twice.");
    assert(moduleLinkedInvoice?.orderId === 302 && moduleLinkedInvoice?.cariBakiyeDegisimi === 0, "Invoices module stores the work-order link and zero additional balance effect.");
    assert(db.isEmirleri.find(o => o.id === 302)?.faturaKesildi === true, "Invoices module marks the selected work order as invoiced.");
    assert(invoicePreview.includes('Teslim edilmiş 6000 TL iş') && invoicePreview.includes('6.000,00'), "Invoice document includes the linked order description and total.");
    assert(invoicePreview.includes('Resmi e-Fatura/e-Arşiv'), "Invoice document makes the official e-invoice limitation clear.");

    // Test 8: Tax exempt quote keeps KDV at 0%
    console.log("Test 8: Tax exempt quote calculation");
    db.teklifler = [];
    dom.window.document.getElementById('quote-type').value = 'lazer';
    dom.window.document.getElementById('quote-customer').value = '101';
    dom.window.document.getElementById('quote-description').value = 'KDV muaf teklif';
    dom.window.document.getElementById('quote-minutes').value = '10';
    dom.window.document.getElementById('quote-rate').value = '100';
    dom.window.document.getElementById('quote-material').value = '0';
    dom.window.document.getElementById('quote-material-qty').value = '1';
    dom.window.document.getElementById('quote-discount').value = '0';
    dom.window.document.getElementById('quote-tax-rate').value = '0';
    dom.window.calculateQuote();
    assert(dom.window.document.getElementById('summary-tax').textContent.includes('0,00'), "Tax exempt quote shows zero KDV in the summary.");
    assert(dom.window.document.getElementById('summary-total').textContent.includes('1.000,00'), "Tax exempt quote total does not add 20% KDV.");
    dom.window.saveQuote();
    assert(db.teklifler[0].taxRate === 0, "Saved tax exempt quote keeps taxRate as 0 instead of falling back to 20.");

    console.log("Test 8a: Quote preview and saved amounts stay identical");
    db.stoklar = [{ id: 807, kodu: 'STK-HESAP', cinsi: 'Hesap Test Sacı', miktar: 10, kg: 100, maliyet: 100, sahibiTipi: 'biz' }];
    dom.window.document.getElementById('quote-type').value = 'lazer';
    dom.window.updateQuoteTypeUI();
    dom.window.document.getElementById('quote-customer').value = '101';
    dom.window.document.getElementById('quote-description').value = 'Ortak hesap motoru testi';
    dom.window.document.getElementById('quote-minutes').value = '1';
    dom.window.document.getElementById('quote-rate').value = '100';
    dom.window.document.getElementById('quote-material').innerHTML = '<option value="807">Hesap Test Sacı</option>';
    dom.window.document.getElementById('quote-material').value = '807';
    dom.window.document.getElementById('quote-material-qty').value = '';
    dom.window.document.getElementById('quote-discount').value = '0';
    dom.window.document.getElementById('quote-tax-rate').value = '0';
    dom.window.calculateQuote();
    const emptyMaterialQuote = dom.window.eval('getQuoteData()');
    assert(emptyMaterialQuote?.stokQty === 0 && emptyMaterialQuote?.materialCost === 0, "Empty material quantity is consistently treated as zero in preview and saved data.");
    assert(dom.window.document.getElementById('summary-total').textContent.includes('100,00') && emptyMaterialQuote?.total === 100, "Preview and saved total match when material quantity is empty.");

    dom.window.document.getElementById('quote-material').innerHTML = '<option value="0">Malzeme yok</option>';
    dom.window.document.getElementById('quote-material').value = '0';
    dom.window.document.getElementById('quote-rate').value = '100.03';
    dom.window.document.getElementById('quote-discount').value = '7';
    dom.window.document.getElementById('quote-tax-rate').value = '20';
    dom.window.calculateQuote();
    const roundedQuote = dom.window.eval('getQuoteData()');
    assert(roundedQuote?.total === 111.64 && dom.window.document.getElementById('summary-total').textContent.includes('111,64'), "Preview and saved total use the same cent rounding rules.");

    console.log("Test 8b: CNC plasma quote uses kilogram pricing");
    db.stoklar = [];
    dom.window.document.getElementById('quote-type').value = 'cnc_plazma';
    dom.window.updateQuoteTypeUI();
    dom.window.document.getElementById('quote-customer').value = '101';
    dom.window.document.getElementById('quote-description').value = 'CNC plazma kesim testi';
    dom.window.document.getElementById('quote-kg-amount').value = '125';
    dom.window.document.getElementById('quote-kg-price').value = '8';
    dom.window.document.getElementById('quote-material').value = '0';
    dom.window.document.getElementById('quote-material-qty').value = '0';
    dom.window.document.getElementById('quote-discount').value = '0';
    dom.window.document.getElementById('quote-tax-rate').value = '20';
    dom.window.calculateQuote();
    const plasmaQuote = dom.window.eval('getQuoteData()');
    assert(dom.window.document.getElementById('quote-lazer-fields').style.display === 'none', "CNC plasma hides minute pricing fields.");
    assert(dom.window.document.getElementById('quote-kg-fields').style.display === 'flex', "CNC plasma shows kilogram pricing fields.");
    assert(dom.window.document.getElementById('label-kg-amount').textContent.includes('Kesilecek Ağırlık'), "CNC plasma shows the correct weight label.");
    assert(dom.window.document.getElementById('quote-pricing-helper').hidden === false, "CNC plasma shows the kilogram pricing explanation.");
    assert(plasmaQuote?.islemTipi === 'cnc_plazma' && plasmaQuote.operationCost === 1000, "CNC plasma operation cost is calculated as weight multiplied by KG price.");
    assert(plasmaQuote?.total === 1200, "CNC plasma quote adds the selected KDV to KG-based pricing.");
    dom.window.printCurrentQuote();
    const plasmaPrint = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(plasmaPrint.includes('CNC Plazma') && plasmaPrint.includes('125 KG'), "CNC plasma print preview keeps the operation type and KG calculation.");
    dom.window.approveQuoteAsOrder();
    const plasmaOrder = db.isEmirleri.find(o => o.description === 'CNC plazma kesim testi');
    assert(plasmaOrder?.islemTipi === 'cnc_plazma' && plasmaOrder.kgAmount === 125, "CNC plasma pricing data is preserved in the work order.");

    db.stoklar = [{ id: 808, kodu: 'STK-KG', cinsi: 'Hammadde Sac', miktar: 5, kg: 500, maliyet: 0, sahibiTipi: 'biz' }];
    dom.window.document.getElementById('quote-type').value = 'hammadde';
    dom.window.updateQuoteTypeUI();
    dom.window.document.getElementById('quote-customer').value = '101';
    dom.window.document.getElementById('quote-description').value = 'KG hammadde satışı';
    dom.window.document.getElementById('quote-kg-amount').value = '100';
    dom.window.document.getElementById('quote-kg-price').value = '50';
    dom.window.document.getElementById('quote-material').innerHTML = '<option value="808">Hammadde Sac</option>';
    dom.window.document.getElementById('quote-material').value = '808';
    dom.window.document.getElementById('quote-material-qty').value = '0';
    dom.window.document.getElementById('quote-discount').value = '0';
    dom.window.document.getElementById('quote-tax-rate').value = '20';
    const rawMaterialQuote = dom.window.eval('getQuoteData()');
    assert(!!rawMaterialQuote && rawMaterialQuote.total === 6000, "Raw material quote validates and calculates against stock KG, not plate count.");
    dom.window.approveQuoteAsOrder();
    const rawMaterialOrder = db.isEmirleri.find(o => o.description === 'KG hammadde satışı');
    dom.window.document.getElementById('input-order-id').value = String(rawMaterialOrder.id);
    dom.window.document.getElementById('input-order-status').value = 'Teslim Edildi';
    dom.window.updateOrderStatus();
    assert(db.stoklar[0].kg === 400 && db.stoklar[0].miktar === 5, "Delivered raw material order deducts KG without changing plate count.");

    // Test 9: Legacy tahsilat records with time are still treated as income in dashboard summaries
    console.log("Test 9: Dashboard legacy tahsilat date parsing");
    db.islemler = [{ id: 9001, tarih: '20.06.2026 13:57', firma: 'Legacy Cari', tip: 'Tahsilat', tutar: 12345, isSuccess: true }];
    db.giderler = [];
    dom.window.eval('isStatsVisible = true; renderDashboard();');
    assert(dom.window.document.getElementById('chart-income-total').textContent.includes('12.345,00'), "Dashboard counts legacy tahsilat with date/time as income.");

    // Test 10: Printing a list with a selected row should preview only selected rows
    console.log("Test 10: Print selected row preview");
    db.cariler = [
        { id: 101, kodu: 'T-001', adi: 'Test Cari', tel: '555', bakiye: 0, durum: 'Temiz' },
        { id: 102, kodu: 'T-002', adi: 'Diger Cari', tel: '444', bakiye: 100, durum: 'Müşteri Borçlu' }
    ];
    dom.window.renderCariler();
    dom.window.toggleReportSelection('accounts', '102', true);
    dom.window.printList('accounts');
    const previewFrame = dom.window.document.querySelector('.print-preview-frame');
    const previewText = previewFrame?.srcdoc || '';
    assert(previewText.includes('Diger Cari'), "Print preview includes the selected customer.");
    assert(!previewText.includes('Test Cari'), "Print preview excludes unselected customers when a row is selected.");
    assert(previewText.includes('Kapsam: Seçilen kayıtlar'), "Print preview labels the scope as selected records.");

    // Test 11: A single selected account prints a dated sales statement, not one merged balance row
    console.log("Test 11: Selected account statement itemizes dated sales");
    dom.window.clearReportSelection('accounts');
    db.cariler = [
        { id: 501, kodu: 'C-005', adi: 'AK TARIM', tel: '-', bakiye: 20472, durum: 'Müşteri Borçlu' }
    ];
    db.isEmirleri = [
        {
            id: 601,
            orderNo: 'EMR-13000',
            tarih: '20.06.2026',
            customerId: 501,
            customerName: 'AK TARIM',
            description: 'İlk kesim işi',
            subTotalBeforeDiscount: 11416.67,
            discountAmount: 0,
            subTotal: 11416.67,
            taxRate: 20,
            tax: 2283.33,
            total: 13700,
            durum: 'Teslim Edildi',
            bakiyeCariyeYansitildi: true
        },
        {
            id: 602,
            orderNo: 'EMR-14272',
            tarih: '21.06.2026',
            customerId: 501,
            customerName: 'AK TARIM',
            description: 'İkinci kesim işi',
            subTotalBeforeDiscount: 12893.33,
            discountPercent: 7.76,
            discountAmount: 1000,
            subTotal: 11893.33,
            taxRate: 20,
            tax: 2378.67,
            total: 14272,
            durum: 'Teslim Edildi',
            bakiyeCariyeYansitildi: true
        }
    ];
    db.faturalar = [];
    db.islemler = [
        {
            id: 701,
            tarih: '22.06.2026 10:15',
            cariId: 501,
            firma: 'AK TARIM',
            tip: 'Tahsilat (Gelen)',
            aciklama: 'Banka havalesi',
            tutar: 5000,
            isGelir: true,
            isSuccess: true
        },
        {
            id: 702,
            tarih: '23.06.2026 14:30',
            cariId: 501,
            firma: 'AK TARIM',
            tip: 'Tahsilat (Gelen)',
            aciklama: 'EFT ödemesi',
            tutar: 2500,
            isGelir: true,
            isSuccess: true
        }
    ];
    dom.window.renderCariler();
    dom.window.toggleReportSelection('accounts', '501', true);
    dom.window.printList('accounts');
    const statementFrame = dom.window.document.querySelector('.print-preview-frame');
    const statementText = statementFrame?.srcdoc || '';
    assert(statementText.includes('Cari Hesap Ekstresi'), "Selected account print uses a detailed account statement.");
    assert(statementText.includes('size: A4 portrait') && statementText.includes('table-header-group'), "Detailed account statement uses the portrait multi-page print profile.");
    assert(statementText.includes('İlk kesim işi') && statementText.includes('İkinci kesim işi'), "Statement keeps the work descriptions separate.");
    assert(statementText.includes('Tahsilat / Ödeme') && statementText.includes('Kalan Bakiye'), "Statement prints a single chronological ledger with running balance.");
    assert(!statementText.includes('Belge / İş Emri'), "Statement removes the extra document/work-order column.");
    assert(!statementText.includes('<div class=\"label\">Durum</div>') && !statementText.includes('<strong>Alacaklı</strong>'), "Statement removes the extra status box.");
    assert(statementText.includes('KDV Oranı') && statementText.includes('%20'), "Statement shows the VAT rate.");
    assert(!statementText.includes('KDV %20:') && !statementText.includes('Ekstre Bilgisi'), "Statement keeps row VAT details rate-only and removes the explanatory note.");
    assert(statementText.includes('İskonto Oranı') && statementText.includes('%7,76'), "Statement shows the discount rate.");
    assert(statementText.includes('İskonto Toplamı') && statementText.includes('1.000,00'), "Statement summarizes discount totals.");
    assert(statementText.includes('Genel Toplam') && statementText.includes('27.972,00'), "Statement summarizes the total amount.");
    assert(statementText.includes('22.06.2026 10:15') && statementText.includes('Banka havalesi'), "Statement prints dated collection rows in the ledger.");
    assert(statementText.includes('EFT ödemesi') && statementText.includes('7.500,00') && statementText.includes('20.472,00'), "Statement summarizes customer collections and remaining balance from the printed rows.");

    dom.window.document.getElementById('account-print-date-start').value = '2026-06-22';
    dom.window.document.getElementById('account-print-date-end').value = '2026-06-23';
    dom.window.printList('accounts');
    const rangedStatementText = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(rangedStatementText.includes('Aralık: 22.06.2026 - 23.06.2026'), "Statement labels the selected date range.");
    assert(rangedStatementText.includes('Seçilen tarih öncesi bakiye') && rangedStatementText.includes('27.972,00'), "Statement carries previous sales into the opening balance.");
    assert(!rangedStatementText.includes('İlk kesim işi') && !rangedStatementText.includes('İkinci kesim işi'), "Statement hides sales outside the selected date range.");
    assert(rangedStatementText.includes('Banka havalesi') && rangedStatementText.includes('EFT ödemesi'), "Statement keeps collections inside the selected date range.");
    assert(rangedStatementText.includes('Dönem Sonu Bakiye') && rangedStatementText.includes('20.472,00'), "Statement shows the closing balance for the selected period.");
    dom.window.document.getElementById('account-print-date-start').value = '';
    dom.window.document.getElementById('account-print-date-end').value = '';

    // Test 12: A single selected work order also prints the detailed financial document
    console.log("Test 12: Selected work order print uses detailed financial document");
    dom.window.clearReportSelection('orders');
    dom.window.renderOrders();
    dom.window.toggleReportSelection('orders', '602', true);
    dom.window.printList('orders');
    const orderFrame = dom.window.document.querySelector('.print-preview-frame');
    const orderText = orderFrame?.srcdoc || '';
    assert(orderText.includes('İş Emri Dökümü'), "Selected work order print opens the detailed work-order document.");
    assert(orderText.includes('İkinci kesim işi'), "Work-order document includes the selected work description.");
    assert(orderText.includes('İsk. Oranı') && orderText.includes('İskonto Oranı') && orderText.includes('%7,76'), "Work-order document shows the discount rate.");
    assert(orderText.includes('KDV Oranı') && orderText.includes('%20'), "Work-order document shows the VAT rate.");
    assert(orderText.includes('Genel Toplam') && orderText.includes('14.272,00'), "Work-order document summarizes the selected order total.");
    assert(!orderText.includes('<th>Durum</th>'), "Work-order document does not fall back to the generic status list.");

    // Test 13: Report date filters affect generic lists and print previews
    console.log("Test 13: Generic report date filter");
    dom.window.clearReportSelection('expenses');
    db.giderler = [
        { id: 801, tarih: '01.05.2026', kategori: 'Diğer', aciklama: 'Eski dönem gideri', tutar: 1000 },
        { id: 802, tarih: '22.06.2026', kategori: 'Elektrik', aciklama: 'Haziran elektrik gideri', tutar: 2500 }
    ];
    dom.window.document.getElementById('report-date-expenses-start').value = '2026-06-01';
    dom.window.document.getElementById('report-date-expenses-end').value = '2026-06-30';
    dom.window.applyReportDateFilter('expenses');
    dom.window.printList('expenses');
    const expenseText = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(expenseText.includes('Aralık: 01.06.2026 - 30.06.2026'), "Generic report print labels the selected date range.");
    assert(expenseText.includes('Haziran elektrik gideri'), "Generic report print includes records inside the selected date range.");
    assert(!expenseText.includes('Eski dönem gideri'), "Generic report print excludes records outside the selected date range.");
    dom.window.clearReportDateRange('expenses');

    // Test 14: Personnel payroll records feed payroll reports and expenses
    console.log("Test 14: Personnel payroll tracking");
    db.personeller = [];
    db.personelPuantajlari = [];
    db.giderler = [];
    dom.window.document.getElementById('input-personel-ad').value = 'Mehmet Usta';
    dom.window.document.getElementById('input-personel-tel').value = '0555 111 2233';
    dom.window.document.getElementById('input-personel-gorev').value = 'Operatör';
    dom.window.document.getElementById('input-personel-maas-tipi').value = 'aylik';
    dom.window.document.getElementById('input-personel-maas').value = '30000';
    dom.window.document.getElementById('input-personel-giris').value = '2026-06-01';
    dom.window.document.getElementById('input-personel-durum').value = 'Aktif';
    dom.window.savePersonel();
    const personel = db.personeller.find(p => p.ad === 'Mehmet Usta');
    assert(!!personel, "Personnel card can be saved.");
    dom.window.openPayrollModal('', personel.id);
    dom.window.document.getElementById('input-puantaj-ay').value = '2026-06';
    dom.window.document.getElementById('input-puantaj-gun').value = '24';
    dom.window.document.getElementById('input-puantaj-izin').value = '1';
    dom.window.document.getElementById('input-puantaj-eksik').value = '2';
    dom.window.document.getElementById('input-puantaj-mesai-saat').value = '5';
    dom.window.document.getElementById('input-puantaj-mesai-ucret').value = '250';
    dom.window.document.getElementById('input-puantaj-avans').value = '1000';
    dom.window.document.getElementById('input-puantaj-prim').value = '500';
    dom.window.document.getElementById('input-puantaj-odendi').checked = true;
    dom.window.togglePayrollPaymentAccount();
    dom.window.document.getElementById('input-puantaj-kasa').value = '1';
    dom.window.savePuantaj();
    const payroll = db.personelPuantajlari.find(p => p.personelId === personel.id);
    assert(!!payroll && payroll.netMaas === 28750, "Payroll calculates missing-day deduction, overtime, bonus and advance.");
    assert(db.giderler.some(g => g.kaynak === 'personel-maas' && g.tutar === 28750), "Paid payroll is automatically added to expenses.");
    assert(db.kasaHareketleri.some(h => h.kaynak === 'personel-maas' && h.tip === 'cikis' && h.tutar === 28750), "Paid payroll creates a linked cash/bank movement.");
    const payrollCountBeforeInvalid = db.personelPuantajlari.length;
    dom.window.openPayrollModal('', personel.id);
    dom.window.document.getElementById('input-puantaj-ay').value = '2026-07';
    dom.window.document.getElementById('input-puantaj-gun').value = '-1';
    dom.window.savePuantaj();
    assert(db.personelPuantajlari.length === payrollCountBeforeInvalid, "Negative payroll day values are rejected.");
    dom.window.setPersonnelTab('payroll');
    dom.window.renderPersonnel();
    dom.window.toggleReportSelection('personnel', `payroll-${payroll.id}`, true);
    dom.window.printList('personnel');
    const payrollText = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(payrollText.includes('Personel Maaş Bordrosu') && payrollText.includes('Mehmet Usta'), "Selected payroll record opens a payroll statement.");
    assert(payrollText.includes('Personel<br>Ad Soyad / İmza') && payrollText.includes('İşveren Yetkilisi'), "Payroll statement includes employee and employer signature fields.");

    // Test 15: Customer-owned consignment stock must never carry our material cost
    console.log("Test 15: Consignment stock cost guard");
    db.cariler = [{ id: 901, kodu: 'C-901', adi: 'Emanet Test Cari', tel: '0555', bakiye: 0, durum: 'Temiz' }];
    db.stoklar = [];
    dom.window.renderCariler();
    dom.window.document.getElementById('input-stok-sahibi').value = 'musteri';
    dom.window.toggleStokCariSelect();
    dom.window.document.getElementById('input-stok-cari').value = '901';
    dom.window.document.getElementById('input-stok-cinsi').value = 'Emanet Paslanmaz';
    dom.window.document.getElementById('input-stok-mm').value = '3';
    dom.window.document.getElementById('input-stok-miktar').value = '2';
    dom.window.document.getElementById('input-stok-kg').value = '50';
    dom.window.document.getElementById('input-stok-en').value = '1000';
    dom.window.document.getElementById('input-stok-boy').value = '2000';
    dom.window.document.getElementById('input-stok-maliyet').value = '777';
    dom.window.saveStok();
    const consignmentStock = db.stoklar.find(s => s.cinsi === 'Emanet Paslanmaz');
    assert(!!consignmentStock && consignmentStock.sahibiTipi === 'musteri' && consignmentStock.maliyet === 0, "Customer-owned consignment stock is forced to zero material cost.");

    // Test 16: Cheque/promissory note tracking only affects accounts when settled
    console.log("Test 16: Cheque and promissory note tracking");
    db.cariler = [{ id: 1001, kodu: 'C-1001', adi: 'Çek Test Cari', tel: '555', bakiye: 10000, durum: 'Müşteri Borçlu' }];
    db.cekSenetler = [];
    db.islemler = [];
    dom.window.renderCariler();
    dom.window.openCekSenetModal();
    dom.window.document.getElementById('input-ceksenet-tip').value = 'alinan_cek';
    dom.window.updateCekSenetStatusOptions();
    dom.window.document.getElementById('input-ceksenet-cari').value = '1001';
    dom.window.document.getElementById('input-ceksenet-no').value = 'CEK-TEST';
    dom.window.document.getElementById('input-ceksenet-banka').value = 'Test Bankası';
    dom.window.document.getElementById('input-ceksenet-vade').value = '2026-06-30';
    dom.window.document.getElementById('input-ceksenet-tutar').value = '4000';
    dom.window.document.getElementById('input-ceksenet-durum').value = 'beklemede';
    dom.window.saveCekSenet();
    const cheque = db.cekSenetler.find(c => c.belgeNo === 'CEK-TEST');
    assert(!!cheque && db.cariler[0].bakiye === 10000, "Pending received cheque is tracked without closing the customer balance.");
    dom.window.updateCekSenetStatus(cheque.id, 'tahsil_edildi');
    dom.window.document.getElementById('input-settlement-kasa').value = '1';
    dom.window.confirmSettlement();
    assert(db.cariler[0].bakiye === 6000, "Settled received cheque decreases the customer balance.");
    assert(db.islemler.some(i => i.tip.includes('Alınan Çek') && i.bakiyeDegisimi === -4000), "Settled cheque creates a linked customer movement.");
    assert(db.kasaHareketleri.some(h => h.kaynak === 'cek-senet' && h.tip === 'giris' && h.tutar === 4000), "Settled cheque creates a linked cash/bank movement.");
    dom.window.updateCekSenetStatus(cheque.id, 'iptal');
    assert(db.cariler[0].bakiye === 10000, "Cancelling a previously settled cheque reverses its customer effect.");
    dom.window.renderCekSenetler();
    dom.window.toggleReportSelection('cheques', String(cheque.id), true);
    dom.window.printList('cheques');
    const chequePrintText = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(chequePrintText.includes('Çek / Senet Takibi') && chequePrintText.includes('CEK-TEST'), "Cheque/senet list can be printed with selected records.");

    // Test 17: Duplicate invoice numbers must not create a second balance movement
    console.log("Test 17: Duplicate invoice number guard");
    db.cariler = [{ id: 1101, kodu: 'C-1101', adi: 'Mükerrer Test Cari', tel: '555', bakiye: 0, durum: 'Temiz' }];
    db.faturalar = [];
    db.islemler = [];
    db.isEmirleri = [];
    dom.window.renderCariler();
    const saveDuplicateInvoiceAttempt = () => {
        dom.window.document.getElementById('input-islem-cari-id').value = '1101';
        dom.window.document.getElementById('input-islem-firma-adi').value = 'Mükerrer Test Cari';
        dom.window.document.getElementById('input-islem-tipi').value = 'fatura_kes';
        dom.window.document.getElementById('input-islem-fatura-no').value = 'FTR-DUP-001';
        dom.window.document.getElementById('input-islem-tutar').value = '100';
        dom.window.saveIslem();
    };
    saveDuplicateInvoiceAttempt();
    saveDuplicateInvoiceAttempt();
    assert(db.faturalar.length === 1, "Duplicate invoice number is rejected before creating a second invoice.");
    assert(db.cariler[0].bakiye === 100 && db.islemler.length === 1, "Rejected duplicate invoice does not change the customer balance.");

    // Test 18: Negative stock and invalid quote totals are rejected
    console.log("Test 18: Negative amount and discount guards");
    db.stoklar = [];
    db.stokHareketleri = [];
    dom.window.document.getElementById('input-stok-sahibi').value = 'biz';
    dom.window.document.getElementById('input-stok-cinsi').value = 'Negatif Test Sac';
    dom.window.document.getElementById('input-stok-miktar').value = '-1';
    dom.window.document.getElementById('input-stok-kg').value = '-10';
    dom.window.document.getElementById('input-stok-en').value = '1000';
    dom.window.document.getElementById('input-stok-boy').value = '2000';
    dom.window.document.getElementById('input-stok-maliyet').value = '-50';
    dom.window.document.getElementById('input-stok-kritik').value = '-2';
    dom.window.saveStok();
    assert(db.stoklar.length === 0, "Negative stock quantity, weight and cost cannot be saved.");

    db.teklifler = [];
    dom.window.document.getElementById('quote-type').value = 'lazer';
    dom.window.document.getElementById('quote-customer').value = '1101';
    dom.window.document.getElementById('quote-description').value = 'Geçersiz teklif';
    dom.window.document.getElementById('quote-minutes').value = '-10';
    dom.window.document.getElementById('quote-rate').value = '100';
    dom.window.document.getElementById('quote-material').innerHTML = '<option value="0">Malzeme yok</option>';
    dom.window.document.getElementById('quote-material').value = '0';
    dom.window.document.getElementById('quote-material-qty').value = '0';
    dom.window.document.getElementById('quote-discount').value = '0';
    dom.window.document.getElementById('quote-tax-rate').value = '20';
    dom.window.saveQuote();
    assert(db.teklifler.length === 0, "Quote with a negative duration cannot be saved.");
    dom.window.document.getElementById('quote-minutes').value = '10';
    dom.window.document.getElementById('quote-discount').value = '150';
    dom.window.saveQuote();
    assert(db.teklifler.length === 0, "Quote with discount above 100 percent cannot be saved.");

    // Test 19: Duplicate cheque numbers and linked-record deletion are blocked
    console.log("Test 19: Duplicate cheque and deletion integrity guards");
    db.cekSenetler = [];
    dom.window.openCekSenetModal();
    const saveDuplicateChequeAttempt = () => {
        dom.window.document.getElementById('input-ceksenet-tip').value = 'alinan_cek';
        dom.window.updateCekSenetStatusOptions();
        dom.window.document.getElementById('input-ceksenet-cari').value = '1101';
        dom.window.document.getElementById('input-ceksenet-no').value = 'CEK-DUP-001';
        dom.window.document.getElementById('input-ceksenet-vade').value = '2026-07-30';
        dom.window.document.getElementById('input-ceksenet-tutar').value = '500';
        dom.window.document.getElementById('input-ceksenet-durum').value = 'beklemede';
        dom.window.saveCekSenet();
    };
    saveDuplicateChequeAttempt();
    saveDuplicateChequeAttempt();
    assert(db.cekSenetler.length === 1, "Duplicate cheque/promissory note number is rejected.");

    db.cariler = [{ id: 1301, kodu: 'C-1301', adi: 'Bağlı Cari', tel: '', bakiye: 0, durum: 'Temiz' }];
    db.faturalar = [{ id: 1302, faturaNo: 'FTR-LINK', cariId: 1301, firma: 'Bağlı Cari', tutar: 100 }];
    db.islemler = [];
    db.isEmirleri = [];
    db.teklifler = [];
    db.cekSenetler = [];
    db.odemePlanlari = [];
    db.stoklar = [];
    dom.window.deleteCari(1301);
    assert(db.cariler.some(c => c.id === 1301), "Customer with linked invoices cannot be deleted and orphan records are prevented.");

    db.stoklar = [{ id: 1401, kodu: 'STK-1401', cinsi: 'Bağlı Stok', miktar: 5, kg: 100, maliyet: 50 }];
    db.isEmirleri = [{ id: 1402, orderNo: 'EMR-1402', stokId: '1401', durum: 'Teslim Edildi' }];
    dom.window.deleteStok(1401);
    assert(db.stoklar.some(s => s.id === 1401), "Stock referenced by a work order cannot be deleted.");

    // Test 20: Imported numeric strings are normalized before accounting arithmetic
    console.log("Test 20: Backup numeric normalization");
    const normalizedBackup = dom.window.eval(`validateAndNormalizeDB(${JSON.stringify({
        cariler: [{ id: '1501', adi: 'Yedek Cari', bakiye: '100' }],
        teklifler: [{ id: 1502, total: '120' }]
    })})`);
    assert(typeof normalizedBackup.cariler[0].bakiye === 'number' && normalizedBackup.cariler[0].bakiye === 100, "Imported string balance is converted to a number.");
    assert(normalizedBackup.teklifler[0].taxRate === undefined, "Missing legacy tax rate stays unset so the existing 20 percent fallback remains available.");
    const emptyBackup = dom.window.eval(`validateAndNormalizeDB(${JSON.stringify({ schemaVersion: 3, cariler: [], stoklar: [], islemler: [], personeller: [], ayarlar: { firmaAdi: 'Boş Firma' } })}, true)`);
    assert(emptyBackup.ayarlar.firmaAdi === 'Boş Firma', "A valid empty or sparse AK LAZER backup can be restored.");
    const sparseNumberingBackup = dom.window.eval(`validateAndNormalizeDB(${JSON.stringify({
        schemaVersion: 3,
        cariler: [{ id: 1503, kodu: 'C-001', adi: 'Numara Test Cari', bakiye: 0 }],
        teklifler: [{ id: 1504, teklifNo: `TEK-${new Date().getFullYear()}-0007`, total: 100 }]
    })}, true)`);
    assert(sparseNumberingBackup.ayarlar.numaralandirma.cari.next === 2, "Sparse backups continue customer numbering after the highest existing serial.");
    assert(sparseNumberingBackup.ayarlar.numaralandirma.teklif.next === 8, "Sparse backups continue current-year quote numbering without duplicates.");
    let invalidNumericRejected = false;
    try {
        dom.window.eval(`validateAndNormalizeDB(${JSON.stringify({ schemaVersion: 3, cariler: [{ id: 1505, adi: 'Bozuk Tutar', bakiye: 'bozuk' }] })}, true)`);
    } catch (_) {
        invalidNumericRejected = true;
    }
    assert(invalidNumericRejected, "Backups with invalid numeric accounting values are rejected instead of silently becoming zero.");
    let duplicateIdRejected = false;
    try {
        dom.window.eval(`validateAndNormalizeDB(${JSON.stringify({ schemaVersion: 3, cariler: [{ id: 1506, adi: 'Birinci' }, { id: 1506, adi: 'İkinci' }] })}, true)`);
    } catch (_) {
        duplicateIdRejected = true;
    }
    assert(duplicateIdRejected, "Backups with duplicate record identifiers are rejected.");
    let maliciousIdRejected = false;
    try {
        dom.window.eval(`validateAndNormalizeDB(${JSON.stringify({ schemaVersion: 3, cariler: [{ id: '1);window.__xss=1;//', adi: 'Kötü Kimlik' }] })}, true)`);
    } catch (_) {
        maliciousIdRejected = true;
    }
    assert(maliciousIdRejected, "Backup records with executable identifiers are rejected.");
    assert(dom.window.eval(`csvCell('=HYPERLINK("https://example.com")')`).includes("'=HYPERLINK"), "Spreadsheet exports neutralize formula-like user input.");
    db.islemler = [];
    dom.window.__normalizedTestCari = normalizedBackup.cariler[0];
    dom.window.eval("addCariMovement(window.__normalizedTestCari, { tip: 'Test', tutar: 50, bakiyeDegisimi: 50 })");
    assert(dom.window.__normalizedTestCari.bakiye === 150, "Accounting adds to a normalized imported balance instead of concatenating text.");

    // Test 21: Paid payment plans reverse both customer and cash effects when deleted
    console.log("Test 21: Payment plan settlement and reversal");
    db.cariler = [{ id: 1601, kodu: 'C-1601', adi: 'Vade Test Cari', tel: '', bakiye: 500, durum: 'Müşteri Borçlu' }];
    db.odemePlanlari = [];
    db.islemler = [];
    db.kasaHesaplari = [{ id: 1602, kodu: 'KASA-TEST', ad: 'Test Kasa', tip: 'nakit', bakiye: 0 }];
    db.kasaHareketleri = [];
    dom.window.openPaymentPlanModal('1601');
    dom.window.document.getElementById('input-plan-tip').value = 'tahsilat';
    dom.window.document.getElementById('input-plan-vade').value = '2026-07-15';
    dom.window.document.getElementById('input-plan-tutar').value = '200';
    dom.window.document.getElementById('input-plan-kasa').value = '1602';
    dom.window.savePaymentPlan();
    const plan = db.odemePlanlari[0];
    dom.window.markPaymentPlanPaid(plan.id, '1602');
    assert(db.cariler[0].bakiye === 300 && db.kasaHesaplari[0].bakiye === 200, "Paid collection plan updates customer and cash balances together.");
    dom.window.deletePaymentPlan(plan.id);
    assert(db.cariler[0].bakiye === 500 && db.kasaHesaplari[0].bakiye === 0, "Deleting a paid plan creates reversal entries for customer and cash balances.");
    assert(db.kasaHareketleri.length === 2 && db.islemler.length === 2, "Payment plan reversal keeps an auditable pair of original and reversal movements.");

    // Test 22: Profitability uses net sales, preserves material ownership and stays internal
    console.log("Test 22: Work order profitability and document privacy");
    db.ayarlar.karlilik = { makineDakikaMaliyeti: 10, iscilikSaatMaliyeti: 100 };
    db.stoklar = [{
        id: 1701,
        kodu: 'STK-1701',
        cinsi: 'Karlilik Test Saci',
        miktar: 10,
        kg: 1000,
        maliyet: 1000,
        sahibiTipi: 'biz'
    }];
    db.isEmirleri = [{
        id: 1702,
        orderNo: 'EMR-KAR-001',
        tarih: '16.07.2026',
        customerId: 1601,
        customerName: 'Karlilik Test Cari',
        description: 'Karlilik test isi',
        islemTipi: 'lazer',
        stokId: 1701,
        stokQty: 1,
        minutes: 60,
        subTotal: 5000,
        tax: 1000,
        total: 6000,
        durum: 'Teslim Edildi'
    }];
    dom.window.__profitOrder = db.isEmirleri[0];
    const profitability = dom.window.eval(`calculateOrderProfitability(window.__profitOrder, {
        costLaborHours: 2,
        costExternal: 100,
        costShipping: 50,
        costOther: 50,
        costScrapRecovery: 100
    })`);
    assert(profitability.profitNetRevenue === 5000, "Profitability excludes KDV from net sales revenue.");
    assert(profitability.costMaterial === 1000 && profitability.costMachine === 600 && profitability.costLabor === 200, "Material, machine and labor costs use their configured bases.");
    assert(profitability.costTotal === 1900 && profitability.grossProfit === 3100 && profitability.profitMargin === 62, "Total cost, gross profit and margin are calculated consistently.");

    db.stoklar[0].sahibiTipi = 'musteri';
    const customerMaterialCost = dom.window.eval('calculateMaterialCostForOrder(window.__profitOrder)');
    assert(customerMaterialCost === 0, "Customer-owned material never creates an internal material cost.");
    db.stoklar[0].sahibiTipi = 'biz';

    dom.window.openOrderProfitability(1702);
    dom.window.document.getElementById('input-profit-labor-hours').value = '2';
    dom.window.document.getElementById('input-profit-external').value = '100';
    dom.window.document.getElementById('input-profit-shipping').value = '50';
    dom.window.document.getElementById('input-profit-other').value = '50';
    dom.window.document.getElementById('input-profit-scrap').value = '100';
    dom.window.saveOrderProfitability();
    assert(db.isEmirleri[0].costStatus === 'Kesin' && db.isEmirleri[0].grossProfit === 3100, "Finalized work order cost is saved with a fixed profitability snapshot.");

    dom.window.document.getElementById('profitability-status-filter').value = 'all';
    dom.window.renderProfitability();
    dom.window.printList('profitability');
    const profitabilityPrint = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(profitabilityPrint.includes('Şirket İçi İş Emri Kârlılık Raporu') && profitabilityPrint.includes('Brüt Kâr'), "Internal profitability report includes cost and profit columns.");
    assert(profitabilityPrint.includes('Net Satış') && profitabilityPrint.includes('Ortalama Kâr Marjı'), "Profitability print includes the management summary cards.");
    assert(profitabilityPrint.includes('size: A4 landscape') && dom.window.document.getElementById('print-preview-overlay')?.dataset.orientation === 'landscape', "Wide profitability report opens in landscape A4 preview.");

    dom.window.printOrderStatement(1702);
    const customerOrderPrint = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(!customerOrderPrint.includes('Brüt Kâr') && !customerOrderPrint.includes('Kâr Marjı') && !customerOrderPrint.includes('Toplam Maliyet'), "Customer-facing work order print hides internal profitability data.");
    dom.window.printQuoteDocument(db.isEmirleri[0]);
    const customerQuotePrint = dom.window.document.querySelector('.print-preview-frame')?.srcdoc || '';
    assert(!customerQuotePrint.includes('Brüt Kâr') && !customerQuotePrint.includes('Kâr Marjı') && !customerQuotePrint.includes('Toplam Maliyet'), "Customer-facing quote print hides internal profitability data.");
    assert(customerQuotePrint.includes('Fiyat Teklifi') && customerQuotePrint.includes('15 gün geçerlidir'), "Customer-facing quote print uses the requested title and validity statement.");
    assert(!customerQuotePrint.includes('Teklif No: Taslak') && !customerQuotePrint.includes('Ad Soyad'), "Draft quote print hides the empty document number and name-surname prompts.");
    assert(!customerQuotePrint.includes('Hazırlayan / İmza') && !customerQuotePrint.includes('Müşteri Onayı / İmza'), "Quote print does not include signature fields.");
    assert(!customerQuotePrint.includes('Teklif Toplamı') && !customerQuotePrint.includes('İşin Kapsamı'), "Quote print keeps the top section minimal.");
    assert(customerQuotePrint.includes('Genel Toplam') && customerQuotePrint.includes('Banka ve IBAN bilgileri'), "Quote print keeps the standard total and empty bank detail fields.");

    // Test 23: Approve button saves the quote and creates one linked work order atomically
    console.log("Test 23: Auto-save quote while creating work order");
    db.teklifler = [];
    db.isEmirleri = [];
    dom.window.document.getElementById('quote-type').value = 'lazer';
    dom.window.document.getElementById('quote-customer').innerHTML = '<option value="1601">Vade Test Cari</option>';
    dom.window.document.getElementById('quote-customer').value = '1601';
    dom.window.document.getElementById('quote-material').innerHTML = '<option value="1701">Karlilik Test Saci</option>';
    dom.window.document.getElementById('quote-material').value = '1701';
    dom.window.document.getElementById('quote-material-qty').value = '1';
    dom.window.document.getElementById('quote-description').value = 'Otomatik kayit testi';
    dom.window.document.getElementById('quote-minutes').value = '30';
    dom.window.document.getElementById('quote-rate').value = '100';
    dom.window.document.getElementById('quote-discount').value = '0';
    dom.window.document.getElementById('quote-tax-rate').value = '20';
    dom.window.approveQuoteAsOrder();
    assert(db.teklifler.length === 1 && db.isEmirleri.length === 1, "Approve button automatically saves one quote and creates one work order.");
    assert(db.teklifler[0].durum === 'Onaylandı' && db.teklifler[0].orderId === db.isEmirleri[0].id, "Automatically saved quote is approved and linked to its work order.");
    assert(db.isEmirleri[0].quoteId === db.teklifler[0].id, "Created work order keeps the originating quote reference.");
    dom.window.eval('isStatsVisible = true; renderDashboard();');
    assert(dom.window.document.getElementById('dash-stat-orders').textContent === '1', "Dashboard counts one active work order once instead of also counting its linked quote.");
    dom.window.approveQuoteAsOrder();
    assert(db.teklifler.length === 1 && db.isEmirleri.length === 1, "Repeated approval does not duplicate the quote or work order.");

    db.teklifler = [];
    db.isEmirleri = [];
    dom.window.document.getElementById('quote-description').value = 'Once kaydedilen teklif testi';
    dom.window.saveQuote();
    dom.window.eval("activeQuoteId = null; activeQuoteFingerprint = '';");
    dom.window.approveQuoteAsOrder();
    assert(db.teklifler.length === 1 && db.isEmirleri.length === 1, "A quote saved before restart is converted without creating a duplicate quote.");
    assert(db.teklifler[0].orderId === db.isEmirleri[0].id, "Previously saved quote remains linked after conversion.");

    // Test 24: Active work orders reserve stock and accounting starts only at delivery
    console.log("Test 24: Stock reservation and controlled order status flow");
    db.cariler = [{ id: 1801, kodu: 'C-1801', adi: 'Rezervasyon Test Cari', tel: '', bakiye: 0, durum: 'Temiz' }];
    db.stoklar = [{ id: 1802, kodu: 'STK-1802', cinsi: 'Rezervasyon Test Sac', miktar: 5, kg: 500, maliyet: 10, sahibiTipi: 'biz' }];
    db.teklifler = [];
    db.isEmirleri = [];
    db.islemler = [];
    db.faturalar = [];
    dom.window.document.getElementById('quote-type').value = 'lazer';
    dom.window.document.getElementById('quote-customer').innerHTML = '<option value="1801">Rezervasyon Test Cari</option>';
    dom.window.document.getElementById('quote-customer').value = '1801';
    dom.window.document.getElementById('quote-material').innerHTML = '<option value="1802">Rezervasyon Test Sac</option>';
    dom.window.document.getElementById('quote-material').value = '1802';
    dom.window.document.getElementById('quote-material-qty').value = '4';
    dom.window.document.getElementById('quote-description').value = 'Stok rezervasyon testi';
    dom.window.document.getElementById('quote-minutes').value = '10';
    dom.window.document.getElementById('quote-rate').value = '10';
    dom.window.document.getElementById('quote-discount').value = '0';
    dom.window.document.getElementById('quote-tax-rate').value = '20';
    dom.window.approveQuoteAsOrder();
    const reservedOrder = db.isEmirleri[0];
    const reservedOrderTotal = reservedOrder.total;
    dom.window.__reservedStock = db.stoklar[0];
    assert(dom.window.eval("getReservedStockQuantity(window.__reservedStock.id, 'miktar')") === 4, "Approved work order reserves its required plate quantity.");
    assert(dom.window.eval("getAvailableStockQuantity(window.__reservedStock, 'miktar')") === 1, "Available stock excludes quantities reserved by active work orders.");
    const selectedMaterialOption = dom.window.document.querySelector('#quote-material option:checked');
    assert(selectedMaterialOption && selectedMaterialOption.textContent.includes('Kullanılabilir: 1'), "Quote material list refreshes the available quantity immediately after reservation.");

    const overbookQuote = {
        id: 1803,
        teklifNo: 'TEK-OVERBOOK',
        tarih: '17.07.2026',
        durum: 'Beklemede',
        customerId: 1801,
        customerName: 'Rezervasyon Test Cari',
        islemTipi: 'lazer',
        description: 'Fazla stok isteyen teklif',
        stokId: 1802,
        stokQty: 2,
        minutes: 10,
        rate: 10,
        operationCost: 100,
        materialCost: 20,
        subTotal: 120,
        taxRate: 20,
        tax: 24,
        total: 144
    };
    db.teklifler.push(overbookQuote);
    dom.window.approveSavedQuoteAsOrder(1803);
    assert(db.isEmirleri.length === 1 && !overbookQuote.orderId, "A saved quote cannot create an order that overbooks reserved stock.");

    const changeOrderStatus = status => {
        dom.window.document.getElementById('input-order-id').value = String(reservedOrder.id);
        dom.window.document.getElementById('input-order-status').innerHTML = `<option value="${status}">${status}</option>`;
        dom.window.document.getElementById('input-order-status').value = status;
        dom.window.updateOrderStatus();
    };
    changeOrderStatus('Üretimde');
    assert(db.cariler[0].bakiye === 0 && db.islemler.length === 0, "Moving an order into production does not create customer debt.");
    assert(dom.window.eval("getReservedStockQuantity(window.__reservedStock.id, 'miktar')") === 4, "Production order keeps its stock reservation.");

    changeOrderStatus('Teslim Edildi');
    assert(db.cariler[0].bakiye === reservedOrderTotal, "Customer debt is created when the order is delivered.");
    assert(db.stoklar[0].miktar === 1 && dom.window.eval("getReservedStockQuantity(window.__reservedStock.id, 'miktar')") === 0, "Delivery consumes physical stock and closes the reservation once.");

    db.faturalar = [{ id: 1804, faturaNo: 'FTR-RES-001', orderId: reservedOrder.id, cariId: 1801, firma: 'Rezervasyon Test Cari', tutar: reservedOrderTotal }];
    changeOrderStatus('İptal');
    assert(reservedOrder.durum === 'Teslim Edildi' && db.stoklar[0].miktar === 1, "Delivered order with a linked invoice cannot be cancelled out of sequence.");
    db.faturalar = [];
    changeOrderStatus('İptal');
    assert(reservedOrder.durum === 'İptal' && db.stoklar[0].miktar === 5 && db.cariler[0].bakiye === 0, "Cancelling an uninvoiced delivered order restores stock and reverses customer debt.");
    changeOrderStatus('Üretimde');
    assert(reservedOrder.durum === 'İptal', "Cancelled work order cannot be moved back into production.");
    
    console.log("--- TESTS COMPLETE ---");
    if (failures > 0) {
        process.exitCode = 1;
    }
}, 1000);
