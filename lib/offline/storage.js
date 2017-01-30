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

goog.provide('shaka.offline.Storage');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.offline.DBEngine');
goog.require('shaka.offline.DownloadManager');
goog.require('shaka.offline.OfflineManifestParser');
goog.require('shaka.offline.OfflineUtils');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.StreamUtils');



/**
 * This manages persistent offline data including storage, listing, and deleting
 * stored manifests.  Playback of offline manifests are done using Player
 * using the special URI (e.g. 'offline:12').
 *
 * First, check support() to see if offline is supported by the platform.
 * Second, configure() the storage object with callbacks to your application.
 * Third, call store(), remove(), or list() as needed.
 * When done, call destroy().
 *
 * @param {shaka.Player} player
 *   The player instance to pull configuration data from.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.offline.Storage = function(player) {
  /** @private {shaka.offline.DBEngine} */
  this.dbEngine_ = new shaka.offline.DBEngine();

  /** @private {shaka.Player} */
  this.player_ = player;

  /** @private {?shakaExtern.OfflineConfiguration} */
  this.config_ = this.defaultConfig_();

  /** @private {shaka.media.DrmEngine} */
  this.drmEngine_ = null;

  /** @private {boolean} */
  this.storeInProgress_ = false;

  /** @private {Array.<shakaExtern.Track>} */
  this.firstPeriodTracks_ = null;

  /**
   * The IDs of the segments that have been stored for an in-progress store().
   * This is used to cleanup in destroy().
   * @private {!Array.<number>}
   */
  this.inProgressSegmentIds_ = [];

  /** @private {number} */
  this.manifestId_ = -1;

  /** @private {number} */
  this.duration_ = 0;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  var netEngine = player.getNetworkingEngine();
  goog.asserts.assert(netEngine, 'Player must not be destroyed');

  /** @private {shaka.offline.DownloadManager} */
  this.downloadManager_ = new shaka.offline.DownloadManager(
      netEngine, player.getConfiguration().streaming.retryParameters,
      this.config_);
};


/**
 * Gets whether offline storage is supported.  Returns true if offline storage
 * is supported for clear content.  Support for offline storage of encrypted
 * content will not be determined until storage is attempted.
 *
 * @return {boolean}
 * @export
 */
shaka.offline.Storage.support = function() {
  return shaka.offline.DBEngine.isSupported();
};


/**
 * Sets the DBEngine instance to use.  This is used for testing.
 *
 * @param {!shaka.offline.DBEngine} engine
 */
shaka.offline.Storage.prototype.setDbEngine = function(engine) {
  goog.asserts.assert(!this.dbEngine_.initialized(),
                      'Should not be initialized yet');
  this.dbEngine_ = engine;
};


/**
 * @override
 * @export
 */
shaka.offline.Storage.prototype.destroy = function() {
  var segments = this.inProgressSegmentIds_;
  var dbEngine = this.dbEngine_;
  // Destroy the download manager first to ensure segments are not added while
  // we delete old ones.
  var ret = !this.downloadManager_ ?
      Promise.resolve() :
      this.downloadManager_.destroy()
          .catch(function() {})
          .then(function() {
            return Promise.all(segments.map(function(id) {
              return dbEngine.remove('segment', id);
            }));
          })
          .then(function() { return dbEngine.destroy(); });

  this.dbEngine_ = null;
  this.downloadManager_ = null;
  this.player_ = null;
  this.config_ = null;
  return ret;
};


/**
 * Sets configuration values for Storage.  This is not associated with
 * Player.configure and will not change Player.
 *
 * There are two important callbacks configured here: one for download progress,
 * and one to decide which tracks to store.
 *
 * The default track selection callback will store the largest SD video track.
 * Provide your own callback to choose the tracks you want to store.
 *
 * @param {shakaExtern.OfflineConfiguration} config
 * @export
 */
