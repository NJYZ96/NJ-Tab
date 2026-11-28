// shared-utils.js - small helpers shared across runtime modules.
(function (global) {
  "use strict";
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function debounce(fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 120);
    };
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  global.__sharedUtils = { clamp: clamp, debounce: debounce, pad2: pad2 };
})(typeof window !== "undefined" ? window : this);
