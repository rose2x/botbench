# Shared test vectors

`vectors.json` is generated once (see `/tmp/make_vectors.py` during development, or write your own) from
hand-checked values and independent HMAC computations. Both `python/tests/test_libs.py` and
`js/test/libs.test.js` load this same file, so a behavior difference between the two languages shows up
as a test failure in whichever one is wrong, not as two libraries that quietly disagree.

If you change a library's behavior, update the vectors here first, then make both implementations match.
