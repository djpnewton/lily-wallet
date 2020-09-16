import { AES, enc } from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import { bip32 } from "bitcoinjs-lib";
import { generateMnemonic, mnemonicToSeed } from "bip39";

import { getUnchainedNetworkFromBjslibNetwork, getP2wpkhDeriationPathForNetwork } from '../utils/transactions';

export const emptyConfig = {
  name: "",
  version: "0.0.2",
  isEmpty: true,
  backup_options: {
    gDrive: false
  },
  wallets: [],
  vaults: [],
  keys: [],
  exchanges: []
}

export const newMnemonic = () => {
    return generateMnemonic(256);
}

export const createSinglesigConfig = async (walletMnemonic, accountName, config, currentBitcoinNetwork) => {
  const configCopy = { ...config };
  configCopy.isEmpty = false;

  // taken from BlueWallet so you can import and use on mobile
  const seed = await mnemonicToSeed(walletMnemonic);
  const root = bip32.fromSeed(seed, currentBitcoinNetwork);
  const path = getP2wpkhDeriationPathForNetwork(currentBitcoinNetwork);
  const child = root.derivePath(path).neutered();
  const xpubString = child.toBase58();
  const xprvString = root.derivePath(path).toBase58();

  const newKey = {
    id: uuidv4(),
    created_at: Date.now(),
    name: accountName,
    network: getUnchainedNetworkFromBjslibNetwork(currentBitcoinNetwork),
    addressType: "P2WPKH",
    quorum: { requiredSigners: 1, totalSigners: 1 },
    xpub: xpubString,
    xprv: xprvString,
    mnemonic: walletMnemonic,
    parentFingerprint: root.fingerprint,
  };

  configCopy.wallets.push(newKey);

  configCopy.keys.push(newKey);

  return configCopy;
}

export const createSinglesigHWWConfig = async (device, accountName, config, currentBitcoinNetwork) => {
  const configCopy = { ...config };
  configCopy.isEmpty = false;

  const newKey = {
    id: uuidv4(),
    created_at: Date.now(),
    name: accountName,
    network: getUnchainedNetworkFromBjslibNetwork(currentBitcoinNetwork),
    addressType: "P2WPKH",
    quorum: { requiredSigners: 1, totalSigners: 1 },
    xpub: device.xpub,
    parentFingerprint: device.fingerprint,
    device: {
      type: device.type,
      model: device.model,
      fingerprint: device.fingerprint
    }
  };

  configCopy.wallets.push(newKey);

  configCopy.keys.push(newKey);

  return configCopy;
}

export const createMultisigConfig = (importedDevices, requiredSigners, accountName, config, currentBitcoinNetwork) => {
  const configCopy = { ...config };
  configCopy.isEmpty = false;

  const newKeys = importedDevices.map((device) => {
    return {
      id: uuidv4(),
      created_at: Date.now(),
      parentFingerprint: device.fingerprint,
      network: getUnchainedNetworkFromBjslibNetwork(currentBitcoinNetwork),
      bip32Path: "m/0",
      xpub: device.xpub,
      device: {
        type: device.type,
        model: device.model,
        fingerprint: device.fingerprint
      }
    }
  });

  configCopy.vaults.push({
    id: uuidv4(),
    created_at: Date.now(),
    name: accountName,
    network: getUnchainedNetworkFromBjslibNetwork(currentBitcoinNetwork),
    addressType: "P2WSH",
    quorum: {
      requiredSigners: requiredSigners,
      totalSigners: importedDevices.length
    },
    extendedPublicKeys: newKeys
  })

  configCopy.keys.push(...newKeys);

  return configCopy;
}

export const encryptConfig = (config, password) => {
  return AES.encrypt(JSON.stringify(config), password).toString();
}

export const decryptConfig = (encryptedData, password) => {
  const bytes = AES.decrypt(encryptedData, password);
  return JSON.parse(bytes.toString(enc.Utf8));
}