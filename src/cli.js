#!/usr/bin/env node

const fs = require('fs');
const yargs = require('yargs');
const { prompt } = require('enquirer');
const { networks } = require('bitcoinjs-lib');
import { satoshisToBitcoins, bitcoinsToSatoshis } from "unchained-bitcoin";

const { getAccountData } = require('./server/accounts');
const { enumerate, getXPub, signtx, promptpin, sendpin } = require('./server/commands');
const { getUnchainedNetworkFromBjslibNetwork, getDataFromMultisig, getDataFromXPub } = require('./utils/transactions');

const { emptyConfig, newMnemonic, createSinglesigConfig, encryptConfig, decryptConfig } = require('./wallet/config');
const { createTransaction, singleSignPsbt, broadcastPsbt, validateAddress, createUtxoMapFromUtxoArray, getFee } = require('./wallet/utils');

const formatAddresses = (addrs) => {
  let res = '';
  for (const addr of addrs) {
    if (res !== '') {
      res = `${res}, ${addr.address}`
    } else {
      res = addr.address;
    }
  }
  return res;
}

const readConfigIfExists = async (filename) => {
  try {
    if (fs.existsSync(filename)) {
      let data = fs.readFileSync(filename, 'utf8');
      const response = await prompt({
        type: 'password',
        name: 'password',
        message: 'Enter the config file password'
      });
      return decryptConfig(data, response.password);
    } else {
      return emptyConfig;
    }
  } catch(err) {
    console.error(err);
    return null;
  }
}

const create = async (options) => {
  let config = await readConfigIfExists(options.filename);
  if (config === null)
    return;
  if (!options.walletname) {
    console.error('walletname parameter is required');
    return;
  }
  for (const wallet of config.wallets) {
    if (wallet.name == options.walletname) {
      console.error('walletname already exists in file');
      return;
    }
  }
  const response = await prompt({
    type: 'password',
    name: 'password',
    message: 'Enter the new config file password'
  });
  if (!response.password || response.password.length < 6) {
    console.error('password is less then 6 characters');
    return;
  }
  const response2 = await prompt({
    type: 'password',
    name: 'password',
    message: 'Confirm the new config file password'
  });
  if (response2.password != response.password) {
    console.error('password confirmation does not match');
    return;
  }
  config = await createSinglesigConfig(newMnemonic(), options.walletname, config, options.bitcoinNetwork);
  let configEncrypted = encryptConfig(config, response.password);
  let filename = options.filename;
  let count = 1;
  while (fs.existsSync(filename)) {
    filename = options.filename + count.toString();
    count++;
  }
  fs.writeFileSync(filename, configEncrypted, 'utf8');
  console.log(`wrote new wallet "${options.walletname}" to "${filename}"`);
}

const show = async (options) => {
  let config = await readConfigIfExists(options.filename);
  if (config === null)
    return;
  if (options.verbose) {
    console.dir(config, { depth: null, colors: true });
  } else {
    console.log(` name:    ${config.name}`);
    console.log(` version: ${config.version}`);
    console.log('   wallets:');
    for (const wallet of config.wallets) {
      if (options.walletname && options.walletname !== wallet.name)
        continue;
      console.log(`    - wallet name:  ${wallet.name}`)
      console.log(`      address type: ${wallet.addressType}`)
    }
  }
}

const balance = async (options) => {
  let config = await readConfigIfExists(options.filename);
  if (config === null)
    return;
  for (const wallet of config.wallets) {
    if (options.walletname && options.walletname !== wallet.name)
      continue;
    console.log(`    - wallet name: ${wallet.name}`);
    const accountData = await getAccountData(wallet, options.bitcoinNetwork);
    console.log(`      balance:     ${satoshisToBitcoins(accountData.currentBalance)}`);
  }
}

const addresses = async (options) => {
  let config = await readConfigIfExists(options.filename);
  if (config === null)
    return;
  for (const wallet of config.wallets) {
    if (options.walletname && options.walletname !== wallet.name)
      continue;
    console.log(`    - wallet name:      ${wallet.name}`);
    const accountData = await getAccountData(wallet, options.bitcoinNetwork);
    console.log(`      addresses:        ${formatAddresses(accountData.addresses)}`);
    console.log(`      change addresses: ${formatAddresses(accountData.changeAddresses)}`);
    console.log(`      unused addresses: ${formatAddresses(accountData.unusedAddresses)}`);
    console.log(`      unused change addresses: ${formatAddresses(accountData.unusedChangeAddresses)}`);
  }
}

