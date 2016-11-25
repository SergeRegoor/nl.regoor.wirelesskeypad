"use strict";
var dgram = require('dgram');
var ip = require('ip');
var strftime = require('strftime');
var WirelessKeypad = require('./../../lib/wireless-keypad.js');

// Settings
var DEBUG										= true;
var UDP_PORT_RECEIVE							= 60505;
var TCP_PORT_REQUEST							= 60506;
var DEVICE_AVAILABILITY_CHECK_ITERATION_SECONDS	= 60;

// Variables
var _devices = [];
var _wirelessKeypad = new WirelessKeypad();
var _listenToUdpBroadcast = false;
var _socketMulticastReceive = null;

// Initialize driver
module.exports.init = function(deviceDatas, callback) {
	// Iterate through devices
    deviceDatas.forEach(function(deviceData){
    	// Set device offline (will be put online after check-in)
    	module.exports.setUnavailable(deviceData, 'Offline');
    	// Initialize device
        var device = module.exports.initializeWifiDevice(deviceData);
        // Load device settings
		module.exports.getSettings(deviceData, function(err, settings){
			device.settings = settings;
		})
    });
    
    // Wait a couple of settings to allow settings to load, then request check-in from all devices
    setTimeout(function(){ module.exports.requestCheckInFromDevices(); }, 3000);
    
    // Check device availability after one minute
    setTimeout(function(){ module.exports.checkDevices(); }, DEVICE_AVAILABILITY_CHECK_ITERATION_SECONDS * 1000);
    
    callback();
}

// Add new device to local array, and retrieve the device's settings
module.exports.added = function(deviceData, callback) {
	var device = module.exports.initializeWifiDevice(deviceData);
    // Load device settings
	module.exports.getSettings(deviceData, function(err, settings){
		device.settings = settings;
	})
	callback(null, true);
}

// Remove the device from the local array
module.exports.deleted = function(deviceData, callback ) {
	var idxToDelete = -1;
	for (var idx = 0; idx < _devices.length; idx++)
		if (_devices[idx].deviceId == deviceData.id)
			idxToDelete = idx;
	if (idxToDelete >= 0)
		_devices.splice(idxToDelete, 1);
	callback(null, true);
}

// Start pairing
module.exports.pair = function(socket) {
    // Return private key to front-end
    socket.on('getPrivateKey', function(data, callback){ callback(null, _wirelessKeypad.getPrivateKey()); });
    
    // Start binding process from Homey
    socket.on('start', function(data, callback){
    	// Return true to let front-end know we're starting
		callback(null, true);
		
		// Create new device ID
		var newDeviceId = _wirelessKeypad.createGuid();
		if (DEBUG) Homey.log('Start pairing. New device ID: '+newDeviceId);
		
		// Set up UDP multicast listener for new device pairing
		module.exports.startUdpBroadcastListening(socket, newDeviceId, true);
		
		// Set time-out for pairing (one minute)
		setTimeout(function(){
			if (module.exports.isListeningToUdpBroadcast()) {
				module.exports.stopUdpBroadcastListening();
				socket.emit('status', {busy:false, error:true, message:__('pair.message_timeout')});
			}
		}, 5 * 60 * 1000);
	});
    
    socket.on('disconnect', function(){
    	module.exports.stopUdpBroadcastListening();
        if (DEBUG) Homey.log('Disconnect received from front-end.');
    });
}

