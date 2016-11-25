var net = require('net');
var http = require('http');
var crypto = require('crypto');
var CryptoJS = require("crypto-js");

var obj = WirelessKeypad.prototype;

function WirelessKeypad(){
	this._settings = Homey.manager('settings').get('wirelesskeypad-settings');
}

obj.getPrivateKey = function() {
	return this._settings.privateKey;
}

obj.getAccessKeys = function() {
	return this._settings.accessKeys;
}

obj.getAccessKeyByEnteredCode = function(enteredCode) {
	if ((enteredCode == null) || (enteredCode.length == 0)) return null;
	for (var idx = 0; idx < this._settings.accessKeys.length; idx++)
		if (this._settings.accessKeys[idx].code.toLowerCase() == enteredCode.toLowerCase())
			return this._settings.accessKeys[idx];
	return null;
}

obj.createGuid = function() { 
	var s4 = function() { return (((1+Math.random())*0x10000)|0).toString(16).substring(1); };
	return (s4() + s4() + '-' + s4() + '-4' + s4().substr(0,3) + '-' + s4() + '-' + s4() + s4() + s4()).toLowerCase();
};

obj.createHash = function(ipAddress, macAddress, privateKey, secondsSinceEpoch) {
  var valueToHash = macAddress + '-' + privateKey + '-' + ipAddress + '-$up3rS3cr3t!-' + secondsSinceEpoch;
  var md5sum = crypto.createHash('md5');
  md5sum.update(valueToHash);
  return md5sum.digest('hex');
}

obj.parseJson = function(jsonText) {
	try {
		if ((jsonText == null) || (jsonText.length == 0)) return null;
		return JSON.parse(jsonText);
	} catch(e) {
		return null;
	}
}

obj.isValidReceivedMessage = function(jsonObj) {
	try {
		if (jsonObj == null) return false;
		if ((jsonObj.type == null) || (jsonObj.type.length == 0)) return false;
		if ((jsonObj.hash == null) || (jsonObj.hash.length == 0)) return false;
		return true;
	} catch(e) {
		return false;
	}
}

obj.secondsSinceEpoch = function(){ 
	return Math.floor(Date.now() / 1000);
}

obj.performHttpRequest = function(hostName, pathName, portNumber, httpMethod, data, callback) {
	try {
		if ((portNumber == 0) || (portNumber <= 0)) portNumber = 80;
		if ((httpMethod == null) || (httpMethod.length == 0)) httpMethod = 'GET';
		
		console.log('Performing HTTP '+httpMethod+' to ' + hostName + ':' + portNumber + pathName + ' with data "' + data + '".');
		
		var httpRequest = http.request({
			host: hostName,
			path: pathName,
			port: portNumber,
			method: httpMethod
		}, function(httpResponse){
			var responseText = ''
			httpResponse.on('data', function (chunk){ responseText += chunk; });
			httpResponse.on('end', function() {
				callback(null, responseText);
			});
		});
		httpRequest.on('socket', function (socket) {
			socket.setTimeout(30000);
			socket.on('timeout', function() {
				console.log('Aborting HTTP request due to time-out.');
				httpRequest.abort();
			});
		});
		httpRequest.on('error', function(err) { 
			callback(err, null); 
		});
		if ((data != null) && (data.length > 0))
			httpRequest.write(data);
		httpRequest.end();
	} catch (e) {
		callback(e, null);
	}
}

obj.getAccessKeysForAutocomplete = function() {
	var accessKeys = this.getAccessKeys();
	var items = [];
	for (var idx = 0; idx < accessKeys.length; idx++)
		items[items.length] = {
			accessKeyId: accessKeys[idx].id,
			name: accessKeys[idx].description
		};
	return items;
}

obj.getBuzzerTypesForAutocomplete = function() {
	var buzzerTypes = ['armed', 'disarmed', 'acknowledged', 'failed', 'keypressed'];
	var buzzers = [];
	for (var idx = 0; idx < buzzerTypes.length; idx++)
		buzzers[buzzers.length] = { id:buzzerTypes[idx], name: __('buzzer.'+buzzerTypes[idx])};
	return buzzers;
}

module.exports = WirelessKeypad;

String.prototype.normalize = function(){
	var str = this;
	if (str == null)
		str = '';
	return str.trim().toLowerCase();
}

String.prototype.startsWith = function(text){
	if ((this == null) || (text == null) || (this.length == 0) || (text.length == 0)) return false;
	if (this.indexOf(text) >= 0) return true;
	return false;
}

String.prototype.isValidMacAddress = function() {
	var regex = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/;
	return regex.test(this);
}
