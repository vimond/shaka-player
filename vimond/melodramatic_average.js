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

goog.provide('shaka.vimond.MelodramaticAverage');

goog.require('shaka.asserts');
goog.require('shaka.log');



/**
 * Computes an exponentionally-weighted moving average, but keeps attention to sudden, negative changes, and makes a bigger deal out of it.
 *
 * @param {number} halfLife About half of the estimated value will be from the
 *     last |halfLife| samples by weight.
 * @param {number} melodramaticDropRatio A value between 0 and 1 indicating the lowest relative change considered to be dramatic. Always considered as a negative value.
 * @param {number} relevanceThreshold No need making fuzz about it, if the bandwidth is great anyway. This is the lower limit for great. Should correspond to highest available bitrate.
 * @struct
 * @constructor
 */
shaka.vimond.MelodramaticAverage = function(halfLife, melodramaticDropRatio, relevanceThreshold) {
    shaka.asserts.assert(halfLife > 0);

    /**
     * Larger values of alpha expire historical data more slowly.
     * @private {number}
     */
    this.alpha_ = Math.exp(Math.log(0.5) / halfLife);

    /** @private {number} */
    this.estimate_ = 0;

    /** @private {number} */
    this.totalWeight_ = 0;
    
    /** @private {Array.<number>} */
    this.history_ = [];
    
    /** @private {number} */
    this.melodramaticDropRatio_ = -Math.abs(melodramaticDropRatio);
    
    /** @private {number} */
    this.relevanceThreshold_ = relevanceThreshold;
};


/**
 * Takes a sample.
 *
 * @param {number} weight
 * @param {number} value
 */
shaka.vimond.MelodramaticAverage.prototype.sample = function(weight, value) {
    var adjAlpha = Math.pow(this.alpha_, weight);
    var melodramatic = this.detectSuddenAndDefiniteDrop_(value);
    if (melodramatic !== value) {
        this.estimate_ = melodramatic;
    } else {
        this.estimate_ = value * (1 - adjAlpha) + adjAlpha * this.estimate_;
    }
    this.totalWeight_ += weight;
};

/**
 * @return {number}
 */
shaka.vimond.MelodramaticAverage.prototype.getTotalWeight = function() {
    return this.totalWeight_;
};

shaka.vimond.MelodramaticAverage.prototype.computeRelativeDifference_ = function(item, index, array) {
    "use strict";
    return (item - array[0]) / array[0];
};

shaka.vimond.MelodramaticAverage.prototype.selectDramaticDrops_ = function(item) {
    "use strict";
    return item < this.melodramaticDropRatio_;
};

function prettyPrint(n) {
    "use strict";
    return (n / 1000).toFixed(2);
}

shaka.vimond.MelodramaticAverage.prototype.detectSuddenAndDefiniteDrop_ = function(value) {
    "use strict";
    this.history_.push(value);
    var returnValue = value;
    if (this.history_.length > 3) {
        if (this.history_[0] < this.relevanceThreshold_) {
            var relativeDiffs = this.history_.map(this.computeRelativeDifference_).filter(this.selectDramaticDrops_.bind(this));
            //shaka.log.info('Last values: ' + this.history_.map(pretty).join(', ') + '. Dramatic drops: ', relativeDiffs.length);
            if (relativeDiffs.length > 2) {
                // At least three samples are radically lower than before.
                // The mood has changed in a dramatic way.
                shaka.log.info('Dramatic change in samples detected.', prettyPrint(this.history_[0]), prettyPrint(returnValue));
                returnValue = Math.min.apply(Math, this.history_);
            }
        }
        this.history_.shift();
    }
    return returnValue;
};

/**
 * @return {number}
 */
shaka.vimond.MelodramaticAverage.prototype.getEstimate = function() {
    var zeroFactor = 1 - Math.pow(this.alpha_, this.totalWeight_);
    return this.estimate_ / zeroFactor;
};

