var bundles, effects, content, iconCanvas, settingsCanvas, publishWindow, icon, version, section
var defaultIconTemplate, defaultSettingsTemplate // loaded in index.html
var DEBUG // holds template debugging info
$(document).ready(function() {
    var firstSection = $('ul#menu li').first().attr('id').replace(/^tab-/, '')
    section = window.location.hash.split(/,/)[2] || firstSection
    makeTabs()
    bundles = $('#bundle-select')
    effects = $('#effect-select')
    content = $('#content-wrapper')

    iconCanvas = $('#content-icon .canvas')
    screenshotCanvas = $('#content-screenshot .canvas')
    settingsCanvas = $('#content-settings .canvas')
    publishWindow = $('#content-publish')

    $.ajax({ url: '/config/get',
	     success: function(config) {
		 var key
		 for (key in config)
		     publishWindow.find('#'+key).val(config[key])
	     },
	     error: function() {
		 alert("Error: Can't get current configuration. Is your server running? Check the logs.")
	     }
	   })

    version = $('#version')

    effects.hide()
    version.hide()

    bundles.change(function() { loadEffects() })
    effects.change(function() { showEffect() })
    $('#next-bundle').click(function() {
	bundles.val(bundles.find(':selected').next().val())
	loadEffects()
    })
    $('#screenshot').click(function() {
	var iconImg = $('<img>')
	var param = { bundle: bundles.val(),
		      effect: effects.val(),
		      width: icon.width(),
		      height: icon.height(),
		      slug: slug()
		    }
	screenshotCanvas.find('img').remove()
	$.ajax({ url: '/screenshot',
		 data: param,
		 success: function(result) {
		     if (result.ok) {
			 $('<img class="thumb">').appendTo(screenshotCanvas).attr('src', 'data:image/png;base64,'+result.thumbnail)
			 $('<img class="screenshot">').appendTo(screenshotCanvas).attr('src', 'data:image/png;base64,'+result.screenshot)
		     } else {
			 alert('Could not generate thumbnail')
		     }
		 },
		 error: function(resp) {
		     alert("Error: Can't generate thumbnail. Is your server running? Check the logs.")
		 },
		 dataType: 'json'
	       })
    })

    $('#install').click(function() {
	savePublishConfiguration(function() {
	    $.ajax({ url: '/post/device/' + bundles.val(),
		     success: function(result) {
			 if (result.ok)
			     alert("Effect installed")
			 else
			     alert("Host said: " + result.error)
		     },
		     error: function(resp) {
			 alert("Error: Can't install bundle. Is your server running? Check the logs.")
		     },
		     timeout: 300000,
		     dataType: 'json'
		   })
	})
    })

    $('#publish').click(function() {
	savePublishConfiguration(function() {
	    $.ajax({ url: '/post/cloud/' + bundles.val(),
		     success: function(result) {
			 if (result.ok)
			     alert("Effect published")
			 else
			     alert("Cloud said: " + result.error)
		     },
		     error: function(resp) {
			 alert("Error: Can't publish bundle. Is your server running? Check the logs.")
		     },
		     timeout: 300000,
		     dataType: 'json'
		   })
	})
    })

    publishWindow.find('.controls span').click(function() {
	var self = $(this)
	self.parent().find('input').val(self.attr('data'))
    })

    $('button.debug').click(function() {
	$('#debug-window pre').text(DEBUG)
	$('#debug-window').show()	
    })
    $('#debug-cancel').click(function() {
	$('#debug-window').hide()
    })	

    loadBundles()
})

