const BigNumber = require('bignumber.js');

const { enumerate, getXPub, signtx, promptpin, sendpin } = require('./commands');
const { getDataFromMultisig, getDataFromXPub } = require('../utils/transactions');

const getAccountData = async (config, currentBitcoinNetwork) => {
  let addresses, changeAddresses, transactions, unusedAddresses, unusedChangeAddresses, availableUtxos;

  if (config.quorum.totalSigners > 1) {
    [addresses, changeAddresses, transactions, unusedAddresses, unusedChangeAddresses, availableUtxos] = await getDataFromMultisig(config, currentBitcoinNetwork);
  } else {
    [addresses, changeAddresses, transactions, unusedAddresses, unusedChangeAddresses, availableUtxos] = await getDataFromXPub(config, currentBitcoinNetwork);
  }

  const currentBalance = availableUtxos.reduce((accum, utxo) => accum.plus(utxo.value), BigNumber(0));

  const accountData = {
    name: config.name,
    config: config,
    addresses,
    changeAddresses,
    availableUtxos,
    transactions,
    unusedAddresses,
    currentBalance: currentBalance.toNumber(),
    unusedChangeAddresses
  };

  return accountData;
}

/*
ipcMain.handle('/enumerate', async (event, args) => {
  const resp = JSON.parse(await enumerate());
  if (resp.error) {
    return Promise.reject(new Error('Error enumerating hardware wallets'))
  }
  const filteredDevices = resp.filter((device) => {
    return device.type === 'coldcard' || device.type === 'ledger' || device.type === 'trezor';
  })
  return Promise.resolve(filteredDevices);
});
*/

/*
ipcMain.handle('/xpub', async (event, args) => {
  const { deviceType, devicePath, path } = args;
  const resp = JSON.parse(await getXPub(deviceType, devicePath, path)); // responses come back as strings, need to be parsed
  if (resp.error) {
    return Promise.reject(new Error('Error extracting xpub'));
  }
  return Promise.resolve(resp);
});
*/

/*
ipcMain.handle('/sign', async (event, args) => {
  const { deviceType, devicePath, psbt } = args;
  const resp = JSON.parse(await signtx(deviceType, devicePath, psbt));
  if (resp.error) {
    return Promise.reject(new Error('Error signing transaction'));
  }
  return Promise.resolve(resp);
});
*/

/*
ipcMain.handle('/promptpin', async (event, args) => {
  const { deviceType, devicePath } = args;
  const resp = JSON.parse(await promptpin(deviceType, devicePath));
  if (resp.error) {
    return Promise.reject(new Error('Error prompting pin'));
  }
  return Promise.resolve(resp);
});
*/

/*
ipcMain.handle('/sendpin', async (event, args) => {
  const { deviceType, devicePath, pin } = args;
  const resp = JSON.parse(await sendpin(deviceType, devicePath, pin));
  if (resp.error) {
    return Promise.reject(new Error('Error sending pin'));
  }
  return Promise.resolve(resp);
});
*/

module.exports = {
  getAccountData
}