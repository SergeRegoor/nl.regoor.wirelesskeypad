"use strict";
var WirelessKeypad = require('./../../lib/wireless-keypad.js');
var DEBUG = true;

module.exports = [
	{
		description:			'Check-in device',
		method: 				'GET',
		path:					'/check-in/',
		requires_authorization:	false,
		fn: function(callback, args) {
			var result = {
				successful: false,
				homeySecondsSinceEpoch: 0,
				checkInTimeOutInSeconds: 0,
				hash: '',
				errorMessage: ''
			};
			try {
				var wirelessKeypad = new WirelessKeypad();
				var driver = Homey.manager('drivers').getDriver('wirelesskeypad-wifi');
				var secondsSinceEpoch = wirelessKeypad.secondsSinceEpoch();
				result.homeySecondsSinceEpoch = secondsSinceEpoch;
				
				// Get parameters
				var deviceId = args.query.deviceid;
				var deviceTime = args.query.devicetime;
				var hash = args.query.hash;
				
				// Check parameters
				if ((deviceId == null) || (deviceId.length == 0)) throw new Error('Missing device ID parameter');
				if ((deviceTime == null) || (deviceTime.length == 0)) throw new Error('Missing device time parameter');
				if ((hash == null) || (hash.length == 0)) throw new Error('Missing hash parameter');
				
				// Get device and check hash
				var device = driver.getDeviceById(deviceId);
				if (device == null) throw new Error('Could not find device');
				if (hash != wirelessKeypad.createHash(device.settings.ipAddress, device.settings.macAddress, wirelessKeypad.getPrivateKey(), deviceTime)) throw new Error('Hash does not match.');
				
				// Handle check-in
				driver.setLastCheckIn(deviceId, deviceTime);
				result.successful = true;
				result.checkInTimeOutInSeconds = device.settings.checkInTimeOutMinutes * 60;
				result.hash = wirelessKeypad.createHash(device.settings.ipAddress, device.settings.macAddress, wirelessKeypad.getPrivateKey(), secondsSinceEpoch);
				if (DEBUG) Homey.log('Successfully processed device check-in for device ' + deviceId + '.');
			} catch(exception) {
				result.successful = false;
				result.errorMessage = exception.message;
				if (DEBUG) Homey.log('Exception in API check-in: ' + exception.message);
			}
			callback(null, result);
		}
	},
	{
		description:			'Access key',
		method: 				'GET',
		path:					'/access-key/',
		requires_authorization:	false,
		fn: function(callback, args) {
			var isInvalidCode = false;
			
			var result = {
				successful: false,
				hash: '',
				errorMessage: ''
			};
			try {
				var wirelessKeypad = new WirelessKeypad();
				var driver = Homey.manager('drivers').getDriver('wirelesskeypad-wifi');
				var secondsSinceEpoch = wirelessKeypad.secondsSinceEpoch();
				
				// Get parameters
				var deviceId = args.query.deviceid;
				var deviceTime = args.query.devicetime;
				var enteredCode = args.query.enteredcode;
				var hash = args.query.hash;
				
				// Check parameters
				if ((deviceId == null) || (deviceId.length == 0)) throw new Error('Missing device ID parameter');
				if ((deviceTime == null) || (deviceTime.length == 0)) throw new Error('Missing device time parameter');
				if ((hash == null) || (hash.length == 0)) throw new Error('Missing hash parameter');
				if ((enteredCode == null) || (enteredCode.length == 0)) throw new Error('Missing entered code parameter');
				
				// Get device and check hash
				var device = driver.getDeviceById(deviceId);
				if (device == null) throw new Error('Could not find device');
				if (hash != wirelessKeypad.createHash(device.settings.ipAddress, device.settings.macAddress, wirelessKeypad.getPrivateKey(), deviceTime)) throw new Error('Hash does not match.');
				
				//Check if device is active
				if (!device.settings.enableDevice) throw new Error('Device is disabled.');
				
				// Check if device time is OK
				var numberOfSecondsSinceLastCheckIn = secondsSinceEpoch - device.lastCheckInSeconds;
				var numberOfSecondsDifferenceInDeviceTime = deviceTime - device.deviceTime;
				var secondsOffset = Math.abs(numberOfSecondsSinceLastCheckIn - numberOfSecondsDifferenceInDeviceTime);
				if (secondsOffset > 10) throw new Error('More than 10 seconds in time difference, possible tampering.');
				
				// Check access key
				var accessKey = wirelessKeypad.getAccessKeyByEnteredCode(enteredCode);
				if ((accessKey == null) || ((accessKey != null) && !accessKey.isActive)) {
					isInvalidCode = true;
					throw new Error('Invalid access key');
				}
				
				// Valid access key, trigger access
				if (DEBUG) Homey.log('Valid access key found for entered code. Triggering device.');
				result.successful = true;
				driver.triggerAccessForDevice(device, accessKey);
				
			} catch(exception) {
				result.successful = false;
				result.errorMessage = exception.message;
				if (DEBUG) Homey.log('Exception in API access-key: ' + exception.message);
				
				if (isInvalidCode)
					driver.triggerInvalidCode(device);
			}
			callback(null, result);
		}
	}
]