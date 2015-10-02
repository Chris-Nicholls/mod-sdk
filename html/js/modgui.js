/*
 * Copyright 2012-2013 AGR Audio, Industria e Comercio LTDA. <contato@moddevices.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


function shouldSkipPort(port) {
    // skip notOnGUI controls
    if (port.properties.indexOf("notOnGUI") >= 0)
        return true
    // skip special designated controls
    if (port.designation == "http://lv2plug.in/ns/lv2core#freeWheeling")
        return true
    if (port.designation == "http://lv2plug.in/ns/lv2core#latency")
        return true
    if (port.designation == "http://lv2plug.in/ns/ext/parameters#sampleRate")
        return true
    // what else?
    return false;
}

var loadedIcons = {}
var loadedSettings = {}
var loadedCSSs = {}
var loadedJSs = {}

function loadDependencies(gui, effect, callback) { //source, effect, bundle, callback) {
    var iconLoaded = true
    var settingsLoaded = true
    var cssLoaded = true
    var jsLoaded = true

    var cb = function () {
        if (iconLoaded && settingsLoaded && cssLoaded && jsLoaded) {
            setTimeout(callback, 0)
        }
    }

    var baseUrl = ''
    if (effect.source) {
        baseUrl += effect.source
        baseUrl.replace(/\/?$/, '')
    }

    if (effect.gui.iconTemplate) {
        if (loadedIcons[effect.uri]) {
            effect.gui.iconTemplate = loadedIcons[effect.uri]
        } else {
            iconLoaded = false
            var iconUrl = baseUrl + '/effect/icon.html?uri=' + escape(effect.uri)
            $.get(iconUrl, function (data) {
                effect.gui.iconTemplate = loadedIcons[effect.uri] = data
                iconLoaded = true
                cb()
            })
        }
    }

    if (effect.gui.settingsTemplate) {
        if (loadedSettings[effect.uri]) {
            effect.gui.settingsTemplate = loadedSettings[effect.uri]
        } else {
            settingsLoaded = false
            var settingsUrl = baseUrl + '/effect/settings.html?uri=' + escape(effect.uri)
            $.get(settingsUrl, function (data) {
                effect.gui.settingsTemplate = loadedSettings[effect.uri] = data
                settingsLoaded = true
                cb()
            })
        }
    }

    if (effect.gui.stylesheet && !loadedCSSs[effect.uri]) {
        cssLoaded = false
        var cssUrl = baseUrl + '/effect/stylesheet.css?uri=' + escape(effect.uri)
        $.get(cssUrl, function (data) {
              data = Mustache.render(data, {
                         ns : '?uri=' + escape(effect.uri),
                         cns: '_' + escape(effect.uri).split("/").join("_").split("%").join("_").split(".").join("_")
                     })
            $('<style type="text/css">').text(data).appendTo($('head'))
            loadedCSSs[effect.uri] = true
            cssLoaded = true
            cb()
        })
    }

    if (effect.gui.javascript) {
        if (loadedJSs[effect.uri]) {
            gui.jsCallback = loadedJSs[effect.uri]
        } else {
            jsLoaded = false
            var jsUrl = baseUrl + '/effect/gui.js?uri=' + escape(effect.uri)
            $.ajax({
                url: jsUrl,
                success: function (code) {
                    var method;
                    eval('method = ' + code)
                    loadedJSs[effect.uri] = method
                    gui.jsCallback = method
                    jsLoaded = true
                    cb()
                },
                cache: false,
            })
        }
    }

    cb()
}

function GUI(effect, options) {
    var self = this

    options = $.extend({
        change: new Function(),
        click: new Function(),
        dragStart: new Function(),
        drag: new Function(),
        dragStop: new Function(),
        presetLoad: new Function(),
        midiLearn: new Function(),
        bypassed: 1,
        defaultIconTemplate: 'Template missing',
        defaultSettingsTemplate: 'Template missing',
        loadDependencies: true,
    }, options)

    if (!effect.gui)
        effect.gui = {}

    self.currentValues = {}

    self.dependenciesCallbacks = []

    if (options.loadDependencies) {
        self.dependenciesLoaded = false

        loadDependencies(this, effect, function () {
            self.dependenciesLoaded = true
            for (var i in self.dependenciesCallbacks) {
                self.dependenciesCallbacks[i]()
            }
            self.dependenciesCallbacks = []
        })
    } else {
        self.dependenciesLoaded = true
    }

    self.effect = effect

    self.bypassed = options.bypassed

    this.makePortIndexes = function (ports) {
        var i, port, porti, indexes = {}

        for (i in ports) {
            porti = ports[i]

            // skip notOnGUI controls
            if (shouldSkipPort(porti))
                continue

            port = {
                widgets: [],
                enabled: true
            }
            $.extend(port, porti)

            // just in case
            if (port.ranges.default === undefined)
                port.ranges.default = port.ranges.minimum

            // adjust for sample rate
            if (port.properties.indexOf("sampleRate") >= 0) {
                port.ranges.minimum *= SAMPLERATE
                port.ranges.maximum *= SAMPLERATE
            }

            // set initial value
            port.value = port.ranges.default

            // ready
            indexes[port.symbol] = port
        }

        return indexes
    }

    self.controls = self.makePortIndexes(effect.ports.control.input)

    // Bypass needs to be represented as a port since it shares the hardware addressing
    // structure with ports. We use the symbol ':bypass' that is an invalid lv2 symbol and
    // so will cause no conflict
    // Be aware that this is being acessed directly in pedalboard.js
    self.controls[':bypass'] = {
        name: 'Bypass',
        symbol: ':bypass',
        ranges: {
            minimum: 0,
            maximum: 1,
            default: 1,
        },
        properties: ["toggled", "integer"],
        widgets: [],
        enabled: true,
        value: self.bypassed ? 1 : 0,

        // FIXME
        default: 1,
        maximum: 1,
        minimum: 0,
        enumeration: false,
        integer: true,
        logarithmic: false,
        toggled: true,
        trigger: false,
        scalePoints: []
    }

    this.setPortValue = function (symbol, value, source) {
        if (isNaN(value))
            throw "Invalid NaN value for " + symbol
        var port = self.controls[symbol]
        var mod_port = source ? source.attr("mod-port") : symbol
        if (!port.enabled || port.value == value)
            return
        /*
          FIXME - shouldn't this be done in the host?

        if (port.properties.indexOf("trigger") >= 0) {
            // Report the new value and return the widget to old value
            options.change(mod_port, value)
            if (source) {
                setTimeout(function () {
                    source.controlWidget('setValue', port.value)
                }, 500)
            }
            return
        }
        */

        // update our own widgets
        self.setPortWidgetsValue(symbol, value, source)

        // let the host know about this change
        options.change(mod_port, value)
    }

    this.setPortWidgetsValue = function (symbol, value, source, only_gui) {
        var port = self.controls[symbol]

        port.value = value
        self.currentValues[symbol] = value

        for (var i in port.widgets) {
            if (port.widgets[i] == source)
                continue
            port.widgets[i].controlWidget('setValue', value, only_gui)
        }

        self.triggerJS({ type: 'change', symbol: symbol, value: value })
    }

    this.getPortValue = function (symbol) {
        return self.controls[symbol].value
    }

    this.serializePreset = function () {
        var data = {}
        for (var symbol in self.controls)
            data[symbol] = self.controls[symbol].value
        return data
    }

    this.disable = function (symbol) {
        var port = self.controls[symbol]
        port.enabled = false
        for (var i in port.widgets)
            port.widgets[i].controlWidget('disable')
    }

    this.enable = function (symbol) {
        var port = self.controls[symbol]
        port.enabled = true
        for (var i in port.widgets)
            port.widgets[i].controlWidget('enable')
    }

    this.render = function (instance, callback, skipNamespace) {
        var render = function () {
            if (instance)
                self.icon = $('<div mod-instance="' + instance + '" class="mod-pedal">')
            else
                self.icon = $('<div class="mod-pedal">')

            var templateData = self.getTemplateData(effect, skipNamespace)
            self.icon.html(Mustache.render(effect.gui.iconTemplate || options.defaultIconTemplate, templateData))

            // Check for old broken icons
            var children = self.icon.children()
            if (children.hasClass("mod-pedal-boxy")      ||
                children.hasClass("mod-pedal-british")   ||
                children.hasClass("mod-pedal-japanese")  ||
                children.hasClass("mod-pedal-lata")      ||
                children.hasClass("mod-combo-model-001") ||
                children.hasClass("mod-head-model-001")  ||
                children.hasClass("mod-rack-model-001"))
            {
                console.log("This icon uses old MOD reserved css classes, this is not allowed anymore")
                self.icon.html(Mustache.render(options.defaultIconTemplate, templateData))
            }

            self.assignIconFunctionality(self.icon)
            self.assignControlFunctionality(self.icon, false)

            // Take the width of the plugin. This is necessary because plugin may have position absolute.
            // setTimeout is here because plugin has not yet been appended to anywhere, let's wait for
            // all instructions to be executed.
            setTimeout(function () {
                if (! instance) {
                    $('[mod-role="input-audio-port"]').addClass("mod-audio-input")
                    $('[mod-role="output-audio-port"]').addClass("mod-audio-output")
                    $('[mod-role="input-midi-port"]').addClass("mod-midi-input")
                    $('[mod-role="output-midi-port"]').addClass("mod-midi-output")
                    $('[mod-role="input-cv-port"]').addClass("mod-cv-input")
                    $('[mod-role="output-cv-port"]').addClass("mod-cv-output")
                }
                self.icon.width(self.icon.children().width())
                self.icon.height(self.icon.children().height())
            }, 1)

            if(instance)
                self.settings = $('<div class="mod-settings" mod-instance="' + instance + '">')
            else
                self.settings = $('<div class="mod-settings">')
            self.settings.html(Mustache.render(effect.gui.settingsTemplate || options.defaultSettingsTemplate, templateData))

            self.assignControlFunctionality(self.settings, false)

            if (! instance) {
                self.settings.find(".js-close").hide()
                self.settings.find(".mod-address").hide()
            }

            /*
            TESTING code for presets
            var p, _presets = []
            console.log(effect.presets)
            for (i in effect.presets) {
                p = effect.presets[i]
                _presets.push({
                    name: p.label,
                    uri: p.uri,
                    bind: MOD_BIND_NONE,
                })
            }
            desktop.presetManager.presetManager("setPresets", instance, _presets)
            */

            self.triggerJS({ 'type': 'start' })

            var preset_select = self.settings.find('[mod-role=presets]')
            preset_select.change(function () {
                var value = $(this).val()
                options.presetLoad(value)
            })
            callback(self.icon, self.settings)
        }

        if (self.dependenciesLoaded) {
            render()
        } else {
            self.dependenciesCallbacks.push(render)
        }
    }

    this.renderDummyIcon = function (callback) {
        var render = function () {
            var icon = $('<div class="mod-pedal dummy">')
            icon.html(Mustache.render(effect.gui.iconTemplate || options.defaultIconTemplate,
                self.getTemplateData(effect, false)))
            self.assignControlFunctionality(icon, true)
            callback(icon)
        }
        if (self.dependenciesLoaded) {
            render()
        } else {
            self.dependenciesCallbacks.push(render)
        }
    }

    this.assignIconFunctionality = function (element) {
        var handle = element.find('[mod-role=drag-handle]')
        var drag_options = {
            handle: handle,
            start: options.dragStart,
            drag: options.drag,
            stop: options.dragStop
        }
        if (handle.length > 0) {
            element.draggable(drag_options)
            element.click(options.click)
        }
    }

    this.assignControlFunctionality = function (element, onlySetValues) {
        var instance = element.attr('mod-instance')

        element.find('[mod-role=input-control-port]').each(function () {
            var control = $(this)
            var symbol = $(this).attr('mod-port-symbol')
            var port = self.controls[symbol]

            control.attr("mod-port", (instance ? instance + "/" : "") + symbol)
            control.addClass("mod-port")

            if (port)
            {
                // Get the display formatting of this control
                var format
                if (port.units.render)
                    format = port.units.render.replace('%f', '%.2f')
                else
                    format = '%.2f'
                if (port.properties.indexOf("integer") >= 0)
                    format = format.replace(/%\.\d+f/, '%d')

                // Index the scalePoints
                if (port.scalePoints) {
                    var scalePointsIndex = {}
                    for (var i in port.scalePoints) {
                        scalePointsIndex[sprintf(format, port.scalePoints[i].value)] = port.scalePoints[i]
                    }
                }

                var valueField = element.find('[mod-role=input-control-value][mod-port-symbol=' + symbol + ']')

                var setValue = function (value) {
                    // When value is changed, let's use format and scalePoints to properly display its value
                    if (isNaN(value))
                        throw "Invalid NaN value"
                    var label = sprintf(format, value)
                    if (port.scalePoints && scalePointsIndex[label])
                        label = scalePointsIndex[label].label
                    valueField.data('value', value)
                    valueField.text(label)

                    self.setPortValue(symbol, value, control)
                }

                control.controlWidget({
                    port: port,
                    change: function (e, value) {
                        setValue(value)
                    },
                    midiLearn: function (e) {
                        var port_path = $(this).attr('mod-port')
                        options.midiLearn(port_path)
                    }
                })

                if (port.properties.indexOf("enumeration") < 0) {
                    // For ports that are not enumerated, we allow
                    // editing the value directly
                    valueField.attr('contenteditable', true)
                    valueField.focus(function () {
                        valueField.text(valueField.data('value'))
                    })
                    valueField.keydown(function (e) {
                        if (e.keyCode == 13) {
                            valueField.blur()
                            return false
                        }
                        return true
                    })
                    valueField.blur(function () {
                        var value = parseFloat(valueField.text())
                        setValue(value)
                        control.controlWidget('setValue', value)
                    })
                    valueField.keydown(function (e) {
                        return true
                        if (e.keyCode >= 48 && e.keyCode <= 57) {
                            // It's a number
                            return true
                        }
                        if (e.keyCode == 13) {
                            // ???
                            //return true
                        }
                        return (e.keyCode == 46 || e.keyCode == 9)
                    })
                }

                port.widgets.push(control)
            }
            else
            {
                control.text('No such symbol: ' + symbol)
            }
        });

        if (onlySetValues)
            return

        element.find('[mod-role=input-control-minimum]').each(function () {
            var symbol = $(this).attr('mod-port-symbol')
            if (!symbol) {
                $(this).html('missing mod-port-symbol attribute')
                return
            }
            var element = self.controls[symbol]
            if (element === undefined)
                return
            var format  = element.units.render || '%.2f'
            if (element.properties.indexOf("integer") >= 0)
                format = format.replace(/%\.\d+f/, '%d')
            $(this).html(sprintf(format, element.ranges.minimum))
        });

        element.find('[mod-role=input-control-maximum]').each(function () {
            var symbol = $(this).attr('mod-port-symbol')
            if (!symbol) {
                $(this).html('missing mod-port-symbol attribute')
                return
            }
            var element = self.controls[symbol]
            if (element === undefined)
                return
            var format  = element.units.render || '%.2f'
            if (element.properties.indexOf("integer") >= 0)
                format = format.replace(/%\.\d+f/, '%d')
            $(this).html(sprintf(format, element.ranges.maximum))
        });

        element.find('[mod-role=bypass]').each(function () {
            var control = $(this)
            var port = self.controls[':bypass']
            port.widgets.push(control)

            control.bypassWidget({
                port: port,
                value: self.bypassed,
                change: function (e, value) {
                    /*
                     TESTING - the following code is also on 'changeLights' so we don't need it here?
                    self.bypassed = value
                    element.find('[mod-role=bypass-light]').each(function () {
                        // NOTE
                        // the element itself will get inverse class ("on" when light is "off"),
                        // because of the switch widget.
                        if (value)
                            $(this).addClass('off').removeClass('on')
                        else
                            $(this).addClass('on').removeClass('off')
                    });
                    */

                    self.setPortValue(':bypass', value ? 1 : 0, control)

                    if (value)
                        control.addClass('on').removeClass('off')
                    else
                        control.addClass('off').removeClass('on')
                },
                changeLights: function (value) {
                    self.bypassed = value

                    element.find('[mod-role=bypass-light]').each(function () {
                        // NOTE
                        // the element itself will get inverse class ("on" when light is "off"),
                        // because of the switch widget.
                        if (value)
                            $(this).addClass('off').removeClass('on')
                        else
                            $(this).addClass('on').removeClass('off')
                    });
                },
            })

            control.attr("mod-port", instance ? instance + "/:bypass" : ":bypass")
            control.attr('mod-widget', 'bypass')
            control.addClass("mod-port")
        })

        if (self.bypassed)
            element.find('[mod-role=bypass-light]').addClass('off').removeClass('on')
        else
            element.find('[mod-role=bypass-light]').addClass('on').removeClass('off')

        // Gestures for tablet. When event starts, we check if it's centered in any widget and stores the widget if so.
        // Following events will be forwarded to proper widget
        element[0].addEventListener('gesturestart', function (ev) {
            ev.preventDefault()
            element.find('[mod-role=input-control-port]').each(function () {
                var widget = $(this)
                var top = widget.offset().top
                var left = widget.offset().left
                var right = left + widget.width()
                var bottom = top + widget.height()
                if (ev.pageX >= left && ev.pageX <= right && ev.pageY >= top && ev.pageY <= bottom) {
                    element.data('gestureWidget', widget)
                    widget.controlWidget('gestureStart')
                }
            });
            ev.handled = true
        })
        element[0].addEventListener('gestureend', function (ev) {
            ev.preventDefault()
            element.data('gestureWidget').controlWidget('gestureEnd', ev.scale)
            element.data('gestureWidget', null)
            ev.handled = true
        })
        element[0].addEventListener('gesturechange', function (ev) {
            ev.preventDefault()
            var widget = element.data('gestureWidget')
            if (!widget)
                return
            widget.controlWidget('gestureChange', ev.scale)
            ev.handled = true
        })
        element[0].addEventListener('dblclick', function (ev) {
            ev.preventDefault()
            ev.handled = true
        })
    }

    this.getTemplateData = function (options, skipNamespace) {
        var data = $.extend({}, options.gui.templateData)
        data.effect = options

        if (skipNamespace) {
            data.ns  = ''
            data.cns = '_sdk'
        } else {
            data.ns  = '?uri=' + escape(options.uri)
            data.cns = '_' + escape(options.uri).split("/").join("_").split("%").join("_").split(".").join("_")
        }

        // fill fields that might be present on modgui data
        if (!data.brand)
            data.brand = effect.gui.brand || ""
        if (!data.label)
            data.label = effect.gui.label || ""
        if (!data.color)
            data.color = effect.gui.color
        if (!data.knob)
            data.knob = effect.gui.knob
        if (!data.model)
            data.model = effect.gui.model
        if (!data.panel)
            data.panel = effect.gui.panel
        if (!data.controls)
            data.controls = options.gui.ports || {}

        // insert scalePoints into controls
        for (var i in data.controls)
        {
            var dcontrol = data.controls[i]
            var scontrol = self.controls[dcontrol.symbol]

            if (scontrol) {
                dcontrol.scalePoints = scontrol.scalePoints
            } else {
                console.log("Control port symbol '" + dcontrol.symbol + "' is missing")
            }
        }

        // FIXME - this is a little ugly hack, sorry!

        // don't show some special ports
        if (data.effect.ports.control.input)
        {
            inputs = []
            for (var i in data.effect.ports.control.input)
            {
                var port = data.effect.ports.control.input[i]
                if (shouldSkipPort(port))
                    continue

                port['enumeration'] = port.properties.indexOf("enumeration") >= 0
                port['integer'    ] = port.properties.indexOf("integer") >= 0
                port['logarithmic'] = port.properties.indexOf("logarithmic") >= 0
                port['toggled'    ] = port.properties.indexOf("toggled") >= 0
                port['trigger'    ] = port.properties.indexOf("trigger") >= 0

                inputs.push(port)
            }
            data.effect.ports.control.input = inputs
        }

        if (window.desktop != undefined) {
            // this is expensive and only useful for mod-sdk
            DEBUG = JSON.stringify(data, undefined, 4)
        }

        return data
    }

    this.jsData = {}

    this.triggerJS = function (event) {
        if (!self.jsCallback)
            return
        var e = {
            event: event,
            values: self.currentValues,
            icon: self.icon,
            settings: self.settings,
            data: self.jsData
        };
        if (event.symbol)
            e.port = self.controls[event.symbol]
        self.jsCallback(e)
    }
}

