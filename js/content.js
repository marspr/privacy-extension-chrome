/**
 * @module content.js
 * - apply user defined settings to javascript elements
 * @author Martin Springwald
 * @license MIT
 */
 
// receive messages from popup script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	// return if out of scope
	if (request.scope != "<all_urls>") {
		if (request.scope != window.location.href) return;
	}
	// clear storage elements
	if (request.method == "clearPageStorage") {
		// query database names
		indexedDB.webkitGetDatabaseNames().onsuccess = function(e) {
			// make storage elements accessible
			var _indexedDB = e.target.result;
			var _sessionStorage = sessionStorage;
			var _localStorage = localStorage;
			// clear storage elements
			var i; for (i=0; i<_indexedDB.length; i++) {
				indexedDB.deleteDatabase(_indexedDB[i]);
			}
			_sessionStorage.clear();
			_localStorage.clear();
		};
	}
	// count storage items
	if (request.method == "countPageStorage") {
		// query database names
		indexedDB.webkitGetDatabaseNames().onsuccess = function(e) {
			// make storage elements accessible
			var _indexedDB = e.target.result;
			var _sessionStorage = sessionStorage;
			var _localStorage = localStorage;
			// count storage items
			var indexedDBCount = _indexedDB.length;
			var sessionStorageCount = _sessionStorage.length;
			var localStorageCount = _localStorage.length;
			// return
			var response = {
				method: "countPageStorageResult",
				data: {
					indexedDBCount: indexedDBCount,
					sessionStorageCount: sessionStorageCount,
					localStorageCount: localStorageCount
				}
			};
			chrome.runtime.sendMessage(response);
		};
	}
});

// request options from extension local storage and modify javascript elements if needed
chrome.runtime.sendMessage({
	method: "localStorage",
	keys: [
		"pe_opt_canvastodataurl",
		"pe_opt_navigator",
		"pe_opt_navigatormimetypes",
		"pe_opt_navigatorplugins",
		"pe_opt_user_agent",
		"pe_opt_perm_ua",
		"pe_opt_cookie",
		"pe_opt_cookie_3rd",
		"pe_opt_windowname"
	]},
	function(response) {
		if (!response.data) return;
		// overwrite or set javascript functions and values by injecting scripts into page at document start
		var script = document.createElement('script');
		script.textContent = "";
		// overwrite toDataUrl if option is set
		var pe_opt_canvastodataurl = response.data[0];
		if (pe_opt_canvastodataurl == "no") {
			script.textContent += "HTMLCanvasElement.prototype.toDataURL = function() { return false; };\n";
		}
		// overwrite navigator if option is set
		var pe_opt_navigator = response.data[1];
		if (pe_opt_navigator == "no") {
			script.textContent += "window.__defineGetter__('navigator', function() {return {};});\n";
			script.textContent += "window.navigator.__proto__ = null;\n";
		}
		else {
			// overwrite navigator.mimeTypes if option is set
			var pe_opt_navigatormimetypes = response.data[2];
			if (pe_opt_navigatormimetypes == "no") {
				script.textContent += "window.navigator.__defineGetter__('mimeTypes', function() {return {};});\n";
			}
			// overwrite navigator.plugins if option is set
			var pe_opt_navigatorplugins = response.data[3];
			if (pe_opt_navigatorplugins == "no") {
				script.textContent += "window.navigator.__defineGetter__('plugins', function() {return {};});\n";
			}
			// overwrite navigator.userAgent and navigator.app* if option is set
			var pe_opt_user_agent = response.data[4];
			if (pe_opt_user_agent == "no") {
				script.textContent += "window.navigator.__defineGetter__('userAgent', function() {return void 0;});\n";
				script.textContent += "window.navigator.__defineGetter__('appName', function() {return void 0;});\n";
				script.textContent += "window.navigator.__defineGetter__('appCodeName', function() {return void 0;});\n";
				script.textContent += "window.navigator.__defineGetter__('appVersion', function() {return void 0;});\n";
			}
			else {
				// set custom user agent if one is given
				var userAgent = response.data[5];
				if (userAgent) {
					userAgent = userAgent.replace(/"/g, '\\"');
					script.textContent += "window.navigator.__defineGetter__('userAgent', function() {return \""+userAgent+"\";});\n";
					script.textContent += "window.navigator.__defineGetter__('appName', function() {return void 0;});\n";
					script.textContent += "window.navigator.__defineGetter__('appCodeName', function() {return void 0;});\n";
					script.textContent += "window.navigator.__defineGetter__('appVersion', function() {return void 0;});\n";
				}
			}
		}
		// overwrite cookie if option is set
		var pe_opt_cookie = response.data[6];
		var pe_opt_cookie_3rd = response.data[7];
		if ((pe_opt_cookie !== "no")&&(pe_opt_cookie_3rd === "no")&&(response.cookie === false)) {
			script.textContent += "document.__defineGetter__('cookie', function() {return '';} );\n";
		}
		// overwrite window.name if option is set
		var pe_opt_windowname = response.data[8];
		if (pe_opt_windowname == "no") {
			script.textContent += "window.__defineSetter__('name', function() {} );\n";
			script.textContent += "window.__defineGetter__('name', function() {return '';} );\n";
		}
		var doc = (document.head||document.documentElement);
		doc.insertBefore(script, doc.firstChild);
		script.parentNode.removeChild(script);
	}
);
