// macOS : signature VMP avant la signature du code (voir vmp-sign.cjs).
const { sign } = require('./vmp-sign.cjs');

exports.default = async function vmpAfterPack(context) {
  if (context.electronPlatformName === 'darwin') sign(context);
};
