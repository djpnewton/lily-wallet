const { enumerate, getXPub, signtx, promptpin, sendpin } = require('./commands');

const devEnum = async () => {
  const resp = JSON.parse(await enumerate());
  if (resp.error) {
    return Promise.reject(new Error('Error enumerating hardware wallets'))
  }
  const filteredDevices = resp.filter((device) => {
    return device.type === 'coldcard' || device.type === 'ledger' || device.type === 'trezor';
  })
  return Promise.resolve(filteredDevices);
}

const devXpub = async (deviceType, devicePath, path) => {
  const resp = JSON.parse(await getXPub(deviceType, devicePath, path)); // responses come back as strings, need to be parsed
  if (resp.error) {
    return Promise.reject(new Error('Error extracting xpub'));
  }
  return Promise.resolve(resp);
}

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
  devEnum,
  devXpub
}