shaka.offline.Storage.prototype.configure = function(config) {
  goog.asserts.assert(this.config_, 'Must not be destroyed');
  shaka.util.ConfigUtils.mergeConfigObjects(
      this.config_, config, this.defaultConfig_(), {}, '');
};


/**
 * Stores the given manifest.  If the content is encrypted, and encrypted
 * content cannot be stored on this platform, the Promise will be rejected with
 * error code 6001, REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE.
 *
 * @param {string} manifestUri The URI of the manifest to store.
 * @param {!Object} appMetadata An arbitrary object from the application that
 *   will be stored along-side the offline content.  Use this for any
 *   application-specific metadata you need associated with the stored content.
 *   For details on the data types that can be stored here, please refer to
 *   https://goo.gl/h62coS
 * @param {!shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<shakaExtern.StoredContent>}  A Promise to a structure
 *   representing what was stored.  The "offlineUri" member is the URI that
 *   should be given to Player.load() to play this piece of content offline.
 *   The "appMetadata" member is the appMetadata argument you passed to store().
 * @export
 */
shaka.offline.Storage.prototype.store = function(
    manifestUri, appMetadata, opt_manifestParserFactory) {
  if (this.storeInProgress_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORE_ALREADY_IN_PROGRESS));
  }
  this.storeInProgress_ = true;

  /** @type {shakaExtern.ManifestDB} */
  var manifestDb;

  var error = null;
  var onError = function(e) { error = e; };
  return this.initIfNeeded_()
      .then(function() {
        this.checkDestroyed_();
        return this.loadInternal(
            manifestUri, onError, opt_manifestParserFactory);
      }.bind(this)).then((
          /**
           * @param {{manifest: shakaExtern.Manifest,
           *          drmEngine: !shaka.media.DrmEngine}} data
           * @return {!Promise}
           */
          function(data) {
            this.checkDestroyed_();
            this.manifest_ = data.manifest;
            this.drmEngine_ = data.drmEngine;

            if (this.manifest_.presentationTimeline.isLive() ||
                this.manifest_.presentationTimeline.isInProgress()) {
              throw new shaka.util.Error(
                  shaka.util.Error.Category.STORAGE,
                  shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE, manifestUri);
            }

            // Re-filter now that DrmEngine is initialized.
            this.manifest_.periods.forEach(this.filterPeriod_.bind(this));

            this.manifestId_ = this.dbEngine_.reserveId('manifest');
            this.duration_ = 0;
            manifestDb = this.createOfflineManifest_(manifestUri, appMetadata);
            return this.downloadManager_.download(manifestDb);
          })
      .bind(this))
      .then(function() {
        this.checkDestroyed_();
        // Throw any errors from the manifest parser or DrmEngine.
        if (error)
          throw error;

        return this.dbEngine_.insert('manifest', manifestDb);
      }.bind(this))
      .then(function() {
        return this.cleanup_();
      }.bind(this))
      .then(function() {
        return shaka.offline.OfflineUtils.getStoredContent(manifestDb);
      }.bind(this))
      .catch(function(err) {
        var Functional = shaka.util.Functional;
        return this.cleanup_().catch(Functional.noop).then(function() {
          throw err;
        });
      }.bind(this));
};


/**
 * Removes the given stored content.
 *
 * @param {shakaExtern.StoredContent} content
 * @return {!Promise}
 * @export
 */
