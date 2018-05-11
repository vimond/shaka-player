/**
 * Copyright 2018 Vimond Media Solutions
 *
 * @fileoverview Specifies the configuration object for tolerance of small gaps in buffered ranges.
 */

goog.provide('shaka.vimond.dash.SmallGapsTolerancePolicy');

/**
 * Creates an SmallGapsTolerancePolicy object speficying the tolerance for small gaps, applying to which user agents.
 * 
 * @param {RegExp} userAgentMatch For which user agent strings the gap tolerance should be allowed for.
 * @param {number} maxGapLength The maximum allowed gap between buffered ranges.
 * @constructor
 * @struct
 * @exportDoc
 */
shaka.vimond.dash.SmallGapsTolerancePolicy = function(userAgentMatch, maxGapLength) {
    /** @public */
    this.userAgentMatch = userAgentMatch;
    /** @public */ 
    this.maxGapLength = maxGapLength
};

/**
 * Clones the SmallGapsTolerancePolicy.
 *
 * @return {!shaka.vimond.dash.SmallGapsTolerancePolicy}
 */
shaka.vimond.dash.SmallGapsTolerancePolicy.prototype.clone = function() {
    return new shaka.vimond.dash.SmallGapsTolerancePolicy(this.userAgentMatch, this.maxGapLength);
};

goog.exportSymbol('shaka.vimond.dash.SmallGapsTolerancePolicy', shaka.vimond.dash.SmallGapsTolerancePolicy);