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

goog.provide('shaka.dash.mpd');

goog.require('goog.Uri');
goog.require('shaka.log');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Creates an Mpd. The MPD XML text is parsed into a tree structure.
 *
 * If a tag that should only exist once exists more than once, then all
 * instances of that tag are ignored; for example, if a "Representation" tag
 * contains more than one "SegmentBase" tag, then every "SegmentBase" tag
 * contained in that "Representation" tag is ignored.
 *
 * Numbers, times, and byte ranges are set to null if they cannot be parsed.
 *
 * @param {string} source The MPD XML text.
 * @param {!Array.<!goog.Uri>} url The MPD URL for relative BaseURL resolution.
 * @return {shaka.dash.mpd.Mpd}
 *
 * @see ISO/IEC 23009-1
 */
shaka.dash.mpd.parseMpd = function(source, url) {
  var parser = new DOMParser();
  var xml = parser.parseFromString(source, 'text/xml');

  if (!xml) {
    shaka.log.error('Failed to parse MPD XML.');
    return null;
  }

  // Construct a virtual parent for the MPD to use in resolving relative URLs.
  var parent = { baseUrl: url };

  return shaka.dash.mpd.parseChild_(parent, xml, shaka.dash.mpd.Mpd);
};


/**
 * @private {number}
 * @const
 */
shaka.dash.mpd.DEFAULT_MIN_BUFFER_TIME_ = 5.0;


/**
 * @private {number}
 * @const
 */
