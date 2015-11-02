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

goog.require('shaka.dash.mpd');

describe('mpd.BaseUrl', function() {
  it('resolves relative and absolute URLs at every level', function() {
    var source = [
      '<MPD>',
      '  <BaseURL>http://example.com/</BaseURL>',
      '  <Period>',
      '    <BaseURL>Period1/</BaseURL>',
      '    <AdaptationSet>',
      '      <BaseURL>AdaptationSet1/</BaseURL>',
      '      <Representation>',
      '        <BaseURL>Representation1</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period>',
      '    <BaseURL>Period2</BaseURL>',
      '    <AdaptationSet>',
      '      <BaseURL>AdaptationSet2</BaseURL>',
      '      <Representation>',
      '        <BaseURL>Representation2</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '  <Period>',
      '    <BaseURL>/Period3/</BaseURL>',
      '    <AdaptationSet>',
      '      <BaseURL>/AdaptationSet3</BaseURL>',
      '      <Representation>',
      '        <BaseURL>?Representation3</BaseURL>',
      '      </Representation>',
      '      <Representation>',
      '        <BaseURL>#Representation4</BaseURL>',
      '      </Representation>',
      '      <Representation>',
      '        <BaseURL>http://foo.bar/</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '    <AdaptationSet>',
      '      <BaseURL>http://foo.bar/multi/level</BaseURL>',
      '      <Representation>',
      '        <BaseURL>?Representation5</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, createFailover('').urls);
    expect(mpd).toBeTruthy();
    expect(mpd.baseUrl.toString()).toBe('http://example.com/');
    expect(mpd.periods.length).toBe(3);

    var p = mpd.periods;
    expect(p[0].baseUrl.toString()).
        toBe('http://example.com/Period1/');
    expect(p[0].adaptationSets[0].baseUrl.toString()).
        toBe('http://example.com/Period1/AdaptationSet1/');
    expect(p[0].adaptationSets[0].representations[0].baseUrl.toString()).
        toBe('http://example.com/Period1/AdaptationSet1/Representation1');

    expect(p[1].baseUrl.toString()).
        toBe('http://example.com/Period2');
    expect(p[1].adaptationSets[0].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet2');
    expect(p[1].adaptationSets[0].representations[0].baseUrl.toString()).
        toBe('http://example.com/Representation2');

    expect(p[2].baseUrl.toString()).
        toBe('http://example.com/Period3/');
    expect(p[2].adaptationSets[0].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet3');
    expect(p[2].adaptationSets[0].representations[0].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet3?Representation3');
    expect(p[2].adaptationSets[0].representations[1].baseUrl.toString()).
        toBe('http://example.com/AdaptationSet3#Representation4');
    expect(p[2].adaptationSets[0].representations[2].baseUrl.toString()).
        toBe('http://foo.bar/');

    expect(p[2].adaptationSets[1].baseUrl.toString()).
        toBe('http://foo.bar/multi/level');
    expect(p[2].adaptationSets[1].representations[0].baseUrl.toString()).
        toBe('http://foo.bar/multi/level?Representation5');
  });

  it('resolves relative URLs across levels', function() {
    var source = [
      '<MPD>',
      '  <BaseURL>sub/</BaseURL>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <BaseURL>1.webm</BaseURL>',
      '      </Representation>',
      '      <Representation>',
      '        <BaseURL>2.webm</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');

    var mpd = shaka.dash.mpd.parseMpd(source, createFailover('').urls);
    expect(mpd).toBeTruthy();
    expect(mpd.baseUrl.toString()).toBe('sub/');
    expect(mpd.periods.length).toBe(1);

    var p = mpd.periods[0];
    expect(p.baseUrl.toString()).toBe('sub/');
    expect(p.adaptationSets.length).toBe(1);

    var as = p.adaptationSets[0];
    expect(as.baseUrl.toString()).toBe('sub/');
    expect(as.representations.length).toBe(2);

    var r = as.representations;
    expect(r[0].baseUrl.toString()).toBe('sub/1.webm');
    expect(r[1].baseUrl.toString()).toBe('sub/2.webm');
  });

  it('resolves relative URLs with respect to the MPD URL', function() {
    var source = [
      '<MPD>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <BaseURL>1.webm</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    var mpdUrl = 'http://example.com/dash/test.mpd';

    var mpd = shaka.dash.mpd.parseMpd(source, createFailover(mpdUrl).urls);
    expect(mpd).toBeTruthy();
    expect(mpd.baseUrl.toString()).toBe(mpdUrl);
    expect(mpd.periods.length).toBe(1);

    var p = mpd.periods[0];
    expect(p.baseUrl.toString()).toBe(mpdUrl);
    expect(p.adaptationSets.length).toBe(1);

    var as = p.adaptationSets[0];
    expect(as.baseUrl.toString()).toBe(mpdUrl);
    expect(as.representations.length).toBe(1);

    var r = as.representations[0];
    expect(r.baseUrl.toString()).toBe('http://example.com/dash/1.webm');
  });

  it('supports multiple Base URLs', function() {
    var source = [
      '<MPD>',
      '  <BaseURL>http://www.example.com/</BaseURL>',
      '    <Period>',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <BaseURL>1.webm</BaseURL>',
      '        <BaseURL>2.webm</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    var mpdUrl = createFailover('').urls;

    var mpd = shaka.dash.mpd.parseMpd(source, mpdUrl);
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var p = mpd.periods[0];
    expect(p.adaptationSets.length).toBe(1);

    var as = p.adaptationSets[0];
    expect(as.representations.length).toBe(1);

    var r = as.representations[0];
    expect(r.baseUrl).toBeTruthy();
    expect(r.baseUrl.length).toBe(2);
    expect(r.baseUrl[0].toString()).toBe('http://www.example.com/1.webm');
    expect(r.baseUrl[1].toString()).toBe('http://www.example.com/2.webm');
  });

  it('overrides multiple Base URLs', function() {
    var source = [
      '<MPD>',
      '  <BaseURL>http://www.example.com/</BaseURL>',
      '  <BaseURL>http://www.google.com/</BaseURL>',
      '    <Period>',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <BaseURL>1.webm</BaseURL>',
      '        <BaseURL>2.webm</BaseURL>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    var mpdUrl = createFailover('').urls;

    var mpd = shaka.dash.mpd.parseMpd(source, mpdUrl);
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var p = mpd.periods[0];
    expect(p.adaptationSets.length).toBe(1);

    var as = p.adaptationSets[0];
    expect(as.representations.length).toBe(1);

    var r = as.representations[0];
    expect(r.baseUrl).toBeTruthy();
    expect(r.baseUrl.length).toBe(2);
    expect(r.baseUrl[0].toString()).toBe('http://www.example.com/1.webm');
    expect(r.baseUrl[1].toString()).toBe('http://www.example.com/2.webm');
  });

  it('handles multiple Base URLs in media urls', function() {
    var source = [
      '<MPD>',
      '  <BaseURL>http://www.example.com/</BaseURL>',
      '  <Period>',
      '    <AdaptationSet>',
      '      <Representation>',
      '        <BaseURL>cat/</BaseURL>',
      '        <BaseURL>dog/</BaseURL>',
      '        <SegmentList>',
      '          <SegmentURL media="a/1.webm"/>',
      '          <SegmentURL media="a/2.webm"/>',
      '      </Representation>',
      '    </AdaptationSet>',
      '  </Period>',
      '</MPD>'].join('\n');
    var mpdUrl = createFailover('').urls;

    var mpd = shaka.dash.mpd.parseMpd(source, mpdUrl);
    expect(mpd).toBeTruthy();
    expect(mpd.periods.length).toBe(1);

    var p = mpd.periods[0];
    expect(p.adaptationSets.length).toBe(1);

    var as = p.adaptationSets[0];
    expect(as.representations.length).toBe(1);

    var r = as.representations[0];
    expect(r.baseUrl).toBeTruthy();
    expect(r.baseUrl.length).toBe(2);
    expect(r.baseUrl[0].toString()).toBe('http://www.example.com/cat/');
    expect(r.baseUrl[1].toString()).toBe('http://www.example.com/dog/');

    var sl = r.segmentList;
    expect(sl).toBeTruthy();
    expect(sl.segmentUrls.length).toBe(2);

    var url1 = sl.segmentUrls[0];
    expect(url1.mediaUrl.length).toBe(2);
    expect(url1.mediaUrl[0].toString()).toBe(
        'http://www.example.com/cat/a/1.webm');
    expect(url1.mediaUrl[1].toString()).toBe(
        'http://www.example.com/dog/a/1.webm');

    var url2 = sl.segmentUrls[1];
    expect(url2.mediaUrl.length).toBe(2);
    expect(url2.mediaUrl[0].toString()).toBe(
        'http://www.example.com/cat/a/2.webm');
    expect(url2.mediaUrl[1].toString()).toBe(
        'http://www.example.com/dog/a/2.webm');
  });
});

