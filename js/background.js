/**
 * @module background.js
 * - catches and modifies http headers according to user defined settings
 * - provides access to extension local storage from content scripts
 * @author Martin Springwald
 * @license MIT
 */
 
/**
 * checkKey
 * - test if key begins with 'pe_opt'
 * - returns true if test is successful, otherwise returns false
 * @param {string} key
 * @returns {boolean}
 */
var checkKey = function(key) {
	if (typeof key == "string") {
		if (key.search(/^pe_opt/)===0) return true;
	}
	return false;
};

/**
 * getHost
 * - returns second and top level domain from url
 * @param {string} url
 * @returns {string}
 */
var getHost = function(url) {
	var domain = url[2].split(".");
	if (domain.length<2) return null;
	return domain[domain.length-2] + "." + domain[domain.length-1];
};

/**
 * headerHandler
 * - remove header fields marked for exclusion from request header
 * @param {Object} details
 * @returns {Object}
 */
var headerHandler = function(details) {
	// associate url with tab
	if (!session[details.tabId]) session[details.tabId] = {};
	session[details.tabId][details.url] = true;
	// check if cookie url is valid
	var isValidCookie = true;
	if ((details.frameId===0)&&(details.type==="main_frame")) {
		session.mainFrames[details.tabId] = details.url;
	}
	else {
		if (getHost(details.url)!=getHost(session.mainFrames[details.tabId])) isValidCookie = false;
	}
	// load options
	var pe_opt_perm_referer = localStorage.pe_opt_perm_referer;
	var pe_opt_perm_ua = localStorage.pe_opt_perm_ua;
	var pe_opt_cookie_3rd = localStorage.pe_opt_cookie_3rd;
	// prepare exclude list
	var exclude = prepareExcludeList((pe_opt_cookie_3rd==="no")?isValidCookie:true);
	// iterate through header fields and build clean list
	var headers = [];
	var i; for (i=0; i<details.requestHeaders.length; i++) {
		// test if header field shall be excluded
		var ok = true;
		var j; for (j=0; j<exclude.length; j++) {
			if (details.requestHeaders[i].name === exclude[j]) {
				ok = false;
			}
		}
		// if header field shall not be excluded, add to clean list
		if (ok) {
			// replace referer if custom value is set
			if (pe_opt_perm_referer&&(details.requestHeaders[i].name == "Referer")) {
				details.requestHeaders[i].value = pe_opt_perm_referer;
			}
			// replace user agent if custom value is set
			if (pe_opt_perm_ua&&(details.requestHeaders[i].name == "User-Agent")) {
				details.requestHeaders[i].value = pe_opt_perm_ua;
			}
			// add header field to clean list
			headers.push(details.requestHeaders[i]);
		}
	}
	// return object with header list
    return {requestHeaders: headers};
};

/**
 * prepareExcludeList
 * - load options from local storage
 * - build exclude list based on options
 * @param {boolean} includeCookies
 * @returns {Array}
 */
var prepareExcludeList = function(includeCookies) {
	// load options
	var pe_opt_user_agent = localStorage.pe_opt_user_agent;
	var pe_opt_accept = localStorage.pe_opt_accept;
	var pe_opt_referer = localStorage.pe_opt_referer;
	// build exclude list
	var exclude = [];
	// exclude user agent header
	if (pe_opt_user_agent == "no") {
		exclude.push("User-Agent");
		exclude.push("X-Client-Data");
	}
	// exclude accept headers
	if (pe_opt_accept == "no") {
		exclude.push("Accept");
		exclude.push("Accept-Encoding");
		exclude.push("Accept-Language");
	}
	// exclude referer header
	if (pe_opt_referer == "no") {
		exclude.push("Referer");
	}
	// exclude cookie header
	if (!includeCookies) {
		exclude.push("Cookie");
	}
	// return array with header fields to exclude
	return exclude;
};

// clear session store
var session = { mainFrames: {} };

// receive messages from content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	// access to session data is requested
    if (request.method == "sessionData") {
		sendResponse({data: session});
	}
	// access to local storage is requested
    if (request.method == "localStorage") {
		var data = null;
		// access request contains key array
		if (request.keys) {
			// iterate through keys and return values as array in same order as key array
			data = [];
			var i; for (i=0; i<request.keys.length; i++) {
				if (checkKey(request.keys[i])) {
					data.push(localStorage[request.keys[i]]);
				}
			}
			// check cookies
			var cookie = (getHost(sender.tab.url)!=getHost(session.mainFrames[sender.tab.id]))?false:true;
			// send requested values
			sendResponse({data: data, cookie: cookie});
		}
	}
});

// catch and modify http header
chrome.webRequest.onBeforeSendHeaders.addListener(
	headerHandler,
	{urls: ["<all_urls>"]},
	["blocking", "requestHeaders"]
);