shaka.dash.mpd.DEFAULT_SUGGESTED_PRESENTATION_DELAY_ = 1.0;



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.Mpd = function() {
  /**
   * The MPD's URL.
   * @type {Array.<!goog.Uri>}
   */
  this.url = null;

  /** @type {?string} */
  this.id = null;

  /** @type {string} */
  this.type = 'static';

  /** @type {Array.<!goog.Uri>} */
  this.baseUrl = null;

  /** @type {Array.<!goog.Uri>} */
  this.updateLocation = null;

  /**
   * The entire stream's duration, in seconds.
   * @type {?number}
   */
  this.mediaPresentationDuration = null;

  /**
   * The amount of content to buffer, in seconds, before playback begins to
   * ensure uninterrupted playback.
   * @type {?number}
   */
  this.minBufferTime = shaka.dash.mpd.DEFAULT_MIN_BUFFER_TIME_;

  /**
   * The interval, in seconds, to poll the media server for an updated
   * MPD, or null if updates are not required.
   * @type {?number}
   */
  this.minUpdatePeriod = null;

  /**
   * The wall-clock time, in seconds, that the media content specified within
   * the MPD started/will start to stream.
   * @type {?number}
   */
  this.availabilityStartTime = null;

  /**
   * The duration, in seconds, that the media server retains live media
   * content, excluding the current segment and the previous segment, which are
   * always available. For example, if this value is 60 then only media content
   * up to 60 seconds from the beginning of the previous segment may be
   * requested from the media server.
   * @type {?number}
   */
  this.timeShiftBufferDepth = null;

  /**
   * The duration, in seconds, that the media server takes to make live media
   * content available. For example, if this value is 30 then only media
   * content at least 30 seconds in the past may be requested from the media
   * server.
   * @type {?number}
   */
  this.suggestedPresentationDelay =
      shaka.dash.mpd.DEFAULT_SUGGESTED_PRESENTATION_DELAY_;

  /** @type {!Array.<!shaka.dash.mpd.Period>} */
  this.periods = [];
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.Period = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * The start time of the Period, in seconds, with respect to the media
   * presentation timeline. Note that the Period becomes/became available at
   * Mpd.availabilityStartTime + Period.start.
   * @type {?number}
   */
  this.start = null;

  /**
   * The duration in seconds.
   * @type {?number}
   */
  this.duration = null;

  /** @type {Array.<!goog.Uri>} */
  this.baseUrl = null;

  /** @type {shaka.dash.mpd.SegmentBase} */
  this.segmentBase = null;

  /** @type {shaka.dash.mpd.SegmentList} */
  this.segmentList = null;

  /** @type {shaka.dash.mpd.SegmentTemplate} */
  this.segmentTemplate = null;

  /** @type {!Array.<!shaka.dash.mpd.AdaptationSet>} */
  this.adaptationSets = [];
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.AdaptationSet = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * This value is never null after parsing.
   * @type {?number}
   */
  this.group = null;

  /**
   * The language.
   * @type {?string}
   * @see IETF RFC 5646
   * @see ISO 639
   */
  this.lang = null;

  /**
   * Should be 'video' or 'audio', not a MIME type.
   * If not specified, will be inferred from the MIME type.
   * @type {?string}
   */
  this.contentType = null;

  /** @type {?number} */
  this.width = null;

  /** @type {?number} */
  this.height = null;

  /**
   * If not specified, will be inferred from the first representation.
   * @type {?string}
   */
  this.mimeType = null;

  /** @type {?string} */
  this.codecs = null;

  /** @type {boolean} */
  this.main = false;

  /** @type {Array.<!goog.Uri>} */
  this.baseUrl = null;

  /** @type {shaka.dash.mpd.SegmentBase} */
  this.segmentBase = null;

  /** @type {shaka.dash.mpd.SegmentList} */
  this.segmentList = null;

  /** @type {shaka.dash.mpd.SegmentTemplate} */
  this.segmentTemplate = null;

  /** @type {!Array.<!shaka.dash.mpd.ContentProtection>} */
  this.contentProtections = [];

  /** @type {!Array.<!shaka.dash.mpd.Representation>} */
  this.representations = [];
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.Role = function() {
  /** @type {?string} */
  this.value = null;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.ContentComponent = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * The language.
   * @type {?string}
   * @see IETF RFC 5646
   * @see ISO 639
   */
  this.lang = null;

  /**
   * Should be 'video' or 'audio', not a MIME type.
   * @type {?string}
   */
  this.contentType = null;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.Representation = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * Never seen on the Representation itself, but inherited from AdapationSet
   * for convenience.
   * @see AdaptationSet.lang
   * @type {?string}
   */
  this.lang = null;

  /**
   * Bandwidth required, in bits per second, to assure uninterrupted playback,
   * assuming that |minBufferTime| seconds of video are in buffer before
   * playback begins.
   * @type {?number}
   */
  this.bandwidth = null;

  /** @type {?number} */
  this.width = null;

  /** @type {?number} */
  this.height = null;

  /** @type {?string} */
  this.mimeType = null;

  /** @type {?string} */
  this.codecs = null;

  /** @type {Array.<!goog.Uri>} */
  this.baseUrl = null;

  /** @type {shaka.dash.mpd.SegmentBase} */
  this.segmentBase = null;

  /** @type {shaka.dash.mpd.SegmentList} */
  this.segmentList = null;

  /** @type {shaka.dash.mpd.SegmentTemplate} */
  this.segmentTemplate = null;

  /** @type {!Array.<!shaka.dash.mpd.ContentProtection>} */
  this.contentProtections = [];
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.ContentProtection = function() {
  /**
   * The entire ContentProtection XML element.
   * @type {Node}
   */
  this.element = null;

  /**
   * @type {?string}
   */
  this.schemeIdUri = null;

  /**
   * @type {shaka.dash.mpd.CencPssh}
   */
  this.pssh = null;

  /**
   * A key ID, as a hex string, that identifies a decryption key for any
   * content specified at the same level and all levels below this
   * ContentProtection element.
   * @type {?string}
   */
  this.defaultKeyId = null;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.CencPssh = function() {
  /**
   * @type {Uint8Array}
   * @expose
   */
  this.psshBox = null;

  /**
   * @type {shaka.util.Pssh}
   * @expose
   */
  this.parsedPssh = null;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.BaseUrl = function() {
  /** @type {?string} */
  this.url = null;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.Location = function() {
  /** @type {?string} */
  this.url = null;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.SegmentBase = function() {
  /**
   * This not an actual XML attribute of SegmentBase. It is inherited from the
   * SegmentBase's parent Representation.
   * @type {Array.<!goog.Uri>}
   */
  this.baseUrl = null;

  /** @type {?number} */
  this.timescale = 1;

  /** @type {?number} */
  this.presentationTimeOffset = null;

  /** @type {shaka.dash.mpd.Range} */
  this.indexRange = null;

  /** @type {shaka.dash.mpd.RepresentationIndex} */
  this.representationIndex = null;

  /** @type {shaka.dash.mpd.Initialization} */
  this.initialization = null;
};


/**
 * Creates a deep copy of this SegmentBase.
 * @return {!shaka.dash.mpd.SegmentBase}
 */
shaka.dash.mpd.SegmentBase.prototype.clone = function() {
  var mpd = shaka.dash.mpd;

  var clone = new shaka.dash.mpd.SegmentBase();

  clone.baseUrl = mpd.cloneA_(this.baseUrl);
  clone.timescale = this.timescale;
  clone.presentationTimeOffset = this.presentationTimeOffset;
  clone.indexRange = mpd.clone_(this.indexRange);
  clone.representationIndex = mpd.clone_(this.representationIndex);
  clone.initialization = mpd.clone_(this.initialization);

  return clone;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.RepresentationIndex = function() {
  /** @type {Array.<!goog.Uri>} */
  this.url = null;

  /**
   * Inherits the value of SegmentBase.indexRange if not specified.
   * @type {shaka.dash.mpd.Range}
   */
  this.range = null;
};


/**
 * Creates a deep copy of this RepresentationIndex.
 * @return {!shaka.dash.mpd.RepresentationIndex}
 */
shaka.dash.mpd.RepresentationIndex.prototype.clone = function() {
  var mpd = shaka.dash.mpd;

  var clone = new shaka.dash.mpd.RepresentationIndex();

  clone.url = mpd.cloneA_(this.url);
  clone.range = mpd.clone_(this.range);

  return clone;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.Initialization = function() {
  /** @type {Array.<!goog.Uri>} */
  this.url = null;

  /** @type {shaka.dash.mpd.Range} */
  this.range = null;
};


/**
 * Creates a deep copy of this Initialization.
 * @return {!shaka.dash.mpd.Initialization}
 */
shaka.dash.mpd.Initialization.prototype.clone = function() {
  var mpd = shaka.dash.mpd;

  var clone = new shaka.dash.mpd.Initialization();

  clone.url = mpd.cloneA_(this.url);
  clone.range = mpd.clone_(this.range);

  return clone;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.SegmentList = function() {
  /**
   * This not an actual XML attribute of SegmentList. It is inherited from the
   * SegmentList's parent Representation.
   * @type {Array.<!goog.Uri>}
   */
  this.baseUrl = null;

  /** @type {?number} */
  this.timescale = 1;

  /** @type {?number} */
  this.presentationTimeOffset = null;

  /**
   * Each segment's duration. This value is never zero.
   * @type {?number}
   */
  this.segmentDuration = null;

  /**
   * The segment number (one-based) of the first segment specified in the
   * SegmentList's corresponding Representation, relative to the start of the
   * Representation's Period.
   *
   * Please see shaka.dash.mpd.SegmentTemplate.zeroBasedSegmentNumbers for
   * additional information.
   *
   * @type {number}
   */
  this.startNumber = 1;

  /** @type {shaka.dash.mpd.Initialization} */
  this.initialization = null;

  /** @type {!Array.<!shaka.dash.mpd.SegmentUrl>} */
  this.segmentUrls = [];

  /** @type {shaka.dash.mpd.SegmentTimeline} */
  this.timeline = null;
};


/**
 * Creates a deep copy of this SegmentList.
 * @return {!shaka.dash.mpd.SegmentList}
 */
shaka.dash.mpd.SegmentList.prototype.clone = function() {
  var mpd = shaka.dash.mpd;

  var clone = new shaka.dash.mpd.SegmentList();

  clone.baseUrl = mpd.cloneA_(this.baseUrl);
  clone.timescale = this.timescale;
  clone.presentationTimeOffset = this.presentationTimeOffset;
  clone.segmentDuration = this.segmentDuration;
  clone.startNumber = this.startNumber;
  clone.initialization = mpd.clone_(this.initialization);
  clone.segmentUrls = mpd.cloneA_(this.segmentUrls) || [];
  clone.timeline = mpd.clone_(this.timeline);

  return clone;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.SegmentUrl = function() {
  /** @type {Array.<!goog.Uri>} */
  this.mediaUrl = null;

  /** @type {shaka.dash.mpd.Range} */
  this.mediaRange = null;
};


/**
 * Creates a deep copy of this SegmentUrl.
 * @return {!shaka.dash.mpd.SegmentUrl}
 */
shaka.dash.mpd.SegmentUrl.prototype.clone = function() {
  var mpd = shaka.dash.mpd;

  var clone = new shaka.dash.mpd.SegmentUrl();

  clone.mediaUrl = mpd.cloneA_(this.mediaUrl);
  clone.mediaRange = mpd.clone_(this.mediaRange);

  return clone;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.SegmentTemplate = function() {
  /** @type {?number} */
  this.timescale = 1;

  /** @type {?number} */
  this.presentationTimeOffset = null;

  /**
   * Each segment's duration. This value is never zero.
   * @type {?number}
   */
  this.segmentDuration = null;

  /**
   * The segment number (one-based) of the first segment specified in the
   * SegmentTemplates's corresponding Representation, relative to the start of
   * the Representation's Period.
   * @type {number}
   */
  this.startNumber = 1;

  /**
   * True if the manifest uses zero-based segment numbers; false if the
   * manifest uses one-based segment numbers.
   *
   * The DASH spec. does not explicitly indicate if manifests should use
   * zero-based segment numbers or one-based segment numbers; however, the
   * spec. seems to prefer one-based segment numbers. We assume manifests use
   * one-based segment numbers unless the manifest specifies startNumber == 0.
   *
   * So, manifests which use zero-based segment numbers and specify
   * startNumber > 0 will cause the player to interpret the first segment
   * listed in a Representation as the startNumber'th segment relative to the
   * start of the Representation's Period, instead of the (startNumber - 1)'th
   * segment. So, we encourage manifests to use one-based segment numbers.
   *
   * We only need this property so we can compute $Number$ for manifests that
   * use zero-based segment numbers instead of one-based segment numbers.
   *
   * @type {boolean}
   */
  this.zeroBasedSegmentNumbers = false;

  /** @type {?string} */
  this.mediaUrlTemplate = null;

  /** @type {?string} */
  this.indexUrlTemplate = null;

  /** @type {?string} */
  this.initializationUrlTemplate = null;

  /** @type {shaka.dash.mpd.SegmentTimeline} */
  this.timeline = null;
};


/**
 * Creates a deep copy of this SegmentTemplate.
 * @return {!shaka.dash.mpd.SegmentTemplate}
 */
shaka.dash.mpd.SegmentTemplate.prototype.clone = function() {
  var mpd = shaka.dash.mpd;

  var clone = new shaka.dash.mpd.SegmentTemplate();

  clone.timescale = this.timescale;
  clone.presentationTimeOffset = this.presentationTimeOffset;
  clone.segmentDuration = this.segmentDuration;
  clone.startNumber = this.startNumber;
  clone.zeroBasedSegmentNumbers = this.zeroBasedSegmentNumbers;
  clone.mediaUrlTemplate = this.mediaUrlTemplate;
  clone.indexUrlTemplate = this.indexUrlTemplate;
  clone.initializationUrlTemplate = this.initializationUrlTemplate;
  clone.timeline = mpd.clone_(this.timeline);

  return clone;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.SegmentTimeline = function() {
  /** @type {!Array.<!shaka.dash.mpd.SegmentTimePoint>} */
  this.timePoints = [];
};


/**
 * Creates a deep copy of this SegmentTimeline.
 * @return {!shaka.dash.mpd.SegmentTimeline}
 */
shaka.dash.mpd.SegmentTimeline.prototype.clone = function() {
  var clone = new shaka.dash.mpd.SegmentTimeline();

  clone.timePoints = shaka.dash.mpd.cloneA_(this.timePoints) || [];

  return clone;
};



/**
 * @constructor
 * @struct
 */
shaka.dash.mpd.SegmentTimePoint = function() {
  /**
   * The start time of the media segment, in seconds, relative to the beginning
   * of the Period.
   * @type {?number}
   */
  this.startTime = null;

  /** @type {?number} */
  this.duration = null;

  /** @type {?number} */
  this.repeat = null;
};


/**
 * Creates a deep copy of this SegmentTimePoint.
 * @return {!shaka.dash.mpd.SegmentTimePoint}
 */
shaka.dash.mpd.SegmentTimePoint.prototype.clone = function() {
  var clone = new shaka.dash.mpd.SegmentTimePoint();

  clone.startTime = this.startTime;
  clone.duration = this.duration;
  clone.repeat = this.repeat;

  return clone;
};



/**
 * Creates a Range.
 * @param {number} begin The beginning of the range.
 * @param {number} end The end of the range.
 * @constructor
 * @struct
 */
shaka.dash.mpd.Range = function(begin, end) {
  /** @const {number} */
  this.begin = begin;

  /** @const {number} */
  this.end = end;
};


/**
 * Creates a deep copy of this Range.
 * @return {!shaka.dash.mpd.Range}
 */
shaka.dash.mpd.Range.prototype.clone = function() {
  return new shaka.dash.mpd.Range(this.begin, this.end);
};


// MPD tag names --------------------------------------------------------------


/**
 * @const {string}
 * @expose all TAG_NAME properties so that they do not get stripped during
 *     advanced compilation.
 */
shaka.dash.mpd.Mpd.TAG_NAME = 'MPD';


/** @const {string} */
shaka.dash.mpd.Period.TAG_NAME = 'Period';


/** @const {string} */
shaka.dash.mpd.AdaptationSet.TAG_NAME = 'AdaptationSet';


/** @const {string} */
shaka.dash.mpd.Role.TAG_NAME = 'Role';


/** @const {string} */
shaka.dash.mpd.ContentComponent.TAG_NAME = 'ContentComponent';


/** @const {string} */
shaka.dash.mpd.Representation.TAG_NAME = 'Representation';


/** @const {string} */
shaka.dash.mpd.ContentProtection.TAG_NAME = 'ContentProtection';


/** @const {string} */
shaka.dash.mpd.CencPssh.TAG_NAME = 'cenc:pssh';


/** @const {string} */
shaka.dash.mpd.BaseUrl.TAG_NAME = 'BaseURL';


/** @const {string} */
shaka.dash.mpd.Location.TAG_NAME = 'Location';


/** @const {string} */
shaka.dash.mpd.SegmentBase.TAG_NAME = 'SegmentBase';


/** @const {string} */
shaka.dash.mpd.RepresentationIndex.TAG_NAME = 'RepresentationIndex';


/** @const {string} */
shaka.dash.mpd.Initialization.TAG_NAME = 'Initialization';


/** @const {string} */
shaka.dash.mpd.SegmentList.TAG_NAME = 'SegmentList';


/** @const {string} */
shaka.dash.mpd.SegmentUrl.TAG_NAME = 'SegmentURL';


/** @const {string} */
shaka.dash.mpd.SegmentTemplate.TAG_NAME = 'SegmentTemplate';


/** @const {string} */
shaka.dash.mpd.SegmentTimeline.TAG_NAME = 'SegmentTimeline';


/** @const {string} */
shaka.dash.mpd.SegmentTimePoint.TAG_NAME = 'S';


// MPD parsing functions ------------------------------------------------------


/**
 * Parses an "MPD" tag.
 * @param {{baseUrl: !Array.<!goog.Uri>}} parent A virtual parent tag
 *     containing a BaseURL which refers to the MPD resource itself.
 * @param {!Node} elem The MPD XML element.
 */
shaka.dash.mpd.Mpd.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.url = parent.baseUrl;
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.type = mpd.parseAttr_(elem, 'type', mpd.parseString_) || 'static';
  this.mediaPresentationDuration = mpd.parseAttr_(
      elem, 'mediaPresentationDuration', mpd.parseDuration_);
  this.minBufferTime =
      mpd.parseAttr_(elem,
                     'minBufferTime',
                     mpd.parseDuration_,
                     this.minBufferTime);

  this.minUpdatePeriod =
      mpd.parseAttr_(elem,
                     'minimumUpdatePeriod',
                     mpd.parseDuration_,
                     this.minUpdatePeriod);

  this.availabilityStartTime =
      mpd.parseAttr_(elem,
                     'availabilityStartTime',
                     mpd.parseDate_,
                     this.availabilityStartTime);
  this.timeShiftBufferDepth =
      mpd.parseAttr_(elem,
                     'timeShiftBufferDepth',
                     mpd.parseDuration_,
                     this.timeShiftBufferDepth);
  this.suggestedPresentationDelay =
      mpd.parseAttr_(elem,
                     'suggestedPresentationDelay',
                     mpd.parseDuration_,
                     this.suggestedPresentationDelay);

  var base = parent.baseUrl;

  // Parse simple child elements.
  var baseUrl = mpd.parseChildren_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrlArray_(base, baseUrl);

  var updateLocation = mpd.parseChild_(this, elem, mpd.Location);
  if (updateLocation) {
    this.updateLocation = mpd.resolveUrl_(base, updateLocation.url);
  }

  // Parse hierarchical children.
  this.periods = mpd.parseChildren_(this, elem, mpd.Period);
};


/**
 * Adds a text set for the given external captions.  This only effects the
 * first period; has no effect if there are no periods.
 *
 * @param {string} url
 * @param {string=} opt_lang Optional language of the text, defaults to 'en'.
 * @param {string=} opt_mime Optional MIME type, defaults to 'text/vtt'.
 */
shaka.dash.mpd.Mpd.prototype.addExternalCaptions =
    function(url, opt_lang, opt_mime) {
  if (this.periods.length === 0) {
    return;
  }

  var as = new shaka.dash.mpd.AdaptationSet();
  as.contentType = 'text';
  as.lang = opt_lang || 'en';
  as.main = true;

  var repr = new shaka.dash.mpd.Representation();
  repr.bandwidth = 0;
  repr.mimeType = opt_mime || 'text/vtt';
  repr.baseUrl = [new goog.Uri(url)];
  as.representations.push(repr);

  this.periods[0].adaptationSets.push(as);
  this.periods[0].assignGroups_();
};


/**
 * Parses a "Period" tag.
 * @param {!shaka.dash.mpd.Mpd} parent The parent Mpd.
 * @param {!Node} elem The Period XML element.
 */
shaka.dash.mpd.Period.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.start = mpd.parseAttr_(elem, 'start', mpd.parseDuration_);
  this.duration = mpd.parseAttr_(elem, 'duration', mpd.parseDuration_);

  // Parse simple child elements.
  var baseUrl = mpd.parseChildren_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrlArray_(parent.baseUrl, baseUrl);

  // Parse hierarchical children.
  this.segmentBase = mpd.parseChild_(this, elem, mpd.SegmentBase);
  this.segmentList = mpd.parseChild_(this, elem, mpd.SegmentList);
  this.segmentTemplate = mpd.parseChild_(this, elem, mpd.SegmentTemplate);

  this.adaptationSets = mpd.parseChildren_(this, elem, mpd.AdaptationSet);
  this.assignGroups_();
};


/**
 * Assigns a unique non-zero group to each AdaptationSet without an explicitly
 * set group.
 *
 * @private
 * @see ISO/IEC 23009-1 5.3.3.1
 */
shaka.dash.mpd.Period.prototype.assignGroups_ = function() {
  /** @type {!Array.<boolean|undefined>} */
  var groups = [];

  for (var i = 0; i < this.adaptationSets.length; ++i) {
    var adaptationSet = this.adaptationSets[i];
    if (adaptationSet.group != null) {
      groups[adaptationSet.group] = true;
    }
  }

  for (var i = 0; i < this.adaptationSets.length; ++i) {
    var adaptationSet = this.adaptationSets[i];
    if (adaptationSet.group == null) {
      var group = 1;
      while (groups[group] == true) ++group;
      groups[group] = true;
      adaptationSet.group = group;
    }
  }
};


/**
 * Parses an "AdaptationSet" tag.
 * @param {!shaka.dash.mpd.Period} parent The parent Period.
 * @param {!Node} elem The AdaptationSet XML element.
 */
shaka.dash.mpd.AdaptationSet.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse children which provide properties of the AdaptationSet.
  var contentComponent = mpd.parseChild_(this, elem, mpd.ContentComponent) ||
                         {};
  var role = mpd.parseChild_(this, elem, mpd.Role);

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.group = mpd.parseAttr_(elem, 'group', mpd.parseNonNegativeInt_);
  this.lang = mpd.parseAttr_(
      elem, 'lang', mpd.parseString_, contentComponent.lang);
  this.contentType = mpd.parseAttr_(
      elem, 'contentType', mpd.parseString_, contentComponent.contentType);
  this.width = mpd.parseAttr_(elem, 'width', mpd.parsePositiveInt_);
  this.height = mpd.parseAttr_(elem, 'height', mpd.parsePositiveInt_);
  this.mimeType = mpd.parseAttr_(elem, 'mimeType', mpd.parseString_);
  this.codecs = mpd.parseAttr_(elem, 'codecs', mpd.parseString_);
  this.main = role && role.value == 'main';

  // Normalize the language tag.
  if (this.lang) this.lang = shaka.util.LanguageUtils.normalize(this.lang);

  // Parse simple child elements.
  var baseUrl = mpd.parseChildren_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrlArray_(parent.baseUrl, baseUrl);

  // TODO: Any initData values or default key IDs in generic MP4
  // ContentProtection elements (i.e, urn:mpeg:dash:mp4protection:2011') should
  // be inherited by other ContentProtection elements.
  this.contentProtections =
      mpd.parseChildren_(this, elem, mpd.ContentProtection);

  if (!this.contentType && this.mimeType) {
    // Infer contentType from mimeType. This must be done before parsing any
    // child Representations, as Representation inherits contentType.
    this.contentType = this.mimeType.split('/')[0];
  }

  // Parse hierarchical children.
  this.segmentBase = parent.segmentBase ?
                     mpd.mergeChild_(this, elem, parent.segmentBase) :
                     mpd.parseChild_(this, elem, mpd.SegmentBase);

  this.segmentList = parent.segmentList ?
                     mpd.mergeChild_(this, elem, parent.segmentList) :
                     mpd.parseChild_(this, elem, mpd.SegmentList);

  this.segmentTemplate = parent.segmentTemplate ?
                         mpd.mergeChild_(this, elem, parent.segmentTemplate) :
                         mpd.parseChild_(this, elem, mpd.SegmentTemplate);

  this.representations = mpd.parseChildren_(this, elem, mpd.Representation);

  if (!this.mimeType && this.representations.length) {
    // Infer mimeType from children.  MpdProcessor will deal with the case
    // where Representations have inconsistent mimeTypes.
    this.mimeType = this.representations[0].mimeType;

    if (!this.contentType && this.mimeType) {
      this.contentType = this.mimeType.split('/')[0];
    }
  }
};


/**
 * Parses a "Role" tag.
 * @param {!shaka.dash.mpd.AdaptationSet} parent The parent AdaptationSet.
 * @param {!Node} elem The Role XML element.
 */
shaka.dash.mpd.Role.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.value = mpd.parseAttr_(elem, 'value', mpd.parseString_);
};


/**
 * Parses a "ContentComponent" tag.
 * @param {!shaka.dash.mpd.AdaptationSet} parent The parent AdaptationSet.
 * @param {!Node} elem The ContentComponent XML element.
 */
shaka.dash.mpd.ContentComponent.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.lang = mpd.parseAttr_(elem, 'lang', mpd.parseString_);
  this.contentType = mpd.parseAttr_(elem, 'contentType', mpd.parseString_);

  // Normalize the language tag.
  if (this.lang) this.lang = shaka.util.LanguageUtils.normalize(this.lang);
};


/**
 * Parses a "Representation" tag.
 * @param {!shaka.dash.mpd.AdaptationSet} parent The parent AdaptationSet.
 * @param {!Node} elem The Representation XML element.
 */
shaka.dash.mpd.Representation.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.bandwidth = mpd.parseAttr_(elem, 'bandwidth', mpd.parsePositiveInt_);
  this.width = mpd.parseAttr_(
      elem, 'width', mpd.parsePositiveInt_, parent.width);
  this.height = mpd.parseAttr_(
      elem, 'height', mpd.parsePositiveInt_, parent.height);
  this.mimeType = mpd.parseAttr_(
      elem, 'mimeType', mpd.parseString_, parent.mimeType);
  this.codecs = mpd.parseAttr_(elem, 'codecs', mpd.parseString_, parent.codecs);

  // Never seen on this element itself, but inherited for convenience.
  this.lang = parent.lang;

  // Parse simple child elements.
  var baseUrl = mpd.parseChildren_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrlArray_(parent.baseUrl, baseUrl);

  this.contentProtections =
      mpd.parseChildren_(this, elem, mpd.ContentProtection);

  // Parse hierarchical children.
  this.segmentBase = parent.segmentBase ?
                     mpd.mergeChild_(this, elem, parent.segmentBase) :
                     mpd.parseChild_(this, elem, mpd.SegmentBase);

  this.segmentList = parent.segmentList ?
                     mpd.mergeChild_(this, elem, parent.segmentList) :
                     mpd.parseChild_(this, elem, mpd.SegmentList);

  this.segmentTemplate = parent.segmentTemplate ?
                         mpd.mergeChild_(this, elem, parent.segmentTemplate) :
                         mpd.parseChild_(this, elem, mpd.SegmentTemplate);

  this.contentProtections =
      this.contentProtections.concat(parent.contentProtections);
};


/**
 * Parses a "ContentProtection" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The ContentProtection XML element.
 */
shaka.dash.mpd.ContentProtection.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  this.element = elem;

  // Parse attributes.
  this.schemeIdUri = mpd.parseAttr_(elem, 'schemeIdUri', mpd.parseString_);

  // The 'default_KID' is specified as a GUID, so remove the dashes.
  var defaultKeyIdGuid =
      mpd.parseAttr_(elem, 'cenc:default_KID', mpd.parseString_);
  if (defaultKeyIdGuid) {
    this.defaultKeyId = defaultKeyIdGuid.replace(/[-]/g, '');
  }

  // Parse simple child elements.
  this.pssh = mpd.parseChild_(this, elem, mpd.CencPssh);
};


/**
 * Parse a "cenc:pssh" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The CencPssh XML element.
 */
shaka.dash.mpd.CencPssh.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  var contents = mpd.getContents_(elem);
  if (!contents) {
    return;
  }

  this.psshBox = Uint8ArrayUtils.fromBase64(contents);

  try {
    this.parsedPssh = new shaka.util.Pssh(this.psshBox);
  } catch (exception) {
    if (!(exception instanceof RangeError)) {
      throw exception;
    }
  }
};


/**
 * Parses a "BaseURL" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The BaseURL XML element.
 */
shaka.dash.mpd.BaseUrl.prototype.parse = function(parent, elem) {
  this.url = shaka.dash.mpd.getContents_(elem);
};


/**
 * Parses a "Location" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The Location XML element.
 */
shaka.dash.mpd.Location.prototype.parse = function(parent, elem) {
  this.url = shaka.dash.mpd.getContents_(elem);
};


/**
 * Parses a "SegmentBase" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The SegmentBase XML element.
 */
shaka.dash.mpd.SegmentBase.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  this.baseUrl = parent.baseUrl || this.baseUrl;

  // When parsing attributes and child elements fallback to |this| to provide
  // default values. If |this| is a new SegmentBase then |this| will have
  // default values from its constructor, and if |this| was cloned from a
  // higher level SegmentBase then |this| will have values from that
  // SegmentBase.
  this.timescale = mpd.parseAttr_(
      elem, 'timescale', mpd.parsePositiveInt_, this.timescale);

  this.presentationTimeOffset =
      mpd.parseAttr_(elem,
                     'presentationTimeOffset',
                     mpd.parseNonNegativeInt_,
                     this.presentationTimeOffset);

  // Parse attributes.
  this.indexRange = mpd.parseAttr_(
      elem, 'indexRange', mpd.parseRange_, this.indexRange);

  // Parse simple child elements.
  this.representationIndex =
      mpd.parseChild_(this, elem, mpd.RepresentationIndex) ||
      this.representationIndex;

  this.initialization =
      mpd.parseChild_(this, elem, mpd.Initialization) ||
      this.initialization;
};


/**
 * Parses a "RepresentationIndex" tag.
 * @param {!shaka.dash.mpd.SegmentBase} parent The parent SegmentBase.
 * @param {!Node} elem The RepresentationIndex XML element.
 */
shaka.dash.mpd.RepresentationIndex.prototype.parse =
    function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  var url = mpd.parseAttr_(elem, 'sourceURL', mpd.parseString_);
  this.url = mpd.resolveUrl_(parent.baseUrl, url);

  this.range = mpd.parseAttr_(
      elem, 'range', mpd.parseRange_, mpd.clone_(parent.indexRange));
};


/**
 * Parses an "Initialization" tag.
 * @param {!shaka.dash.mpd.SegmentBase|!shaka.dash.mpd.SegmentList} parent
 *     The parent SegmentBase or parent SegmentList.
 * @param {!Node} elem The Initialization XML element.
 */
shaka.dash.mpd.Initialization.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  var url = mpd.parseAttr_(elem, 'sourceURL', mpd.parseString_);
  this.url = mpd.resolveUrl_(parent.baseUrl, url);

  this.range = mpd.parseAttr_(elem, 'range', mpd.parseRange_);
};


/**
 * Parses a "SegmentList" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The SegmentList XML element.
 */
shaka.dash.mpd.SegmentList.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  this.baseUrl = parent.baseUrl || this.baseUrl;

  // Parse attributes.
  this.timescale = mpd.parseAttr_(
      elem, 'timescale', mpd.parsePositiveInt_, this.timescale);

  this.presentationTimeOffset =
      mpd.parseAttr_(elem,
                     'presentationTimeOffset',
                     mpd.parseNonNegativeInt_,
                     this.presentationTimeOffset);

  this.segmentDuration = mpd.parseAttr_(
      elem, 'duration', mpd.parsePositiveInt_, this.segmentDuration);

  var startNumber = mpd.parseAttr_(
      elem, 'startNumber', mpd.parseNonNegativeInt_, this.startNumber);
  if (startNumber != null) {
    if (startNumber > 0) {
      this.startNumber = startNumber;
    } else {
      shaka.log.warning(
          'SegmentList specifies @startNumber=0.',
          'Please consider using one-based segment numbers.');
      this.startNumber = 1;
    }
  }

  // Parse simple children
  this.initialization =
      mpd.parseChild_(this, elem, mpd.Initialization) ||
      this.initialization;

  var temp = mpd.parseChildren_(this, elem, mpd.SegmentUrl);
  this.segmentUrls = temp && temp.length > 0 ? temp : this.segmentUrls;

  // Parse hierarchical children.
  this.timeline =
      mpd.parseChild_(this, elem, mpd.SegmentTimeline) ||
      this.timeline;
};


