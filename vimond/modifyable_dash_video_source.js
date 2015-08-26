/**
 * Copyright 2015 Vimond Media Solutions
 *
 * @fileoverview Implements a DASH video source where the manifest can be modified client side.
 */

goog.provide('vimond.shaka.player.ModifyableDashVideoSource');

goog.require('shaka.player.DashVideoSource');
goog.require('shaka.dash.MpdProcessor');
goog.require('vimond.shaka.dash.ModifyableMpdRequest');
goog.require('shaka.dash.mpd');

/**
 * Creates a DashVideoSource where the manifest can be modified.
 * @param {string} mpdUrl The MPD URL.
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback} interpretContentProtection A callback to interpret the ContentProtection elements in the MPD.
 * @param {shaka.util.IBandwidthEstimator} estimator
 * @param {shaka.media.IAbrManager} abrManager
 * @param {object=} opt_manifestModificationSetup
 *
 * @constructor
 * @struct
 * @extends {shaka.player.StreamVideoSource}
 * @exportDoc
 */
vimond.shaka.player.ModifyableDashVideoSource = function(mpdUrl, interpretContentProtection, estimator, abrManager, opt_manifestModificationSetup) {
    shaka.player.DashVideoSource.call(this, mpdUrl, interpretContentProtection, estimator, abrManager);
    /** @private {Object} */
    this.opt_manifestModificationSetup_ = opt_manifestModificationSetup;
};

goog.inherits(vimond.shaka.player.ModifyableDashVideoSource, shaka.player.DashVideoSource);
if (shaka.features.Dash) {
    goog.exportSymbol('vimond.shaka.player.ModifyableDashVideoSource', vimond.shaka.player.ModifyableDashVideoSource);
}

/** @override */
vimond.shaka.player.ModifyableDashVideoSource.prototype.load = function() {
    var mpdRequest =
        new vimond.shaka.dash.ModifyableMpdRequest(this.mpdUrl_, this.mpdRequestTimeout, this.opt_manifestModificationSetup_);
    return mpdRequest.send().then(shaka.util.TypedBind(this,
            /** @param {!shaka.dash.mpd.Mpd} mpd */
            function(mpd) {
                for (var i = 0; i < this.captionsUrl_.length; i++) {
                    mpd.addExternalCaptions(this.captionsUrl_[i],
                        this.captionsLang_[i], this.captionsMime_[i]);
                }

                var mpdProcessor =
                    new shaka.dash.MpdProcessor(this.interpretContentProtection_);
                this.manifestInfo = mpdProcessor.process(mpd);

                var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
                var p = baseClassLoad.call(this);

                return p;
            }.bind(this))
    );
};

/** @override */
vimond.shaka.player.ModifyableDashVideoSource.prototype.onUpdateManifest = function(url) {
    var mpdRequest =
        new vimond.shaka.dash.ModifyableMpdRequest(url, this.mpdRequestTimeout);
    return mpdRequest.send().then(shaka.util.TypedBind(this,
            /** @param {!shaka.dash.mpd.Mpd} mpd */
            function(mpd) {
                var mpdProcessor =
                    new shaka.dash.MpdProcessor(this.interpretContentProtection_);
                var newManifestInfo = mpdProcessor.process(mpd);
                return Promise.resolve(newManifestInfo);
            })
    );
};
