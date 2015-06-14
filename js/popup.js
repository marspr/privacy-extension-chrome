/**
 * @module popup.js
 * - handle input for all check and text box elements
 * - load and save user defined settings
 * - collect and prepare to remove cookies and storage data
 * @author Martin Springwald
 * @license MIT
 */

/**
 * clear_data
 * - display overlay during collection of data
 * - ask user if data should be removed
 * - clear cookies and storage for current url
 */
var clear_data = function() {
	// make overlay visible
	show_overlay(true);
	// query current tab
	chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
		var tab = tabs[0];
		// get cookies
		get_cookies(function(cookielist) {
			// iterate through cookie list and build unique list by generating hash values for comparison
			var cookiemap = {};
			var cookies = [];
			var i; for (i=0; i<cookielist.length; i++) {
				// use url (protocol, domain, path) and name for hash value
				var hash = [cookielist[i].secure,cookielist[i].domain,cookielist[i].path,cookielist[i].name].join("%");
				// add to list if cookie was not already added
				if (!cookiemap[hash]) {
					cookies.push(cookielist[i]);
					cookiemap[hash] = true;
				}
			}
			// reset item count for storage elements
			sessionStorage.statIndexedDBCount = 0;
			sessionStorage.statLocalStorageCount = 0;
			sessionStorage.statSessionStorageCount = 0;
			// let content script count storage items
			chrome.tabs.sendMessage(tab.id, {
				method: "countPageStorage",
				scope: (localStorage.pe_opt_clear_data_3rd!=="no")?"<all_urls>":tab.url
			});
			// timeout after 1.5s
			window.setTimeout(function() {
				// get storage item counts
				var storage = {
					indexedDBCount: parseInt(sessionStorage.statIndexedDBCount, 10),
					localStorageCount: parseInt(sessionStorage.statLocalStorageCount, 10),
					sessionStorageCount: parseInt(sessionStorage.statSessionStorageCount, 10)
				};
				// display counts and ask user to remove data
				var c = "";
				if (cookies.length>0) c += cookies.length + " " + chrome.i18n.getMessage("message_clear_data_count_cookies") + "\n";
				if (storage.indexedDBCount>0) c += storage.indexedDBCount + " " + chrome.i18n.getMessage("message_clear_data_count_db") + "\n";
				if (storage.localStorageCount>0) c += storage.localStorageCount + " " + chrome.i18n.getMessage("message_clear_data_count_localstorage") + "\n";
				if (storage.sessionStorageCount>0) c += storage.sessionStorageCount + " " + chrome.i18n.getMessage("message_clear_data_count_sessionstorage") + "\n";
				if (c!=="") {
					var value = window.confirm(chrome.i18n.getMessage("message_clear_data_confirm_prefix") + "\n"+c+"\n"+chrome.i18n.getMessage("message_clear_data_confirm_suffix"));
					// user requests removal of data
					if (value) {
						// query current tab
						chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
							var tab = tabs[0];
							// remove cookies
							clear_cookies(cookies);
							// clear storage elements
							chrome.tabs.sendMessage(tab.id, {
								method: "clearPageStorage",
								scope: (localStorage.pe_opt_clear_data_3rd!=="no")?"<all_urls>":tab.url
							});
						});
					}
				}
				else {
					window.alert(chrome.i18n.getMessage("message_clear_data_empty"));
				}
				// make overlay invisible
				show_overlay(false);
			}, 1500);
		});
	});
};

/**
 * clear_cookies
 * - removes every cookie specified in cookies array
 * @param {Array} cookies
 */
var clear_cookies = function(cookies) {
	var i; for (i=0; i<cookies.length; i++) {
		var c = cookies[i];
		chrome.cookies.remove({
			url: (c.secure?"https":"http")+"://"+c.domain+c.path,
			name: c.name
		});
	}
};

/**
 * get_cookies_byurl
 * - retrieve all cookies from store that match host (second level domain) and path specified by url
 * - returns cookies array and counter (i) increased by 1 to callback
 * @param {string} taburl
 * @param {Array} cookies
 * @param {function} callback
 * @param {Number} i
 */
