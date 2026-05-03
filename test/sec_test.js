const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('./index.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });

// Mock localStorage
let storage = {};
dom.window.localStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => storage[k] = v,
    clear: () => storage = {}
};

// Mock alert
dom.window.alert = (msg) => console.log('ALERT:', msg);

// Load app.js code
const appCode = fs.readFileSync('./app.js', 'utf-8');
const script = dom.window.document.createElement("script");
script.textContent = appCode;
dom.window.document.body.appendChild(script);

setTimeout(() => {
    console.log("--- STARTING TESTS ---");
    
    // Test 1: XSS via Customer Name
    console.log("Test 1: XSS Check");
    dom.window.document.getElementById('input-cari-adi').value = "<script>console.log('XSS_SUCCESS')</script><img src=x onerror=console.log('XSS_IMG')>";
    dom.window.document.getElementById('input-cari-tel').value = "123";
    dom.window.saveCari();
    
    // Force render
    dom.window.renderCariler();
    const tbody = dom.window.document.getElementById('cari-tbody').innerHTML;
    if (tbody.includes("<script>") || tbody.includes("<img")) {
        console.log("VULNERABILITY FOUND: XSS is possible via innerHTML!");
    } else {
        console.log("SAFE: No XSS");
    }

    // Test 2: Crash via missing keys in DB
    console.log("Test 2: Corrupt DB Crash Check");
    let corruptDB = { ...JSON.parse(storage['ProLazerDB']) };
    delete corruptDB.islemler; // Remove critical array
    storage['ProLazerDB'] = JSON.stringify(corruptDB);
    
    try {
        dom.window.renderDashboard();
        console.log("SAFE: Dashboard handled corrupt DB gracefully.");
    } catch(e) {
        console.log("CRASH FOUND: Dashboard crashed on missing DB key:", e.message);
    }
    
    console.log("--- TESTS COMPLETE ---");
}, 1000);