/**
 * Parses a "SegmentUrl" tag.
 * @param {!shaka.dash.mpd.SegmentList} parent The parent SegmentList.
 * @param {!Node} elem The SegmentUrl XML element.
 */
shaka.dash.mpd.SegmentUrl.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  var url = mpd.parseAttr_(elem, 'media', mpd.parseString_);
  this.mediaUrl = mpd.resolveUrl_(parent.baseUrl, url);

  this.mediaRange = mpd.parseAttr_(elem, 'mediaRange', mpd.parseRange_);
};


/**
 * Parses a "SegmentTemplate" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The SegmentTemplate XML element.
 */
shaka.dash.mpd.SegmentTemplate.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.timescale = mpd.parseAttr_(
      elem, 'timescale', mpd.parsePositiveInt_, this.timescale);

  this.presentationTimeOffset =
      mpd.parseAttr_(elem,
                     'presentationTimeOffset',
                     mpd.parseNonNegativeInt_,
                     this.presentationTimeOffset);

  this.segmentDuration = mpd.parseAttr_(
      elem, 'duration', mpd.parsePositiveInt_, this.segmentDuration);

  var startNumber = mpd.parseAttr_(
      elem, 'startNumber', mpd.parseNonNegativeInt_, this.startNumber);
  if (startNumber != null) {
    if (startNumber > 0) {
      this.startNumber = startNumber;
    } else {
      shaka.log.warning(
          'SegmentTemplate specifies @startNumber=0.',
          'Please consider using one-based segment numbers.');
      this.startNumber = 1;
      this.zeroBasedSegmentNumbers = true;
    }
  }

  this.mediaUrlTemplate = mpd.parseAttr_(
      elem, 'media', mpd.parseString_, this.mediaUrlTemplate);

  this.indexUrlTemplate = mpd.parseAttr_(
      elem, 'index', mpd.parseString_, this.indexUrlTemplate);

  this.initializationUrlTemplate = mpd.parseAttr_(
      elem, 'initialization', mpd.parseString_, this.initializationUrlTemplate);

  // Parse hierarchical children.
  this.timeline =
      mpd.parseChild_(this, elem, mpd.SegmentTimeline) ||
      this.timeline;
};