shaka.offline.Storage.prototype.remove = function(content) {
  var uri = content.offlineUri;
  var parts = /^offline:([0-9]+)$/.exec(uri);
  if (!parts) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI, uri));
  }

  var error = null;
  var onError = function(e) {
    // Ignore errors if the session was already removed.
    if (e.code != shaka.util.Error.Code.OFFLINE_SESSION_REMOVED)
      error = e;
  };

  /** @type {shakaExtern.ManifestDB} */
  var manifestDb;
  /** @type {!shaka.media.DrmEngine} */
  var drmEngine;
  var manifestId = Number(parts[1]);
  return this.initIfNeeded_().then(function() {
    this.checkDestroyed_();
    return this.dbEngine_.get('manifest', manifestId);
  }.bind(this)).then((
      /**
       * @param {?shakaExtern.ManifestDB} data
       * @return {!Promise}
       */
      function(data) {
        this.checkDestroyed_();
        if (!data) {
          throw new shaka.util.Error(
              shaka.util.Error.Category.STORAGE,
              shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND, uri);
        }
        manifestDb = data;
        var manifest =
            shaka.offline.OfflineManifestParser.reconstructManifest(manifestDb);
        var netEngine = this.player_.getNetworkingEngine();
        goog.asserts.assert(netEngine, 'Player must not be destroyed');
        drmEngine =
            new shaka.media.DrmEngine(netEngine, onError, function() {});
        drmEngine.configure(this.player_.getConfiguration().drm);
        return drmEngine.init(manifest, true /* isOffline */);
      })
  .bind(this)).then(function() {
    return drmEngine.removeSessions(manifestDb.sessionIds);
  }.bind(this)).then(function() {
    return drmEngine.destroy();
  }.bind(this)).then(function() {
    this.checkDestroyed_();
    if (error) throw error;
    var Functional = shaka.util.Functional;
    // Get every segment for every stream in the manifest.
    /** @type {!Array.<number>} */
    var segments = manifestDb.periods.map(function(period) {
      return period.streams.map(function(stream) {
        var segments = stream.segments.map(function(segment) {
          var parts = /^offline:[0-9]+\/[0-9]+\/([0-9]+)$/.exec(segment.uri);
          goog.asserts.assert(parts, 'Invalid offline URI');
          return Number(parts[1]);
        });
        if (stream.initSegmentUri) {
          var parts = /^offline:[0-9]+\/[0-9]+\/([0-9]+)$/.exec(
              stream.initSegmentUri);
          goog.asserts.assert(parts, 'Invalid offline URI');
          segments.push(Number(parts[1]));
        }
        return segments;
      }).reduce(Functional.collapseArrays, []);
    }).reduce(Functional.collapseArrays, []);

    // Delete all the segments.
    var deleteCount = 0;
    var segmentCount = segments.length;
    var callback = this.config_.progressCallback;
    return this.dbEngine_.removeWhere('segment', function(segment) {
      var i = segments.indexOf(segment.key);
      if (i >= 0) {
        callback(content, deleteCount / segmentCount);
        deleteCount++;
      }
      return i >= 0;
    }.bind(this));
  }.bind(this)).then(function() {
    this.checkDestroyed_();
    this.config_.progressCallback(content, 1);
    return this.dbEngine_.remove('manifest', manifestId);
  }.bind(this));
};


/**
 * Lists all the stored content available.
 *
 * @return {!Promise.<!Array.<shakaExtern.StoredContent>>}  A Promise to an
 *   array of structures representing all stored content.  The "offlineUri"
 *   member of the structure is the URI that should be given to Player.load()
 *   to play this piece of content offline.  The "appMetadata" member is the
 *   appMetadata argument you passed to store().
 * @export
 */
shaka.offline.Storage.prototype.list = function() {
  /** @type {!Array.<shakaExtern.StoredContent>} */
  var storedContents = [];
  return this.initIfNeeded_()
      .then(function() {
        this.checkDestroyed_();
        return this.dbEngine_.forEach(
            'manifest', function(/** shakaExtern.ManifestDB */ manifest) {
              storedContents.push(
                  shaka.offline.OfflineUtils.getStoredContent(manifest));
            });
      }.bind(this))
      .then(function() { return storedContents; });
};


/**
 * Loads the given manifest, parses it, and constructs the DrmEngine.  This
 * stops the manifest parser.  This may be replaced by tests.
 *
 * @param {string} manifestUri
 * @param {function(*)} onError
 * @param {!shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<{
 *   manifest: shakaExtern.Manifest,
 *   drmEngine: !shaka.media.DrmEngine
 * }>}
 */
