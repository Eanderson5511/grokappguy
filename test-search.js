// node test-search.js  — live check of every search source
const S = require("./yt-search.js");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
async function get(url, json) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "SOCS=CAI", Origin: "https://eanderson5511.github.io" } });
    const cors = r.headers.get("access-control-allow-origin");
    const body = json ? await r.json() : await r.text();
    return { status: r.status, cors, body };
  } finally { clearTimeout(t); }
}
(async () => {
  const q = process.argv[2] || "atomic habits audiobook";
  try {
    const r = await get("https://www.youtube.com/results?search_query=" + encodeURIComponent(q) + "&sp=EgIQAQ%253D%253D", false);
    const items = S.parseYouTubeHtml(r.body);
    console.log("youtube.com", r.status, items.length, "items", JSON.stringify(items[0]));
  } catch (e) { console.log("youtube.com FAIL", e.message); }
  for (const b of S.PIPED) {
    try { const r = await get(b + "/search?q=" + encodeURIComponent(q) + "&filter=videos", true); const it = S.normalizePiped(r.body);
      console.log("piped", b, r.status, "cors=" + r.cors, it.length, it[0] && it[0].title + " | " + it[0].channel + " | " + it[0].duration);
    } catch (e) { console.log("piped", b, "FAIL", e.message); }
  }
  for (const b of S.INVIDIOUS) {
    try { const r = await get(b + "/api/v1/search?q=" + encodeURIComponent(q) + "&type=video", true); const it = S.normalizeInvidious(r.body);
      console.log("invidious", b, r.status, "cors=" + r.cors, it.length, it[0] && it[0].title + " | " + it[0].channel + " | " + it[0].duration);
    } catch (e) { console.log("invidious", b, "FAIL", e.message); }
  }
})();