var get_cookies_byurl = function(taburl, cookies, callback, i) {
	// split url by '/', e.g. http://example.com/path -> [ 'http:', '', 'example.com', 'path' ]
	url = taburl.split("/");
	// return if url does not contain a domain
	if (url.length<=2) {
		callback(cookies, i+1);
		return;
	}
	// split domain by '.', e.g. example.com -> [ 'example', 'com' ]
	var domain = url[2].split(".");
	// return if domain is only top level
	if (domain.length<2) {
		callback(cookies, i+1);
		return;
	}
	// extract second level domain, e.g. www.example.com -> 'example.com'
	var host = domain[domain.length-2] + "." + domain[domain.length-1];
	// query cookie store for all cookies which match the given host
	chrome.cookies.getAll({
		domain: host
	}, function(result) {
		// iterate through result
		var e; for (e in result) {
			// test if the cookie origin is part of the given domain
			var cookiehost = result[e].domain.split(".").join("\\.");
			if (domain.join(".").search(new RegExp(cookiehost, "i"))!=-1) {
				// test if the cookie path is part of the given url without query string
				var url_path = taburl.split("?")[0];
				if (url_path.search(new RegExp(":\/\/" + domain.join("\\.") + result[e].path + ((result[e].path.length==1)?".*$":"(\/.*)*$"), "i"))!=-1) {
					cookies.push(result[e]);
				}
			}
		}
		// return
		callback(cookies, i+1);
	});
};

/**
 * get_cookies
 * - retrieve list of urls that were requested during load of the current page
 * - query cookie store for all cookies by all urls associated with the current page
 * - returns unique list of cookies to callback
 * @param {function} callback
 */
var get_cookies = function(callback) {
	// query current tab
	chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
		var tab = tabs[0];
		// query background page for list of urls for all tabs
		chrome.runtime.sendMessage({
			method: "sessionData"
		}, function(result) {
			// get list of urls by tab id
			var urls = [];
			var list = result.data[tab.id];
			if (list) {
				if (localStorage.pe_opt_clear_data_3rd !== "no") {
					// make array from hash map
					var e; for (e in list) {
						if (list.hasOwnProperty(e)) {
							urls.push(e);
						}
					}
				}
				else {
					urls = [ tab.url ];
				}
				// iterate through url array and query cookies by url
				var cookies = [];
				var next = function(cookies, i) {
					if (i<urls.length) {
						get_cookies_byurl(urls[i], cookies, next, i);
					}
					else {
						callback(cookies);
					}
				};
				next(cookies, 0);
			}
			else {
				callback([]);
			}
		});
	});
};

/**
 * handleDep
 * - disable child controls if parent check box is unchecked
 */
var handleDep = function() {
	if (document.getElementById("pe_opt_cookie").checked) {
		document.getElementById("pe_opt_cookie_3rd").disabled=false;
	}
	else {
		document.getElementById("pe_opt_cookie_3rd").disabled=true;
	}
	if (document.getElementById("pe_opt_script").checked) {
		document.getElementById("pe_opt_navigator").disabled=false;
		document.getElementById("pe_opt_canvastodataurl").disabled=false;
		document.getElementById("pe_opt_windowname").disabled=false;
		if (document.getElementById("pe_opt_navigator").checked) {
			document.getElementById("pe_opt_navigatormimetypes").disabled=false;
			document.getElementById("pe_opt_navigatorplugins").disabled=false;
		}
		else {
			document.getElementById("pe_opt_navigatormimetypes").disabled=true;
			document.getElementById("pe_opt_navigatorplugins").disabled=true;
		}
	}
	else {
		document.getElementById("pe_opt_navigator").disabled=true;
		document.getElementById("pe_opt_navigatormimetypes").disabled=true;
		document.getElementById("pe_opt_navigatorplugins").disabled=true;
		document.getElementById("pe_opt_canvastodataurl").disabled=true;
		document.getElementById("pe_opt_windowname").disabled=true;
	}
};

/**
 * input_ref
 * - ask user for referer to be applied
 * - save option to local storage
 */
var input_ref = function() {
	// ask user
	var value = window.prompt(chrome.i18n.getMessage("message_input_ref"), document.getElementById("pe_label_referer").innerHTML);
	// if canceled or empty, reset to url in current tab
	if (value === ""||value === null) {
		chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
			delete localStorage.pe_opt_perm_referer;
			document.getElementById("pe_label_referer").innerHTML = tabs.length?tabs[0].url:"";
			document.getElementById("pe_label_referer").style.color = "black";
		});
	}
	// if not empty, apply specified referer as new permanent referer
	else {
		localStorage.pe_opt_perm_referer = value;
		document.getElementById("pe_label_referer").innerHTML = value;
		document.getElementById("pe_label_referer").style.color = "orange";
	}
};

/**
 * input_ua
 * - ask user for user agent to be applied
 * - save option to local storage
 */
var input_ua = function() {
	// ask user
	var value = window.prompt(chrome.i18n.getMessage("message_input_ua"), document.getElementById("pe_label_user_agent").innerHTML);
	// if canceled or empty, reset to default (navigator.userAgent)
	if (value === ""||value === null) {
		delete localStorage.pe_opt_perm_ua;
		document.getElementById("pe_label_user_agent").innerHTML = navigator.userAgent;
		document.getElementById("pe_label_user_agent").style.color = "black";
	}
	// if not empty, apply specified user agent as new permanent user agent
	else {
		localStorage.pe_opt_perm_ua = value;
		document.getElementById("pe_label_user_agent").innerHTML = value;
		document.getElementById("pe_label_user_agent").style.color = "orange";
	}
};

