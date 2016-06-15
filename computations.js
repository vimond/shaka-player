
"use strict";
function pad(num) {
    return num > 9 ? num : '0' + num.toString();

}

function toClockTime(seconds, emptyIfZero) {
    seconds = isNaN(seconds) ? 0 : Math.round(seconds);
    if (emptyIfZero && seconds === 0) {
        return '';
    } else {
        var minus = '';
        if (seconds < 0) {
            minus = '-';
            seconds = -seconds;
        }
        var days = (seconds >= 86400 ? Math.floor(seconds / 86400) + '.' : '');
        var hrs = ((seconds > 3600) || days ? Math.floor(seconds % 86400 / 3600) + ':' : '');
        var mins = (hrs && seconds % 3600 < 600 ? '0' : '') + Math.floor(seconds % 3600 / 60) + ':';
        var secs = (seconds % 60 < 10 ? '0' : '') + seconds % 60;
        return minus + days + hrs + mins + secs;
    }
}

function getParameters() {
    return {
        availabilityStartTime: '1970-01-01T00:00:00Z',
        presentationTimeOffset: '',
        timescale: '0',
        startOffset: '',
        segmentDuration: '',
        repeat: '1'
    };
}

function getOriginal() {
    return {
        availabilityStartTime: '2016-06-09T01:39:11Z',
        presentationTimeOffset: '14653967524906444',
        timescale: 10000000,
        startOffset: '14657874020800000',
        segmentDuration: '19200000',
        repeat: 3715
    };
}

function getOriginal2() {
    return {
        availabilityStartTime: '2016-06-09T01:39:11Z',
        presentationTimeOffset: '14653967524906444',
        timescale: 10000000,
        startOffset: '14657874020720001',
        segmentDuration: '19200000',
        repeat: 3715
    };
}


function computeEdgeBigInt(input) {
    var availabilityStartTimeSeconds = new Date(input.availabilityStartTime).getTime() / 1000;
    
    var timelineLengthSeconds = (bigInt(input.startOffset).add(bigInt(input.segmentDuration).multiply(input.repeat)).subtract(input.presentationTimeOffset)).divide(input.timescale).toJSNumber();
    
    var edge = new Date((availabilityStartTimeSeconds + timelineLengthSeconds) * 1000);
    return edge;
}

function scaled(str) {
    return parseInt(str.substr(0, str.length - 7), 10);
}

function computeEdge(input) {
    var availabilityStartTimeSeconds = new Date(input.availabilityStartTime).getTime() / 1000;

    var timelineLengthSeconds = (parseInt(input.startOffset, 10) + (parseInt(input.segmentDuration, 10) * parseInt(input.repeat, 10)) - parseInt(input.presentationTimeOffset, 10)) / parseInt(input.timescale, 10);

    var edge = new Date((availabilityStartTimeSeconds + timelineLengthSeconds) * 1000);
    return edge;
}

function computeStart(input) {
    var availabilityStartTimeSeconds = new Date(input.availabilityStartTime).getTime() / 1000;

    var timelineStartOffsetSeconds = (parseInt(input.startOffset, 10) - parseInt(input.presentationTimeOffset, 10)) / parseInt(input.timescale, 10);

    var start = new Date((availabilityStartTimeSeconds + timelineStartOffsetSeconds) * 1000);
    return start;
}

function computeEdgeTimeCode(input) {
    var b = {
        basic: (parseInt(input.startOffset, 10) + (parseInt(input.repeat, 10) * parseInt(input.segmentDuration, 10))),
        bigInt: bigInt(input.startOffset).add(bigInt(input.repeat).multiply(input.segmentDuration))
    };
    b.isSafe = b.bigInt.equals(b.basic);
    b.basic = b.basic.toString();
    b.bigInt = b.bigInt.toString();
    return b;
}

function output(date) {
    console.log('Local: ', date);
    console.log('ISO: ', date.toISOString());
    console.log('Milliseconds: ', date.getTime());
}

function makeBigIntFree(original) {
    var parsedStartOffset = parseFloat(original.startOffset);
    if (bigInt.isPrecise(parsedStartOffset)) {
        return original;
    } else {
        var bigIntFree = getParameters();
        var originalAvailabilityStartTimeSeconds = new Date(original.availabilityStartTime).getTime() / 1000;
        var originalScaledNetOffset = bigInt(original.startOffset || 0).subtract(original.presentationTimeOffset || 0); // The scaled time from availabilityst
        
        var yesterdayIsNewStartTimeInSeconds = (Math.floor(originalAvailabilityStartTimeSeconds / 86400) - 1) * 86400;
        var availabilityStartTimeDifferenceSeconds = originalAvailabilityStartTimeSeconds - yesterdayIsNewStartTimeInSeconds;

        bigIntFree.timescale = original.timescale;
        bigIntFree.repeat = original.repeat;
        bigIntFree.segmentDuration = original.segmentDuration;
        
        bigIntFree.availabilityStartTime = new Date(yesterdayIsNewStartTimeInSeconds * 1000).toISOString();

        bigIntFree.presentationTimeOffset = '0'; // 0 is 0, regardless of timescale.

        //var so = gammel netto offset - forskjell mellom datoer.
        
        bigIntFree.startOffset = originalScaledNetOffset.add(availabilityStartTimeDifferenceSeconds * parseInt(original.timescale)).toJSNumber();
        return bigIntFree;
    }

    

    return {
        availabilityStartTime: '1970-01-01T00:00:00Z',
        presentationTimeOffset: '',
        timescale: 0,
        startOffset: '',
        segmentDuration: '',
        repeat: 1
    };
}