/**
 * Copyright 2016 Vimond Media Solutions
 *
 * @fileoverview Preprocessor for computing JS number compatible timing parameters for a stream
 */

goog.provide('shaka.vimond.dash.SerialBigIntegerEliminator');
goog.require('shaka.log');
goog.require('shaka.vimond.Integer');

shaka.vimond.dash.SerialBigIntegerEliminator.MANIFEST_ELIGIBILITY_REGEX = 
    /(type="static"|availabilityStartTime="([A-Z]|[0-9]|-|\+|:|\.)+"((.|\n)*) t="[0-9]{16,}")/;

shaka.vimond.dash.SerialBigIntegerEliminator.MANIFEST_REPLACEMENT_REGEX =
    /(type)="static"|(availabilityStartTime)="(?:.*?)"|<(SegmentTemplate) |(presentationTimeOffset)="[0-9]*?"|(timescale)="[0-9]*?"| (t)="[0-9]*?"/g;
//CG:  1                        2                               3                      4                           5                  6

function getAttributeValue(str) {
    "use strict";
    var splat = str.split('"');
    if (splat && splat.length > 2) {
        return splat[splat.length - 2];
    }
}

shaka.vimond.dash.SerialBigIntegerEliminator.handlers = {
    'type': function(state, match) {
        "use strict";
        var startTimeSeconds = 100; // More than 100 seconds difference between different timelines should not happen.
        
        return {
            updatedState: {
                originalAvailabilityStartTimeSeconds: startTimeSeconds,
                adjustedAvailabilityStartTimeSeconds: startTimeSeconds
            },
            replacement: match
        };
        
    },
    'availabilityStartTime': function processAvailabilityStartTime(state, match) {
        var originalIsoDateStr, originalAvailabilityStartTimeSeconds, adjustedAvailabilityStartTimeSeconds, adjustedAvailabilityStartTimeStr = match;
        try {
            originalIsoDateStr = getAttributeValue(match);
            originalAvailabilityStartTimeSeconds = new Date(originalIsoDateStr).getTime() / 1000;
        } catch(e) {
            shaka.log.warning('Parse date failed.', e);    
        }
        if (originalAvailabilityStartTimeSeconds) {
            adjustedAvailabilityStartTimeSeconds = (Math.floor(originalAvailabilityStartTimeSeconds / 86400) - 1) * 86400;
            adjustedAvailabilityStartTimeStr = 'availabilityStartTime="' + new Date(adjustedAvailabilityStartTimeSeconds * 1000).toISOString() +
                '" _availabilityStartTime="' + originalIsoDateStr + '"';
        }
        return {
            updatedState: {
                originalAvailabilityStartTimeSeconds: originalAvailabilityStartTimeSeconds,
                adjustedAvailabilityStartTimeSeconds: adjustedAvailabilityStartTimeSeconds
            },
            replacement: adjustedAvailabilityStartTimeStr
        };
    },
    'SegmentTemplate': function processSegmentTemplate(state, match) {
        // New timeline coming up. Reset parameters, so default values are used if they are not explicitly set.
        return {
            updatedState: {
                currentTimescale: 1,
                currentPresentationTimeOffset: 0
            },
            replacement: match
        };
    },
    'timescale': function processTimeScale(state, match) {
        var timescale;
        try {
            timescale = parseInt(getAttributeValue(match), 10);
        } catch(e) {
            shaka.log.warning('Parse timescale failed.', e);
        }
        return {
            updatedState: {
                currentTimescale: timescale 
            },
            replacement: match
        };
    },
    'presentationTimeOffset': function processPresentationTimeOffset(state, match) {
        var presentationTimeOffset;
        try {
            presentationTimeOffset = parseInt(getAttributeValue(match), 10);
        } catch(e) {
            shaka.log.warning('Parse presentationTimeOffset failed.', e);
        }
        return {
            updatedState: {
                currentPresentationTimeOffset: presentationTimeOffset
            },
            replacement: 'presentationTimeOffset="0"'
        };
    },
    't': function t(state, match) {
        var adjustedStartOffsetStr = match;
        try {
            var originalScaledStartOffsetStr = getAttributeValue(match) || 0,
                originalScaledOffset = shaka.vimond.Integer.from(originalScaledStartOffsetStr || 0),
                originalScaledNetOffset = originalScaledOffset.subtract(state.currentPresentationTimeOffset || 0), // The scaled time from availabilityst
                startTimeDifferenceSeconds = state.originalAvailabilityStartTimeSeconds - state.adjustedAvailabilityStartTimeSeconds,
                adjustedScaledStartOffset = originalScaledNetOffset.add(startTimeDifferenceSeconds * state.currentTimescale).toJSNumber(),
                timestampOffset = state.adjustedAvailabilityStartTimeSeconds + shaka.vimond.Integer.from(state.currentPresentationTimeOffset).divide(state.currentTimescale).toJSNumber() - state.originalAvailabilityStartTimeSeconds;

            /*
            window.presentationTimeOffset = shaka.vimond.Integer.create(state.currentPresentationTimeOffset).divide(state.currentTimescale).toJSNumber();
            window.originalStartOffset = shaka.vimond.Integer.create(originalScaledOffset).divide(state.currentTimescale).toJSNumber();
            window.originalNetOffset = shaka.vimond.Integer.create(originalScaledNetOffset).divide(state.currentTimescale).toJSNumber();
            window.originalAvailabilityStartTimeSeconds = state.originalAvailabilityStartTimeSeconds;
            window.adjustedAvailabilityStartTimeSeconds = state.adjustedAvailabilityStartTimeSeconds;
            window.desired = 1465736399;
            
            console.table([{
                key: 'presentationTimeOffset',
                value: window.presentationTimeOffset
            },{
                key: 'originalStartOffset',
                value: window.originalStartOffset
            },{
                key: 'originalNetOffset',
                value: window.originalNetOffset
            },{
                key: 'originalAvailabilityStartTimeSeconds',
                value: window.originalAvailabilityStartTimeSeconds
            },{
                key: 'adjustedAvailabilityStartTimeSeconds',
                value: window.adjustedAvailabilityStartTimeSeconds
            },{
                key: 'desired',
                value: window.desired
            }]);
            */
            
            adjustedStartOffsetStr = ' t="' + adjustedScaledStartOffset + '" _t="' + originalScaledStartOffsetStr + '" _timestampOffset="' + timestampOffset.toString() + '"';
            shaka.log.info('Adjusting start offset to JS compatible integer, and keeping the old one.', adjustedStartOffsetStr);
            shaka.log.info('Original/adjusted availability start time', new Date(state.originalAvailabilityStartTimeSeconds*1000), new Date(state.adjustedAvailabilityStartTimeSeconds*1000));
        } catch(e) {
            shaka.log.warning('Start offset adjustment failed.', e);
        }
        
        return {
            updatedState: {},
            replacement: adjustedStartOffsetStr
        };
    }
};

