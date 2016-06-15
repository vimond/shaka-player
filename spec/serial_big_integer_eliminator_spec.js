goog.require('shaka.vimond.dash.SerialBigIntegerEliminator');

describe('SerialBigIntegerEliminator', function() {
    'use strict';

    var manifest = '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="dynamic" publishTime="2016-06-10T04:59:19Z" minimumUpdatePeriod="PT0S" timeShiftBufferDepth="PT1H58M56S" availabilityStartTime="2016-06-09T01:39:11Z" minBufferTime="PT2S">\n' +
        '<Period start="PT0S">\n' +
        '    <AdaptationSet id="1" group="1" profiles="ccff" bitstreamSwitching="false" segmentAlignment="true" contentType="video" mimeType="video/mp4" codecs="avc1.640029" maxWidth="1280" maxHeight="720" startWithSAP="1">\n' +
        '        <InbandEventStream schemeIdUri="urn:mpeg:dash:event:2012" value="1"/>\n' +
        '        <SegmentTemplate timescale="10000000" presentationTimeOffset="14653967524906444" media="QualityLevels($Bandwidth$)/Fragments(video=$Time$,format=mpd-time-csf)" initialization="QualityLevels($Bandwidth$)/Fragments(video=i,format=mpd-time-csf)">\n' +
        '            <SegmentTimeline>\n' +
        '                <S t="14654880262200001" d="19200000" r="3715"/>\n' +
        '            </SegmentTimeline>\n' +
        '        </SegmentTemplate>\n' +
        '        <Representation id="1_V_video_18350004765514813618" bandwidth="2000000" width="1280" height="720"/>\n' +
        '        <Representation id="1_V_video_14354944200505779013" bandwidth="110000" codecs="avc1.4D4015" width="256" height="144"/>\n' +
        '    </AdaptationSet>\n' +
        '    <AdaptationSet id="2" group="5" profiles="ccff" bitstreamSwitching="false" segmentAlignment="true" contentType="audio" mimeType="audio/mp4" codecs="mp4a.40.2">\n' +
        '        <InbandEventStream schemeIdUri="urn:mpeg:dash:event:2012" value="1"/>\n' +
        '        <SegmentTemplate timescale="10000000" presentationTimeOffset="14653967524906444" media="QualityLevels($Bandwidth$)/Fragments(audio_track=$Time$,format=mpd-time-csf)" initialization="QualityLevels($Bandwidth$)/Fragments(audio_track=i,format=mpd-time-csf)">\n' +
        '            <SegmentTimeline>\n' +
        '                <S t="14654880262026667" d="19200000" r="3715"/>\n' +
        '            </SegmentTimeline>\n' +
        '        </SegmentTemplate>\n' +
        '        <Representation id="5_A_audio_track_12432206106814790452" bandwidth="128000" audioSamplingRate="48000"/>\n' +
        '    </AdaptationSet>\n' +
        '</Period>\n' +
        '</MPD>\n';

    function isValidXml(str) {
        var domParser = new DOMParser();
        var parsed = domParser.parseFromString(str, 'application/xml');
        return parsed.documentElement.nodeName != 'parsererror';
    }
    
    var copyOfOriginalAvailabilityStartTimeStr = ' _availabilityStartTime="2016-06-09T01:39:11Z"',
        adjustedAvailabilityStartTimeStr = ' availabilityStartTime="2016-06-08T00:00:00.000Z"',
        adjustedPresentationTimeOffsetMatch = /presentationTimeOffset="0"/g,
        copyOfOriginalStartOffsetMatch = / _t="([0-9]*?)"/g,
        timestampOffsetMatch = / _timestampOffset="(-)?([0-9]*?)"/g,
        adjustedStartOffsetMatch = / t="([0-9]*?)"/g,
        originalStartOffsets = [' _t="14654880262200001"', ' _t="14654880262026667"'],
        adjustedStartOffsets = [' t="1836247293557"', ' t="1836247120223"'],
        timestampOffsets = [' _timestampOffset="1465304401"', ' _timestampOffset="1465304401"'];
        timestampOffsets = [' _timestampOffset="1465304401"', ' _timestampOffset="1465304401"'];
    
    describe('eliminate', function () {
        var adjusted;
        beforeAll(function() {
            adjusted = shaka.vimond.dash.SerialBigIntegerEliminator.eliminate(manifest);
            
        });
        it('keeps XML validity.', function () {
            expect(isValidXml(adjusted)).toBe(true);
        });
        it('sets a new availabilityStartTime of yesterday midnight UTC, and keeps a copy of the original availabilityStartTime for later reference.', function () {
            var adjustedAttributePos = adjusted.indexOf(adjustedAvailabilityStartTimeStr),
                copyOfOriginalPos = adjusted.indexOf(copyOfOriginalAvailabilityStartTimeStr),
                periodPos = adjusted.indexOf('<Period');
            expect(adjustedAttributePos).toBeGreaterThan(4);
            expect(copyOfOriginalPos).toBeGreaterThan(4);
            expect(copyOfOriginalPos).toBeLessThan(periodPos);
            expect(adjustedAttributePos).toBeLessThan(periodPos);
        });
        it('resets the presentationTimeOffsets to 0 for increased simplicity in adjustments, but keep the original one.', function () {
            var matches = adjusted.match(adjustedPresentationTimeOffsetMatch);
            expect(matches.length).toBe(2);
        });
        it('adjusts start offsets within all SegmentTimelines according to the one common start time, but with individual presentationTimeOffsets and timescales.', function () {
            // Split?
            var matches = adjusted.match(adjustedStartOffsetMatch);
            expect(matches[0]).toBe(adjustedStartOffsets[0]);
            expect(matches[1]).toBe(adjustedStartOffsets[1]);
            
        });
        it('keeps copies of the original startOffsets for later correct segment URL resolution.', function () {
            var matches = adjusted.match(copyOfOriginalStartOffsetMatch);
            console.log(adjusted);
            expect(matches[0]).toBe(originalStartOffsets[0]);
            expect(matches[1]).toBe(originalStartOffsets[1]);
        });

        it('contains timestamp offsets for time codes not being aligned to Unix epoch time.', function () {
            var matches = adjusted.match(timestampOffsetMatch);
            expect(matches[0]).toBe(timestampOffsets[0]);
            expect(matches[1]).toBe(timestampOffsets[1]);
        });

        /*
        it('can operate on SegmentTemplates on every level allowed.', function () {
            // Period, AdaptationSet, Representation
        });
        */

    });
});