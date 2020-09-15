#!/usr/bin/env node

const fs = require('fs');
const yargs = require("yargs");
const prompt = require('prompt');
const { networks } = require('bitcoinjs-lib');
import { satoshisToBitcoins, bitcoinsToSatoshis } from "unchained-bitcoin";

const { getAccountData } = require('./server/accounts');
const { enumerate, getXPub, signtx, promptpin, sendpin } = require('./server/commands');
const { getDataFromMultisig, getDataFromXPub } = require('./utils/transactions');
const { getUnchainedNetworkFromBjslibNetwork } = require('./utils/files');

const { decryptConfig } = require('./wallet/config');
const { createTransaction, singleSignPsbt, broadcastPsbt, validateAddress, createUtxoMapFromUtxoArray, getFee } = require('./wallet/utils');

const options = yargs
  .command('show', 'Show wallet file', function (yargs) {
    return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true })
                .option('v', { alias: 'verbose', describe: 'Show all wallet data', type: 'boolean' });
  })
  .command('balance', 'Show wallet balances', function (yargs) {
    return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true });
  })
  .command('addresses', 'Show wallet addresses', function (yargs) {
    return yargs.option('f', { alias: 'filename', describe: 'Config filename', type: 'string', demandOption: true });
  })
  .command('spend', 'Spend from wallet', function (yargs) {
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
const currentBitcoinNetwork = options.testnet ? networks.testnet : networks.bitcoin;

console.log(`:: network: ${getUnchainedNetworkFromBjslibNetwork(currentBitcoinNetwork)}`);
console.log(`:: filename: ${options.filename}`);

fs.readFile(options.filename, 'utf8', function (err, data) {
  if (err) {
    return console.error(err);
  }
  const properties = [
    {
        name: 'password',
        hidden: true
    }
  ];
  prompt.start();
  prompt.get(properties, async function (err, result) {
    if (err) {
      return console.error(err);
    }
    const configFile = (decryptConfig(data, result.password));
    switch (options._[0]) {
      case 'show':
        if (options.verbose) {
          console.dir(configFile, { depth: null, colors: true });
        } else {
          console.log(` name:    ${configFile.name}`);
          console.log(` version: ${configFile.version}`);
          console.log('   wallets:');
          for (const wallet of configFile.wallets) {
            if (options.walletname && options.walletname !== wallet.name)
              continue;
            console.log(`    - wallet name:  ${wallet.name}`)
            console.log(`      address type: ${wallet.addressType}`)
          }
        }
        break;
      case 'balance':
        for (const wallet of configFile.wallets) {
          if (options.walletname && options.walletname !== wallet.name)
            continue;
          console.log(`    - wallet name: ${wallet.name}`);
          const accountData = await getAccountData(wallet, currentBitcoinNetwork);
          console.log(`      balance:     ${satoshisToBitcoins(accountData.currentBalance)}`);
        }
        break;
        case 'addresses':
          for (const wallet of configFile.wallets) {
            if (options.walletname && options.walletname !== wallet.name)
              continue;
            console.log(`    - wallet name:      ${wallet.name}`);
            const accountData = await getAccountData(wallet, currentBitcoinNetwork);
            console.log(`      addresses:        ${formatAddresses(accountData.addresses)}`);
            console.log(`      change addresses: ${formatAddresses(accountData.changeAddresses)}`);
            console.log(`      unused addresses: ${formatAddresses(accountData.unusedAddresses)}`);
            console.log(`      unused change addresses: ${formatAddresses(accountData.unusedChangeAddresses)}`);
          }
          break;
        case 'spend':
          if (!validateAddress(options.recipient, currentBitcoinNetwork)) {
            console.error(`invalid address (${options.recipient})`);
            return;
          }
          for (const wallet of configFile.wallets) {
            if (options.walletname === wallet.name) {
              console.log(` wallet name:     ${wallet.name}`);
              const accountData = await getAccountData(wallet, currentBitcoinNetwork);
              console.log(` balance:         ${satoshisToBitcoins(accountData.currentBalance)}`);
              console.log(`------`);
              console.log(` transaction:`);
              console.log(`   recipient:     ${options.recipient}`);
              console.log(`   amount:        ${options.amount}`);
              console.log(`   fee:           ${options.fee}`);
              const { psbt, fee, feeRates } = await createTransaction(accountData, options.amount, options.recipient, bitcoinsToSatoshis(options.fee), accountData.availableUtxos, accountData.transactions, accountData.unusedChangeAddresses, currentBitcoinNetwork);
              console.log(`   psbt:          ${psbt}`);
              console.log(`   fee:           ${satoshisToBitcoins(fee)}`);
              console.log(`   fee rates:     ${feeRates}`);
              console.log(`------`);
              if (!accountData.config.mnemonic) {
                console.error('multisig or hw signing not yet implemented');
                return;
              }
              await singleSignPsbt(psbt, accountData, currentBitcoinNetwork);
              console.log(`Are you sure you want to broadcast the transaction? y/[N]`);
              const properties = [
                {
                    name: 'broadcast'
                }
              ];
              prompt.get(properties, async function (err, result) {
                if (err) {
                  return console.error(err);
                }
                if (result.broadcast && result.broadcast.toLowerCase() == 'y') {
                  const { txid, errMsg } = await broadcastPsbt(psbt, currentBitcoinNetwork);
                  if (txid !== null) {
                    console.log(txid);
                  } else {
                    console.error(errMsg);
                  }
                }
              });
              break;
            }
          }
    }
  });
});

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