shaka.offline.Storage.prototype.loadInternal = function(
    manifestUri, onError, opt_manifestParserFactory) {

  var netEngine = /** @type {!shaka.net.NetworkingEngine} */ (
      this.player_.getNetworkingEngine());
  var config = this.player_.getConfiguration();

  /** @type {shakaExtern.Manifest} */
  var manifest;
  /** @type {!shaka.media.DrmEngine} */
  var drmEngine;
  /** @type {!shakaExtern.ManifestParser} */
  var manifestParser;

  var onKeyStatusChange = function() {};
  return shaka.media.ManifestParser
      .getFactory(
          manifestUri, netEngine, config.manifest.retryParameters,
          opt_manifestParserFactory)
      .then(function(factory) {
        this.checkDestroyed_();
        manifestParser = new factory();
        manifestParser.configure(config.manifest);
        return manifestParser.start(
            manifestUri, netEngine, this.filterPeriod_.bind(this), onError);
      }.bind(this))
      .then(function(data) {
        this.checkDestroyed_();
        manifest = data;
        drmEngine =
            new shaka.media.DrmEngine(netEngine, onError, onKeyStatusChange);
        drmEngine.configure(config.drm);
        return drmEngine.init(manifest, true /* isOffline */);
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return this.createSegmentIndex_(manifest);
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return drmEngine.createOrLoad();
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return manifestParser.stop();
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return {manifest: manifest, drmEngine: drmEngine};
      }.bind(this))
      .catch(function(error) {
        if (manifestParser)
          return manifestParser.stop().then(function() { throw error; });
        else
          throw error;
      });
};


/**
 * The default track selection function.
 *
 * @param {!Array.<shakaExtern.Track>} tracks
 * @return {!Array.<shakaExtern.Track>}
 * @private
 */
shaka.offline.Storage.prototype.defaultTrackSelect_ = function(tracks) {
  var LanguageUtils = shaka.util.LanguageUtils;

  var selectedTracks = [];

  // Select variants with best language match.
  var audioLangPref = LanguageUtils.normalize(
      this.player_.getConfiguration().preferredAudioLanguage);
  var matchTypes = [
    LanguageUtils.MatchType.EXACT,
    LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
    LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY
  ];
  var allVariantTracks =
      tracks.filter(function(t) { return t.type == 'variant'; });
  // For each match type, get the tracks that match the audio preference for
  // that match type.
  var tracksByMatchType = matchTypes.map(function(match) {
    return allVariantTracks.filter(function(track) {
      var lang = LanguageUtils.normalize(track.language);
      return LanguageUtils.match(match, audioLangPref, lang);
    });
  });
  // Find the best match type that has any matches, defaulting to all tracks.
  var variantTracks = allVariantTracks;
  for (var i = 0; i < tracksByMatchType.length; i++) {
    if (tracksByMatchType[i].length) {
      variantTracks = tracksByMatchType[i];
    }
  }

  // From previously selected variants, choose the highest-res SD ones
  // (height <= 480).
  var tracksByHeight = variantTracks.filter(function(t) {
    return t.height && t.height <= 480;
  });

  // If variants don't have video or no video with height <= 480 was
  // found, proceed with the previously selected tracks.
  if (tracksByHeight.length) {
    tracksByHeight.sort(function(a, b) { return b.height - a.height; });
    tracksByHeight.filter(function(t) {
      return t.height == tracksByHeight[0].height;
    });
    variantTracks = tracksByHeight;
  }

  variantTracks.sort(function(a, b) { return a.bandwidth - b.bandwidth; });

  // From previously selected variants, select the middle bandwidth one.
  if (variantTracks.length)
    selectedTracks.push(variantTracks[Math.floor(variantTracks.length / 2)]);

  // Select all text tracks with any text pref language match.
  var textLangPref = LanguageUtils.normalize(
      this.player_.getConfiguration().preferredTextLanguage);
  var matchesTextPref = LanguageUtils.match.bind(
      null, LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY, textLangPref);
  selectedTracks.push.apply(selectedTracks, tracks.filter(function(t) {
    var language = LanguageUtils.normalize(t.language);
    return t.type == 'text' && matchesTextPref(language);
  }));

  return selectedTracks;
};


