var _settingsKey = 'wirelesskeypad-settings';
var _settings = {};
var _accessKeyTypes = [
	{
		type: 'keypad'
	}
];

// Load settings when Homey's ready
function onHomeyReady(){
	// Add localized texts to access key types
	for (var idx = 0; idx < _accessKeyTypes.length; idx++) {
		var keyType = _accessKeyTypes[idx];
		keyType.list = {};
		keyType.edit = {};
		keyType.singularDescription =  __('settings.accesskey_type.keypad.singular_description');
		keyType.list.header = __('settings.accesskey_type.keypad.list_header');
		keyType.list.explanation = __('settings.accesskey_type.keypad.list_explanation');
		keyType.list.keyColumn = __('settings.accesskey_type.keypad.list_keycolumn');
		keyType.list.descriptionColumn = __('settings.accesskey_type.keypad.list_descriptioncolumn');
		keyType.list.addButton = __('settings.accesskey_type.keypad.list_addbutton');
		keyType.edit.keyField = __('settings.accesskey_type.keypad.edit_keyfield');
		keyType.edit.descriptionField = __('settings.accesskey_type.keypad.edit_descriptionfield');
	}
	
	// Load access key lists html
	for (var idx = 0; idx < _accessKeyTypes.length; idx++) {
		var keyType = _accessKeyTypes[idx];
		var listContainerObj = $($('#accessKeyListTemplate').html());
		var listObj = listContainerObj.find('.keyList');
		listObj.addClass(keyType.type);
		listContainerObj.find('.keyTypeText').each(function(){ $(this).text(eval('keyType.'+$(this).attr('rel-text'))); });
		listObj.removeClass('keyList').addClass('list accessKey');
		listContainerObj.find('.addButton').removeClass('addButton').addClass('addAccessKeyButton');
		listContainerObj.find('.addAccessKeyButton, .list.accessKey').addClass(keyType.type).attr('rel-keytype', keyType.type);
		$('body').append(listContainerObj);
	}
	$('#privateKeyContainer .copyToClipboard').attr('rel-description', __('settings.privatekey.yourkey'));
	
	loadSettings(function(){
		$('#fieldPrivateKey').text(_settings.privateKey);
		$('body').loadBindings();
	});
	Homey.ready();
};

// Load dynamic bindings
$.fn.loadBindings = function(){
	var containerObj = $(this);
	containerObj.loadLocalizedTexts();
	
	containerObj.find('.list.accessKey').each(function(){ $(this).renderAccessKeyList(); });
	containerObj.find('.addAccessKeyButton').click(function(e){
		var button = $(this);
		e.preventDefault();
		var keyType = button.getAccessKeyType();
		var popupContainer = loadPopup(createGuid(), null, 100, 450, 250);
		popupContainer.renderAccessKeyForm({
			id:createGuid(), 
			type:keyType.type, 
			code:'', 
			description:'', 
			isActive:true
		});
	});
	containerObj.find('.setCustomPrivateKey').click(function(e){
		e.preventDefault();
		var popupContainer = loadPopup(createGuid(), null, 100, 450, 325);
		popupContainer.renderCustomPrivateKeyForm();
	});
	containerObj.find('.firstFocus').focus();
};

function loadSettings(callback) {
	Homey.get(_settingsKey, function(error, settingValue){ 
		_settings = settingValue; 
		if (_settings == null) 
			_settings = {};
		if (_settings.accessKeys == null)
			_settings.accessKeys = [];
		if (_settings.privateKey == null) {
			_settings.privateKey = createGuid();
			saveSettings();
		}
		if (callback != null)
			callback();
	});	
}

function saveSettings() {
	Homey.set(_settingsKey, _settings);	
};

function getAccessKeyById(accessKeyId){
	for (var idx = 0; idx < _settings.accessKeys.length; idx++)
		if (_settings.accessKeys[idx].id == accessKeyId)
			return _settings.accessKeys[idx];
	return null;
};

function deleteAccessKeyById(accessKeyId){
	for (var idx = 0; idx < _settings.accessKeys.length; idx++)
		if (_settings.accessKeys[idx].id == accessKeyId)
			_settings.accessKeys.splice(idx, 1);
}

$.fn.getAccessKeyType = function(){
	var obj = $(this);
	for (var idx = 0; idx < _accessKeyTypes.length; idx++)
		if (obj.attr('rel-keytype') == _accessKeyTypes[idx].type)
			return _accessKeyTypes[idx];
	return null;
};

function getKeyType(type) {
	for (var idx = 0; idx < _accessKeyTypes.length; idx++)
		if (type == _accessKeyTypes[idx].type)
			return _accessKeyTypes[idx];
	return null;
}

$.fn.renderAccessKeyList = function(){
	var listObj = $(this);
	if (listObj.length == 0) return;
	var keyType = listObj.getAccessKeyType();
	listObj.find('.row.accessKey').remove();
	
	for (var idx = 0; idx < _settings.accessKeys.length; idx++)	 {
		var accessKey = _settings.accessKeys[idx];
		if ((accessKey != null) && (accessKey.type == keyType.type)) {
			var row = $('<div/>').addClass('row accessKey').attr('rel-id', accessKey.id);
			listObj.append(row);
			var editCell = $('<div/>').addClass('col');
			editCell.append($('<button/>').addClass('editButton').text(__('settings.accesskey_list.editbutton')).attr('rel-id',accessKey.id).click(function(e){
				e.preventDefault();
				var popupContainer = loadPopup(createGuid(), null, 100, 450, 275);
				popupContainer.renderAccessKeyForm(getAccessKeyById($(this).attr('rel-id')));
			}));
			editCell.append($('<button/>').addClass('deleteButton').text(__('settings.accesskey_list.deletebutton')).attr('rel-id',accessKey.id).click(function(e){
				e.preventDefault();
				var accessKey = getAccessKeyById($(this).attr('rel-id'));
				if (accessKey == null) return;
				if (!confirm(__('settings.accesskey_list.confirmdelete').replace('[code]', accessKey.code).replace('[description]', accessKey.description))) return;
				deleteAccessKeyById($(this).attr('rel-id'));
				saveSettings();
				listObj.renderAccessKeyList();
			}));
			row.append(editCell);
			row.append($('<div/>').addClass('col').text(accessKey.isActive ? __('yes') : __('no')));
			row.append($('<div/>').addClass('col').text(accessKey.code));
			row.append($('<div/>').addClass('col').text(accessKey.description));
			row.loadBindings();
		}
	}
	
	listObj.show();
	if (listObj.find('.row.accessKey').length == 0)
		listObj.hide();
};

