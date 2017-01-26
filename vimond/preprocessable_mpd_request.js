/**
 * Copyright 2015 Vimond Media Solutions.
 *
 * @fileoverview Implements an MPD request where the data sent to parsing can be preprocessed and modified.
 */

goog.provide('shaka.vimond.dash.PreprocessableMpdRequest');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.vimond.dash.ManifestTextPreprocessor');
goog.require('shaka.vimond.dash.SerialBigIntegerEliminator');
goog.require('shaka.vimond.dash.SerialBigIntegerEliminator.WorkaroundState');
goog.require('shaka.player.Defaults');
goog.require('shaka.util.AjaxRequest');
goog.require('shaka.util.FailoverUri');
goog.require('shaka.util.FailoverUri');

/**
 * @param {string} manifestString
 * @param {shaka.vimond.dash.SerialBigIntegerEliminator.WorkaroundState=} state
 * @struct
 * @constructor
 */
shaka.vimond.dash.ProcessResult = function(manifestString, state) {
    "use strict";
    this.manifestString = manifestString;
    /** @public {?shaka.vimond.dash.SerialBigIntegerEliminator.WorkaroundState|undefined} */
    this.state = state;
};

/**
 * Creates an MpdRequest where the manifest can be modified.
 *
 * @param {!shaka.util.FailoverUri} url The URL.
 * @param {number=} opt_requestTimeout The timeout for a MpdRequest in seconds.
 * @param {shaka.vimond.dash.ManifestModificationSetup=} opt_modificationSetup
 * @param {shaka.vimond.dash.SerialBigIntegerEliminator.WorkaroundState=} opt_previousBigIntegerWorkaroundState
 * @constructor
 * @struct
 * @extends {shaka.dash.MpdRequest}
 * @exportDoc
 */
shaka.vimond.dash.PreprocessableMpdRequest = function(url, opt_requestTimeout, opt_modificationSetup, opt_previousBigIntegerWorkaroundState) {
    shaka.dash.MpdRequest.call(this, url, opt_requestTimeout);
    /** @private {shaka.vimond.dash.ManifestTextPreprocessor} */
    this.manifestTextPreprocessor_ = new shaka.vimond.dash.ManifestTextPreprocessor(opt_modificationSetup);
    /** @private {?shaka.vimond.dash.ManifestModificationSetup} */
    this.modificationSetup_ = opt_modificationSetup || null;
    this.presentationTimeOffsetFixMethod_ = null;
    if (this.modificationSetup_ && this.modificationSetup_.presentationTimeOffsetFixPolicy) {
        this.presentationTimeOffsetFixMethod_ = this.modificationSetup_.presentationTimeOffsetFixPolicy == 'highest' ? this.findHighestOffset_ :
            (this.modificationSetup_.presentationTimeOffsetFixPolicy == 'lowest' ? this.findLowestOffset_ : this.findFirstOffsetWithVideo_);  
    }
    /** @private {?shaka.vimond.dash.SerialBigIntegerEliminator.WorkaroundState|undefined} */
    this.previousBigIntegerWorkaroundState_ = opt_previousBigIntegerWorkaroundState;
    /** @public {?shaka.vimond.dash.SerialBigIntegerEliminator.WorkaroundState|undefined} */
    this.updatedBigIntegerWorkaroundState = null;
};

goog.inherits(shaka.vimond.dash.PreprocessableMpdRequest, shaka.dash.MpdRequest);

/** @override */
shaka.vimond.dash.PreprocessableMpdRequest.prototype.send = function() {
    var url = this.url_;
    return url.fetch(this.parameters_).then(function(data) {
        var processedResult = this.fixBigIntegers_(this.manifestTextPreprocessor_.process(data));
        if (processedResult.state) {
            shaka.log.info('Big int processed state.', processedResult.state);
        }
        this.updatedBigIntegerWorkaroundState = processedResult.state;
        var mpd = shaka.dash.mpd.parseMpd(processedResult.manifestString, url.urls, [url.currentUrl]);
        if (mpd) {
            return Promise.resolve(this.applyPresentationTimeOffsetFix_(this.processTimeline_(mpd)));
        }

        var error = new Error('MPD parse failure.');
        error.type = 'dash';
        return Promise.reject(error);
    }.bind(this));
};


shaka.vimond.dash.PreprocessableMpdRequest.prototype.transformTimeline_ = function(segmentTemplate, mapFn, filterFn, mutateFn, adaptationSet, representation, mpd) {
    if (segmentTemplate && segmentTemplate.timeline && segmentTemplate.timeline.timePoints) {
        if (mutateFn) {
            mutateFn(adaptationSet, representation, mpd, segmentTemplate.timeline);
        } else {
            var timePoints = segmentTemplate.timeline.timePoints;
            if (mapFn) {
                timePoints = timePoints.map(mapFn.bind(this, adaptationSet, representation, mpd));
            }
            if (filterFn) {
                timePoints = timePoints.filter(mapFn.bind(this, adaptationSet, representation, mpd));
            }
            segmentTemplate.timeline.timePoints = timePoints;
        }
    }
};

/**
 * Filters the timeline
 * @param {shaka.dash.mpd.Mpd} mpd
 * @param {function} filterFn 
 * @returns {shaka.dash.mpd.Mpd}
 */
