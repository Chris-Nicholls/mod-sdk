function getEffects(bundle, callback) {
    window.location.hash = bundle
    if (!bundle) {
	effects.hide()
	return
    }
    $.ajax({ url: '/effects/' + bundle,
	     success: function(result) {
		 if (!result.ok) {
		     alert(result.error)
		     return
		 }
		 callback(result.data.plugins)
	     },
	     error: function(resp) {
		 alert("Error: Can't get list of effects. Is your server running? Check the logs.")
	     }
	   })
}
