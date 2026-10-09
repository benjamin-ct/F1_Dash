// Signature VMP (Verified Media Path) castlabs EVS de l'application empaquetée : nécessaire pour
// que les serveurs de licence Widevine (F1 TV) acceptent l'appli. Faite seulement si les
// identifiants EVS sont fournis (secrets GitHub EVS_ACCOUNT_NAME et EVS_PASSWD).
// Ordre demandé par castlabs : APRÈS la signature du code sous Windows (crochet afterSign, ce
// fichier), AVANT la signature du code sous macOS (crochet afterPack, vmp-after-pack.cjs).
// Linux : pas de VMP (non pris en charge par Widevine sur ce système).
const { execFileSync } = require('node:child_process');

function sign(context) {
  const { EVS_ACCOUNT_NAME, EVS_PASSWD } = process.env;
  if (!EVS_ACCOUNT_NAME || !EVS_PASSWD) {
    console.warn('[vmp] identifiants EVS absents : application non signée VMP (les flux DRM F1 TV pourraient être refusés).');
    return;
  }
  const python = process.platform === 'win32' ? 'python' : 'python3';
  console.log(`[vmp] signature de ${context.appOutDir}`);
  execFileSync(python, ['-m', 'castlabs_evs.vmp', '--no-ask', 'sign-pkg', context.appOutDir], { stdio: 'inherit', env: { ...process.env, EVS_NO_ASK: '1' } });
}

exports.sign = sign;
exports.default = async function vmpAfterSign(context) {
  if (context.electronPlatformName === 'win32') sign(context);
};
