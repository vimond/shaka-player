/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


var customMatchers = {};


/**
 * Creates a new Jasmine matcher object for comparing two Uint8Array objects.
 *
 * @param {Object} util
 * @param {Object} customEqualityTesters
 *
 * @return {Object} A Jasmine matcher object.
 */
customMatchers.toMatchUint8Array = function(util, customEqualityTesters) {
  var matcher = {};

  matcher.compare = function(actual, opt_expected) {
    var expected = opt_expected || new Uint8Array();

    var result = {};

    if (actual.length != expected.length) {
      result.pass = false;
      return result;
    }

    for (var i = 0; i < expected.length; i++) {
      if (actual[i] == expected[i])
        continue;
      result.pass = false;
      return result;
    }

    result.pass = true;
    return result;
  };

  return matcher;
};


/**
 * Creates a new Jasmine matcher object for comparing two range object. A range
 * object is an object of type {{ start: number, end: number }}.
 *
 * @param {Object} util
 * @param {Object} customEqualityTesters
 *
 * @return {Object} A Jasmine matcher object.
 */
customMatchers.toMatchRange = function(util, customEqualityTesters) {
  var matcher = {};

  matcher.compare = function(actual, opt_expected) {
    var expected = opt_expected || { begin: 0, end: 0 };

    var result = {};

    if ((actual == null && expected != null) ||
        (actual != null && expected == null) ||
        (actual.begin != expected.begin) || (actual.end != expected.end)) {
      result.pass = false;
      return result;
    }

    result.pass = true;
    return result;
  };

  return matcher;
};


/**
 * Jasmine-ajax doesn't send events as arguments when it calls event handlers.
 * This binds very simple event stand-ins to all event handlers.
 *
 * @param {FakeXMLHttpRequest} xhr The FakeXMLHttpRequest object.
 */
function mockXMLHttpRequestEventHandling(xhr) {
  var fakeEvent = { 'target': xhr };

  var events = ['onload', 'onerror', 'onreadystatechange'];
  for (var i = 0; i < events.length; ++i) {
    if (xhr[events[i]]) {
      xhr[events[i]] = xhr[events[i]].bind(xhr, fakeEvent);
    }
  }
}


/**
 * Returns a Promise which is resolved after the given delay.
 *
 * @param {number} seconds The delay in seconds.
 * @return {!Promise}
 */
function delay(seconds) {
  var p = new shaka.util.PublicPromise;
  setTimeout(p.resolve, seconds * 1000.0);
  return p;
}


/**
 * Replace shaka.asserts and console.assert with a version which hooks into
 * jasmine.  This converts all failed assertions into failed tests.
 */
var assertsToFailures = {
  uninstall: function() {
    shaka.asserts = assertsToFailures.originalShakaAsserts_;
    console.assert = assertsToFailures.originalConsoleAssert_;
  },

  install: function() {
    assertsToFailures.originalShakaAsserts_ = shaka.asserts;
    assertsToFailures.originalConsoleAssert_ = console.assert;

    var realAssert = console.assert.bind(console);

    var jasmineAssert = function(condition, opt_message) {
      realAssert(condition, opt_message);
      if (!condition) {
        var message = opt_message || 'Assertion failed.';
        try {
          throw new Error(message);
        } catch (exception) {
          fail(message);
        }
      }
    };

    shaka.asserts = {
      assert: function(condition, opt_message) {
        jasmineAssert(condition, opt_message);
      },
      notImplemented: function() {
        jasmineAssert(false, 'Not implemented.');
      },
      unreachable: function() {
        jasmineAssert(false, 'Unreachable reached.');
      }
    };

    console.assert = jasmineAssert;
  }
};


/**
 * Called to interpret ContentProtection elements from the MPD.
 * @param {!string} schemeIdUri
 * @param {!Node} contentProtection The ContentProtection XML element.
 * @return {Array.<shaka.player.DrmInfo.Config>}
 */
function interpretContentProtection(schemeIdUri, contentProtection) {
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  // This is the only scheme used in integration tests at the moment.
  if (schemeIdUri == 'com.youtube.clearkey') {
    var license;
    for (var i = 0; i < contentProtection.childNodes.length; ++i) {
      var child = contentProtection.childNodes[i];
      if (child.nodeName == 'ytdrm:License') {
        license = child;
        break;
      }
    }
    if (!license) {
      return null;
    }
    var keyid = Uint8ArrayUtils.fromHex(license.getAttribute('keyid'));
    var key = Uint8ArrayUtils.fromHex(license.getAttribute('key'));
    var keyObj = {
      kty: 'oct',
      kid: Uint8ArrayUtils.toBase64(keyid, false),
      k: Uint8ArrayUtils.toBase64(key, false)
    };
    var jwkSet = {keys: [keyObj]};
    var license = JSON.stringify(jwkSet);
    var initData = {
      'initData': keyid,
      'initDataType': 'webm'
    };
    var licenseServerUrl = 'data:application/json;base64,' +
        shaka.util.StringUtils.toBase64(license);
    return [{
      'keySystem': 'org.w3.clearkey',
      'licenseServerUrl': licenseServerUrl,
      'initData': initData
    }];
  }

  return null;
}