/**
 * Parses a "SegmentTimeline" tag.
 * @param {!shaka.dash.mpd.SegmentTemplate} parent The parent SegmentTemplate.
 * @param {!Node} elem The SegmentTimeline XML element.
 */
shaka.dash.mpd.SegmentTimeline.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  this.timePoints = mpd.parseChildren_(this, elem, mpd.SegmentTimePoint);
};


/**
 * Parses an "S" tag.
 * @param {!shaka.dash.mpd.SegmentTimeline} parent The parent SegmentTimeline.
 * @param {!Node} elem The SegmentTimePoint XML element.
 */
shaka.dash.mpd.SegmentTimePoint.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.startTime = mpd.parseAttr_(elem, 't', mpd.parseNonNegativeInt_);
  this.duration = mpd.parseAttr_(elem, 'd', mpd.parseNonNegativeInt_);
  this.repeat = mpd.parseAttr_(elem, 'r', mpd.parseInt_);
};


// MPD parsing utility functions ----------------------------------------------


/**
 * Resolves each URL of |url| relative to the first URL of |parentUrl|.
 *
 * @param {Array.<!goog.Uri>} parentUrl
 * @param {Array.<!shaka.dash.mpd.BaseUrl>} url
 * @return {Array.<!goog.Uri>}
 * @private
 */
