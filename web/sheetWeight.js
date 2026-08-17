(function (root) {
    const MATERIALS = {
        steel: { label: 'Siyah Sac / Çelik', density: 7.85 },
        dkp: { label: 'DKP Sac', density: 7.85 },
        stainless: { label: 'Paslanmaz Çelik', density: 7.93 },
        aluminum: { label: 'Alüminyum', density: 2.70 },
        copper: { label: 'Bakır', density: 8.96 },
        brass: { label: 'Pirinç', density: 8.50 },
        galvanized: { label: 'Galvaniz Sac', density: 7.85 }
    };

    function toPositiveNumber(value, fieldName) {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) {
            throw new Error(`${fieldName} değeri sıfırdan büyük olmalıdır.`);
        }
        return number;
    }

    function calculateSheetWeightKg(lengthMm, widthMm, thicknessMm, density, quantity) {
        const length = toPositiveNumber(lengthMm, 'Uzunluk');
        const width = toPositiveNumber(widthMm, 'Genişlik');
        const thickness = toPositiveNumber(thicknessMm, 'Kalınlık');
        const densityValue = toPositiveNumber(density, 'Yoğunluk');
        const quantityValue = toPositiveNumber(quantity, 'Adet');

        return length * width * thickness * densityValue * quantityValue / 1000000;
    }

    const api = { MATERIALS, calculateSheetWeightKg };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    root.AkLazerWeight = api;
})(typeof window !== 'undefined' ? window : globalThis);
