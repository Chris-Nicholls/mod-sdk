
function renderIcon(template, data) {
    var element = $('<strong>') // TODO this container must be <div class="pedal">
    element.html(Mustache.render(template, getTemplateData(data)))
    return assignFunctionality(element, data)
}

function renderSettings(template, data) {
    var element = $('<div>')
    element.html(Mustache.render(template, getTemplateData(data)))
    return assignFunctionality(element, data)
}

function assignFunctionality(element, effect) {
    var controls = makePortIndex(effect.ports.control.input)

    element.find('[mod-role=input-control-port]').each(function() {
	var symbol = $(this).attr('mod-port-symbol')
	$(this).widget({ port: controls[symbol],
		       container: element
		     })
    });

    element.find('[mod-role=input-control-minimum]').each(function() {
	var symbol = $(this).attr('mod-port-symbol')
	if (!symbol) {
	    $(this).html('missing mod-port-symbol attribute')
	    return
	}
	var content = controls[symbol].minimum
	var format = controls[symbol].unit ? controls[symbol].unit.render : '%.2f'
	$(this).html(sprintf(format, controls[symbol].minimum))
    });
    element.find('[mod-role=input-control-maximum]').each(function() {
	var symbol = $(this).attr('mod-port-symbol')
	if (!symbol) {
	    $(this).html('missing mod-port-symbol attribute')
	    return
	}
	var content = controls[symbol].maximum
	var format = controls[symbol].unit ? controls[symbol].unit.render : '%.2f'
	$(this).html(sprintf(format, controls[symbol].maximum))
    });

    var handle = element.find('[mod-role=drag-handle]')
    if (handle.length > 0)
	element.draggable({ handle: handle })
    element.find('[mod-role=bypass]').click(function() {
	var light = element.find('[mod-role=bypass-light]')
	if (light.hasClass('on')) {
	    light.addClass('off')
	    light.removeClass('on')
	} else {
	    light.addClass('on')
	    light.removeClass('off')
	}
    })

    return element
}

function makePortIndex(ports) {
    var index = {}
    for (var i in ports) {
	var port = ports[i]
	index[port.symbol] = port
    }
    return index
}


function getTemplateData(options) {
    var i, port, control, symbol
    var data = $.extend({}, options.gui.templateData)
    data.effect = options
    data.ns = '?bundle=' + options.package + '&url=' + escape(options.url)
    if (!data.controls)
	return data
    var controlIndex = {}
    for (i in options.ports.control.input) {
	port = options.ports.control.input[i]
	controlIndex[port.symbol] = port
    }
    for (var i in data.controls) {
	control = data.controls[i]
	if (typeof control == "string") {
	    control = controlIndex[control]
	} else {
	    control = $.extend({}, controlIndex[control.symbol], control)
	}
	data.controls[i] = control
    }
    DEBUG = JSON.stringify(data, undefined, 4)
    return data
}

function JqueryClass() {
    var name = arguments[0]
    var methods = {}
    for (var i=1; i<arguments.length; i++) {
	$.extend(methods, arguments[i])
    }
    (function($) {
	$.fn[name] = function(method) {
	    if (methods[method]) {
		return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
	    } else if (typeof method === 'object' || !method) {
		return methods.init.apply(this, arguments);
	    } else {
		$.error( 'Method ' +  method + ' does not exist on jQuery.' + name );
	    }
	}
    })(jQuery);
}

JqueryClass('widget', {
    init: function(options) {
	var self = $(this)
	switch(self.attr('mod-widget')) {
	case 'film':
	    self.film(options)
	    break
	case 'select':
	    self.selectWidget(options)
	    break
	case 'custom-select':
	    self.customSelect(options)
	    break
	default:
	    self.film(options)
	    break
	}
    }
})

