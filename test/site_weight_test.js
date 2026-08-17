const assert = require('assert');
const { calculateSheetWeightKg, MATERIALS } = require('../web/sheetWeight');

assert.strictEqual(MATERIALS.steel.density, 7.85);
assert.strictEqual(calculateSheetWeightKg(1000, 1000, 1, 7.85, 1), 7.85);
assert.strictEqual(calculateSheetWeightKg(2000, 1000, 10, 7.85, 2), 314);
assert.throws(() => calculateSheetWeightKg(0, 1000, 1, 7.85, 1), /Uzunluk/);
assert.throws(() => calculateSheetWeightKg(1000, -1, 1, 7.85, 1), /Genişlik/);
assert.throws(() => calculateSheetWeightKg(1000, 1000, 1, 0, 1), /Yoğunluk/);

console.log('Sac levha ağırlık hesaplama testleri geçti.');
