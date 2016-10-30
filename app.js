"use strict";
var WirelessKeypad = require('./../../lib/wireless-keypad.js');
var _wirelessKeypad = new WirelessKeypad();
var DEBUG = true;

// Initialize app
module.exports.init = function(){};

// Handle autocomplete params
Homey.manager('flow').on('trigger.access_code.keyname.autocomplete', function(callback, args){ callback(null, _wirelessKeypad.getAccessKeysForAutocomplete()); });
Homey.manager('flow').on('action.buzzer.buzzertype.autocomplete', function(callback, args){ callback(null, _wirelessKeypad.getBuzzerTypesForAutocomplete()); });

// Perform buzzer avtion
Homey.manager('flow').on('action.buzzer', function(callback, args){
	var successful = false;
	if ((args != null) && (args.buzzertype != null) && (args.device != null) && (args.device.id != null)) {
		var driver = Homey.manager('drivers').getDriver('wirelesskeypad-wifi');
		driver.requestBuzzerSound(args.device.id, args.buzzertype.id);
		successful = true;
	}
	callback(null, successful);
});

// Perform enable action
Homey.manager('flow').on('action.enable', function(callback, args){
	var successful = false;
	if ((args != null) && (args.device != null) && (args.device.id != null)) {
		var driver = Homey.manager('drivers').getDriver('wirelesskeypad-wifi');
		driver.enableDevice(args.device.id, true);
		successful = true;
		if (DEBUG) Homey.log('Enabled device ' + args.device.id + ' due to disable action.');
	}
	callback(null, successful);
});

// Perform disable action
Homey.manager('flow').on('action.disable', function(callback, args){
	var successful = false;
	if ((args != null) && (args.device != null) && (args.device.id != null)) {
		var driver = Homey.manager('drivers').getDriver('wirelesskeypad-wifi');
		driver.enableDevice(args.device.id, false);
		successful = true;
		if (DEBUG) Homey.log('Disabled device ' + args.device.id + ' due to disable action.');
	}
	callback(null, successful);
});

// Check access_code trigger
Homey.manager('flow').on('trigger.access_code', function(callback, args, state){
	var canTrigger = false;
	// Have we been triggered for the correct acess key?
	if ((args != null) && (args.keyname != null) && (state != null) && (args.keyname.accessKeyId != null) && (state.accessKeyId != null) && (args.keyname.accessKeyId == state.accessKeyId))
		canTrigger = true;
	callback(null, canTrigger);
});
