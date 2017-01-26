function getFixedStartSimulator(){
    "use strict";
    // All time codes are scaled
    var fixedStart = 0,
        currentLiveEdge = 0,
        storageKey = 'fixedStartTimeCode';
    
    var enableLogging = true;
    
    var storedFixedStart = localStorage.getItem(storageKey);
    if (storedFixedStart) {
        fixedStart = parseInt(storedFixedStart, 10);
    }
    
    function findLiveEdge(array) {
        return array.reduce(function(accumulated, currentTimePoint) {
            var currentOffset = currentTimePoint.startTime || accumulated;
            return currentOffset + (currentTimePoint.duration * (1 + currentTimePoint.repeat || 0));
        }, 0);
    }
   
    function getProp(obj, propertyName, shortForm) {
        return obj[propertyName] != null ? shortForm + '=' + obj[propertyName] : '';
    }
    
    function timePointToString(tp) {
        return '{' + [getProp(tp, 'startTime', 's'), getProp(tp, 'duration', 'd'), getProp(tp, 'repeat', 'r')].filter(function(t) {return t;}).join(',') + '}';
    }
    
    function timePointsToString(array) {
        if (array.length > 1) {
            return 'Start: ' + timePointToString(array[0]) + ' End: ' + timePointToString(array[array.length - 1]);
        } else if( array.length === 1) {
            return 'Single entry: ' + timePointToString(array[0]);
        } else {
            return '(Empty)';
        }
    }
    
    
    function removeTimePointsBeforeFixedStart(array) {
        var currentTimePoint;
        var currentStartTime;
        var currentEndTime;
        var previousEndTime = 0;
        var currentMultiplier;
        var numberOfSegments = 0;
        for (var i=0; i<array.length; i++) {
            currentTimePoint = array[i];
            currentStartTime = currentTimePoint.startTime;
            if (currentStartTime) {
                if (enableLogging && currentStartTime !== currentTimePoint.startTime) {
                    console.log('Potential gap between time points.', currentStartTime, currentTimePoint.startTime);
                }
            } else {
                if (i === 0) {
                    currentStartTime = 0;
                } else {
                    currentStartTime = previousEndTime;
                }
            }
            if (currentStartTime > fixedStart) { // We have arrived at a segment after the fixedStart, without returning that sliced array with a new first timepoint.
                enableLogging && console.log('What happened? firstStartTime: %s currentStartTime: %s offset first-fixed: %s offset current-fixed: %s', array[0].startTime, currentStartTime, (array[0].startTime || 0) - fixedStart, currentStartTime - fixedStart);
                /*var previousPoint = array[i-1];
                var prevStartTime = previousPoint.startTime;
                var prevEndTime = prevStartTime + (previousPoint.duration * ((previousPoint.repeat || 0) + 1));
                var isStartSmaller = prevStartTime < fixedStart;
                var isEndBiggger = prevEndTime > fixedStart;
                var netDuration = prevEndTime - prevStartTime;*/
                return array;
            }
            currentMultiplier = currentTimePoint.repeat ? currentTimePoint.repeat + 1 : 1;
            currentEndTime = currentStartTime + (currentTimePoint.duration * currentMultiplier);
            
            if (currentEndTime > fixedStart && currentStartTime <= fixedStart) { // Within this time point, the fixed start will be.
                var newFirstTimePoint = currentTimePoint.clone();
                if (currentTimePoint.repeat) {
                    // We need to compute a new repeat and a new startTime
                    var newMultiplier = Math.ceil((currentEndTime - fixedStart) / currentTimePoint.duration); // Including the segment that contains the fixedStart position
                    numberOfSegments += newMultiplier;
                    
                    newFirstTimePoint.startTime = currentStartTime + ((currentMultiplier - newMultiplier) * currentTimePoint.duration); // Start offset in count
                    newFirstTimePoint.repeat = newMultiplier < 2 ? null : newMultiplier - 1;
                } else {
                    if (currentTimePoint.startTime === currentStartTime) {
                        // This timepoint can be used as it is.
                    } else {
                        // Set the startTime attribute.
                        newFirstTimePoint.startTime = currentStartTime;
                    }
                    numberOfSegments += currentMultiplier;
                    throw new Error('Tell antall segment forkasta, og oppdater startNumber!');
                }
                enableLogging && console.log('Left-truncating the segment timeline at time point %s, with start time %s (was %s). Total number of segments removed: %s', i+1, newFirstTimePoint.startTime, currentStartTime, numberOfSegments);
                var newArray = [newFirstTimePoint].concat(array.slice(i+1));
                enableLogging && console.log('Lengths. Old: %s New: %s', array.length, newArray.length);
                return newArray;
            } else {
                numberOfSegments += currentMultiplier;
                previousEndTime = currentEndTime;
            }
        }
        //Fallback
        enableLogging && console.log('Current end time: %s fixedStart: %s difference: %s', currentEndTime, fixedStart, currentEndTime - fixedStart);
        return array;
    }
    
    function mutateManifest(adaptationSet, representation, mpd, timeline) {
        currentLiveEdge = findLiveEdge(timeline.timePoints);
        //
        // enableLogging && console.log('Current live edge', currentLiveEdge);
        timeline.timePoints = removeTimePointsBeforeFixedStart(timeline.timePoints);
        if (enableLogging) {
            console.log('Timeline for %s', adaptationSet.contentType, timePointsToString(timeline.timePoints));
        }
    }

    function setFixedStartPoint(startPoint) {
        fixedStart = startPoint;
        localStorage.setItem(storageKey, startPoint);
    }
    
    function getCurrentLiveEdge() {
        return currentLiveEdge;
    }
    return {
        mutateManifest: mutateManifest,
        setFixedStartPoint: setFixedStartPoint,
        getCurrentLiveEdge: getCurrentLiveEdge,
        enableLogging: function () {
            enableLogging = true;
        },
        disableLogging: function () {
            enableLogging = false;
        }
    };
}