module.exports.handleReceivedUdpBroadcastMessage = function(newDeviceId, receivedMessage, returnInfo, socket) {
	if (!module.exports.isListeningToUdpBroadcast()) return;
	
	// Get message and device IP address
	var message = receivedMessage.toString();
	var deviceIpAddress = returnInfo.address;
	if (DEBUG) Homey.log('Received UDP packet from "' + deviceIpAddress + '" with message: "' + message + '".');
	
	// Check message validity (prefix:MAC address)
	var broadcastMessagePrefix = 'homey-wireless-keypad-broadcast:';
	if (!message.startsWith(broadcastMessagePrefix)) {
		if (DEBUG) Homey.log('Received UDP message is invalid.');
	} else {
		var deviceMacAddress = message.substring(broadcastMessagePrefix.length);
		if (!deviceMacAddress.isValidMacAddress()) {
			if (DEBUG) Homey.log('UDP message contains invalid MAC address ('+deviceMacAddress+').');
		} else {
			// Disable UDP processing, and update front-end with status
			module.exports.stopUdpBroadcastListening();
			
			// Check if there's a device already with the MAC address
			var existingDevice = module.exports.getDeviceByMacAddress(deviceMacAddress);
			if (existingDevice != null) {
				socket.emit('status', {busy:true, error:false, message:__('pair.message_existing_device')});
				newDeviceId = existingDevice.deviceId;
				if (DEBUG) Homey.log('Device is already known in Homey. Using existing device id: ' + newDeviceId);
			}
			
			// Update front-end with status
			socket.emit('status', {busy:true, error:false, message:__('pair.message_configuring_device')});
			var secondsSinceEpoch = _wirelessKeypad.secondsSinceEpoch();
			
			// perform HTTP request for binding
			_wirelessKeypad.performHttpRequest(deviceIpAddress, '/bind', TCP_PORT_REQUEST, 'POST', JSON.stringify({
				type: 'bind',
				homeyIpAddress: ip.address(),
				homeySecondsSinceEpoch: secondsSinceEpoch,
				deviceId: newDeviceId,
				hash: _wirelessKeypad.createHash(deviceIpAddress, deviceMacAddress, _wirelessKeypad.getPrivateKey(), secondsSinceEpoch)
			}), function(err, jsonResponseText){
				if (err) {
					if (DEBUG) Homey.log('Error in HTTP request: ' + err);
					socket.emit('status', {busy:true, error:true, message:__('pair.message_connection_error')+' '+err});
					module.exports.startUdpBroadcastListening(socket, newDeviceId, false);
				} else {
					if (DEBUG) Homey.log('Received HTTP response from device: ' + jsonResponseText);
					
					// Parse and check JSON response
					var jsonResponse = _wirelessKeypad.parseJson(jsonResponseText);
					if (jsonResponse == null) {
						if (DEBUG) Homey.log('HTTP response from device is not valid JSON.');
						socket.emit('status', {busy:false, error:true, message:__('pair.message_malformed_error')});
					} else if (!jsonResponse.successful) {
						if (DEBUG) Homey.log('Response unsuccessful. Error: ' + jsonResponse.errorMessage);
						socket.emit('status', {busy:false, error:true, message:__('pair.message_configuration_error')+' '+jsonResponse.errorMessage});
					} else {
						// Inform front-end of finished pairing. The front-end will actually add the device to Homey.
						socket.emit('finish', {
							deviceId: newDeviceId,
							ipAddress: deviceIpAddress,
							macAddress: deviceMacAddress,
							isExistingDevice: existingDevice != null
						}, function(err, result){
							if (err && DEBUG) Homey.log('Finish error from front-end: ' + err);
							if (!err && DEBUG) Homey.log('Finish success from front-end: ' + result);
						});
					}
				}
			});
		}
	}
}

// Save new device settings to local array
module.exports.settings = function(deviceData, newSettingsObj, oldSettingsObj, changedKeys, callback) {
    var device = module.exports.getDeviceById(deviceData.id);
    if (device != null) {
    	device.settings = newSettingsObj;
    	module.exports.requestCheckIn(device);
    }
    callback();
}

