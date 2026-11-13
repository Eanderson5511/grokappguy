/* Dual Tube — YouTube URL / ID parser (browser + Node) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DualTubeParse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  var HOST_RE = /^(youtu\.be|youtube\.com|m\.youtube\.com|music\.youtube\.com|youtube-nocookie\.com)$/;

  function parseTimeParam(t) {
    if (t == null || t === "") return 0;
    var s = String(t).trim();
    try { s = decodeURIComponent(s); } catch (e) {}
    if (/^\d+(\.\d+)?$/.test(s)) return Math.floor(Number(s));
    var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (m && (m[1] || m[2] || m[3])) {
      return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
    }
    return 0;
  }

  function cleanVideoId(id) {
    if (!id) return null;
    var v = String(id).trim().replace(/[^A-Za-z0-9_-].*$/, "");
    return VIDEO_ID_RE.test(v) ? v : null;
  }

  function parseYouTubeInput(input) {
    if (input == null) return null;
    var raw = String(input).trim().replace(/^<|>$/g, "").trim();
    if (!raw) return null;

    if (VIDEO_ID_RE.test(raw)) {
      return { videoId: raw, playlistId: null, startSeconds: 0 };
    }

    var url;
    try {
      url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : "https://" + raw);
    } catch (e) {
      return null;
    }

    var host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!HOST_RE.test(host) && !host.endsWith(".youtube.com")) return null;

    var params = url.searchParams;
    var videoId = cleanVideoId(params.get("v") || params.get("video_id"));
    var playlistId = (params.get("list") || "").trim() || null;
    var startSeconds = parseTimeParam(params.get("t") || params.get("start") || params.get("time_continue"));

    if (!startSeconds && url.hash) {
      var hm = url.hash.match(/(?:^|[&#])t=([^&]+)/);
      if (hm) startSeconds = parseTimeParam(hm[1]);
    }

    var parts = url.pathname.split("/").filter(Boolean);

    if (!videoId) {
      if (host === "youtu.be") {
        if (parts[0] === "live" && parts[1]) videoId = cleanVideoId(parts[1]);
        else if (parts[0] && parts[0] !== "live") videoId = cleanVideoId(parts[0]);
      } else if (parts.length >= 2 && ["shorts", "embed", "live", "v", "e"].indexOf(parts[0]) !== -1) {
        videoId = cleanVideoId(parts[1]);
      }
    }

    if (!videoId && !playlistId) return null;
    return { videoId: videoId, playlistId: playlistId, startSeconds: startSeconds || 0 };
  }

  return { parseYouTubeInput: parseYouTubeInput, parseTimeParam: parseTimeParam };
});