/**
 * load
 * - load check and text box values from local storage
 * - register event handlers for all input elements
 */
var load = function() {
	// get locale
	document.getElementById("pe_but_clear_data").value = chrome.i18n.getMessage("label_pe_but_clear_data");
	document.getElementById("pe_but_referer").value = chrome.i18n.getMessage("label_pe_but_referer");
	document.getElementById("pe_but_user_agent").value = chrome.i18n.getMessage("label_pe_but_user_agent");
	document.getElementById("pe_label_cookie_3rd").innerHTML = chrome.i18n.getMessage("label_pe_label_cookie_3rd");
	document.getElementById("pe_label_clear_data_3rd").innerHTML = chrome.i18n.getMessage("label_pe_label_clear_data_3rd");
	document.getElementById("pe_label_loading").innerHTML = chrome.i18n.getMessage("label_pe_label_loading");
	// get values from local storage
	var pe_opt_user_agent = localStorage.pe_opt_user_agent;
	var pe_opt_accept = localStorage.pe_opt_accept;
	var pe_opt_referer = localStorage.pe_opt_referer;
	var pe_opt_script = localStorage.pe_opt_script;
	var pe_opt_navigator = localStorage.pe_opt_navigator;
	var pe_opt_navigatormimetypes = localStorage.pe_opt_navigatormimetypes;
	var pe_opt_navigatorplugins = localStorage.pe_opt_navigatorplugins;
	var pe_opt_canvastodataurl = localStorage.pe_opt_canvastodataurl;
	var pe_opt_windowname = localStorage.pe_opt_windowname;
	var pe_opt_perm_referer = localStorage.pe_opt_perm_referer;
	var pe_opt_perm_ua = localStorage.pe_opt_perm_ua;
	var pe_opt_cookie = localStorage.pe_opt_cookie;
	var pe_opt_cookie_3rd = localStorage.pe_opt_cookie_3rd;
	var pe_opt_clear_data_3rd = localStorage.pe_opt_clear_data_3rd;
	// apply retrieved values to check box states
	if (!pe_opt_user_agent||pe_opt_user_agent=="yes") document.getElementById("pe_opt_user_agent").checked = "checked";
	if (!pe_opt_accept||pe_opt_accept=="yes") document.getElementById("pe_opt_accept").checked = "checked";
	if (!pe_opt_referer||pe_opt_referer=="yes") document.getElementById("pe_opt_referer").checked= "checked";
	if (!pe_opt_script||pe_opt_script=="yes") document.getElementById("pe_opt_script").checked = "checked";
	if (!pe_opt_navigator||pe_opt_navigator=="yes") document.getElementById("pe_opt_navigator").checked = "checked";
	if (!pe_opt_navigatormimetypes||pe_opt_navigatormimetypes=="yes") document.getElementById("pe_opt_navigatormimetypes").checked = "checked";
	if (!pe_opt_navigatorplugins||pe_opt_navigatorplugins=="yes") document.getElementById("pe_opt_navigatorplugins").checked = "checked";
	if (!pe_opt_canvastodataurl||pe_opt_canvastodataurl=="yes") document.getElementById("pe_opt_canvastodataurl").checked = "checked";
	if (!pe_opt_windowname||pe_opt_windowname=="yes") document.getElementById("pe_opt_windowname").checked = "checked";
	if (!pe_opt_cookie||pe_opt_cookie=="yes") document.getElementById("pe_opt_cookie").checked = "checked";
	if (!pe_opt_cookie_3rd||pe_opt_cookie_3rd=="yes") document.getElementById("pe_opt_cookie_3rd").checked = "checked";
	if (!pe_opt_clear_data_3rd||pe_opt_clear_data_3rd=="yes") document.getElementById("pe_opt_clear_data_3rd").checked = "checked";
	// apply permanent user agent value to corresponding text box
	if (pe_opt_perm_ua) {
		document.getElementById("pe_label_user_agent").innerHTML = pe_opt_perm_ua;
		document.getElementById("pe_label_user_agent").style.color = "orange";
	}
	else {
		document.getElementById("pe_label_user_agent").innerHTML = navigator.userAgent;
		document.getElementById("pe_label_user_agent").style.color = "black";
	}
	// apply permanent referer value to corresponding text box
	if (pe_opt_perm_referer) {
		document.getElementById("pe_label_referer").innerHTML = pe_opt_perm_referer;
		document.getElementById("pe_label_referer").style.color = "orange";
	}
	else {
		chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
			var tab = tabs[0];
			document.getElementById("pe_label_referer").innerHTML = tab.url;
			document.getElementById("pe_label_referer").style.color = "black";
		});
	}
	// register event handlers for all input elements
	document.getElementById("pe_opt_user_agent").addEventListener('click', save);
	document.getElementById("pe_opt_accept").addEventListener('click', save);
	document.getElementById("pe_opt_referer").addEventListener('click', save);
	document.getElementById("pe_opt_script").addEventListener('click', save);
	document.getElementById("pe_opt_navigator").addEventListener('click', save);
	document.getElementById("pe_opt_navigatormimetypes").addEventListener('click', save);
	document.getElementById("pe_opt_navigatorplugins").addEventListener('click', save);
	document.getElementById("pe_opt_canvastodataurl").addEventListener('click', save);
	document.getElementById("pe_opt_windowname").addEventListener('click', save);
	document.getElementById("pe_opt_cookie").addEventListener('click', save);
	document.getElementById("pe_opt_cookie_3rd").addEventListener('click', save);
	document.getElementById("pe_opt_clear_data_3rd").addEventListener('click', save);
	document.getElementById("pe_but_referer").addEventListener('click', input_ref);
	document.getElementById("pe_but_user_agent").addEventListener('click', input_ua);
	document.getElementById("pe_but_clear_data").addEventListener('click', clear_data);
	// handle dependencies
	handleDep();
};

