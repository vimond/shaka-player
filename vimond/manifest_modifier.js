/**
 * Copyright 2015 Vimond Media Solutions
 *
 * @fileoverview Processes a MPD manifest as text content, manipulating it according to configured rules.
 */

goog.provide('vimond.shaka.dash.ManifestModifier');

/**
 * Creates an ManifestModifier with a ruleset/configuration for modifications to be applied.
 *
 * @param {vimond.shaka.dash.ManifestModificationSetup=} opt_modificationSetup
 *
 * @constructor
 * @struct
 * @exportDoc
 */
vimond.shaka.dash.ManifestModifier = function(opt_modificationSetup) {
    /** @private {?vimond.shaka.dash.ManifestModificationSetup} */
    this.modificationSetup_ = opt_modificationSetup || null;
};


/*

Example config object

manifestModifier: {
    replacements: [{
        match: /<S.*d="0".*\/>/gm,
        replacement: ' ',
    },{
        match: /("avc1\.4d001f")+/g,
        replacement: '"avc1.4d401f"'
    },{
         match: '("avc1\.4d001f")+',
         options: 'g',
         replacement: '"avc1.4d401f"'
    }]
    presentationTimeOffsetFixPolicy: 'firstVideo' // 'highest' 'lowest' 'higestCeil'
}

 */

/**
 * Processes the given manifest text.
 * This function modifies |mpd| but does not take ownership of it.
 *
 * @param {string|ArrayBuffer|null} manifest
 * @return {string}
 */
vimond.shaka.dash.ManifestModifier.prototype.process = function(manifest) {
    if (typeof manifest === 'string' && this.modificationSetup_) {
        var replacements = this.modificationSetup_.replacements;
        if (replacements) {
            manifest = replacements.reduce(function (prevData, replaceEntry) {
                var match = replaceEntry.match instanceof RegExp ? replaceEntry.match : new RegExp(replaceEntry.match.toString(), replaceEntry.options);
                var replaced = prevData.replace(match, replaceEntry.replacement);
                //if (isNotLogged) {
                if (replaced !== prevData) {
                    shaka.log.info('Manifest modifier in action: Replaced matches for %s with %s.', match, replaceEntry.replacement);
                } else {
                    shaka.log.info('Manifest modifier found nothing for pattern %s to be replaced with %s.', match, replaceEntry.replacement);
                }
                //}
                return replaced;
            }, manifest);
        }
        //if (typeof this.modificationSetup_.presentationTimeOffsetFixPolicy === 'string') {
        //
        //}
    }
    return manifest;
};