// Apply last check-in date
module.exports.setLastCheckIn = function(deviceId, deviceTime) {
	// Check if device is known
	var device = module.exports.getDeviceById(deviceId);
	if (device == null) return;
	
	// Get current time
	var secondsSinceEpoch = _wirelessKeypad.secondsSinceEpoch();
	
	// Set device back to available
	module.exports.setAvailable(device.data);
	device.isOnline = true;
	
	// Set device settings
	device.deviceTime = deviceTime;
	device.lastCheckInSeconds = secondsSinceEpoch;
	
	// Format readable date format, and write to settings
	var readableDate = strftime('%H:%M:%S @ %A %e %B %Y');
	device.settings.lastCheckIn = readableDate;
	module.exports.setSettings(device.data, { lastCheckIn:readableDate });
}

// Search for device in local array by device's ID
module.exports.getDeviceById = function(deviceId) {
	for (var idx = 0; idx < _devices.length; idx++)
		if (_devices[idx].deviceId == deviceId)
			return _devices[idx];
	return null;
}

// Search for device in local array by device's ID
module.exports.getDeviceByMacAddress = function(macAddress) {
	for (var idx = 0; idx < _devices.length; idx++)
		if (_devices[idx].settings.macAddress.toLowerCase() == macAddress.toLowerCase())
			return _devices[idx];
	return null;
}

// Request buzzer sound
module.exports.requestBuzzerSound = function(deviceId, buzzerType) {
	if (DEBUG) Homey.log('Requesting buzzer sound "' + buzzerType + '" for device ' + deviceId);
	var device = module.exports.getDeviceById(deviceId);
	if (device == null) return;
	
	// Perform HTTP request to device
	var secondsSinceEpoch = _wirelessKeypad.secondsSinceEpoch();
	_wirelessKeypad.performHttpRequest(device.settings.ipAddress, '/request-buzzer', 60506, 'POST', JSON.stringify({
		type: 'request-buzzer',
		buzzer: buzzerType,
		homeySecondsSinceEpoch: secondsSinceEpoch,
		hash: _wirelessKeypad.createHash(device.settings.ipAddress, device.settings.macAddress, _wirelessKeypad.getPrivateKey(), secondsSinceEpoch)
	}), function(err, jsonResponseText){
		if (err) {
			if (DEBUG) Homey.log('Error in HTTP request for buzzer request: ' + err);
		} else {
			if (DEBUG) Homey.log('Received HTTP response from device: ' + jsonResponseText);
			
			// Parse and check JSON response
			var jsonResponse = _wirelessKeypad.parseJson(jsonResponseText);
			if (jsonResponse == null) {
				if (DEBUG) Homey.log('HTTP response from device is not valid JSON.');
			} else if (!jsonResponse.successful) {
				if (DEBUG) Homey.log('Response unsuccessful. Error: ' + jsonResponse.errorMessage);
			} else {
				if (DEBUG) Homey.log('Successfully requested buzzer at device. The buzzer will sound shortly.');
			}
		}
	});
}

// Enable or disable the specified device
module.exports.enableDevice = function(deviceId, enableDevice) {
	var device = module.exports.getDeviceById(deviceId);
	if (device == null) return;
	if (DEBUG) Homey.log('Setting device enabled to "' + enableDevice + '" for device ' + deviceId);
	device.settings.enableDevice = enableDevice;
	module.exports.setSettings(device.data, {
		enableDevice:enableDevice
	}, function( err, settings ){
		if (err && DEBUG) Homey.log('Error updating enableDevice setting to new value.');
		if (!err && DEBUG) Homey.log('Successfully updated enableDevice setting to new value.');
	});	
}

// Request check-ins from all devices
module.exports.requestCheckInFromDevices = function() {
	for (var idx = 0; idx < _devices.length; idx++)
		if (!_devices[idx].isOnline)
			module.exports.requestCheckIn(_devices[idx]);
}