shaka.dash.mpd.resolveUrlArray_ = function(parentUrl, url) {
  if (!url || url.length === 0) {
    return parentUrl;
  }

  /** @type {!Array.<!goog.Uri>} */
  var ret = [];
  for (var i = 0; i < url.length; i++) {
    var current = url[i].url;
    if (parentUrl == null || parentUrl.length === 0) {
      ret.push(new goog.Uri(current));
    } else {
      var temp = shaka.dash.mpd.resolveUrl_(parentUrl.slice(0, 1), current);
      ret.push(temp[0]);
    }
  }

  return ret;
};


/**
 * Resolves |urlString| relative to |baseUrl|.
 * @param {Array.<!goog.Uri>} parentUrl
 * @param {?string} urlString
 * @return {Array.<!goog.Uri>}
 * @private
 */
shaka.dash.mpd.resolveUrl_ = function(parentUrl, urlString) {
  if (!urlString) {
    return parentUrl;
  }

  var url = new goog.Uri(urlString);
  if (parentUrl) {
    return parentUrl.map(function(a) { return a.resolve(url); });
  } else {
    return [url];
  }
};


/**
 * Parses a child XML element and merges it into an existing MPD node object.
 * @param {*} parent The parent MPD node object.
 * @param {!Node} elem The parent XML element.
 * @param {!T} original The existing MPD node object.
 * @return {!T} The merged MPD node object. If a child XML element cannot be
 *     parsed (see parseChild_) then the merged MPD node object is identical
 *     to |original|, although it is not the same object.
 * @template T
 * @private
 */