/**
 * save
 * - save check box values to local storage and settings
 */
var save = function() {
	localStorage.pe_opt_user_agent = (document.getElementById("pe_opt_user_agent").checked===true)?"yes":"no";
	localStorage.pe_opt_accept = (document.getElementById("pe_opt_accept").checked===true)?"yes":"no";
	localStorage.pe_opt_referer = (document.getElementById("pe_opt_referer").checked===true)?"yes":"no";
	localStorage.pe_opt_navigator = (document.getElementById("pe_opt_navigator").checked===true)?"yes":"no";
	localStorage.pe_opt_navigatormimetypes = (document.getElementById("pe_opt_navigatormimetypes").checked===true)?"yes":"no";
	localStorage.pe_opt_navigatorplugins = (document.getElementById("pe_opt_navigatorplugins").checked===true)?"yes":"no";
	localStorage.pe_opt_canvastodataurl = (document.getElementById("pe_opt_canvastodataurl").checked===true)?"yes":"no";
	localStorage.pe_opt_windowname = (document.getElementById("pe_opt_windowname").checked===true)?"yes":"no";
	localStorage.pe_opt_script = (document.getElementById("pe_opt_script").checked===true)?"yes":"no";
	localStorage.pe_opt_cookie = (document.getElementById("pe_opt_cookie").checked===true)?"yes":"no";
	localStorage.pe_opt_cookie_3rd = (document.getElementById("pe_opt_cookie_3rd").checked===true)?"yes":"no";
	localStorage.pe_opt_clear_data_3rd = (document.getElementById("pe_opt_clear_data_3rd").checked===true)?"yes":"no";
	// enable or disable javascript
	chrome.contentSettings.javascript.clear({});
	if (!document.getElementById("pe_opt_script").checked) {
		chrome.contentSettings.javascript.set({
			primaryPattern: "<all_urls>",
			setting: "block"
		});
	}
	// enable or disable cookies
	chrome.contentSettings.cookies.clear({});
	if (!document.getElementById("pe_opt_cookie").checked) {
		chrome.contentSettings.cookies.set({
			primaryPattern: "<all_urls>",
			setting: "block"
		});
	}
	handleDep();
};

/**
 * show_overlay
 * - makes overlay visible if 'show' is true, otherwise makes overlay invisible
 * @param {boolean} show
 */
var show_overlay = function(show) {
	if (show) {
		document.getElementById('overlay').style.visibility = "visible";
	}
	else {
		document.getElementById('overlay').style.visibility = "hidden";
	}
};

// receive messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	// receive requested numbers of storage items by url and add to total count of all urls
	if (request.method == "countPageStorageResult") { 
		var storage = request.data;
		sessionStorage.statIndexedDBCount = parseInt(sessionStorage.statIndexedDBCount, 10)+storage.indexedDBCount;
		sessionStorage.statLocalStorageCount = parseInt(sessionStorage.statLocalStorageCount, 10)+storage.localStorageCount;
		sessionStorage.statSessionStorageCount = parseInt(sessionStorage.statSessionStorageCount, 10)+storage.sessionStorageCount;
	}
});

// load on popup show
document.addEventListener('DOMContentLoaded', load);
