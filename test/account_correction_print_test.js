const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
(async()=>{
 const dom=new JSDOM(html,{url:'http://account-correction.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.alert=m=>{throw Error(String(m))};w.confirm=()=>true;w.console.warn=()=>{};
 const s=d.createElement('script');s.textContent=fs.readFileSync('app.js','utf8');d.body.append(s);await new Promise(r=>setTimeout(r,100));
 const seed=(amount,replacement)=>{
  w.eval(`db=createEmptyDatabase();db.cariler=[{id:1,kodu:'C-1',adi:'Test Müşteri',bakiye:${1000-amount},ledgerOpeningBalance:0}];db.kasaHesaplari=[{id:2,ad:'Banka',tip:'banka',bakiye:${amount},ledgerOpeningBalance:0},{id:3,ad:'Nakit Kasa',tip:'nakit',bakiye:0,ledgerOpeningBalance:0}];db.faturalar=[{id:11,tur:'kesilen',cariId:1,firma:'Test Müşteri',faturaNo:'FT-11',tutar:1000,tarih:'14.09.2026',paymentTrackingVersion:1}];db.islemler=[{id:21,cariId:1,firma:'Test Müşteri',tip:'Tahsilat (Gelen)',aciklama:'Banka tahsilatı',tutar:${amount},bakiyeDegisimi:${-amount},isGelir:true,kasaHareketId:31,tarih:'14.09.2026 12:46'}];db.kasaHareketleri=[{id:31,kasaId:2,kasaAdi:'Banka',tip:'giris',tutar:${amount},kaynak:'cari-islem',refId:21,tarih:'14.09.2026 12:46'}];`);
  const db=w.eval('db');w.renderCariler();w.openEditCariMovement(21);d.getElementById('input-islem-kasa').value='3';d.getElementById('input-islem-tutar').value=String(replacement);w.saveIslem();
  assert.equal(db.cariler[0].bakiye,1000-replacement);assert.equal(db.kasaHesaplari[0].bakiye,0);assert.equal(db.kasaHesaplari[1].bakiye,replacement);
  assert.equal(db.islemler.length,3);assert.equal(db.kasaHareketleri.length,3);assert.equal(db.islemler[0].reversedBy,db.islemler[1].id);assert.equal(db.islemler[2].correctionOf,21);
  return db;
 };
 const rows=()=>w.getCariLedgerLines(w.eval('db.cariler[0]'),w.getCariStatementLines(w.eval('db.cariler[0]')),w.eval('db.cariler[0].bakiye'));
 const capture=()=>new JSDOM(d.querySelector('.print-preview-frame').srcdoc).window.document;
 let db=seed(1000,1000);let lines=rows();assert.equal(lines.length,2);assert.deepEqual([...lines].map(x=>x.balance),[1000,0]);assert.equal(lines.filter(x=>x.credit>0).length,1);assert.equal(lines.reduce((n,x)=>n+x.credit,0),1000);
 const persisted=JSON.stringify(db);w.printAccountStatement(1);let doc=capture();assert.equal(doc.querySelectorAll('.statement-table > tbody:first-of-type tr').length,2);assert.equal((doc.querySelector('.statement-totals').textContent.match(/1\.000,00/g)||[]).length,2);assert(!doc.querySelector('.statement-table').textContent.includes('Hatalı kayıt düzeltme'));
 assert.equal(JSON.stringify(db),persisted,'Printing must not alter the audit ledger');d.querySelector('#btn-print-preview-close').click();
 const day=new Date();const iso=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
 d.getElementById('account-print-date-start').value=iso;d.getElementById('account-print-date-end').value=iso;
 w.printAccountStatement(1);doc=capture();assert.equal(doc.querySelectorAll('.statement-table > tbody:first-of-type tr').length,1,'Zero-effect bank-to-cash correction should not create a customer charge/payment in its day');assert(doc.querySelector('.statement-table').textContent.includes('Bu cari için yazdırılacak hareket bulunamadı'));assert(doc.querySelector('.statement-totals').textContent.includes('₺0,00'));d.querySelector('#btn-print-preview-close').click();
 db=seed(200,300);d.getElementById('account-print-date-start').value='';d.getElementById('account-print-date-end').value='';
 lines=rows();assert.equal(lines.length,2);assert.equal(lines[1].credit,300);assert.equal(lines[1].balance,700);
 d.getElementById('account-print-date-start').value=iso;d.getElementById('account-print-date-end').value=iso;
 w.printAccountStatement(1);doc=capture();const selectedRows=[...doc.querySelectorAll('.statement-table > tbody:first-of-type tr')];assert.equal(selectedRows.length,2);assert(selectedRows[0].textContent.includes('Seçilen tarih öncesi bakiye'));assert(selectedRows[1].textContent.includes('Tahsilat / ödeme düzeltmesi'));assert(doc.querySelector('.statement-totals').textContent.includes('₺700,00'));d.querySelector('#btn-print-preview-close').click();
 // Undo without a replacement must remove both audit entries from the full statement.
 w.eval(`db=createEmptyDatabase();db.cariler=[{id:1,kodu:'C-1',adi:'Test Müşteri',bakiye:800,ledgerOpeningBalance:0}];db.isEmirleri=[];db.faturalar=[{id:11,tur:'kesilen',cariId:1,firma:'Test Müşteri',faturaNo:'FT-11',tutar:1000,tarih:'14.09.2026'}];db.islemler=[{id:21,cariId:1,firma:'Test Müşteri',tip:'Tahsilat (Gelen)',tutar:200,bakiyeDegisimi:-200,isGelir:true,tarih:'14.09.2026 12:46'}];`);
 w.reverseCariMovement(21);assert.equal(w.eval('db.cariler[0].bakiye'),1000);d.getElementById('account-print-date-start').value='';d.getElementById('account-print-date-end').value='';
 lines=rows();assert.equal(lines.length,1);assert.equal(lines[0].debit,1000);
 // Two same-amount corrections on a later day have no net effect in that day's customer statement.
 w.eval(`db=createEmptyDatabase();db.cariler=[{id:1,kodu:'C-1',adi:'Test Müşteri',bakiye:800,ledgerOpeningBalance:0}];db.faturalar=[{id:11,tur:'kesilen',cariId:1,firma:'Test Müşteri',faturaNo:'FT-11',tutar:1000,tarih:'14.09.2026'}];db.islemler=[
  {id:21,cariId:1,firma:'Test Müşteri',tip:'Tahsilat (Gelen)',tutar:200,bakiyeDegisimi:-200,tarih:'14.09.2026',reversedBy:22,correctedBy:23},
  {id:22,cariId:1,firma:'Test Müşteri',tip:'Düzeltme Ters Kaydı',tutar:200,bakiyeDegisimi:200,tarih:'16.09.2026',reversalOf:21,correctedBy:23},
  {id:23,cariId:1,firma:'Test Müşteri',tip:'Tahsilat (Gelen)',tutar:200,bakiyeDegisimi:-200,tarih:'16.09.2026',correctionOf:21,reversedBy:24,correctedBy:25},
  {id:24,cariId:1,firma:'Test Müşteri',tip:'Düzeltme Ters Kaydı',tutar:200,bakiyeDegisimi:200,tarih:'16.09.2026',reversalOf:23,correctedBy:25},
  {id:25,cariId:1,firma:'Test Müşteri',tip:'Tahsilat (Gelen)',tutar:200,bakiyeDegisimi:-200,tarih:'16.09.2026',correctionOf:23}
 ];`);
 d.getElementById('account-print-date-start').value='2026-09-16';d.getElementById('account-print-date-end').value='2026-09-16';
 const repeated=w.getCariLedgerLines(w.eval('db.cariler[0]'),w.getCariStatementLines(w.eval('db.cariler[0]')),800,w.getAccountPrintDateRange());
 assert.equal(repeated.length,1,'Repeated zero-effect corrections should show only the opening balance');
 assert.equal(repeated[0].balance,800);
 dom.window.close();console.log('Account statement corrections: bank-to-cash transfer, amount correction, date range, undo, closing balance and audit preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