// Request a check-in to the specified device
module.exports.requestCheckIn = function(device) {
	if (DEBUG) Homey.log('Requesting check-in for device ' + device.deviceId);
	
	// Perform HTTP request to device
	var secondsSinceEpoch = _wirelessKeypad.secondsSinceEpoch();
	_wirelessKeypad.performHttpRequest(device.settings.ipAddress, '/request-check-in', 60506, 'POST', JSON.stringify({
		type: 'request-check-in',
		homeySecondsSinceEpoch: secondsSinceEpoch,
		hash: _wirelessKeypad.createHash(device.settings.ipAddress, device.settings.macAddress, _wirelessKeypad.getPrivateKey(), secondsSinceEpoch)
	}), function(err, jsonResponseText){
		if (err) {
			if (DEBUG) Homey.log('Error in HTTP request for check-in request: ' + err);
		} else {
			if (DEBUG) Homey.log('Received HTTP response from device: ' + jsonResponseText);
			
			// Parse and check JSON response
			var jsonResponse = _wirelessKeypad.parseJson(jsonResponseText);
			if (jsonResponse == null) {
				if (DEBUG) Homey.log('HTTP response from device is not valid JSON.');
			} else if (!jsonResponse.successful) {
				if (DEBUG) Homey.log('Response unsuccessful. Error: ' + jsonResponse.errorMessage);
			} else {
				if (DEBUG) Homey.log('Successfully requested check-in at device. The device will check-in shortly.');
			}
		}
	});
}

// Check for device availability every minute
module.exports.checkDevices = function() {
	if (module.exports.isListeningToUdpBroadcast()) return;
	if (DEBUG) Homey.log('Checking device availability...');
	var secondsSinceEpoch = _wirelessKeypad.secondsSinceEpoch();
	
	for (var idx = 0; idx < _devices.length; idx++) {
		var device = _devices[idx];
		
		// Reset device tamper if necessary
		if ((device.tamperStartSecondsSinceEpoch > 0) && ((device.tamperStartSecondsSinceEpoch + (device.settings.invalidCodeTimeOutMinutes*60)) < secondsSinceEpoch)) {
			module.exports.resetTamperForDevice(device);
			if (DEBUG) Homey.log('Tamper for device ' + device.deviceId + ' has been lifted.');
		}
		
		if (device.isOnline) {
			var setToUnavailable = false;
			// If device has not checked in yet, set to unavailable
			if (device.lastCheckInSeconds <= 0)
				setToUnavailable = true;
			else if (device.settings.checkInTimeOutMinutes > 0) {
				// If the check-in time-out has been configured, check if it has timed out
				if (secondsSinceEpoch > (device.lastCheckInSeconds + ((device.settings.checkInTimeOutMinutes + 1) * 60))) // Give the device an extra minute
					setToUnavailable = true;
			}
			
			if (setToUnavailable) {
				if (DEBUG) Homey.log('Device '+device.deviceId + ' has not checked in in the last ' + device.settings.checkInTimeOutMinutes + ' minutes, setting to unavailable.');
				device.isOnline = false;
				device.deviceTime = 0;
				device.lastCheckInSeconds = 0;
				module.exports.setUnavailable(device.data, 'Offline');
				
				// Trigger offline for flows
				module.exports.triggerDevice(device.deviceId, 'offline');
			}
		}
	}
	
	// Execute function again in configured nr of seconds
    setTimeout(function(){ module.exports.checkDevices(); }, DEVICE_AVAILABILITY_CHECK_ITERATION_SECONDS * 1000);	
}

// Fire a trigger for the specified device
module.exports.triggerDevice = function(deviceId, triggerName, state) {
	if (state == null) state = {};
	var device = module.exports.getDeviceById(deviceId);
	if (device == null) {
		if (DEBUG) Homey.log('Cannot trigger ' + triggerName + ' for device ' + deviceId + ', the device cannot be found.');
		return;
	}
	if (DEBUG) Homey.log('Triggering ' + triggerName + ' for device ' + deviceId);
	Homey.manager('flow').triggerDevice(triggerName, {}, state, device.data, function(err, success){
		if (!success && DEBUG) Homey.log('Error triggering ' + triggerName + ' for device ' + deviceId + ': ' + err);
		if (success && DEBUG) Homey.log('Successfully triggered ' + triggerName + ' for device ' + deviceId + '.');
	});
}

