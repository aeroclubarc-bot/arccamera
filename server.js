import express from "express";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

const app = express();
const STREAM_ORIGIN = "http://aeroclubarc.duckdns.org:8888";
const PORT = process.env.PORT || 3000;

// Timeouts : un manifest doit répondre vite, un segment peut être plus long
const MANIFEST_TIMEOUT_MS = 8000;
const SEGMENT_TIMEOUT_MS = 25000;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Origin, Range, Accept, Content-Type");
  res.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  next();
});

app.options("*", (req, res) => res.sendStatus(204));

app.get("/", (req, res) => res.send("ARC live proxy OK"));

app.get("/debug-manifest", async (req, res) => {
  try {
    const r = await fetchWithTimeout(`${STREAM_ORIGIN}/piste/index.m3u8`, {}, MANIFEST_TIMEOUT_MS);
    res.set("Content-Type", "text/plain").send(await r.text());
  } catch (e) {
    res.status(502).send("Origine injoignable : " + e.message);
  }
});

// ---------------------------------------------------------------------------
// Snapshot JPEG pour Windy (et autres annuaires de webcams)
// ffmpeg extrait une image du flux HLS, mise en cache SNAPSHOT_TTL_MS
// ---------------------------------------------------------------------------
const SNAPSHOT_TTL_MS = 60_000; // une image fraîche au plus toutes les 60 s
const SNAPSHOT_FFMPEG_TIMEOUT_MS = 25_000;

let snapshotCache = { buffer: null, time: 0 };
let snapshotInFlight = null;

function generateSnapshot() {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-loglevel", "error",
      "-i", `${STREAM_ORIGIN}/piste/index.m3u8`,
      "-frames:v", "1",
      "-q:v", "3",       // qualité JPEG élevée (1 = max, 31 = min)
      "-f", "image2",
      "pipe:1",
    ];
    const ff = spawn("ffmpeg", args);
    const chunks = [];
    let stderr = "";
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (c) => (stderr += c));
    const killer = setTimeout(() => ff.kill("SIGKILL"), SNAPSHOT_FFMPEG_TIMEOUT_MS);
    ff.on("error", (e) => {
      clearTimeout(killer);
      reject(e);
    });
    ff.on("close", (code) => {
      clearTimeout(killer);
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

app.get("/snapshot.jpg", async (req, res) => {
  try {
    const stale = Date.now() - snapshotCache.time > SNAPSHOT_TTL_MS;
    if (!snapshotCache.buffer || stale) {
      // Une seule génération ffmpeg à la fois, même si Windy et des
      // visiteurs demandent l'image simultanément
      if (!snapshotInFlight) {
        snapshotInFlight = generateSnapshot()
          .then((buf) => {
            snapshotCache = { buffer: buf, time: Date.now() };
          })
          .finally(() => {
            snapshotInFlight = null;
          });
      }
      try {
        await snapshotInFlight;
      } catch (e) {
        // Si la génération échoue mais qu'une image récente existe,
        // on sert l'ancienne plutôt qu'une erreur
        if (!snapshotCache.buffer) throw e;
        console.warn("Snapshot: échec ffmpeg, image précédente servie —", e.message);
      }
    }
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", `public, max-age=${SNAPSHOT_TTL_MS / 1000}`);
    res.set("Last-Modified", new Date(snapshotCache.time).toUTCString());
    res.send(snapshotCache.buffer);
  } catch (e) {
    console.error("Snapshot error:", e.message);
    res.status(502).send("Flux indisponible, pas d'image");
  }
});

// ---------------------------------------------------------------------------
// Proxy HLS : /piste/*  (GET + HEAD — Safari iOS fait parfois des HEAD)
// ---------------------------------------------------------------------------
app.all("/piste/*", async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.sendStatus(405);

  const subpath = req.params[0];
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = `${STREAM_ORIGIN}/piste/${subpath}${query}`;

  const isManifest = /\.m3u8$/i.test(subpath);
  const isSegment = /\.(ts|m4s|mp4|aac)$/i.test(subpath);
  const timeout = isManifest ? MANIFEST_TIMEOUT_MS : SEGMENT_TIMEOUT_MS;

  // Si le client (lecteur vidéo) abandonne, on coupe aussi la requête amont
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeout);
  res.on("close", () => {
    clearTimeout(timer);
    controller.abort(new Error("client disconnected"));
  });

  try {
    // Transmettre l'en-tête Range (requis pour les HLS en byte-range / Safari)
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    // Une nouvelle tentative sur les manifests : absorbe les micro-coupures
    // de l'origine (redémarrage mediamtx, renouvellement IP DuckDNS)
    let r;
    for (let attempt = 1; ; attempt++) {
      try {
        r = await fetch(url, { method: req.method, headers, signal: controller.signal });
        break;
      } catch (err) {
        if (!isManifest || attempt >= 2 || controller.signal.aborted) throw err;
        await new Promise((ok) => setTimeout(ok, 500));
      }
    }
    clearTimeout(timer);

    if (!r.ok && r.status !== 206) {
      const text = await r.text().catch(() => "");
      return res.status(r.status).send(text);
    }

    // --- En-têtes de réponse ---------------------------------------------
    res.status(r.status);

    // Content-Type : reprendre celui de l'origine, sinon déduire de l'extension
    // (Safari iOS est strict sur les types MIME HLS)
    const ct =
      r.headers.get("content-type") ||
      (isManifest
        ? "application/vnd.apple.mpegurl"
        : /\.ts$/i.test(subpath)
          ? "video/mp2t"
          : /\.(m4s|mp4)$/i.test(subpath)
            ? "video/mp4"
            : "application/octet-stream");
    res.set("Content-Type", ct);

    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = r.headers.get(h);
      if (v) res.set(h, v);
    }

    // Cache : le manifest doit toujours être re-demandé, mais les segments
    // sont immuables → les laisser en cache évite des re-téléchargements
    if (isManifest) {
      res.set("Cache-Control", "no-cache");
    } else if (isSegment) {
      res.set("Cache-Control", "public, max-age=60, immutable");
    } else {
      res.set("Cache-Control", "no-store");
    }

    if (req.method === "HEAD" || !r.body) return res.end();

    // --- Streaming : transmission des octets au fil de l'eau ---------------
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    clearTimeout(timer);
    if (res.headersSent) return res.end();
    if (e.name === "AbortError" || /disconnect/i.test(String(e.message))) return res.end();
    console.error("Proxy error:", url, e.message);
    res.status(502).send("Erreur proxy flux");
  }
});

function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`ARC live proxy en écoute sur le port ${PORT}`);
});

// Connexions keep-alive un peu plus longues que le cycle de rafraîchissement
// des manifests HLS côté lecteurs
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