/**
 * @return {shakaExtern.OfflineConfiguration}
 * @private
 */
shaka.offline.Storage.prototype.defaultConfig_ = function() {
  return {
    trackSelectionCallback: this.defaultTrackSelect_.bind(this),
    progressCallback: function(storedContent, percent) {
      // Reference arguments to keep closure from removing it.
      // If the argument is removed, it breaks our function length check
      // in mergeConfigObjects_().
      // NOTE: Chrome App Content Security Policy prohibits usage of new
      // Function().
      if (storedContent || percent) return null;
    }
  };
};


/**
 * Initializes the DBEngine if it is not already.
 *
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.initIfNeeded_ = function() {
  var scheme = shaka.offline.OfflineUtils.DB_SCHEME;
  return this.dbEngine_.initialized() ? Promise.resolve() :
                                        this.dbEngine_.init(scheme);
};


/**
 * @param {shakaExtern.Period} period
 * @private
 */
shaka.offline.Storage.prototype.filterPeriod_ = function(period) {
  var StreamUtils = shaka.util.StreamUtils;
  var activeStreams = {};
  if (this.firstPeriodTracks_) {
    var variantTracks = this.firstPeriodTracks_.filter(function(t) {
      return t.type == 'variant';
    });
    var variant = null;
    if (variantTracks.length)
      variant = StreamUtils.findVariantForTrack(period, variantTracks[0]);

    if (variant) {
      // Use the first variant as the container of "active streams".  This
      // is then used to filter out the streams that are not compatible with it.
      // This ensures that in multi-Period content, all Periods have streams
      // with compatible MIME types.
      if (variant.video) activeStreams['video'] = variant.video;
      if (variant.audio) activeStreams['audio'] = variant.audio;
    }
  }
  StreamUtils.filterPeriod(this.drmEngine_, activeStreams, period);
  StreamUtils.applyRestrictions(
      period, this.player_.getConfiguration().restrictions,
      /* maxHwRes */ { width: Infinity, height: Infinity });
};


/**
 * Cleans up the current store and destroys any objects.  This object is still
 * usable after this.
 *
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.cleanup_ = function() {
  var ret = this.drmEngine_ ? this.drmEngine_.destroy() : Promise.resolve();
  this.drmEngine_ = null;
  this.manifest_ = null;
  this.storeInProgress_ = false;
  this.firstPeriodTracks_ = null;
  this.inProgressSegmentIds_ = [];
  this.manifestId_ = -1;
  return ret;
};


/**
 * Calls createSegmentIndex for all streams in the manifest.
 *
 * @param {shakaExtern.Manifest} manifest
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.createSegmentIndex_ = function(manifest) {
  var Functional = shaka.util.Functional;
  var streams = manifest.periods
      .map(function(period) { return period.variants; })
      .reduce(Functional.collapseArrays, [])
      .map(function(variant) {
        var variantStreams = [];
        if (variant.audio) variantStreams.push(variant.audio);
        if (variant.video) variantStreams.push(variant.video);
        return variantStreams;
      })
      .reduce(Functional.collapseArrays, [])
      .filter(Functional.isNotDuplicate);

  var textStreams = manifest.periods
      .map(function(period) { return period.textStreams; })
      .reduce(Functional.collapseArrays, []);

  streams.push.apply(streams, textStreams);
  return Promise.all(
      streams.map(function(stream) { return stream.createSegmentIndex(); }));
};


/**
 * Creates an offline 'manifest' for the real manifest.  This does not store
 * the segments yet, only adds them to the download manager through
 * createPeriod_.
 *
 * @param {string} originalManifestUri
 * @param {!Object} appMetadata
 * @return {shakaExtern.ManifestDB}
 * @private
 */
