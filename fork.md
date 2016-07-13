# Vimond customizations

### Summary

* DASH manifest text preprocessor
* Extraction and application of missing presentationTimeOffset
* Exposal of start date/time from where the stream positions offsets are computed
* Dynamically updating exposed live state, relevant after live stream shutdown during time shifted playback
* Shutdown of live streams upon HTTP errors
* suggestedPresentationDelay attribute for live streams also respected in segment timeline manifests.
* Demo page convenience additions

### Build scripts for including customizations

Variations on build.sh and all.sh are added, [build-vup-debug](https://github.com/vimond/shaka-player/blob/manifestmodifier/build/build-vup-debug.sh),  [lib-vup-debug.sh](https://github.com/vimond/shaka-player/blob/manifestmodifier/build/lib-vup-debug.sh), and [all-vup-debug.sh](https://github.com/vimond/shaka-player/blob/manifestmodifier/build/all-vup-debug.sh).

For including the Vimond extensions, use 
```Shell
./build/all-vup-debug.sh
```

### DASH manifest preprocessor

The Vimond DASH preprocessor can be activated by passing a [`shaka.vimond.player.ModifyableDashVideoSource`](https://github.com/vimond/shaka-player/blob/manifestmodifier/vimond/modifyable_dash_video_source.js) [sic] instance in the Shaka player's `load()` method.

This is an extension of the standard `shaka.player.DashVideoSource`, and its constructor takes two additional optional arguments, the latter of type [`shaka.vimond.dash.ManifestModificationSetup`](https://github.com/vimond/shaka-player/blob/manifestmodifier/vimond/manifest_modification_setup.js). Passing an instance of this to the constructor, can cover one or both of the preprocessing options discussed below.

#### Textual manipulation of manifest XML source

This is a regex based manipulation of the DASH XML manifest after download, and before parsing. It can be used to correct data errors output from  streaming and encoder setups being misconfigured or not mature enough for current DASH clients.

One or more manipulations can be added by specifying an array in the ManifestModificationSetup property `replacements`. The item(s) should align to the type [shaka.vimond.dash.ReplacementRule](https://github.com/vimond/shaka-player/blob/manifestmodifier/vimond/replacement_rule.js), with this structure:


```Javascript
{
  match: /(.*)/g,
  replacement: 'This replaces everything'
}
```

Or, for the configuration textarea, parsed as JSON (see bottom of this doc):

```JSON
{
  "match": "(.*)",
  "options": "g",
  "replacement": "This replaces everything"
}
```

Several items will be run in order. Regex manipulation of XML isn't really recommended. The replacements and regular expressions need to be crafted so that the XML stays valid.

Full example:

```Javascript
var manifestModificationSetup = {
  replacements: [{
    match: /(.*)/g,
    replacement: 'This replaces everything'
  }]
};
```

#### Extraction and application of missing presentationTimeOffset

When soft-cropping a source stream, or creating a subclip, some streaming engines, like Unified Streaming Platform, doesn't generate a correct DASH manifest, where the available timeline or seekable period is cropped to the subclip's length.

This is due to not adding a `presentationTimeOffset` to the `<SegmentTemplate>` or similar elements.

The correct value for this attribute can be extracted from the segment timeline start time offset. The Vimond manifest modifier can apply this by specifying the `presentationTimeOffsetFixPolicy` property of the ManifestModificationSetup, with either of these three strings: `lowest`, `highest`, `firstVideo`.

Due to different segment durations, the start offsets for audio and video don't align. `lowest` sets the presentationTimeOffset to the lowest value among audio and video, `highest` finds the highest of the two possible values, and `firstVideo` always selects the video offset. The latter seems to work best.

### Exposing a stream position's start date/time

Live stream positions are reported as a number of seconds relative to a starting point. This isn't necessarily the start of the seekable range, due to different DVR characteristics. 

Instead they are offset to the DASH manifest's `availabilityStartTime` attribute. 

In order to be able to map stream positions to dates and wall clock times, the `availabilityStartTime` date/time is exposed through a callback function.

The [`shaka.vimond.player.ModifyableDashVideoSource`](https://github.com/vimond/shaka-player/blob/manifestmodifier/vimond/modifyable_dash_video_source.js) constructor optionally takes a callback function as its second-to-last argument.

This callback is expected to have one parameter, where the `availabilityStartTime` will be passed as a number of seconds since Jan 1 1970, when a live (dynamic) manifest is loaded initially.

A wall clock time can then be computed as `new Date((availabilityStartTime + videoElement.currentTime * 1000)`.

### Reflecting a stream's live state changing to on demand when a live encoding is ended

The exposed API's `isLive()` property [will change from true to false when the live stream is shut down](https://github.com/vimond/shaka-player/commit/7fd93b90d387e0ccfba1fbfe28df489fd1d56ed1). This is relevant for time shifted viewing, where playback continues after the stutdown. Earlier it kept the initial value throughout the playback, i.e. `true`.

When a live stream is stopped, i.e. there are no new content added to the live edge, the stream nature is practically the same as for on demand streams. When watching at the live edge, the playback will stop almost immediately, and this change has no effect.

If a viewer is e.g. five minutes behind the live edge, then there will five more minutes to watch before reaching the end. In this period, it is more optimal to present the player controls as for on demand:

* A "go to live" button no longer makes sense, because that would seek to the end, and playback would stop.
* The cursor on the timeline will move to the right edge, instead of asymptotically approaching it.

The `isLive()` transition from `true` to `false` enables integrators to make their UI reflect the changed nature.

### Handle 403s or 404s as "end of live stream"

Activate by configuration: `player.configure({'enableShutdownOnLiveError': true})`

### Exposed log levels for external configuration

Otherwise `shaka.log.Level.DEBUG` etc. became uglified during build.

### Demo page additions

* Configuration text area that can parse a JSON string and apply it as the ManifestModificationSetup parameter mentioned above.
* Last used stream and license URLs are remembered.