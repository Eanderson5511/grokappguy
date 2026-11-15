/* Dual Tube — free YouTube search (browser + Node).
 * Order of sources:
 *   1. Inside the Android app: the native bridge (window.DualTubeNative.search), which reads
 *      youtube.com directly from Java (no CORS limits) and falls back to Piped / Invidious itself.
 *   2. In a normal browser: free public Piped / Invidious API servers that allow cross-site
 *      requests (CORS). They are raced in parallel; the first good answer wins.
 * No API keys, nothing paid.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DualTubeSearch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Checked Nov 2026: these answered search requests with CORS headers.
  // Extra entries are harmless: a dead server just loses the race.
  var PIPED = [
    "https://api.piped.private.coffee",
    "https://pipedapi.ducks.party",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.reallyaweso.me",
    "https://piapi.ggtyler.dev"
  ];
  var INVIDIOUS = [
    "https://yt.chocolatemoo53.com",
    "https://inv.tux.pizza",
    "https://invidious.nerdvpn.de",
    "https://inv.nadeko.net"
  ];
  var INVIDIOUS_DIRECTORY = "https://api.invidious.io/instances.json?sort_by=type,users";
  var TIMEOUT_MS = 8000;

  function thumb(id) { return "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"; }

  function fmtDuration(sec) {
    sec = Math.floor(Number(sec));
    if (!isFinite(sec) || sec <= 0) return "";
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = (s < 10 ? "0" : "") + s;
    if (h) return h + ":" + (m < 10 ? "0" : "") + m + ":" + ss;
    return m + ":" + ss;
  }

  function fmtViews(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B views";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K views";
    return n + (n === 1 ? " view" : " views");
  }

  var ID_RE = /^[A-Za-z0-9_-]{11}$/;

  function clean(items) {
    var seen = {}, out = [];
    (items || []).forEach(function (it) {
      if (!it || !ID_RE.test(it.videoId || "") || seen[it.videoId]) return;
      seen[it.videoId] = 1;
      out.push({
        videoId: it.videoId,
        title: String(it.title || "Untitled"),
        channel: String(it.channel || ""),
        duration: String(it.duration || ""),
        live: !!it.live,
        views: String(it.views || ""),
        published: String(it.published || ""),
        thumbnail: thumb(it.videoId)
      });
    });
    return out;
  }

  function normalizePiped(json) {
    var items = (json && json.items) || [];
    return clean(items.filter(function (x) {
      return x && (x.type === "stream" || /\/watch\?v=/.test(x.url || ""));
    }).map(function (x) {
      var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(x.url || "");
      var live = x.duration === -1 || x.duration === 0 && !x.uploaded;
      return {
        videoId: m && m[1],
        title: x.title,
        channel: x.uploaderName,
        duration: live ? "" : fmtDuration(x.duration),
        live: live,
        views: x.views > 0 ? fmtViews(x.views) : "",
        published: live ? "" : (x.uploadedDate || "")
      };
    }));
  }

  function normalizeInvidious(json) {
    var items = Array.isArray(json) ? json : [];
    return clean(items.filter(function (x) { return x && x.type === "video"; }).map(function (x) {
      return {
        videoId: x.videoId,
        title: x.title,
        channel: x.author,
        duration: x.liveNow ? "" : fmtDuration(x.lengthSeconds),
        live: !!x.liveNow,
        views: x.viewCount > 0 ? fmtViews(x.viewCount) : "",
        published: x.publishedText || ""
      };
    }));
  }

  // --- youtube.com HTML (used by Node tests; the Android app does the same in Java) ---
  function textOf(o) {
    if (!o) return "";
    if (o.simpleText) return o.simpleText;
    if (o.runs) return o.runs.map(function (r) { return r.text; }).join("");
    return "";
  }
  function viewsLabel(t) {
    t = String(t || "").trim();
    return /^[\d.,]+[KMB]?$/i.test(t) ? t + " views" : t;
  }
  function extractInitialData(html) {
    var markers = ["var ytInitialData = ", 'window["ytInitialData"] = ', "ytInitialData = "];
    for (var i = 0; i < markers.length; i++) {
      var at = html.indexOf(markers[i]);
      if (at < 0) continue;
      var start = html.indexOf("{", at);
      var depth = 0, inStr = false, esc = false;
      for (var j = start; j < html.length; j++) {
        var c = html.charCodeAt(j);
        if (inStr) {
          if (esc) esc = false;
          else if (c === 92) esc = true;
          else if (c === 34) inStr = false;
        } else if (c === 34) inStr = true;
        else if (c === 123) depth++;
        else if (c === 125 && --depth === 0) return JSON.parse(html.slice(start, j + 1));
      }
    }
    return null;
  }
  function parseYouTubeHtml(html) {
    var data = extractInitialData(html);
    var found = [];
    (function walk(o) {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      for (var k in o) {
        if (k === "videoRenderer") found.push(o[k]);
        else walk(o[k]);
      }
    })(data);
    return clean(found.map(function (v) {
      var len = textOf(v.lengthText);
      return {
        videoId: v.videoId,
        title: textOf(v.title),
        channel: textOf(v.ownerText || v.longBylineText || v.shortBylineText),
        duration: len,
        live: !len,
        views: viewsLabel(textOf(v.shortViewCountText || v.viewCountText)),
        published: textOf(v.publishedTimeText)
      };
    }));
  }

  // --- network helpers (browser) ---
  function fetchJson(url, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || TIMEOUT_MS);
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function hostOf(u) { return u.replace(/^https?:\/\//, "").replace(/\/.*$/, ""); }

  function pipedTask(base, q) {
    return fetchJson(base + "/search?q=" + encodeURIComponent(q) + "&filter=videos").then(function (j) {
      var items = normalizePiped(j);
      if (!items.length) throw new Error("empty");
      return { items: items, source: "Piped (" + hostOf(base) + ")" };
    });
  }
  function invidiousTask(base, q) {
    return fetchJson(base + "/api/v1/search?q=" + encodeURIComponent(q) + "&type=video").then(function (j) {
      var items = normalizeInvidious(j);
      if (!items.length) throw new Error("empty");
      return { items: items, source: "Invidious (" + hostOf(base) + ")" };
    });
  }

  function firstSuccess(promises) {
    return new Promise(function (resolve, reject) {
      var left = promises.length;
      if (!left) reject(new Error("no sources"));
      promises.forEach(function (p) {
        p.then(resolve, function () { if (--left === 0) reject(new Error("all sources failed")); });
      });
    });
  }

  var PREF_KEY = "dual-tube-search-good";
  function orderByLastGood(list) {
    var good = "";
    try { good = localStorage.getItem(PREF_KEY) || ""; } catch (e) {}
    return list.slice().sort(function (a, b) { return (b === good) - (a === good); });
  }

  function webSearch(q) {
    var tasks = orderByLastGood(PIPED).map(function (b) {
      return pipedTask(b, q).then(function (r) { try { localStorage.setItem(PREF_KEY, b); } catch (e) {} return r; });
    }).concat(INVIDIOUS.map(function (b) { return invidiousTask(b, q); }));
    return firstSuccess(tasks).catch(function () {
      // Second chance: ask the Invidious directory for servers that currently allow CORS.
      return fetchJson(INVIDIOUS_DIRECTORY, 6000).then(function (list) {
        var extra = (list || []).filter(function (e) {
          return e && e[1] && e[1].type === "https" && e[1].cors && e[1].api && INVIDIOUS.indexOf("https://" + e[0]) < 0;
        }).slice(0, 8).map(function (e) { return invidiousTask("https://" + e[0], q); });
        return firstSuccess(extra);
      });
    });
  }

  // --- Android native bridge ---
  var pending = {}, seq = 0;
  function hasNative() {
    return typeof window !== "undefined" && window.DualTubeNative && typeof window.DualTubeNative.search === "function";
  }
  function nativeSearch(q) {
    return new Promise(function (resolve, reject) {
      var id = "s" + (++seq);
      var timer = setTimeout(function () { delete pending[id]; reject(new Error("timeout")); }, 25000);
      pending[id] = function (res) {
        clearTimeout(timer);
        delete pending[id];
        if (res && res.ok && res.items && res.items.length) resolve({ items: clean(res.items), source: res.source || "YouTube" });
        else reject(new Error((res && res.error) || "no results"));
      };
      try { window.DualTubeNative.search(id, q); }
      catch (e) { clearTimeout(timer); delete pending[id]; reject(e); }
    });
  }
  function onNative(id, payload) {
    var fn = pending[id];
    if (!fn) return;
    var res = payload;
    if (typeof payload === "string") { try { res = JSON.parse(payload); } catch (e) { res = null; } }
    fn(res);
  }

  function search(query) {
    var q = String(query || "").trim();
    if (!q) return Promise.reject(new Error("empty query"));
    if (hasNative()) {
      return nativeSearch(q).catch(function () { return webSearch(q); });
    }
    return webSearch(q);
  }

  return {
    search: search,
    _native: onNative,
    normalizePiped: normalizePiped,
    normalizeInvidious: normalizeInvidious,
    parseYouTubeHtml: parseYouTubeHtml,
    fmtDuration: fmtDuration,
    PIPED: PIPED,
    INVIDIOUS: INVIDIOUS
  };
});