shaka.offline.Storage.prototype.createOfflineManifest_ = function(
    originalManifestUri, appMetadata) {
  var periods = this.manifest_.periods.map(this.createPeriod_.bind(this));
  var drmInfo = this.drmEngine_.getDrmInfo();
  var sessions = this.drmEngine_.getSessionIds();
  if (drmInfo) {
    if (!sessions.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE, originalManifestUri);
    }
    // Don't store init data since we have stored sessions.
    drmInfo.initData = [];
  }

  return {
    key: this.manifestId_,
    originalManifestUri: originalManifestUri,
    duration: this.duration_,
    size: 0,
    periods: periods,
    sessionIds: sessions,
    drmInfo: drmInfo,
    appMetadata: appMetadata
  };
};


/**
 * Converts a manifest Period to a database Period.  This will use the current
 * configuration to get the tracks to use, then it will search each segment
 * index and add all the segments to the download manager through createStream_.
 *
 * @param {shakaExtern.Period} period
 * @return {shakaExtern.PeriodDB}
 * @private
 */
shaka.offline.Storage.prototype.createPeriod_ = function(period) {
  var StreamUtils = shaka.util.StreamUtils;

  var variantTracks = StreamUtils.getVariantTracks(period, null, null);
  var textTracks = StreamUtils.getTextTracks(period, null);
  var allTracks = variantTracks.concat(textTracks);

  var tracks = this.config_.trackSelectionCallback(allTracks);

  if (this.firstPeriodTracks_ == null) {
    this.firstPeriodTracks_ = tracks;
    // Now that the first tracks are chosen, filter again.  This ensures all
    // Periods have compatible content types.
    this.manifest_.periods.forEach(this.filterPeriod_.bind(this));
  }

  for (var i = tracks.length - 1; i > 0; --i) {
    var foundSimilarTracks = false;
    for (var j = i - 1; j >= 0; --j) {
      if (tracks[i].type == tracks[j].type &&
          tracks[i].kind == tracks[j].kind &&
          tracks[i].language == tracks[j].language) {
        shaka.log.warning(
            'Multiple tracks of the same type/kind/language given.');
        foundSimilarTracks = true;
        break;
      }
    }
    if (foundSimilarTracks) break;
  }

  var streams = [];

  for (var i = 0; i < variantTracks.length; i++) {
    var variant = StreamUtils.findVariantForTrack(period, variantTracks[i]);
    if (variant) {
      // Make a rough estimation of the streams' bandwidth so download manager
      // can track the progress of the download.
      var bandwidthEstimation;
      if (variant.audio) {
        // If the audio stream has already been added to the DB
        // as part of another variant, add the ID to the list.
        // Otherwise, add it to the DB.
        var stream = streams.filter(function(s) {
          return s.id == variant.audio.id;
        })[0];
        if (stream) {
          stream.variantIds.push(variant.id);
        } else {
          // If variant has both audio and video, roughly estimate them
          // both to be 1/2 of the variant's bandwidth.
          // If variant only has one stream, it's bandwidth equals to
          // the bandwidth of the variant.
          bandwidthEstimation =
              variant.video ? variant.bandwidth / 2 : variant.bandwidth;
          streams.push(this.createStream_(period,
                                          variant.audio,
                                          bandwidthEstimation,
                                          variant.id));
        }
      }
      if (variant.video) {
        var stream = streams.filter(function(s) {
          return s.id == variant.video.id;
        })[0];
        if (stream) {
          stream.variantIds.push(variant.id);
        } else {
          bandwidthEstimation =
              variant.audio ? variant.bandwidth / 2 : variant.bandwidth;
          streams.push(this.createStream_(period,
                                          variant.video,
                                          bandwidthEstimation,
                                          variant.id));
        }
      }
    } else {
      shaka.log.error('Unable to find the track with id "' +
                      variantTracks[i].id);
    }
  }

  var textStreams = textTracks.map(function(track) {
    var stream = StreamUtils.findTextStreamForTrack(period, track);
    goog.asserts.assert(stream, 'Could not find track with id ' + track.id);
    return this.createStream_(period, stream, 0 /* estimatedStreamBandwidth */);
  }.bind(this));

  streams.push.apply(streams, textStreams);

  return {
    startTime: period.startTime,
    streams: streams
  };
};


