import moment from 'moment';
import { networks } from 'bitcoinjs-lib';

import { bitcoinNetworkEqual, getMultisigDeriationPathForNetwork } from './transactions';

export const formatFilename = (fileContents, currentBitcoinNetwork, fileType) => {
  if (bitcoinNetworkEqual(currentBitcoinNetwork, networks.bitcoin)) {
    return `${fileContents}-bitcoin-${moment().format('MMDDYY-hhmmss')}.${fileType}`;
  } else {
    return `${fileContents}-testnet-${moment().format('MMDDYY-hhmmss')}.${fileType}`;
  }
}

export const downloadFile = (file, filename) => {
  const fileUrl = URL.createObjectURL(file);

  window.ipcRenderer.send('download-item', { url: fileUrl, filename: filename })
}

export const createColdCardBlob = (requiredSigners, totalSigners, accountName, importedDevices, currentBitcoinNetwork) => {
  let derivationPath = getMultisigDeriationPathForNetwork(currentBitcoinNetwork);
  return new Blob([`# Coldcard Multisig setup file (created by Lily Wallet on ${moment(Date.now()).format('MM/DD/YYYY')})
#
Name: ${accountName}
Policy: ${requiredSigners} of ${totalSigners}
Derivation: ${derivationPath}
Format: P2WSH
${importedDevices.map((device) => (
    `\n${device.fingerprint || device.parentFingerprint}: ${device.xpub}`
  ))}
`], { type: 'text/plain' });
}