var baseWidget = {
    config: function(port) {
	var self = $(this)

	var portSteps
	if (port.toggle) {
	    port.minimum = port.minimum || 0
	    port.maximum = port.maximum || 1
	    portSteps = 2
	} else if (port.enumeration) {
	    portSteps = port.scalePoints.length
	    port.scalePoints.sort(function(a, b) { return a.value - b.value })
	} else {
	    portSteps = self.data('filmSteps')
	}

	if (port.rangeSteps)
	    portSteps = Math.min(port.rangeSteps, portSteps)

	// This is a bit verbose and could be optmized, but it's better that
	// each port property used is documented here
	self.data('symbol', port.symbol)
	self.data('default', port.default)
	self.data('enumeration', port.enumeration)
	self.data('integer', port.integer)
	self.data('maximum', port.maximum)
	self.data('minimum', port.minimum)
	self.data('logarithmic', port.logarithmic)
	self.data('toggle', port.toggle)
	self.data('scalePoints', port.scalePoints)

	if (port.logarithmic) {
	    self.data('scaleMinimum', Math.log(port.minimum) / Math.log(2))
	    self.data('scaleMaximum', Math.log(port.maximum) / Math.log(2))
	} else {
	    self.data('scaleMinimum', port.minimum)
	    self.data('scaleMaximum', port.maximum)
	}

	var format
	if (port.unit)
	    format = port.unit.render.replace('%f', '%.2f')
	else
	    format = '%.2f'
	if (port.integer)
	    format = format.replace(/%\.\d+f/, '%d')
	self.data('format', format)

	if (port.scalePoints) {
	    var index = {}
	    for (var i in port.scalePoints) {
		index[sprintf(format, port.scalePoints[i].value)] = port.scalePoints[i]
	    }
	    self.data('scalePointsIndex', index)
	}

	self.data('portSteps', portSteps)
	self.data('dragPrecision', Math.ceil(50/portSteps))
    },

    setValue: function() {
	alert('not implemented')
    },

    valueFromSteps: function(steps) {
	var self = $(this)
	var min = self.data('scaleMinimum')
	var max = self.data('scaleMaximum')
	var portSteps = self.data('portSteps')

	steps = Math.min(steps, portSteps-1)
	steps = Math.max(steps, 0)

	var portSteps = self.data('portSteps')

	var value = min + steps * (max - min) / (portSteps - 1)
	if (self.data('logarithmic'))
	    value = Math.pow(2, value)

	if (self.data('integer'))
	    value = Math.round(value)

	if (self.data('enumeration'))
	    value = self.data('scalePoints')[steps].value

	return value
    },

    stepsFromValue: function(value) {
	var self = $(this)

	if (self.data('enumeration')) {
	    // search for the nearest scalePoint
	    var points = self.data('scalePoints')
	    if (value <= points[0].value)
		return 0
	    for (var step=0; step<points.length; step++) {
		if (points[step+1] == null)
		    return step
		if (value < points[step].value + (points[step+1].value - points[step].value) / 2)
		    return step
	    }
	}

	var portSteps = self.data('portSteps')
	var min = self.data('scaleMinimum')
	var max = self.data('scaleMaximum')

	if (self.data('logarithmic'))
	    value = Math.log(value) / Math.log(2)

	if (self.data('integer'))
	    value = Math.round(value)

	return parseInt((value - min) * (portSteps - 1) / (max - min))
    },

    reportValue: function(value) {
	var self = $(this)
	var container = self.data('container')
	var symbol = self.data('symbol')
	var format = self.data('format')

	var label = sprintf(format, value)

	if (self.data('scalePoints') && self.data('scalePointsIndex')[label])
	    label = self.data('scalePointsIndex')[label].label

	container.find('[mod-role=input-control-value][mod-port-symbol='+symbol+']').text(label)
    }
}