// Set up UDP multicast listener for new device pairing
module.exports.startUdpBroadcastListening = function(socket, newDeviceId, isInitial) {
	var broadcastIpAddress = ip.or(ip.address(), '0.0.0.255');
	if (DEBUG) Homey.log('Listening to UDP broadcasts on IP address ' + broadcastIpAddress);
	_socketMulticastReceive = dgram.createSocket('udp4');
	_socketMulticastReceive.bind(UDP_PORT_RECEIVE, broadcastIpAddress, function(){ _socketMulticastReceive.setBroadcast(true); });
	
	// Execute when UDP broadcast message has been received
	_socketMulticastReceive.on('message', function(receivedMessage, returnInfo) {
		module.exports.handleReceivedUdpBroadcastMessage(newDeviceId, receivedMessage, returnInfo, socket);
	});
	_listenToUdpBroadcast = true;
	if (isInitial)
		socket.emit('status', {busy:true, error:false, message:__('pair.message_start_pairing')});
}

// Check if driver is listening to UDP broadcasts
module.exports.isListeningToUdpBroadcast = function() {
	return _listenToUdpBroadcast && (_socketMulticastReceive != null);
}

// Stop UDP multicast listener
module.exports.stopUdpBroadcastListening = function() {
	if (_socketMulticastReceive != null) {
		_socketMulticastReceive.close();
		_socketMulticastReceive = null;
	}
	_listenToUdpBroadcast = false;
	if (DEBUG) Homey.log('Stopped listening to UDP broadcasts.');
}

// Trigger access for the device
module.exports.triggerAccessForDevice = function(device, accessKey) {
	if ((device == null) || (accessKey == null)) return;
	module.exports.resetTamperForDevice(device);
	module.exports.triggerDevice(device.deviceId, 'access_code', { accessKeyId:accessKey.id });
	module.exports.triggerDevice(device.deviceId, 'access');
	if (DEBUG) Homey.log('Triggered access for device ' + device.deviceId + ' and access key ' + accessKey.id);
}

// Trigger invalid code (and tamper if needed) for device
module.exports.triggerInvalidCode = function(device) {
	if (device == null) return;
	module.exports.triggerDevice(device.deviceId, 'invalid_code');
	
	// Setting/updating device tamper variables
	var secondsSinceEpoch = _wirelessKeypad.secondsSinceEpoch();
	if (device.tamperStartSecondsSinceEpoch <= 0)
		device.tamperStartSecondsSinceEpoch = secondsSinceEpoch;
	device.tamperNumberOfInvalidCodes++;
	
	// Check if tamper is in range of the configured time-out
	if (device.tamperStartSecondsSinceEpoch > 0) {
		// Check if the number of invalid codes invalidates the tamper trigger
		if (device.tamperNumberOfInvalidCodes >= device.settings.invalidCodeTamperThreshold) {
			// Trigger tamper for the device
			module.exports.triggerDevice(device.deviceId, 'tamper');
		}
	}
	
	// Update the tamper time of the device
	device.tamperStartSecondsSinceEpoch = secondsSinceEpoch;
}

module.exports.resetTamperForDevice = function(device) {
	device.tamperStartSecondsSinceEpoch = 0;
	device.tamperNumberOfInvalidCodes = 0;
}

// Initialize device and add to local array
module.exports.initializeWifiDevice = function(deviceData) {
	if (DEBUG) Homey.log('Adding device ' + deviceData.id + ' to local array.');
	var device = {
		deviceId: deviceData.id,
		deviceTime: 0,
		lastCheckInSeconds: 0,
		isOnline: false,
		tamperStartSecondsSinceEpoch: 0,
		tamperNumberOfInvalidCodes: 0,
		settings: {},
		state: '',
		data: deviceData
	};
	_devices[_devices.length] = device;
	return device;
}
