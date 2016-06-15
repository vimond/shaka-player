Big integer workaround
----------------------

Status
======

Proof of concept is now running. Needs to be verified on stream usually failing, possibly when the offset is an odd number.

Assumptions (is the mother of all...)
=====================================

1. Offsets with big numbers is expected to be found in <S> elements, in <SegmentTimeline>s inside <SegmentTemplate>s. No other styles for segment specification is recognized.
2. All adaptation sets should have big numbers.
3. If found more than in the first segment, all start times of segments, i.e. several t="" attributes in different <S> elements, are expected to be big numbers.
4. Only the first t="" attribute is checked for big number start time. Not subsequent offsets, or the total length. Not difficult to code, but for better performance.

To do:
======

* Look into bad impacts to performance both in MPD parsing and segment reference construction.
* Code cleanup
    * Integrate BigInteger as Google Closure type?
    * Remove all methods not needed?
    * Make code additions Google Closure compliant.
* Add tests for big int handling. Check that existing tests run.
* Documentation.
* Test absolute position computation in Shaka player.