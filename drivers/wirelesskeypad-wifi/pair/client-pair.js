// Execute on page load
$(document).ready(function(){
	$('body').loadLocalizedTexts();
	
	// Load page texts
	$('.page.pageStart').attr('rel-title', __('pair.page_start_title'));
	$('.page.pageConnectWifi').attr('rel-title', __('pair.page_connectwifi_title'));
	$('.page.pageWifiTrouble').attr('rel-title', __('pair.page_wifitrouble_title'));
	$('.page.pageKeypad').attr('rel-title', __('pair.page_keypad_title'));
	$('.page.pageKeypadTrouble').attr('rel-title', __('pair.page_keypadtrouble_title'));
	$('.page.pageStartPairing').attr('rel-title', __('pair.page_startpairing_title'));
	
	// Hide all pages, and show Start page
	$('.page').hide();
	$('#privateKeyContainer').hide();
	showPage('Start');
	
	// Handle page button click
	$('.pageButton').click(function(e){ e.preventDefault(); showPage($(this).attr('rel-step')); });
	
	// Get private key and load in UI
	Homey.emit('getPrivateKey', null, function(err, result) {
		if (err || (result == null) || (result.length == 0)) return;
		$('#privateKey').text(result);
		$('#privateKeyContainer').show();
	});
});

// Show page based on page name
function showPage(pageName) {
	$('.page').hide();
	$('.page.page'+pageName).show();
	Homey.setTitle($('.page.page'+pageName).attr('rel-title'));
	
	// Start pairing when needed
	if (pageName.toLowerCase() == 'startpairing')
		startPairing();
}

// Start pairing between Wireless Keypad and Homey
function startPairing() {
	$('.pageStartPairing .loadingIcon').fadeIn();
	
	// Add listening start message to UI
	Homey.emit('start', null, function(err, result){ /*$('#statusList').append($('<li>').text(__('pair.message_start_pairing')));*/ });
	
	// Add status update from back-end to UI
	Homey.on('status', function(statusObj, callback) {
		if (statusObj == null) return;
		if ((statusObj.message != null) && (statusObj.message.length > 0))
			$('#statusList').append($('<li>').text(statusObj.message));
		if ((statusObj.busy != null) && statusObj.busy)
			$('.pageStartPairing .loadingIcon').fadeIn();
		else if ((statusObj.busy != null) && !statusObj.busy)
			$('.pageStartPairing .loadingIcon').fadeOut();
	});
	
	// When back-end says we're finished, add the device to Homey
	Homey.on('finish', function(resultObj, callback) {
		// Add finish message to UI
		if (resultObj.isExistingDevice)
			$('#statusList').append($('<li>').text(__('pair.message_finish_existing')));
		else
			$('#statusList').append($('<li>').text(__('pair.message_finish_pairing')));
		
		if (!resultObj.isExistingDevice) {
			// Add device to Homey
			Homey.addDevice({
				data: { id: resultObj.deviceId },
				name: 'Wireless Entry',
				settings: {
					enableDevice: true,
					checkInTimeOutMinutes: 60,
					invalidCodeTimeOutMinutes: 10,
					invalidCodeTamperThreshold: 5,
					ipAddress: resultObj.ipAddress,
					macAddress: resultObj.macAddress,
					lastCheckIn: ''
				}
			});
		}
		
		$('.pageStartPairing .loadingIcon').fadeOut();
	
		// After three seconds, tell Homey we're done. Homey will close the pairing dialog.
		setTimeout(function(){ Homey.done(); }, 3000);
		
		// Inform back-end we're done here
		callback(null, true);
	});
}