/**
 * Checks that the given Range objects match.
 * @param {shaka.dash.mpd.Range} actual
 * @param {shaka.dash.mpd.Range} expected
 */
function checkRange(actual, expected) {
  if (expected) {
    expect(actual).toBeTruthy();
    expect(actual.begin).toBe(expected.begin);
    expect(actual.end).toBe(expected.end);
  } else {
    expect(actual).toBeNull();
  }
}


/**
 * Checks that the given "URL type objects" match.
 * @param {shaka.dash.mpd.RepresentationIndex|
 *         shaka.dash.mpd.Initialization} actual
 * @param {shaka.dash.mpd.RepresentationIndex|
 *         shaka.dash.mpd.Initialization} expected
 */
function checkUrlTypeObject(actual, expected) {
  if (expected) {
    if (expected.url) {
      expect(actual.url).toBeTruthy();
      expect(actual.url.toString()).toBe(expected.url.toString());
    } else {
      expect(actual.url).toBeNull();
    }

    if (expected.range) {
      expect(actual.range).toBeTruthy();
      expect(actual.range.begin).toBe(expected.range.begin);
      expect(actual.range.end).toBe(expected.range.end);
    } else {
      expect(actual.range).toBeNull();
    }
  } else {
    expect(actual).toBeNull();
  }
}


/**
 * Checks that the given references have the correct times and byte ranges.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references
 * @param {string} expectedUrl
 * @param {!Array.<number>} expectedStartTimes
 * @param {!Array.<number>} expectedStartBytes
 */
function checkReferences(
    references,
    expectedUrl,
    expectedStartTimes,
    expectedStartBytes) {
  console.assert(expectedStartTimes.length == expectedStartBytes.length);
  expect(references.length).toBe(expectedStartTimes.length);
  for (var i = 0; i < expectedStartTimes.length; i++) {
    var reference = references[i];
    var expectedStartTime = expectedStartTimes[i];
    var expectedStartByte = expectedStartBytes[i];

    expect(reference).toBeTruthy();
    expect(reference.url).toBeTruthy();
    expect(reference.url.toString()).toBe(expectedUrl);

    expect(reference.startTime.toFixed(3)).toBe(expectedStartTime.toFixed(3));
    expect(reference.url.startByte).toBe(expectedStartByte);

    // The final end time and final end byte are dependent on the specific
    // content, so for simplicity just omit checking them.
    var isLast = (i == expectedStartTimes.length - 1);
    if (!isLast) {
      var expectedEndTime = expectedStartTimes[i + 1];
      var expectedEndByte = expectedStartBytes[i + 1] - 1;
      expect(reference.endTime.toFixed(3)).toBe(expectedEndTime.toFixed(3));
      expect(reference.url.endByte).toBe(expectedEndByte);
    }
  }
}


/**
 * Checks the given reference; expects its |startByte| and |endByte| fields to
 * be 0 and null respectively.
 *
 * @param {!shaka.media.SegmentReference} reference
 * @param {string} url
 * @param {number} startTime
 * @param {number} endTime
 */
function checkReference(reference, url, startTime, endTime) {
  expect(reference).toBeTruthy();
  expect(reference.url).toBeTruthy();
  expect(reference.url.urls[0].toString()).toBe(url);
  expect(reference.url.startByte).toBe(0);
  expect(reference.url.endByte).toBeNull();
  expect(reference.startTime).toBe(startTime);
  expect(reference.endTime).toBe(endTime);
}


/**
 * Creates a FailoverUri with the given info.
 *
 * @param {!string} url
 * @param {number=} opt_start
 * @param {?number=} opt_end
 * @return {!shaka.util.FailoverUri}
 */
function createFailover(url, opt_start, opt_end) {
  return new shaka.util.FailoverUri(
      null, [new goog.Uri(url)], opt_start || 0, opt_end || null);
}


/**
 * Creates a reference object using the given values.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} url
 * @param {number=} opt_startByte
 * @param {?number=} opt_endByte
 * @return {!shaka.media.SegmentReference}
 */
function createReference(startTime, endTime, url, opt_startByte, opt_endByte) {
  var failover = createFailover(url, opt_startByte, opt_endByte);
  return new shaka.media.SegmentReference(startTime, endTime, failover);
}


/**
 * Waits for a video time to increase.
 * @param {!HTMLMediaElement} video The playing video.
 * @param {!shaka.util.EventManager} eventManager
 * @return {!Promise} resolved when the video's currentTime changes.
 */
