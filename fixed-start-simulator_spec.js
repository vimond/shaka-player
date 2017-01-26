goog.require('shaka.vimond.dash.PreprocessableMpdRequest');
goog.require('shaka.util.FailoverUri');

// fixedStart near beginning (of third)
// fixedStart near end
// Not aligned to segments?
// Make sure start time for first time point snaps to original segment boundaries

var availabilityStartTime = 1484916750;

var earlyFixedStart = 38007905420; // Right after audio t=38007905400
var originals = [{
    url: 'assets/live-1.xml',
    videoArrayLength: 1,
    videoRepeat: 1799,
    videoDuration: 180000,
    videoStartTime: 37991523600,
    audioArrayLength: 900,
    audioStartTime: 37991523960,
    audioLastStartTime: 38315345400,
    audioLastDuration: 178560,
    audioLastRepeat: null,
    early: {
        fixedStart: earlyFixedStart, // Inside 10th audio segment in live-3.xml
        videoArrayLength: 1, // Constant.
        videoRepeat: 1799 - 91,
        videoDuration: 180000, // Constant.
        videoStartTime: 38007903600, // Constant. Snap to previous
        audioArrayLength: 855,
        audioStartTime: 38007905400 // Constant. Snap to previous
    }
},{
    url: 'assets/live-2.xml',
    videoArrayLength: 1,
    videoRepeat: 1799,
    videoDuration: 180000,
    videoStartTime: 38000343600,
    audioArrayLength: 901,
    audioStartTime: 38000344440,
    audioLastStartTime: 38324163960,
    audioLastDuration: 180480,
    audioLastRepeat: null,
    early: {
        fixedStart: earlyFixedStart, // Inside 10th audio segment in live-3.xml
        videoArrayLength: 1, // Constant.
        videoRepeat: 1799-42,
        videoDuration: 180000, // Constant.
        videoStartTime: 38007903600, // Constant. Snap to previous
        audioArrayLength: 880,
        audioStartTime: 38007905400 // Constant. Snap to previous
    }
},{
    url: 'assets/live-3.xml',
    videoArrayLength: 1,
    videoRepeat: 1799,
    videoDuration: 180000,
    videoStartTime: 38004663600,
    audioArrayLength: 901,
    audioStartTime: 38004664440,
    audioLastStartTime: 38328483960,
    audioLastDuration: 180480,
    audioLastRepeat: null,
    early: {
        fixedStart: earlyFixedStart, // Inside 10th audio segment in live-3.xml
        videoArrayLength: 1, // Constant.
        videoRepeat: 1799-18,
        videoDuration: 180000, // Constant.
        videoStartTime: 38007903600, // Constant. Snap to previous
        audioArrayLength: 892,
        audioStartTime: 38007905400 // Constant. Snap to previous
    }
}];

function checkLongTimePoints(timePoints, startTime, pointCount, lastStart, lastRepeat, lastDuration) {
    "use strict";
    
}

function checkShortTimePoints(timePoints, startTime, repeat, duration) {
    "use strict";
    
}

function getAndProcessMpd(url, sim) {
    "use strict";
    var failoverUri = new shaka.util.FailoverUri(null, [url]);
    var request = new shaka.vimond.dash.PreprocessableMpdRequest(failoverUri, null, { mutateManifestFn: sim && sim.mutateManifest });
    return request.send();
}

function extractTimelines(mpd) {
    "use strict";
    var p = mpd.periods[0],
        timelineVideo = p.adaptationSets[0].representations[0].segmentTemplate.timeline,
        timelineAudio = p.adaptationSets[1].representations[0].segmentTemplate.timeline;
    
    // TODO: Cover all video timelines?
    return {
        video: timelineVideo,
        audio: timelineAudio
    };
}

function testOriginalMpds(done) {
    "use strict";
    var promises = originals.map(function(original) {
        //return function() {
            return getAndProcessMpd(original.url).then(function(mpd) {
                expect(mpd.availabilityStartTime).toBe(availabilityStartTime);
                var timelines = extractTimelines(mpd);
                expect(timelines.video.timePoints.length).toBe(original.videoArrayLength);
                expect(timelines.video.timePoints[0].repeat).toBe(original.videoRepeat);
                expect(timelines.video.timePoints[0].startTime).toBe(original.videoStartTime);
                expect(timelines.video.timePoints[0].duration).toBe(original.videoDuration);
                expect(timelines.audio.timePoints.length).toBe(original.audioArrayLength);
                expect(timelines.audio.timePoints[0].startTime).toBe(original.audioStartTime);
                
                var lastAudio = timelines.audio.timePoints[timelines.audio.timePoints.length - 1];
                expect(lastAudio.startTime).toBe(original.audioLastStartTime);
                expect(lastAudio.duration).toBe(original.audioLastDuration);
                expect(lastAudio.repeat).toBe(original.audioLastRepeat);
            });
        //};
    });
    Promise.all(promises).then(function(res) {
        done();
    }, function (err) {
        throw err;
        done();
    });
}

function testEarlyFixedStart(done) {
    "use strict";
    var sim = getFixedStartSimulator();
    sim.setFixedStartPoint(earlyFixedStart);
    var promises = originals.map(function(original) {
        //return function() {
        return getAndProcessMpd(original.url, sim).then(function(mpd) {
            var timelines = extractTimelines(mpd);
            expect(timelines.video.timePoints.length).toBe(original.early.videoArrayLength);
            expect(timelines.video.timePoints[0].repeat).toBe(original.early.videoRepeat);
            expect(timelines.video.timePoints[0].startTime).toBe(original.early.videoStartTime);
            expect(timelines.video.timePoints[0].duration).toBe(original.early.videoDuration);
            
            expect(timelines.audio.timePoints.length).toBe(original.early.audioArrayLength);
            expect(timelines.audio.timePoints[0].startTime).toBe(original.early.audioStartTime);
            var lastAudio = timelines.audio.timePoints[timelines.audio.timePoints.length - 1];
            expect(lastAudio.startTime).toBe(original.audioLastStartTime);
            expect(lastAudio.duration).toBe(original.audioLastDuration);
            expect(lastAudio.repeat).toBe(original.audioLastRepeat);
        });
        //};
    });
    Promise.all(promises).then(function(res) {
        done();
    }, function (err) {
        throw err;
        done();
    });
}

describe('FixedStartSimulator', function() {
    'use strict';
    
    describe('Original MPDs', function() {
        it('should contain 900, 901, and 901 audio elements, and repeat=1799 for video.', testOriginalMpds);
    });

    describe('MPDs transformed to early fixed start.', function() {
        it('should contain shorter timelines, but live edge should remain the same.', testEarlyFixedStart);
    });
});