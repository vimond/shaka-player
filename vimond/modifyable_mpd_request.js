/**
 * Copyright 2015 Vimond Media Solutions.
 *
 * @fileoverview Implements an MPD request where the data sent to parsing can be preprocessed and modified.
 */

goog.provide('shaka.vimond.dash.ModifyableMpdRequest');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.vimond.dash.ManifestModifier');
goog.require('shaka.player.Defaults');
goog.require('shaka.util.AjaxRequest');
goog.require('shaka.util.FailoverUri');
goog.require('shaka.util.FailoverUri');

/**
 * Creates an MpdRequest where the manifest can be modified.
 *
 * @param {!shaka.util.FailoverUri} url The URL.
 * @param {number=} opt_requestTimeout The timeout for a MpdRequest in seconds.
 * @param {shaka.vimond.dash.ManifestModificationSetup=} opt_modificationSetup
 *
 * @constructor
 * @struct
 * @extends {shaka.dash.MpdRequest}
 * @exportDoc
 */
shaka.vimond.dash.ModifyableMpdRequest = function(url, opt_requestTimeout, opt_modificationSetup) {
    shaka.dash.MpdRequest.call(this, url, opt_requestTimeout);
    /** @private {shaka.vimond.dash.ManifestModifier} */
    this.manifestModifier_ = new shaka.vimond.dash.ManifestModifier(opt_modificationSetup);
};

goog.inherits(shaka.vimond.dash.ModifyableMpdRequest, shaka.dash.MpdRequest);

/** @override */
shaka.vimond.dash.ModifyableMpdRequest.prototype.send = function() {
    var url = this.url_;
    return url.fetch(this.parameters_).then(function(data) {
            var mpd = shaka.dash.mpd.parseMpd(this.manifestModifier_.process(data), url.urls);
            if (mpd) {
                return Promise.resolve(mpd);
            }

            var error = new Error('MPD parse failure.');
            error.type = 'mpd';
            return Promise.reject(error);
        }.bind(this));
};

