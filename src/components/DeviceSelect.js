import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { ErrorOutline, CheckCircle } from '@styled-icons/material';

import { Button, StyledIcon, PromptPinModal } from '../components';
import { lightGreen, gray, green, blue, white, darkGray, red, lightRed, yellow, lightYellow, black, gray600 } from '../utils/colors';

export const DeviceSelect = ({ configuredDevices, unconfiguredDevices, errorDevices, setUnconfiguredDevices, configuredThreshold, deviceAction, deviceActionText, deviceActionLoadingText }) => {
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceActionLoading, setDeviceActionLoading] = useState(null);
  const [promptPinModalDevice, setPromptPinModalDevice] = useState(null);


  useEffect(() => {
    enumerate();
  }, []); // eslint-disable-line

  const enumerate = async () => {
    setDevicesLoading(true);
    // what?
    try {
      const response = await window.ipcRenderer.invoke('/enumerate');
      setDevicesLoading(false);

      // filter out devices that are available but already imported
      const filteredDevices = response.filter((device) => { // eslint-disable-line
        let deviceAlreadyConfigured = false;
        for (let i = 0; i < configuredDevices.length; i++) {
          if (configuredDevices[i].fingerprint === device.fingerprint) {
            deviceAlreadyConfigured = true;
          }
        }
        if (!deviceAlreadyConfigured) {
          return device
        }
      });
      setUnconfiguredDevices(filteredDevices);
    } catch (e) {
      console.log('e: ', e);
      setDevicesLoading(false);
    }
  }

  const performDeviceAction = async (device, index) => {
    setDeviceActionLoading(index)
    await deviceAction(device, index);
    setDeviceActionLoading(null);
  }

  return (
    <Wrapper>
      <PromptPinModal promptPinModalIsOpen={!!promptPinModalDevice} setPromptPinModalDevice={setPromptPinModalDevice} device={promptPinModalDevice} enumerate={enumerate} />
      <DevicesWrapper>
        {configuredDevices.map((device, index) => (
          <DeviceWrapper
            key={index}
            imported={true}
            displayLoadingCursor={deviceActionLoading !== null}>
            <IconWrapper style={{ color: green }}>
              <StyledIcon as={CheckCircle} size={24} />
            </IconWrapper>
            <DeviceImage
              src={
                device.type === 'coldcard' ? require('../assets/coldcard.png')
                  : device.type === 'ledger' ? require('../assets/ledger.png')
                    : require('../assets/trezor.png')
              } />
            <DeviceInfoWrapper>
              <DeviceName>{device.type}</DeviceName>
              <DeviceFingerprint imported={true}>{device.fingerprint}</DeviceFingerprint>
            </DeviceInfoWrapper>
          </DeviceWrapper>
        ))}

        {unconfiguredDevices.map((device, index) => {
          const deviceError = errorDevices.includes(device.fingerprint);
          const deviceWarning = !device.fingerprint; // if ledger isn't in the BTC app or trezor is locked, it wont give fingerprint, so show warning
          return (
            <DeviceWrapper
              key={index}
              onClick={async () => {
                if (deviceActionLoading === null) {
                  if (deviceWarning) {
                    if (device.type === 'trezor') {
                      setPromptPinModalDevice(device);
                    } else {
                      await enumerate();
                    }
                  } else {
                    performDeviceAction(device, index)
                  }
                }
              }}
              loading={deviceActionLoading === index}
              warning={deviceWarning}
              error={deviceError}
              displayLoadingCursor={deviceActionLoading !== null}
            >
              {deviceError || deviceWarning && (
                <IconWrapper style={{ color: red }}>
                  <StyledIcon as={ErrorOutline} size={24} />
                </IconWrapper>
              )}
              <DeviceImage
                loading={deviceActionLoading === index}
                src={
                  device.type === 'coldcard' ? require('../assets/coldcard.png')
                    : device.type === 'ledger' ? require('../assets/ledger.png')
                      : require('../assets/trezor.png')
                } />
              <DeviceInfoWrapper>
                <DeviceName>{device.type}</DeviceName>
                <DeviceFingerprint>{device.fingerprint}</DeviceFingerprint>
                <ImportedWrapper>
                  {deviceActionLoading === index ? (
                    <ConfiguringText error={deviceError} style={{ textAlign: 'center' }}>
                      {deviceActionLoadingText}
                      <ConfiguringAnimation>.</ConfiguringAnimation>
                      <ConfiguringAnimation>.</ConfiguringAnimation>
                      <ConfiguringAnimation>.</ConfiguringAnimation>
                    </ConfiguringText>
                  ) : deviceError || deviceWarning ? (
                    <ConfiguringText error={true} warning={deviceWarning}>
                      {deviceError ? 'Click to Retry' : device.type === 'ledger' ? 'Open Bitcoin App on Device' : 'Click to enter PIN'}
                    </ConfiguringText>
                  ) : (
                        <ConfiguringText>
                          {deviceActionText}
                        </ConfiguringText>
                      )}
                </ImportedWrapper>
              </DeviceInfoWrapper>
            </DeviceWrapper>
          )
        }
        )}

        {unconfiguredDevices.length === 0 && configuredDevices.length === 0 && !devicesLoading && (
          <NoDevicesContainer>
            <NoDevicesWrapper>
              <NoDevicesHeader>No devices detected</NoDevicesHeader>
              <StyledIcon as={ErrorOutline} size={96} />
              <NoDevicesSubheader>Please make sure your device is connected and unlocked.</NoDevicesSubheader>
            </NoDevicesWrapper>
          </NoDevicesContainer>
        )}
      </DevicesWrapper>

      {unconfiguredDevices.length === 0 && configuredDevices.length === 0 && devicesLoading && (
        <NoDevicesContainer>
          <LoadingDevicesWrapper>
            <img src={require('../assets/flower-loading.svg')} style={{ maxWidth: '6.25em' }} />
            <LoadingText>Loading Devices</LoadingText>
            <LoadingSubText>Please wait...</LoadingSubText>
          </LoadingDevicesWrapper>
        </NoDevicesContainer>
      )}

      {configuredDevices.length < configuredThreshold && <ScanDevicesButton background={white} color={blue} onClick={enumerate}>{devicesLoading ? 'Updating Device List...' : 'Scan for devices'}</ScanDevicesButton>}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  background: ${white};
`;

const NoDevicesContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25em;
`;

const NoDevicesWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5em;
  justify-content: center;
  color: ${black};
  text-align: center;
`;

const LoadingDevicesWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5em;
  justify-content: center;
  color: ${gray};
  text-align: center;
`;


const NoDevicesHeader = styled.h3`

`;


const NoDevicesSubheader = styled.h4`

`;

const ConfiguringText = styled.div`
  color: ${p => p.error ? gray600 : darkGray};
  font-size: ${p => p.warning ? '0.75em' : '1em'};
  text-align: center;
`;

const DevicesWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 1.25em;
  overflow: scroll;
`;

const DeviceInfoWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
`;

const IconWrapper = styled.div`
  position: absolute;
  align-self: flex-end;
  top: 0.65em;
`;

const DeviceWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding: .75em;
  margin: 1.5em;
  margin-bottom: 0px;
  flex: 0 1 15.625em;
  border-radius: 4px;
  position: relative;

  background: ${p => p.imported ? lightGreen : p.error ? lightRed : p.warning ? lightYellow : 'none'};
  border: ${p => p.imported ? `1px solid ${green}` : p.error ? `1px solid ${red}` : p.warning ? `1px solid ${yellow}` : '1px solid transparent'};

  &:hover {
    cursor: ${p => p.displayLoadingCursor ? 'wait' : 'pointer'};
`;

const DeviceImage = styled.img`
  display: block;
  width: auto;
  height: auto;
  max-height: 250px;
  max-width: 6.25em;

  animation-name: ${p => p.loading ? blinking : 'none'};
  animation-duration: 1.4s;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
`;

const DeviceName = styled.h4`
  text-transform: capitalize;
  margin-bottom: 2px;
  font-weight: 500;
`;

const DeviceFingerprint = styled.h5`
  color: ${p => p.imported ? darkGray : gray};
  margin: 0;
  font-weight: 100;
`;

const LoadingText = styled.div`
  font-size: 1.5em;
  margin: 4px 0;
`;

const LoadingSubText = styled.div`
    font-size: .75em;
`;

const ImportedWrapper = styled.div``;

const ScanDevicesButton = styled.button`
  ${Button};
  padding: 1em;
  font-size: 1em;
  width: fit-content;
  align-self: center;
  border: 1px solid ${blue};
  margin-bottom: 1em;
`;

const blinking = keyframes`
  0% { opacity: .2; }
  50% { opacity: 1; }
  100% { opacity: .2; }
`;

const ConfiguringAnimation = styled.span`
  animation-name: ${blinking};
  animation-duration: 1.4s;
  animation-iteration-count: infinite;
  animation-fill-mode: both;

  // &:nth-child(2) {
  //   animation-delay: .2s;
  // }

  // &:nth-child(3) {
  //   animation-delay: .4s;
  // }
`;