shaka.dash.mpd.mergeChild_ = function(parent, elem, original) {
  var mpd = shaka.dash.mpd;

  var merged = mpd.clone_(original);
  shaka.asserts.assert(merged);

  var childElement = mpd.findChild_(elem, original.constructor.TAG_NAME);
  if (childElement) {
    merged.parse(parent, childElement);
  }

  return merged;
};


/**
 * Parses a child XML element.
 * @param {*} parent The parent MPD node object.
 * @param {!Node} elem The parent XML element.
 * @param {function(new:T)} constructor The constructor of the parsed
 *     child XML element. The constructor must define the attribute "TAG_NAME".
 * @return {T} The parsed child XML element on success, or null if a child
 *     XML element does not exist with the given tag name OR if there exists
 *     more than one child XML element with the given tag name OR if the child
 *     XML element could not be parsed.
 * @template T
 * @private
 */
shaka.dash.mpd.parseChild_ = function(parent, elem, constructor) {
  var mpd = shaka.dash.mpd;

  var parsedChild = null;

  var childElement = mpd.findChild_(elem, constructor.TAG_NAME);
  if (childElement) {
    parsedChild = new constructor();
    parsedChild.parse(parent, childElement);
  }

  return parsedChild;
};


/**
 * Finds a child XML element.
 * @param {!Node} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {Node} The child XML element, or null if a child XML element does
 *     not exist with the given tag name OR if there exists more than one
 *     child XML element with the given tag name.
 * @private
 */
