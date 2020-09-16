#!/usr/bin/env node

const fs = require('fs');
const yargs = require('yargs');
const { prompt } = require('enquirer');
const { networks } = require('bitcoinjs-lib');
const { satoshisToBitcoins, bitcoinsToSatoshis } = require("unchained-bitcoin");

const { devEnum, devXpub } = require('./server/device');
const { getUnchainedNetworkFromBjslibNetwork, getP2shDeriationPathForNetwork } = require('./utils/transactions');

const { emptyConfig, newMnemonic, createSinglesigConfig, encryptConfig, decryptConfig, createSinglesigHWWConfig } = require('./wallet/config');
const { createTransaction, singleSignPsbt, broadcastPsbt, validateAddress, getAccountData } = require('./wallet/utils');
const { newDevice } = require('./wallet/device');

const WT_SINGLE = 'single';
const WT_HARDWARE = 'hardware';

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

const enumerate = async (options) => {
  for (const device of await devEnum()) {
    console.dir(device);
  }
}

const xpub = async (options) => {
  for (const device of await devEnum()) {
    if (device.fingerprint == options.fingerprint) {
      console.dir(await devXpub(
        device.type,
        device.path,
        getP2shDeriationPathForNetwork(options.bitcoinNetwork) //TODO: wrap with something like SingleSigDeviceDerivationPath()???
        ));
      break;
    }
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
  if (options.wallettype == WT_SINGLE) {
    config = await createSinglesigConfig(newMnemonic(), options.walletname, config, options.bitcoinNetwork);
  } else if (options.wallettype == WT_HARDWARE) {
    let foundDevice = null;
    for (const device of await devEnum()) {
      if (device.fingerprint == options.fingerprint) {
        foundDevice = device;
        break;
      }
    }
    if (foundDevice) {
      const { xpub } = await devXpub(foundDevice.type, foundDevice.path,
        getP2shDeriationPathForNetwork(options.bitcoinNetwork) //TODO: wrap with something like SingleSigDeviceDerivationPath()???
      );
      const importedDevice = newDevice(foundDevice.type, foundDevice.model, foundDevice.path, foundDevice.fingerprint, xpub);
      config = await createSinglesigHWWConfig(importedDevice, options.walletname, config, options.bitcoinNetwork);
    } else {
      console.error('device not found');
      return;
    }
  }
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

function main() {
  const ENUM = 'enumerate';
  const XPUB = 'xpub';
  const CREATE = 'create';
  const SHOW = 'show';
  const BALANCE = 'balance';
  const ADDRESSES = 'addresses';
  const SPEND = 'spend';

  const options = yargs
    .command(ENUM, 'Enumerate hardware devices')
    .command(XPUB, 'Get device xpub', function (yargs) {
      return yargs.option('F', { alias: 'fingerprint', describe: 'Device fingerprint', type: 'string', demandOption: true });
    })
    .command(CREATE, 'Create wallet file', function (yargs) {
      return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true })
                  .option('w', { alias: 'wallettype', describe: `Wallet type (${WT_SINGLE}, ${WT_HARDWARE})`, type: 'string', demandOption: true })
                  .option('F', { alias: 'fingerprint', describe: 'Device fingerprint', type: 'string' })
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
  console.log();

  switch (options._[0]) {
    case ENUM:
      enumerate(options);
      break;
    case XPUB:
      xpub(options);
      break;
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