JqueryClass('film', baseWidget, {
    init: function(options) {
	var self = $(this)
	self.data('container', options.container)
	self.film('getSize', function() { 
	    self.film('config', options.port)
	    self.film('setValue', options.port.default)
	})

	self.on('dragstart', function(event) { event.preventDefault() })

	var moveHandler = function(e) {
	    self.film('mouseMove', e)
	}
	
	var upHandler = function(e) {
	    self.film('mouseUp', e)
	    $(document).unbind('mouseup', upHandler)
	    $(document).unbind('mousemove', moveHandler)
	    //self.trigger('filmstop')
	}
	
	self.mousedown(function(e) {
	    if (e.which == 1) { // left button
		self.film('mouseDown', e)
		$(document).bind('mouseup', upHandler)
		$(document).bind('mousemove', moveHandler)
		self.trigger('filmstart')
	    }
	})

    },

    setValue: function(value) {
	var self = $(this)
	var position = self.film('stepsFromValue', value)
	self.data('position', position)
	self.film('setRotation', position)
	self.film('reportValue', value)
    },

    getSize: function(callback) {
	var self = $(this)
	setTimeout(function() {
	    var url = self.css('background-image').replace('url(', '').replace(')', '').replace("'", '').replace('"', '');
	    var height = self.css('background-size').split(/ /)[1]
	    if (height)
		height = parseInt(height.replace(/\D+$/, ''))
	    var bgImg = $('<img />');
	    bgImg.css('max-width', '999999999px')
	    bgImg.hide();
	    bgImg.bind('load', function() {
		if (!height)
		    height = bgImg.height()
		self.data('filmSteps', height * bgImg.width() / (self.width() * bgImg.height()))
		self.data('size', self.width())
		bgImg.remove()
		callback()
	    });
	    self.append(bgImg);
	    bgImg.attr('src', url);    
	}, 1)
    },

    mouseDown: function(e) {
	var self = $(this)
	self.data('lastY', e.pageY)
    },

    mouseUp: function(e) {
	var self = $(this)
    },

    mouseMove: function(e) {
	var self = $(this)
	var diff = self.data('lastY') - e.pageY
	diff = parseInt(diff / self.data('dragPrecision'))
	var position = self.data('position')

	position += diff
	self.data('position', position)
	if (Math.abs(diff) > 0)
	    self.data('lastY', e.pageY)
	self.film('setRotation', position)
	var value = self.film('valueFromSteps', position)
	self.film('reportValue', value)
    },

    setRotation: function(steps) {
	var self = $(this)

	var filmSteps = self.data('filmSteps')
	var portSteps = self.data('portSteps')
	var rotation

	if (portSteps == 1)
	    // this is very dummy, a control with only one possible. let's just avoid zero division
	    // in this theoric case.
	    rotation = Math.round(filmSteps/2)
	else if (portSteps != null)
	    rotation = steps * parseInt(filmSteps / (portSteps-1))

	rotation = Math.min(rotation, filmSteps-1)
	rotation = Math.max(rotation, 0)

	var bgShift = rotation * -self.data('size')
	bgShift += 'px 0px'
	self.css('background-position', bgShift)
    },

})

JqueryClass('selectWidget', baseWidget, {
    init: function(options) {
	var self = $(this)
	self.data('container', options.container)
	self.selectWidget('config', options.port)
	self.change(function() {
	    self.selectWidget('reportValue', parseFloat(self.val()))
	})
	self.selectWidget('setValue', options.port.default)
    },

    setValue: function(value) {
	var self = $(this)
	self.val(value)
	self.selectWidget('reportValue', value)
    }
})

JqueryClass('customSelect', baseWidget, {
    init: function(options) {
	var self = $(this)
	self.data('container', options.container)
	self.customSelect('config', options.port)
	self.find('[mod-role=enumeration-option]').each(function() {
	    var opt = $(this)
	    var value = opt.attr('mod-port-value')
	    opt.click(function() {
		self.customSelect('setValue', value)
	    })
	})
	self.customSelect('setValue', options.port.default)
    },

    setValue: function(value) {
	var self = $(this)
	self.find('[mod-role=enumeration-option]').removeClass('selected')
	self.find('[mod-role=enumeration-option][mod-port-value="'+value+'"]').addClass('selected')
	self.customSelect('reportValue', parseFloat(value))
    }
})
