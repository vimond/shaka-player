/**
 * Copyright 2015 Vimond Media Solutions
 *
 * @fileoverview Specifies the configuration object for manifest modification.
 */

goog.provide('shaka.vimond.dash.ManifestModificationSetup');

/**
 * Creates an ManifestModificationSetup object speficying rules for manifest modification.
 * @param {Array<shaka.vimond.dash.ReplacementRule>=} opt_replacements
 * @param {string=} opt_presentationTimeOffsetFixPolicy
 * @param {string=} opt_bigIntegersFixPolicy
 * @constructor
 * @struct
 * @exportDoc
 */
shaka.vimond.dash.ManifestModificationSetup = function(opt_replacements, opt_presentationTimeOffsetFixPolicy, opt_bigIntegersFixPolicy) {
    'use strict';    
    /** @public */
    this.replacements = opt_replacements || null;
    
    this.bigIntegersFixPolicy = opt_bigIntegersFixPolicy || null;

    /** @public */ 
    this.presentationTimeOffsetFixPolicy = opt_presentationTimeOffsetFixPolicy || null;
};
goog.exportSymbol('shaka.vimond.dash.ManifestModificationSetup', shaka.vimond.dash.ManifestModificationSetup);