shaka.vimond.dash.PreprocessableMpdRequest.prototype.processTimeline_ = function(mpd) {
    if (this.modificationSetup_) {
        var filterFn = this.modificationSetup_.timelineFilterFn,
            mapFn = this.modificationSetup_.timelineMapFn,
            mutateFn = this.modificationSetup_.mutateManifestFn;
        if (filterFn || mapFn || mutateFn) {
            mpd.periods.forEach(function (period) {
                period.adaptationSets.forEach(function (adaptationSet) {
                    if (Array.isArray(adaptationSet.representations)) {
                        adaptationSet.representations.forEach(function (representation) {
                            this.transformTimeline_(representation.segmentTemplate, mapFn, filterFn, mutateFn, adaptationSet, representation, mpd);
                        }.bind(this));
                    }
                    this.transformTimeline_(adaptationSet.segmentTemplate, mapFn, filterFn, mutateFn, adaptationSet, null, mpd);
                }.bind(this));
            }.bind(this));
        }
    }
    return mpd;
};


/**
 * Applies workarounds for big numbers in offsets and time codes
 * @param {string} manifest
 * @returns {shaka.vimond.dash.ProcessResult}
 */
shaka.vimond.dash.PreprocessableMpdRequest.prototype.fixBigIntegers_ = function(manifest) {
    "use strict";
    if (this.modificationSetup_ && this.modificationSetup_.bigIntegersFixPolicy) {
        shaka.log.info('Previous state', this.previousBigIntegerWorkaroundState_);
        return shaka.vimond.dash.SerialBigIntegerEliminator.eliminate(manifest, this.previousBigIntegerWorkaroundState_);
    } else {
        return new shaka.vimond.dash.ProcessResult(manifest);
    }
};

/**
 * If a presentationTimeOffset fix policy is specified, applies such a fix if needed, by mutating the Mpd instance.
 * @param {shaka.dash.mpd.Mpd} mpd
 * @returns {shaka.dash.mpd.Mpd}
 */
shaka.vimond.dash.PreprocessableMpdRequest.prototype.applyPresentationTimeOffsetFix_ = function(mpd) {
    "use strict";
    if (mpd.type === 'static' && mpd.periods && this.presentationTimeOffsetFixMethod_) {
        mpd.periods.forEach(function(period) {
            var offset = this.presentationTimeOffsetFixMethod_(period);
            try {
                if (offset > 0) {
                    shaka.log.info('Found missing presentationTimeOffset from segment start offset, based on the configured ' + this.modificationSetup_.presentationTimeOffsetFixPolicy + ' policy.', offset);
                    period.adaptationSets.forEach(function (a) {
                        if (!a.segmentTemplate.presentationTimeOffset) {
                            a.segmentTemplate.presentationTimeOffset = offset * (a.segmentTemplate.timescale || 1);
                        }
                        if (a.representations) {
                            a.representations.forEach(function(r) {
                                if (r.segmentTemplate && !r.segmentTemplate.presentationTimeOffset) {
                                    r.segmentTemplate.presentationTimeOffset = offset * (r.segmentTemplate.timescale || 1);
                                }
                            });
                        }
                    });
                }
            } catch(e) {
                shaka.log.warning('Attempt of fixing presentationTimeOffset in manifest failed. Trying to continue anyway.', e, period);
            }
        }.bind(this));
    }
    shaka.log.info('MPD', mpd);
    return mpd;
};

/**
 * This algorithm of finding the value to be used as the missing presentationTimeOffset has proven to work best in practical testing.
 * @param {shaka.dash.mpd.Period} period
 * @returns {number} The offset based on the video segment list, if relevant.
 * @private
 */
shaka.vimond.dash.PreprocessableMpdRequest.prototype.findFirstOffsetWithVideo_ = function(period) {
    'use strict';
    var videoOffset = 0;
    try {
        period.adaptationSets.forEach(/** @param {!shaka.dash.mpd.AdaptationSet} as */ 
        function (as) {
            var st = as.segmentTemplate;
            if (st && !st.presentationTimeOffset) {
                var firstSegment = st.timeline && st.timeline.timePoints && st.timeline.timePoints[0];
                if (firstSegment.startTime) {
                    var offset = firstSegment.startTime / (st.timescale || 1);
                    if (as.contentType === 'video') {
                        videoOffset = offset;
                    }
                }
            }
        });
    } catch(e) {
        shaka.log.warning('Error when searching for start offset snapping to video segment start.', e);
        return 0;
    }
    return videoOffset;
};

shaka.vimond.dash.PreprocessableMpdRequest.prototype.findLowestOffset_ = function(period) {
    'use strict';
    var lowestOffset = 0;
    try {
        period.adaptationSets.forEach(function (as) {
            var st = as.segmentTemplate;
            if (st && !st.presentationTimeOffset) {
                var firstSegment = st.timeline && st.timeline.timePoints && st.timeline.timePoints[0];
                if (firstSegment.startTime) {
                    var offset = firstSegment.startTime / (st.timescale || 1);
                    lowestOffset = lowestOffset === 0 ? offset : Math.min(lowestOffset, offset);
                }
            }
        });
    } catch(e) {
        shaka.log.warning('Error when searching for lowest start offset.', e);
        return 0;
    }
    return lowestOffset;
};

shaka.vimond.dash.PreprocessableMpdRequest.prototype.findHighestOffset_ = function(period) {
    'use strict';
    var highestOffset = 0;
    try {
        period.adaptationSets.forEach(function (as) {
            var st = as.segmentTemplate;
            if (st && !st.presentationTimeOffset) {
                var firstSegment = st.timeline && st.timeline.timePoints && st.timeline.timePoints[0];
                if (firstSegment.startTime) {
                    var offset = firstSegment.startTime / (st.timescale || 1);
                    highestOffset = Math.max(highestOffset, offset);
                }
            }
        });
    } catch(e) {
        shaka.log.warning('Error when searching for highest start offset.', e);
        return 0;
    }
    return highestOffset;
};