shaka.dash.mpd.findChild_ = function(elem, name) {
  var childElement = null;

  for (var i = 0; i < elem.childNodes.length; i++) {
    if (elem.childNodes[i].tagName != name) {
      continue;
    }
    if (childElement) {
      return null;
    }
    childElement = elem.childNodes[i];
  }

  return childElement;
};


/**
 * Parses an array of child XML elements.
 * @param {*} parent The parsed parent object.
 * @param {!Node} elem The parent XML element.
 * @param {function(new:T)} constructor The constructor of each parsed child
 *     XML element. The constructor must define the attribute "TAG_NAME".
 * @return {!Array.<!T>} The parsed child XML elements.
 * @template T
 * @private
 */
shaka.dash.mpd.parseChildren_ = function(parent, elem, constructor) {
  var parsedChildren = [];

  for (var i = 0; i < elem.childNodes.length; i++) {
    if (elem.childNodes[i].tagName != constructor.TAG_NAME) {
      continue;
    }
    var parsedChild = new constructor();
    parsedChild.parse.call(parsedChild, parent, elem.childNodes[i]);
    parsedChildren.push(parsedChild);
  }

  return parsedChildren;
};


/**
 * Gets the text contents of a node.
 * @param {!Node} elem The XML element.
 * @return {?string} The text contents, or null if there are none.
 * @private
 */
