const { execFileSync } = require('child_process');

function fail(message) {
    console.error(`macOS dağıtımı durduruldu: ${message}`);
    process.exit(1);
}

if (process.platform !== 'darwin') {
    fail('İmzalı macOS paketi yalnızca macOS üzerinde üretilebilir.');
}

const hasCertificateFile = !!process.env.CSC_LINK;
const configuredIdentity = String(process.env.CSC_NAME || '').trim();
let hasDeveloperIdIdentity = configuredIdentity.includes('Developer ID Application');

if (!hasCertificateFile && !hasDeveloperIdIdentity) {
    try {
        const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        hasDeveloperIdIdentity = identities.includes('Developer ID Application');
    } catch (_) {
        hasDeveloperIdIdentity = false;
    }
}

if (!hasCertificateFile && !hasDeveloperIdIdentity) {
    fail('Developer ID Application sertifikası bulunamadı. CSC_LINK veya geçerli bir CSC_NAME tanımlayın.');
}

const hasApiKeyNotary = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
    .every(name => !!process.env[name]);
const hasAppleIdNotary = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
    .every(name => !!process.env[name]);
const hasKeychainNotary = !!process.env.APPLE_KEYCHAIN_PROFILE;

if (!hasApiKeyNotary && !hasAppleIdNotary && !hasKeychainNotary) {
    fail('Apple noter kimliği bulunamadı. API anahtarı, Apple ID üçlüsü veya keychain profili tanımlayın.');
}

console.log('macOS imzalama ve noter ön koşulları hazır. Dağıtım paketi oluşturulabilir.');
