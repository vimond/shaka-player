/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('MediaSourceEngine', function() {
  var video;
  var mediaSource;
  var mediaSourceEngine;
  var generators;
  var metadata;
  var presentationDuration = 840;
  // TODO: add text streams to MSE integration tests

  beforeAll(function() {
    video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    document.body.appendChild(video);

    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = shaka.test.TestScheme.GENERATORS['sintel'];
  });

  beforeEach(function(done) {
    mediaSource = new MediaSource();
    video.src = window.URL.createObjectURL(mediaSource);

    var onMediaSourceOpen = function() {
      mediaSource.removeEventListener('sourceopen', onMediaSourceOpen);
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video, mediaSource, null);
      done();
    };
    mediaSource.addEventListener('sourceopen', onMediaSourceOpen);
  });

  afterEach(function(done) {
    mediaSourceEngine.destroy().then(function() {
      video.removeAttribute('src');
      video.load();
      done();
    });
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  function appendInit(type) {
    var segment = generators[type].getInitSegment(Date.now() / 1000);
    return mediaSourceEngine.appendBuffer(type, segment, null, null);
  }

  function append(type, segmentNumber) {
    var segment = generators[type].
        getSegment(segmentNumber, 0, Date.now() / 1000);
    return mediaSourceEngine.appendBuffer(type, segment, null, null);
  }

  function buffered(type, time) {
    return mediaSourceEngine.bufferedAheadOf(type, time);
  }

  function remove(type, segmentNumber) {
    var start = (segmentNumber - 1) * metadata[type].segmentDuration;
    var end = segmentNumber * metadata[type].segmentDuration;
    return mediaSourceEngine.remove(type, start, end);
  }

  function getFullMimeType(streamMetadata) {
    var fullMimeType = streamMetadata.mimeType;
    if (streamMetadata.codecs)
      fullMimeType += '; codecs="' + streamMetadata.codecs + '"';
    return fullMimeType;
  }

  it('buffers MP4 video', function(done) {
    mediaSourceEngine.init({'video': getFullMimeType(metadata.video)});
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit('video');
    }).then(function() {
      expect(buffered('video', 0)).toBe(0);
      return append('video', 1);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(10);
      return append('video', 2);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(20);
      return append('video', 3);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(30);
    }).catch(fail).then(done);
  });

  it('removes segments', function(done) {
    mediaSourceEngine.init({'video': getFullMimeType(metadata.video)});
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit('video');
    }).then(function() {
      return Promise.all([
        append('video', 1),
        append('video', 2),
        append('video', 3)
      ]);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(30);
      return remove('video', 1);
    }).then(function() {
      expect(buffered('video', 0)).toBe(0);
      expect(buffered('video', 10)).toBeCloseTo(20);
      return remove('video', 2);
    }).then(function() {
      expect(buffered('video', 0)).toBe(0);
      expect(buffered('video', 10)).toBe(0);
      expect(buffered('video', 20)).toBeCloseTo(10);
      return remove('video', 3);
    }).then(function() {
      expect(buffered('video', 20)).toBe(0);
    }).catch(fail).then(done);
  });

  it('extends the duration', function(done) {
    mediaSourceEngine.init({'video': getFullMimeType(metadata.video)});
    mediaSourceEngine.setDuration(0).then(function() {
      return appendInit('video');
    }).then(function() {
      return mediaSourceEngine.setDuration(20);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(20);
      return append('video', 1);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(20);
      return mediaSourceEngine.setDuration(35);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(35);
      return Promise.all([
        append('video', 2),
        append('video', 3),
        append('video', 4)
      ]);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(40);
      return mediaSourceEngine.setDuration(60);
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(60);
    }).catch(fail).then(done);
  });

  it('ends the stream, truncating the duration', function(done) {
    mediaSourceEngine.init({'video': getFullMimeType(metadata.video)});
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit('video');
    }).then(function() {
      return append('video', 1);
    }).then(function() {
      return append('video', 2);
    }).then(function() {
      return append('video', 3);
    }).then(function() {
      return mediaSourceEngine.endOfStream();
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(30);
    }).catch(fail).then(done);
  });

  it('queues operations', function(done) {
    var resolutionOrder = [];
    var requests = [];

    function checkOrder(p) {
      var nextIndex = requests.length;
      requests.push(p);
      p.then(function() { resolutionOrder.push(nextIndex); });
    }

    mediaSourceEngine.init({'video': getFullMimeType(metadata.video)});
    checkOrder(mediaSourceEngine.setDuration(presentationDuration));
    checkOrder(appendInit('video'));
    checkOrder(append('video', 1));
    checkOrder(append('video', 2));
    checkOrder(append('video', 3));
    checkOrder(mediaSourceEngine.endOfStream());

    Promise.all(requests).then(function() {
      expect(resolutionOrder).toEqual([0, 1, 2, 3, 4, 5]);
    }).catch(fail).then(done);
  });

  it('buffers MP4 audio', function(done) {
    mediaSourceEngine.init({'audio': getFullMimeType(metadata.audio)});
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      // NOTE: For some reason, this appendInit never resolves on my Windows VM.
      // The test operates correctly on real hardware.
      return appendInit('audio');
    }).then(function() {
      expect(buffered('audio', 0)).toBe(0);
      return append('audio', 1);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(10, 1);
      return append('audio', 2);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(20, 1);
      return append('audio', 3);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(30, 1);
    }).catch(fail).then(done);
  });

  it('buffers MP4 video and audio', function(done) {
    mediaSourceEngine.init({
      'video': getFullMimeType(metadata.video),
      'audio': getFullMimeType(metadata.audio)
    });

    mediaSourceEngine.setDuration(presentationDuration).catch(fail);

    var audioStreaming = appendInit('audio').then(function() {
      return append('audio', 1);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(10, 1);
      return append('audio', 2);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(20, 1);
      return append('audio', 3);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(30, 1);
      return append('audio', 4);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(40, 1);
      return append('audio', 5);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(50, 1);
      return append('audio', 6);
    }).then(function() {
      expect(buffered('audio', 0)).toBeCloseTo(60, 1);
    }).catch(fail);

    var videoStreaming = appendInit('video').then(function() {
      return append('video', 1);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(10);
      return append('video', 2);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(20);
      return append('video', 3);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(30);
      return append('video', 4);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(40);
      return append('video', 5);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(50);
      return append('video', 6);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(60);
    }).catch(fail);

    Promise.all([audioStreaming, videoStreaming]).then(function() {
      return mediaSourceEngine.endOfStream();
    }).then(function() {
      expect(mediaSource.duration).toBeCloseTo(60, 1);
    }).catch(fail).then(done);
  });

  it('trims content at appendWindowEnd', function(done) {
    mediaSourceEngine.init({'video': getFullMimeType(metadata.video)});
    mediaSourceEngine.setDuration(presentationDuration).then(function() {
      return appendInit('video');
    }).then(function() {
      return mediaSourceEngine.setAppendWindowEnd('video', 18);
    }).then(function() {
      expect(buffered('video', 0)).toBe(0);
      return append('video', 1);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(10);
      return append('video', 2);
    }).then(function() {
      expect(buffered('video', 0)).toBeCloseTo(18, 1);
    }).catch(fail).then(done);
  });
});