shaka.dash.mpd.getContents_ = function(elem) {
  var contents = elem.firstChild;
  if (contents.nodeType != Node.TEXT_NODE) {
    return null;
  }

  return contents.nodeValue;
};


/**
 * @param {Array.<T>} obj
 * @return {Array.<T>} A clone of |obj| if |obj| is non-null; otherwise,
 *     return null.
 * @private
 * @template T
 */
shaka.dash.mpd.cloneA_ = function(obj) {
  return obj ? obj.map(function(o) { return o.clone(); }) : null;
};


/**
 * @param {T} obj
 * @return {T} A clone of |obj| if |obj| is non-null; otherwise, return null.
 * @private
 * @template T
 */
shaka.dash.mpd.clone_ = function(obj) {
  return obj ? obj.clone() : null;
};


/**
 * Parses an attribute by its name.
 * @param {!Node} elem The XML element.
 * @param {string} name The attribute name.
 * @param {function(string): (T|null)} parseFunction A function that parses
 *     the attribute.
 * @param {(T|null)=} opt_defaultValue The attribute's default value, if not
 *     specified, the attibute's default value is null.
 * @return {(T|null)} The parsed attribute on success, or the attribute's
 *     default value if the attribute does not exist or could not be parsed.
 * @template T
 * @private
 */
shaka.dash.mpd.parseAttr_ = function(
    elem, name, parseFunction, opt_defaultValue) {
  var parsedValue = parseFunction(elem.getAttribute(name));
  if (parsedValue != null) {
    return parsedValue;
  } else {
    return opt_defaultValue !== undefined ? opt_defaultValue : null;
  }
};


/**
 * Parses an XML date string.
 * @param {string} dateString
 * @return {?number}
 * @private
 */
shaka.dash.mpd.parseDate_ = function(dateString) {
  if (!dateString) {
    return null;
  }

  var result = Date.parse(dateString);
  return (!isNaN(result) ? Math.floor(result / 1000.0) : null);
};


/**
 * Parses an XML duration string.
 * Negative values are not supported. Years and months are treated as exactly
 * 365 and 30 days respectively.
 * @param {string} durationString The duration string, e.g., "PT1H3M43.2S",
 *     which means 1 hour, 3 minutes, and 43.2 seconds.
 * @return {?number} The parsed duration in seconds, or null if the duration
 *     string could not be parsed.
 * @see http://www.datypic.com/sc/xsd/t-xsd_duration.html
 * @private
 */
shaka.dash.mpd.parseDuration_ = function(durationString) {
  if (!durationString) {
    return null;
  }

  var regexpString = '^P(?:([0-9]*)Y)?(?:([0-9]*)M)?(?:([0-9]*)D)?' +
                     '(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$';
  var matches = new RegExp(regexpString).exec(durationString);

  if (!matches) {
    shaka.log.warning('Invalid duration string:', durationString);
    return null;
  }

  var duration = 0;

  // Assume a year always has 365 days.
  var years = shaka.dash.mpd.parseNonNegativeInt_(matches[1]);
  if (years) {
    duration += (60 * 60 * 24 * 365) * years;
  }

  // Assume a month is 30 days.
  var months = shaka.dash.mpd.parseNonNegativeInt_(matches[2]);
  if (months) {
    duration += (60 * 60 * 24 * 30) * months;
  }

  var days = shaka.dash.mpd.parseNonNegativeInt_(matches[3]);
  if (days) {
    duration += (60 * 60 * 24) * days;
  }

  var hours = shaka.dash.mpd.parseNonNegativeInt_(matches[4]);
  if (hours) {
    duration += (60 * 60) * hours;
  }

  var minutes = shaka.dash.mpd.parseNonNegativeInt_(matches[5]);
  if (minutes) {
    duration += 60 * minutes;
  }

  var seconds = shaka.dash.mpd.parseFloat_(matches[6]);
  if (seconds) {
    duration += seconds;
  }

  return duration;
};


/**
 * Parses a range string.
 * @param {string} rangeString The range string, e.g., "101-9213"
 * @return {shaka.dash.mpd.Range} The parsed range, or null if the range string
 *     could not be parsed.
 * @private
 */
shaka.dash.mpd.parseRange_ = function(rangeString) {
  var matches = /([0-9]+)-([0-9]+)/.exec(rangeString);

  if (!matches) {
    return null;
  }

  var begin = shaka.dash.mpd.parseNonNegativeInt_(matches[1]);
  if (begin == null) {
    return null;
  }

  var end = shaka.dash.mpd.parseNonNegativeInt_(matches[2]);
  if (end == null) {
    return null;
  }

  return new shaka.dash.mpd.Range(begin, end);
};


/**
 * Parses an integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed integer on success; otherwise, return null.
 * @private
 */
shaka.dash.mpd.parseInt_ = function(intString) {
  var result = window.parseInt(intString, 10);
  return (!isNaN(result) ? result : null);
};


/**
 * Parses a positive integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed positive integer on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.mpd.parsePositiveInt_ = function(intString) {
  var result = window.parseInt(intString, 10);
  return (result > 0 ? result : null);
};


/**
 * Parses a non-negative integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed non-negative integer on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.mpd.parseNonNegativeInt_ = function(intString) {
  var result = window.parseInt(intString, 10);
  return (result >= 0 ? result : null);
};


/**
 * Parses a floating point number.
 * @param {string} floatString The floating point number string.
 * @return {?number} The parsed floating point number, or null if the floating
 *     point number string could not be parsed.
 * @private
 */
shaka.dash.mpd.parseFloat_ = function(floatString) {
  var result = window.parseFloat(floatString);
  return (!isNaN(result) ? result : null);
};


/**
 * A misnomer.  Does no parsing, just returns the input string as-is.
 * @param {string} inputString The inputString.
 * @return {?string} The "parsed" string.  The type is specified as nullable
 *     only to fit into the parseAttr_() template, but null will never be
 *     returned.
 * @private
 */
shaka.dash.mpd.parseString_ = function(inputString) {
  return inputString;
};