$.fn.renderAccessKeyForm = function(accessKey){
	var popupContainer = $(this);
	var keyType = getKeyType(accessKey.type);
	popupContainer.append($($('#accessKeyFormTemplate').html()));
	popupContainer.find('.keyTypeText').each(function(){
		$(this).text(eval('keyType.'+$(this).attr('rel-text')));
	});
	popupContainer.find('.closePopup').click(function(){ popupContainer.closePopup(); });
	popupContainer.find('.propertyField').each(function(){
		var field = $(this);
		if (field.attr('type') == 'checkbox')
			field.prop('checked', accessKey[field.attr('rel-property')]);
		else
			field.val(accessKey[field.attr('rel-property')]);
	});
	popupContainer.find('.saveButton').click(function(e){
		e.preventDefault();
		var newValues = {};
		popupContainer.find('.propertyField').each(function(){
			var field = $(this);
			if (field.attr('type') == 'checkbox')
				newValues[field.attr('rel-property')] = field.prop('checked');
			else
				newValues[field.attr('rel-property')] = $.trim(field.val());
		});
		
		var errorMessages = '';
		if ($.trim(newValues.code).length < 4)
			errorMessages += __('settings.accesskey_edit.error_code_length') + '\n';
		if ($.trim(newValues.description).length == 0)
			errorMessages += __('settings.accesskey_edit.error_description_length') + '\n';
		var codeAlreadyExists = false;
		for (var idx = 0; idx < _settings.accessKeys.length; idx++)
			if ((_settings.accessKeys[idx].id != accessKey.id) && (_settings.accessKeys[idx].code.toLowerCase() == newValues.code.toLowerCase()))
				codeAlreadyExists = true;
		if (codeAlreadyExists)
			errorMessages += __('settings.accesskey_edit.error_cose_exists') + '\n';
		if (errorMessages.length > 0) {
			alert(errorMessages);
			return;
		}
		
		popupContainer.find('.propertyField').each(function(){
			var field = $(this);
			if (field.attr('type') == 'checkbox')
				accessKey[field.attr('rel-property')] = field.prop('checked');
			else
				accessKey[field.attr('rel-property')] = $.trim(field.val());
		});
		
		if (getAccessKeyById(accessKey.id) == null)
			_settings.accessKeys[_settings.accessKeys.length] = accessKey;
		saveSettings();
		$('.list.accessKey.'+accessKey.type).renderAccessKeyList();
		popupContainer.closePopup();
	});
	popupContainer.loadBindings();
}

$.fn.renderCustomPrivateKeyForm = function() {
	var popupContainer = $(this);
	popupContainer.append($($('#setCustomPrivateKeyTemplate').html()));
	popupContainer.find('#fieldNewPrivateKey').val('');
	popupContainer.find('.closePopup').click(function(){ popupContainer.closePopup(); });
	popupContainer.find('.saveButton').click(function(e){
		e.preventDefault();
		var newPrivateKey = popupContainer.find('#fieldNewPrivateKey').val();
		
		var errorMessages = '';
		if ($.trim(newPrivateKey).length < 5)
			errorMessages += __('settings.privatekey.custom_error_length') + '\n';
		
		if (errorMessages.length > 0) {
			alert(errorMessages);
			return;
		}
		
		_settings.privateKey = newPrivateKey;
		saveSettings();
		$('#fieldPrivateKey').text(_settings.privateKey);
		popupContainer.closePopup();
	});
	popupContainer.loadBindings();
}

// Load & show popup
function loadPopup(id, selector, zIndex, width, height){
	var popupBackground = $('<div>').addClass('popupBackground').attr('id', id+'Background');
	popupBackground.css('z-index', zIndex-1);
	var popupContainer = $('<div>').addClass('popupContainer').attr('id', id);
	if (selector != null)
		popupContainer.html(selector.html());
	popupContainer.find('.closePopup').click(function(){ popupContainer.closePopup(); });
	popupContainer.css('z-index', zIndex);
	popupContainer.css('width', 'calc('+width+'px - 40px)');
	popupContainer.css('height', 'calc('+height+'px - 40px)');
	popupContainer.css('margin', '-'+(height/2)+'px 0 0 -'+(width/2)+'px');
	popupContainer.loadBindings();
	$('body').append(popupBackground);
	$('body').append(popupContainer);
	return popupContainer;
};

// Close a popup
$.fn.closePopup = function(){
	var popupContainer = $(this);
	var popupId = popupContainer.attr('id');
	var popupBackground = $('#'+popupId+'Background');
	popupContainer.remove();
	popupBackground.remove();
};

// Create unique GUID
function createGuid() { 
	var s4 = function() { return (((1+Math.random())*0x10000)|0).toString(16).substring(1); };
	return (s4() + s4() + "-" + s4() + "-4" + s4().substr(0,3) + "-" + s4() + "-" + s4() + s4() + s4()).toLowerCase();
};