function waitForMovement(video, eventManager) {
  var promise = new shaka.util.PublicPromise;
  var originalTime = video.currentTime;
  eventManager.listen(video, 'timeupdate', function() {
    if (video.currentTime != originalTime) {
      eventManager.unlisten(video, 'timeupdate');
      promise.resolve();
    }
  });
  return promise;
}


/**
 * Waits for a callback function to succeed using a poll.
 *
 * @param {number} timeout in seconds
 * @param {function(): boolean} callback
 * @param {function(!Error)=} opt_timeoutCallback
 * @return {!Promise}
 */
function waitFor(timeout, callback, opt_timeoutCallback) {
  var promise = new shaka.util.PublicPromise();
  var stack;
  try {
    throw new Error('stacktrace');
  } catch (error) {
    stack = error.stack.split('\n').slice(1).join('\n');
  }
  var pollId;

  var timeoutId = window.setTimeout(function() {
    window.clearInterval(pollId);

    // Reject the promise, but replace the error's stack with the original
    // call stack.  This timeout handler's stack is not helpful.
    var error = new Error('Timeout waiting for callback');
    error.stask = stack;

    if (opt_timeoutCallback)
      opt_timeoutCallback(error);

    promise.reject(error);
  }, timeout * 1000);

  pollId = window.setInterval(function() {
    if (callback()) {
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);

      promise.resolve();
    }
  }, 100);
  return promise;
}


/**
 * @param {!HTMLMediaElement} video The playing video.
 * @param {!shaka.util.EventManager} eventManager
 * @param {number} targetTime in seconds
 * @param {number} timeout in seconds
 * @return {!Promise} resolved when the video's currentTime >= |targetTime|.
 */
function waitForTargetTime(video, eventManager, targetTime, timeout) {
  var promise = new shaka.util.PublicPromise;
  var stack;
  try {
    throw new Error('stacktrace');
  } catch (error) {
    stack = error.stack.split('\n').slice(1).join('\n');
  }

  var timeoutId = window.setTimeout(function() {
    // This expectation will fail, but will provide specific values to
    // Jasmine to help us debug timeout issues.
    expect(video.currentTime).toBeGreaterThan(targetTime);
    eventManager.unlisten(video, 'timeupdate');
    // Reject the promise, but replace the error's stack with the original
    // call stack.  This timeout handler's stack is not helpful.
    var error = new Error('Timeout waiting for video time ' + targetTime);
    error.stack = stack;
    promise.reject(error);
  }, timeout * 1000);

  eventManager.listen(video, 'timeupdate', function() {
    if (video.currentTime > targetTime) {
      // This expectation will pass, but will keep Jasmine from complaining
      // about tests which have no expectations.  In practice, some tests
      // only need to demonstrate that they have reached a certain target.
      expect(video.currentTime).toBeGreaterThan(targetTime);
      eventManager.unlisten(video, 'timeupdate');
      window.clearTimeout(timeoutId);
      promise.resolve();
    }
  });
  return promise;
}


/**
 * @param {!SourceBuffer} sourceBuffer
 * @param {number} targetTime in seconds
 * @param {number} timeout in seconds
 * @return {!Promise} resolved when |sourceBuffer| has buffered at least
 *     |targetTime| seconds of data.
 */
function waitUntilBuffered(sourceBuffer, targetTime, timeout) {
  return waitFor(timeout, function() {
    var buffered = sourceBuffer.buffered;

    // If there is nothing buffered, then it may be 0.  Simply wait until
    // it gets buffered.
    expect(buffered.length).toBeLessThan(2);
    if (buffered.length == 1) {
      var secondsBuffered = buffered.end(0) - buffered.start(0);
      return secondsBuffered > targetTime;
    } else {
      return false;
    }
  }, function(error) {
    var buffered = sourceBuffer.buffered;
    expect(buffered.length).toBe(1);

    var secondsBuffered = buffered.end(0) - buffered.start(0);
    // This expectation will fail, but will provide specific values to
    // Jasmine to help us debug timeout issues.
    expect(secondsBuffered).toBeGreaterThan(targetTime);

    error.message = 'Timeout waiting for buffered ' + targetTime;
  });
}


/**
 * Creates a new DashVideoSource out of the manifest.
 * @param {string} manifest
 * @return {!shaka.player.DashVideoSource}
 */
function newSource(manifest) {
  var estimator = new shaka.util.EWMABandwidthEstimator();
  // FIXME: We should enable caching because the tests do not use bitrate
  // adaptation, but Chrome's xhr.send() produces net::ERR_<unknown> for some
  // range requests when caching is enabled, so disable caching for now as it
  // breaks many of the integration tests.
  estimator.supportsCaching = function() { return false; };
  return new shaka.player.DashVideoSource(manifest,
                                          interpretContentProtection,
                                          estimator);
}


/**
 * @param {!Event} event
 */
function convertErrorToTestFailure(event) {
  // Treat all player errors as test failures.
  var error = event.detail;
  fail(error);
}

beforeAll(function() {
  shaka.polyfill.installAll();
});
