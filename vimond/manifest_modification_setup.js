/**
 * Copyright 2015 Vimond Media Solutions
 *
 * @fileoverview Specifies the configuration object for manifest modification.
 */

goog.provide('vimond.shaka.dash.ManifestModificationSetup');

/**
 * Creates an ManifestModificationSetup object speficying rules for manifest modification.
 * @param {Array<vimond.shaka.dash.ReplacementRule>=} opt_replacements
 * @param {string=} opt_presentationTimeOffsetFixPolicy
 * @constructor
 * @struct
 * @exportDoc
 */
vimond.shaka.dash.ManifestModificationSetup = function(opt_replacements, opt_presentationTimeOffsetFixPolicy) {
    'use strict';    
    /** @public {?Array<vimond.shaka.dash.ReplacementRule>} */
    this.replacements = opt_replacements || null;

    /** @public {?string} */ 
    this.presentationTimeOffsetFixPolicy = opt_presentationTimeOffsetFixPolicy || null;
};