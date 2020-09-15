import { AES, enc } from 'crypto-js';

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

export const encryptConfig = (config, password) => {
  return AES.encrypt(JSON.stringify(config), password).toString();
}

export const decryptConfig = (encryptedData, password) => {
  const bytes = AES.decrypt(encryptedData, password);
  return JSON.parse(bytes.toString(enc.Utf8));
}