function JqueryClass() {
    var name = arguments[0]
    var methods = {}
    for (var i = 1; i < arguments.length; i++) {
        $.extend(methods, arguments[i])
    }
    (function ($) {
        $.fn[name] = function (method) {
            if (methods[method]) {
                return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
            } else if (typeof method === 'object' || !method) {
                return methods.init.apply(this, arguments);
            } else {
                $.error('Method ' + method + ' does not exist on jQuery.' + name);
            }
        }
    })(jQuery);
}

(function ($) {
    $.fn['controlWidget'] = function () {
        var self = $(this)
        var widgets = {
            'film': 'film',
            'switch': 'switchWidget',
            'bypass': 'bypassWidget',
            'select': 'selectWidget',
            'custom-select': 'customSelect'
        }
        var name = self.attr('mod-widget') || 'film'
        name = widgets[name]
        $.fn[name].apply(this, arguments)
    }
})(jQuery);

var baseWidget = {
    config: function (options) {
        var self = $(this)
            // Very quick bugfix. When pedalboard is unserialized, the disable() of addressed knobs
            // are called before config. Right thing would probably be to change this behaviour, but
            // while that is not done, this check will avoid the bug. TODO
        if (!(self.data('enabled') === false))
            self.data('enabled', true)
        self.bind('valuechange', options.change)
        self.bind('midilearn', options.midiLearn)

        var port = options.port

        var portSteps
        if (port.properties.indexOf("toggled") >= 0) {
            //port.ranges.minimum = port.ranges.minimum || 0
            //port.ranges.maximum = port.ranges.maximum || 1
            portSteps = 2
        } else if (port.properties.indexOf("enumeration") >= 0) {
            portSteps = port.scalePoints.length
            port.scalePoints.sort(function (a, b) { return a.value - b.value })
        } else {
            portSteps = self.data('filmSteps')
        }

        if (port.rangeSteps)
            portSteps = Math.min(port.rangeSteps, portSteps)

        // This is a bit verbose and could be optmized, but it's better that
        // each port property used is documented here
        self.data('symbol',       port.symbol)
        self.data('default',      port.ranges.default)
        self.data('maximum',      port.ranges.maximum)
        self.data('minimum',      port.ranges.minimum)
        self.data('enumeration',  port.properties.indexOf("enumeration") >= 0)
        self.data('integer',      port.properties.indexOf("integer") >= 0)
        self.data('logarithmic',  port.properties.indexOf("logarithmic") >= 0)
        self.data('toggled',      port.properties.indexOf("toggled") >= 0)
        self.data('trigger',      port.properties.indexOf("trigger") >= 0)
        self.data('scalePoints',  port.scalePoints)

        if (port.properties.indexOf("logarithmic") >= 0) {
            self.data('scaleMinimum', Math.log(port.ranges.minimum) / Math.log(2))
            self.data('scaleMaximum', Math.log(port.ranges.maximum) / Math.log(2))
        } else {
            self.data('scaleMinimum', port.ranges.minimum)
            self.data('scaleMaximum', port.ranges.maximum)
        }

        self.data('portSteps', portSteps)
        self.data('dragPrecisionVertical', Math.ceil(100 / portSteps))
        self.data('dragPrecisionHorizontal', Math.ceil(portSteps / 10))
    },

    setValue: function () {
        alert('not implemented')
    },

    // For tablets: these methods can be used to implement gestures.
    // It will receive gesture events a scale from a gesture centered on this widget
    gestureStart: function () {},
    gestureChange: function (scale) {},
    gestureEnd: function (scale) {},

    disable: function () {
        $(this).addClass('disabled').data('enabled', false)
    },
    enable: function () {
        $(this).removeClass('disabled').data('enabled', true)
    },

    valueFromSteps: function (steps) {
        var self = $(this)
        var min = self.data('scaleMinimum')
        var max = self.data('scaleMaximum')
        var portSteps = self.data('portSteps')

        steps = Math.min(steps, portSteps - 1)
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

    stepsFromValue: function (value) {
        var self = $(this)

        if (self.data('enumeration')) {
            // search for the nearest scalePoint
            var points = self.data('scalePoints')
            if (value <= points[0].value)
                return 0
            for (var step = 0; step < points.length; step++) {
                if (points[step + 1] == null)
                    return step
                if (value < points[step].value + (points[step + 1].value - points[step].value) / 2)
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

    prevent: function (e) {
        var self = $(this)
        if (self.data('prevent'))
            return
        self.data('prevent', true)
        var img = $('<img>').attr('src', 'img/icn-blocked.png')
        $('body').append(img)
        img.css({
            position: 'absolute',
            top: e.pageY - img.height() / 2,
            left: e.pageX - img.width() / 2,
            zIndex: 99999
        })
        setTimeout(function () {
            img.remove()
            self.data('prevent', false)
        }, 500)
    }
}

JqueryClass('film', baseWidget, {
    init: function (options) {
        var self = $(this)
        self.film('getSize', function () {
            self.film('config', options)
            self.film('setValue', options.port.ranges.default)
        })

        self.on('dragstart', function (event) {
            event.preventDefault()
        })

        var moveHandler = function (e) {
            if (!self.data('enabled')) return
            self.film('mouseMove', e)
        }

        var upHandler = function (e) {
            self.film('mouseUp', e)
            $(document).unbind('mouseup', upHandler)
            $(document).unbind('mousemove', moveHandler)
                //self.trigger('filmstop')
        }

        self.mousedown(function (e) {
            if (!self.data('enabled')) return self.film('prevent', e)
            if (e.which == 1) { // left button
                self.film('mouseDown', e)
                $(document).bind('mouseup', upHandler)
                $(document).bind('mousemove', moveHandler)
                self.trigger('filmstart')
            }
         })

        self.data('wheelBuffer', 0)
        self.bind('mousewheel', function (e) {
            self.film('mouseWheel', e)
        })

        self.click(function (e) {
            if (!self.data('enabled')) return self.film('prevent', e)
            self.film('mouseClick', e)
        })

        return self
    },

    setValue: function (value, only_gui) {
        var self = $(this)
        var position = self.film('stepsFromValue', value)
        self.data('position', position)
        self.film('setRotation', position)
        if (!only_gui)
            self.trigger('valuechange', value)
    },

    getSize: function (callback) {
        var self = $(this)
        setTimeout(function () {
            var url = self.css('background-image').replace('url(', '').replace(')', '').replace("'", '').replace('"', '');
            if (! url) {
                console.log("ERROR: The background-image for '" + self[0].className + "' is missing, typo in css?")
                return
            }
            var height = self.css('background-size').split(/ /)[1]
            if (height)
                height = parseInt(height.replace(/\D+$/, ''))
            var bgImg = $('<img />');
            bgImg.css('max-width', '999999999px')
            bgImg.hide();
            bgImg.bind('load', function () {
                var h = bgImg[0].height || bgImg.height()
                var w = bgImg[0].width || bgImg.width()
                if (w == 0) {
                    new Notification('error', 'Apparently your browser does not support all features you need. Install latest Chromium, Google Chrome or Safari')
                }
                if (!height)
                    height = h
                self.data('filmSteps', height * w / (self.width() * h))
                self.data('size', self.width())
                bgImg.remove()
                callback()
            });
            $('body').append(bgImg);
            bgImg.attr('src', url);
        }, 1)
    },

    mouseDown: function (e) {
        var self = $(this)
        self.data('lastY', e.pageY)
        self.data('lastX', e.pageX)
    },

    mouseUp: function (e) {
        var self = $(this)
    },

    mouseMove: function (e) {
        var self = $(this)
        var vdiff = self.data('lastY') - e.pageY
        vdiff = parseInt(vdiff / self.data('dragPrecisionVertical'))
        var hdiff = e.pageX - self.data('lastX')
        hdiff = parseInt(hdiff / self.data('dragPrecisionHorizontal'))

        if (Math.abs(vdiff) > 0)
            self.data('lastY', e.pageY)
        if (Math.abs(hdiff) > 0)
            self.data('lastX', e.pageX)

        var position = self.data('position')

        position += vdiff + hdiff
        self.data('position', position)

        self.film('setRotation', position)
        var value = self.film('valueFromSteps', position)
        self.trigger('valuechange', value)
    },

    mouseClick: function (e) {
        // Advance one step, to go beginning if at end.
        // Useful for fine tunning and toggle
        var self = $(this)
        var filmSteps = self.data('filmSteps')
        var position = self.data('position')
        position = (position + 1) % filmSteps
        self.data('position', position)
        self.film('setRotation', position)
        var value = self.film('valueFromSteps', position)
        self.trigger('valuechange', value)
    },

    mouseWheel: function (e) {
        var self = $(this)
        var wheelStep = 30
        var delta = self.data('wheelBuffer') + e.originalEvent.wheelDelta
        self.data('wheelBuffer', delta % wheelStep)
        var diff = parseInt(delta / wheelStep)
        var position = self.data('position')
        position += diff
        self.data('position', position)
        if (Math.abs(diff) > 0)
            self.data('lastY', e.pageY)
        self.film('setRotation', position)
        var value = self.film('valueFromSteps', position)
        self.trigger('valuechange', value)
    },

    gestureStart: function () {},
    gestureChange: function (scale) {
        var self = $(this)
        var diff = parseInt(Math.log(scale) * 30)
        var position = self.data('position')
        position += diff
        self.film('setRotation', position)
        self.data('lastPosition', position)
        var value = self.film('valueFromSteps', position)
        self.trigger('valuechange', value)
    },
    gestureEnd: function () {
        var self = $(this)
        self.data('position', self.data('lastPosition'))
    },

    setRotation: function (steps) {
        var self = $(this)

        var filmSteps = self.data('filmSteps')
        var portSteps = self.data('portSteps')
        var rotation

        if (portSteps == 1)
        // this is very dummy, a control with only one possible. let's just avoid zero division
        // in this theoric case.
            rotation = Math.round(filmSteps / 2)
        else if (portSteps != null)
            rotation = steps * parseInt(filmSteps / (portSteps - 1))

        rotation = Math.min(rotation, filmSteps - 1)
        rotation = Math.max(rotation, 0)

        var bgShift = rotation * -self.data('size')
        bgShift += 'px 0px'
        self.css('background-position', bgShift)
    }

})

JqueryClass('selectWidget', baseWidget, {
    init: function (options) {
        var self = $(this)
        self.selectWidget('config', options)
        self.selectWidget('setValue', options.port.ranges.default)
        self.change(function () {
            self.trigger('valuechange', parseFloat(self.val()))
        })
        return self
    },

    disable: function () {
        var self = $(this)
        self.attr('disabled', true)
        self.data('enabled', false)
    },

    enable: function () {
        var self = $(this)
        self.attr('disabled', false)
        self.data('enabled', true)
    },

    setValue: function (value, only_gui) {
        var self = $(this)
        self.val(value)
        if (!only_gui)
            self.trigger('valuechange', value)
    }
})

JqueryClass('switchWidget', baseWidget, {
    init: function (options) {
        var self = $(this)
        self.switchWidget('config', options)
        if (options.value != undefined) {
            self.switchWidget('setValue', options.value)
        } else {
            self.switchWidget('setValue', options.port.ranges.default)
        }
        self.click(function (e) {
            if (!self.data('enabled'))
                return self.switchWidget('prevent', e)
            var value = self.data('value')
            if (value == self.data('minimum')) {
                self.switchWidget('setValue', self.data('maximum'))
                self.addClass('on').removeClass('off')
            } else {
                self.switchWidget('setValue', self.data('minimum'))
                self.addClass('off').removeClass('on')
            }
        })
        return self
    },
    setValue: function (value, only_gui) {
        var self = $(this)
        self.data('value', value)

        if (value == self.data('minimum')) {
            self.addClass('off').removeClass('on')
        } else {
            self.addClass('on').removeClass('off')
        }

        if (!only_gui)
            self.trigger('valuechange', value)
    }
})

// this is the same as switchWidget with extra bypass-specific stuff
JqueryClass('bypassWidget', baseWidget, {
    init: function (options) {
        var self = $(this)
        self.data('changeLights', options.changeLights)
        self.bypassWidget('config', options)
        if (options.value != undefined) {
            self.bypassWidget('setValue', options.value)
        } else {
            self.bypassWidget('setValue', options.port.ranges.default)
        }
        self.click(function (e) {
            if (!self.data('enabled'))
                return self.bypassWidget('prevent', e)
            var value = self.data('value')
            if (value == self.data('minimum')) {
                self.bypassWidget('setValue', self.data('maximum'))
                self.addClass('on').removeClass('off')
            } else {
                self.bypassWidget('setValue', self.data('minimum'))
                self.addClass('off').removeClass('on')
            }
        })
        return self
    },
    setValue: function (value, only_gui) {
        var self = $(this)
        self.data('value', value)
        self.data('changeLights')(value)

        if (value)
            self.addClass('on').removeClass('off')
        else
            self.addClass('off').removeClass('on')

        if (!only_gui)
            self.trigger('valuechange', value)
    },
})

JqueryClass('customSelect', baseWidget, {
    init: function (options) {
        var self = $(this)
        self.customSelect('config', options)
        self.customSelect('setValue', options.port.ranges.default)
        self.find('[mod-role=enumeration-option]').each(function () {
            var opt = $(this)
            var value = opt.attr('mod-port-value')
            opt.click(function (e) {
                if (self.data('enabled')) {
                    self.customSelect('setValue', value)
                } else {
                    self.customSelect('prevent', e)
                }
            })
        });
        var enumlist = self.find('.mod-enumerated-list')
        self.click(function () {
            enumlist.toggle()
        })

        return self
    },

    setValue: function (value, only_gui) {
        value = parseFloat(value)
        var self = $(this)
        self.find('[mod-role=enumeration-option]').removeClass('selected')
        self.find('[mod-role=enumeration-option][mod-port-value="' + value + '"]').addClass('selected')
        if (!only_gui)
            self.trigger('valuechange', value)
    }
})
