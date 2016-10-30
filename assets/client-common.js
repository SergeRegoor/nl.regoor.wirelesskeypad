$(document).ready(function(){
	$('a.newWindow').click(function(e){
		e.preventDefault();
		window.open($(this).attr('href'));
	});
	
	$('.copyToClipboard').click(function(e){
		e.preventDefault();
		copyToClipboard($($(this).attr('rel-selector')));
		var valueDescription = $(this).attr('rel-description');
		if (valueDescription.length > 0)
			alert(valueDescription + ' ' + __('clipboard_xxxxx_copied'));
		else
			alert(__('clipboard_value_copied'));
	});
});

$.fn.loadLocalizedTexts = function() {
	$(this).find('*[rel-localized!=""]').each(function(){
		if (($(this).attr('rel-localized') != null) && ($(this).attr('rel-localized').length > 0)) {
			var localizedTextFor = $(this).attr('rel-localized-for');
			var localizedTextId = $(this).attr('rel-localized');
			var localizedText = __(localizedTextId);
			if ((localizedTextFor != null) && (localizedTextFor.length > 0))
				$(this).attr(localizedTextFor, localizedText);
			else if ((localizedText.indexOf('/>') >= 0) || (localizedText.indexOf('</') >= 0))
				$(this).html(localizedText);
			else
				$(this).text(localizedText);
			$(this).find('a.newWindow').click(function(e){
				e.preventDefault();
				window.open($(this).attr('href'));
			});
		}
	});
}

function copyToClipboard(obj) {
	var value = '';
	if (obj.is('input') || obj.is('textarea') || obj.is('textarea'))
		value = obj.val();
	else
		value = obj.text();
	
	var hiddenObj = $('<input>').addClass('clipboardInput');
	$('body').append(hiddenObj);
	hiddenObj.val(value);
	hiddenObj.select();
	
    var isSuccessful;
    try {
    	  isSuccessful = document.execCommand("copy");
    } catch(e) {
        isSuccessful = false;
    }
    
    hiddenObj.remove();
	return isSuccessful;
}