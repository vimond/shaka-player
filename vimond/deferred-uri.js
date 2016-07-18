/**
 * @license
 * Copyright 2015 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.vimond.DeferredUri');

goog.require('shaka.util.FailoverUri');
goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.util.AjaxRequest');



/**
 * Creates a FailoverUri, which handles requests to multiple URLs in case of
 * failure.
 *
 * @param {shaka.util.FailoverUri.NetworkCallback} callback
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} segmentReplacement
 * @param {number} timeReplacement
 * @extends {shaka.util.FailoverUri}
 * @constructor
 */
shaka.vimond.DeferredUri = function(callback, representation, segmentReplacement, timeReplacement) {
    
    /** @private {!shaka.dash.mpd.Representation} */
    this.representation_ = representation;

    /** @const {number} */
    this.segmentReplacement_ = segmentReplacement;

    /** @const {number} */
    this.timeReplacement_ = timeReplacement;

    /** @const {!Array.<!goog.Uri>} */
    this.urls = [];

    /** @const {number} */
    this.startByte = 0;

    /** @const {?number} */
    this.endByte = null;

    /** @private {?Promise} */
    this.requestPromise_ = null;

    /** @private {shaka.util.AjaxRequest} */
    this.request_ = null;

    /** @private {shaka.util.FailoverUri.NetworkCallback} */
    this.callback2_ = callback;

    /** @type {goog.Uri} */
    this.currentUrl = null;
};

goog.inherits(shaka.vimond.DeferredUri, shaka.util.FailoverUri);

/**
 * Constructs and returns the Uri when needed.
 * @private
 * @returns {shaka.util.FailoverUri}
 */
shaka.vimond.DeferredUri.prototype.getUri_ = function() {
    "use strict";
    return shaka.dash.MpdUtils.createFromTemplate(
        this.callback2_, this.representation_, this.segmentReplacement_,
        this.timeReplacement_, 0, null);
};

/** @override */
shaka.vimond.DeferredUri.prototype.fetch = function(opt_parameters, opt_estimator) {
    "use strict";
    this.urls.push(this.getUri_().urls[0]);
    return shaka.util.FailoverUri.prototype.fetch.call(this, opt_parameters, opt_estimator);
};

/** @override */
shaka.vimond.DeferredUri.prototype.isOfflineUri = function() {
    return false;
};