/**
 * 
 * @param {string } manifestString
 */
shaka.vimond.dash.SerialBigIntegerEliminator.eliminate = function(manifestString) {
    "use strict";
    var state = {
        originalAvailabilityStartTimeSeconds: null,
        adjustedAvailabilityStartTimeSeconds: null,
        currentTimescale: 1,
        currentPresentationTimeOffset: 0
    };

    function replace(match, p1, p2, p3, p4, p5, p6) {
        var matchKeyword = p1 || p2 || p3 || p4 || p5 || p6;
        
        if (matchKeyword) {
            try {
                var processed = shaka.vimond.dash.SerialBigIntegerEliminator.handlers[matchKeyword](state, match);
                Object.getOwnPropertyNames(processed.updatedState).forEach(function (key) {
                    state[key] = processed.updatedState[key];
                });
                return processed.replacement;
            } catch(e) {
                state.error = e;
                console.log('Error while finding replacement.', e);
                return match;
            }
        } else {
            return match;
        }
    }
    
    var isEligible = shaka.vimond.dash.SerialBigIntegerEliminator.MANIFEST_ELIGIBILITY_REGEX.test(manifestString);
    if (isEligible) {
        return manifestString.replace(shaka.vimond.dash.SerialBigIntegerEliminator.MANIFEST_REPLACEMENT_REGEX, replace);
    } else {
        return manifestString;
    }
};