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

goog.provide('shaka.vimond.PessimisticBandwidthEstimator');

goog.require('shaka.log');
goog.require('shaka.vimond.MelodramaticAverage');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');



/**
 * Tracks bandwidth samples and estimates available bandwidth.
 * Based on the minimum of two exponentially-weighted moving averages with
 * different half-lives.
 *
 * @struct
 * @constructor
 * @param {number=} melodramaticDropRatio A value between 0 and 1 indicating the lowest relative change considered to be melodramatic. Always considered negative.
 * @param {number=} relevanceThreshold No need making fuzz about it, if the bandwidth is great anyway. This is the threshold for great. Corresponds to highest available bitrate.
 * @param {number=} fastHalfLife For overriding the fast average sample history length
 * @param {number=} slowHalfLife For overriding the slow average sample history length
 * @param {number=} defaultBandwidth For initializing a defaultBandwidth in bits
 * @extends {shaka.util.FakeEventTarget}
 * @implements {shaka.util.IBandwidthEstimator}
 * @export
 */
shaka.vimond.PessimisticBandwidthEstimator = function(melodramaticDropRatio, relevanceThreshold, fastHalfLife, slowHalfLife, defaultBandwidth) {
    shaka.util.FakeEventTarget.call(this, null);

    /**
     * A fast-moving average.
     * Half of the estimate is based on the last 2 seconds of sample history.
     * @private {!shaka.vimond.MelodramaticAverage}
     */
    this.fast_ = new shaka.vimond.MelodramaticAverage(fastHalfLife || 4, melodramaticDropRatio || 0.2, relevanceThreshold || 2000000);

    /**
     * A slow-moving average.
     * Half of the estimate is based on the last 4 seconds of sample history.
     * @private {!shaka.vimond.MelodramaticAverage}
     */
    this.slow_ = new shaka.vimond.MelodramaticAverage(slowHalfLife || 8, melodramaticDropRatio || 0.2, relevanceThreshold || 2000000);

    /**
     * Prevents ultra-fast internal connections from causing crazy results.
     * @private {number}
     * @const
     */
    this.minDelayMs_ = 50;

    /**
     * Initial estimate used when there is not enough data.
     * @private {number}
     */
    this.defaultEstimate_ = defaultBandwidth || 5e5;  // 500kbps

    /**
     * Minimum weight required to trust the estimate.
     * @private {number}
     * @const
     */
    this.minWeight_ = 0.5;

    //TEA/Vimond: Reduced bytes threshold for estimator to be active, in order to adapt to very small segments.
    /**
     * Minimum number of bytes, under which samples are discarded.
     * @private {number}
     * @const
     */
    this.minBytes_ = 20000;

    /**
     * The last time a sample was recorded, in milliseconds.
     * @private {number}
     */
    this.lastSampleTime_ = 0;
};
goog.inherits(shaka.vimond.PessimisticBandwidthEstimator, shaka.util.FakeEventTarget);


/** @override */
shaka.vimond.PessimisticBandwidthEstimator.prototype.sample = function(delayMs, bytes) {
    if (bytes < this.minBytes_) {
        return;
    }

    delayMs = Math.max(delayMs, this.minDelayMs_);

    var bandwidth = 8000 * bytes / delayMs;
    var weight = delayMs / 1000;

    //shaka.log.info('Bandwidth sample', (bandwidth / 1000).toFixed(2), weight);
    this.fast_.sample(weight, bandwidth);
    this.slow_.sample(weight, bandwidth);

    this.dispatchEvent(shaka.util.FakeEvent.create({
        'type': 'bandwidth'
    }));

    this.lastSampleTime_ = Date.now();
};

/** @override */
shaka.vimond.PessimisticBandwidthEstimator.prototype.getBandwidth = function() {
    if (this.fast_.getTotalWeight() < this.minWeight_) {
        return this.defaultEstimate_;
    }

    // Take the minimum of these two estimates.  This should have the effect of
    // adapting down quickly, but up more slowly.
    //shaka.log.info('Fast/slow bandwidth', prettyPrint(this.fast_.getEstimate()), prettyPrint(this.slow_.getEstimate()));
    return Math.min(this.fast_.getEstimate(), this.slow_.getEstimate());
};


/** @override */
shaka.vimond.PessimisticBandwidthEstimator.prototype.getDataAge = function() {
    return (Date.now() - this.lastSampleTime_) / 1000;
};


/** @override */
shaka.vimond.PessimisticBandwidthEstimator.prototype.supportsCaching = function() {
    return false;
};