/**
 * Converts a manifest stream to a database stream.  This will search the
 * segment index and add all the segments to the download manager.
 *
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Stream} stream
 * @param {number} estimatedStreamBandwidth
 * @param {number=} opt_variantId
 * @return {shakaExtern.StreamDB}
 * @private
 */
shaka.offline.Storage.prototype.createStream_ = function(
    period, stream, estimatedStreamBandwidth, opt_variantId) {
  /** @type {!Array.<shakaExtern.SegmentDB>} */
  var segmentsDb = [];
  var startTime = this.manifest_.presentationTimeline.getEarliestStart();
  var endTime = startTime;
  var i = stream.findSegmentPosition(startTime);
  var ref = (i != null ? stream.getSegmentReference(i) : null);
  while (ref) {
    var id = this.dbEngine_.reserveId('segment');
    var bandwidthSize =
        (ref.endTime - ref.startTime) * estimatedStreamBandwidth / 8;
    this.downloadManager_.addSegment(
        stream.type, ref, bandwidthSize,
        function(id, pos, streamId, data) {
          /** @type {shakaExtern.SegmentDataDB} */
          var dataDb = {
            key: id,
            data: data,
            manifestKey: this.manifestId_,
            streamNumber: streamId,
            segmentNumber: pos
          };
          this.inProgressSegmentIds_.push(id);
          return this.dbEngine_.insert('segment', dataDb);
        }.bind(this, id, ref.position, stream.id));

    segmentsDb.push({
      startTime: ref.startTime,
      endTime: ref.endTime,
      uri: 'offline:' + this.manifestId_ + '/' + stream.id + '/' + id
    });

    endTime = ref.endTime + period.startTime;
    ref = stream.getSegmentReference(++i);
  }

  this.duration_ = Math.max(this.duration_, (endTime - startTime));
  var initUri = null;
  if (stream.initSegmentReference) {
    var id = this.dbEngine_.reserveId('segment');
    initUri = 'offline:' + this.manifestId_ + '/' + stream.id + '/' + id;
    this.downloadManager_.addSegment(stream.contentType,
        stream.initSegmentReference, 0,
        function(streamId, data) {
          /** @type {shakaExtern.SegmentDataDB} */
          var dataDb = {
            key: id,
            data: data,
            manifestKey: this.manifestId_,
            streamNumber: streamId,
            segmentNumber: -1
          };
          this.inProgressSegmentIds_.push(id);
          return this.dbEngine_.insert('segment', dataDb);
        }.bind(this, stream.id));
  }

  var variantIds = [];
  if (opt_variantId != null) variantIds.push(opt_variantId);

  return {
    id: stream.id,
    primary: stream.primary,
    presentationTimeOffset: stream.presentationTimeOffset || 0,
    contentType: stream.type,
    mimeType: stream.mimeType,
    codecs: stream.codecs,
    frameRate: stream.frameRate,
    kind: stream.kind,
    language: stream.language,
    width: stream.width || null,
    height: stream.height || null,
    initSegmentUri: initUri,
    encrypted: stream.encrypted,
    keyId: stream.keyId,
    segments: segmentsDb,
    variantIds: variantIds
  };
};


/**
 * Throws an error if the object is destroyed.
 * @private
 */
shaka.offline.Storage.prototype.checkDestroyed_ = function() {
  if (!this.player_) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.OPERATION_ABORTED);
  }
};


shaka.Player.registerSupportPlugin('offline', shaka.offline.Storage.support);