function loadBundles() {
    $.ajax({ url: '/bundles',
	     success: function(data) {
		 content.hide()
		 if (data.length == 0) {
		     bundles.hide()
		     $('#no-bundles').show()
		     return
		 }
		 $('#no-bundles').hide()
		 bundles.show()
		 bundles.find('option').remove()
		 $('<option>').val('').html('-- Select Bundle --').appendTo(bundles)
		 data.sort()
		 for (var i in data) {
		     $('<option>').val(data[i]).html(data[i]).appendTo(bundles)
		 }

		 var hash = window.location.hash.replace(/^#/, '')
		 if (hash) {
		     var bundle = hash.split(/,/)[0]
		     var effect = hash.split(/,/)[1]
		     bundles.val(bundle)
		     loadEffects(function() {
			 if (effect) {
			     effects.val(effect)
			     showEffect()
			 }
		     })
		 }
	     },
	     error: function(resp) {
		 alert("Error: Can't get list of bundles. Is your server running? Check the logs.")
	     },
	     dataType: 'json'
	   })
}

function loadEffects(callback) {
    var bundle = bundles.val()
    version.hide()
    getEffects(bundle, function(plugins) {
	effects.find('option').remove()
	$('<option>').html('-- Select Effect --').appendTo(effects)
	for (var url in plugins) {
	    var effect = plugins[url]
	    $('<option>').val(effect.url).html(effect.name).data(effect).appendTo(effects)
	}
	effects.show()
	if (effects.children().length == 2) {
	    effects.children().first().remove()
	    showEffect()
	}		 
	if (callback != null)
	    callback()
    })    
}

function showEffect() {
    content.hide()
    var bundle = bundles.val()
    if (!bundle) {
	window.location.hash = ''
	return
    }
    var options = effects.find('option:selected').data()

    if (options.version) {
	version.html('v' + options.version + ' (' + options.stability + ')')
	version.show()
    } else
	version.hide()
    if (!options.url) {
	window.location.hash = bundle
	return
    }

    window.location.hash = bundle + ',' + options.url + ',' + section

    var gui = new GUI(options, {
	defaultIconTemplate: defaultIconTemplate, 
	defaultSettingsTemplate: defaultSettingsTemplate
    })

    gui.render(function(icon, settings) {

	var actions = $('<div>').addClass('mod-actions').appendTo(icon)
	$('<div>').addClass('mod-settings').appendTo(actions)
	$('<div>').addClass('mod-remove').appendTo(actions)

	iconCanvas.html('').append(icon)
	settingsCanvas.html('').append(settings)

	content.show()

	screenshotCanvas.html('')
	var param = '?bundle=' + options.package + '&url=' + escape(options.url)
	if (options.gui.thumbnail) {
	    var thumb = $('<img class="thumb">')
	    thumb.attr('src', '/effect/image/thumbnail.png'+param)
	    thumb.appendTo(screenshotCanvas)
	}
	if (options.gui.screenshot) {
	    var shot = $('<img class="screenshot">')
	    shot.attr('src', '/effect/image/screenshot.png'+param)
	    shot.appendTo(screenshotCanvas)
	}
    })
}

function makeTabs() {
    $('ul#menu li').each(function() {
	var item = $(this)
	item.click(function() {
	    selectTab(item.attr('id').replace(/^tab-/, ''))
	})
    })

    $('.content').hide()

    selectTab(section)
}

function selectTab(newSection) {
    section = newSection
    var tab = $('#tab-'+section)
    var path = window.location.hash.split(/,/)
    if (path[2] != section) {
	path[2] = section
	window.location.hash = path.join(',')
    }	    
    $('.content').hide()
    $('ul#menu li.selected').removeClass('selected')
    tab.addClass('selected')
    $('#content-'+section).show()
}

function savePublishConfiguration(callback) {
    var config = {}
    publishWindow.find('input').each(function() {
	config[this.id] = $(this).val()
    });
    $.ajax({ url: '/config/set',
	     type: 'POST',
	     data: JSON.stringify(config),
	     success: function() {
		 callback()
	     },
	     error: function() {
		 alert("Error: Can't set configuration. Is your server running? Check the logs.")
	     },
	     dataType: 'json'
	   })
    return false
}

function slug() {
    var effect = effects.find('option:selected').data()
    return effect['name'].toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
}
    