const spend = async (options) => {
  let config = await readConfigIfExists(options.filename);
  if (config === null)
    return;
  if (!validateAddress(options.recipient, options.bitcoinNetwork)) {
    console.error(`invalid address (${options.recipient})`);
    return;
  }
  for (const wallet of config.wallets) {
    if (options.walletname === wallet.name) {
      console.log(` wallet name:     ${wallet.name}`);
      const accountData = await getAccountData(wallet, options.bitcoinNetwork);
      console.log(` balance:         ${satoshisToBitcoins(accountData.currentBalance)}`);
      console.log(`------`);
      console.log(` transaction:`);
      console.log(`   recipient:     ${options.recipient}`);
      console.log(`   amount:        ${options.amount}`);
      console.log(`   fee:           ${options.fee}`);
      const { psbt, fee, feeRates } = await createTransaction(accountData, options.amount, options.recipient, bitcoinsToSatoshis(options.fee), accountData.availableUtxos, accountData.transactions, accountData.unusedChangeAddresses, options.bitcoinNetwork);
      console.log(`   psbt:          ${psbt}`);
      console.log(`   fee:           ${satoshisToBitcoins(fee)}`);
      console.log(`   fee rates:     ${feeRates}`);
      console.log(`------`);
      if (!accountData.config.mnemonic) {
        console.error('multisig or hw signing not yet implemented');
        return;
      }
      await singleSignPsbt(psbt, accountData, options.bitcoinNetwork);
      const response = await prompt({
        type: 'input',
        name: 'broadcase',
        message: 'Are you sure you want to broadcast the transaction? y/[N]'
      });
      if (response.broadcast && response.broadcast.toLowerCase() == 'y') {
        const { txid, errMsg } = await broadcastPsbt(psbt, options.bitcoinNetwork);
        if (txid !== null) {
          console.log(txid);
        } else {
          console.error(errMsg);
        }
      }
      break;
    }
  }
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

function main() {
  const CREATE = 'create';
  const SHOW = 'show';
  const BALANCE = 'balance';
  const ADDRESSES = 'addresses';
  const SPEND = 'spend';
  
  const options = yargs
    .command(CREATE, 'Create wallet file', function (yargs) {
      return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true });
    })
    .command(SHOW, 'Show wallet file', function (yargs) {
      return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true })
                  .option('v', { alias: 'verbose', describe: 'Show all wallet data', type: 'boolean' });
    })
    .command(BALANCE, 'Show wallet balances', function (yargs) {
      return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true });
    })
    .command(ADDRESSES, 'Show wallet addresses', function (yargs) {
      return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true });
    })
    .command(SPEND, 'Spend from wallet', function (yargs) {
      return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true })
                  .option('r', { alias: 'recipient', describe: 'Recipient address', type: 'string', demandOption: true })
                  .option('a', { alias: 'amount', describe: 'Amount to spend', type: 'integer', demandOption: true })
                  .option('fee', { describe: 'Fee to pay', type: 'integer'});
    })
    .option('t', { alias: 'testnet', describe: 'Testnet', type: 'boolean' })
    .option('n', { alias: 'walletname', describe: 'Specify wallet name', type: 'string'})
    .demandCommand()
    .help()
    .argv;
  options.bitcoinNetwork = options.testnet ? networks.testnet : networks.bitcoin;
  
  console.log(`:: network: ${getUnchainedNetworkFromBjslibNetwork(options.bitcoinNetwork)}`);
  console.log(`:: filename: ${options.filename}`);
  
  switch (options._[0]) {
    case CREATE:
      create(options);
      break;
    case SHOW:
      show(options);
      break;
    case BALANCE:
      balance(options);
      break;
    case ADDRESSES:
      addresses(options);
      break;
    case SPEND:
      spend(options);
      break;
  }
}
main();