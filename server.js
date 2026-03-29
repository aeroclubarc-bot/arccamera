import express from "express";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);
const app = express();
const STREAM_ORIGIN = "http://aeroclubarc.duckdns.org:8888";

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Origin, Range, Accept, Content-Type");
  next();
});

app.options("*", (req, res) => res.sendStatus(204));

app.get("/", (req, res) => res.send("ARC live proxy OK"));

app.get("/debug-manifest", async (req, res) => {
  try {
    const r = await fetch(`${STREAM_ORIGIN}/piste/index.m3u8`);
    const text = await r.text();
    res.setHeader("Content-Type", "text/plain");
    res.send(text);
  } catch (e) {
    res.status(500).send("Erreur : " + e.message);
  }
});

app.get("/piste/*", async (req, res) => {
  try {
    const subpath = req.params[0];
    const url = `${STREAM_ORIGIN}/piste/${subpath}`;
    const r = await fetch(url);
    if (!r.ok) { res.status(r.status).send("Fichier introuvable"); return; }
    const contentType = r.headers.get("content-type");
    if (contentType) res.set("Content-Type", contentType);
    const buffer = Buffer.from(await r.arrayBuffer());
    res.send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur proxy flux");
  }
});

app.get("/snapshot", async (req, res) => {
  const ts = Date.now();
  const segPath = `/tmp/segment_${ts}.ts`;
  const imgPath = `/tmp/snapshot_${ts}.jpg`;

  try {
    const manifestRes = await fetch(`${STREAM_ORIGIN}/piste/index.m3u8`);
    if (!manifestRes.ok) throw new Error(`Manifest HTTP ${manifestRes.status}`);
    const manifest = await manifestRes.text();

    console.log("MANIFEST:", manifest);

    const lines = manifest.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const mediaLines = lines.filter(l => !l.startsWith("#"));

    if (!mediaLines.length) throw new Error(`Aucun segment trouvé. Manifest:\n${manifest}`);

    const lastSeg = mediaLines[mediaLines.length - 1];
    const segmentUrl = lastSeg.startsWith("http")
      ? lastSeg
      : `${STREAM_ORIGIN}/piste/${lastSeg.split("?")[0]}`;

    console.log("Segment URL:", segmentUrl);

    const segRes = await fetch(segmentUrl);
    if (!segRes.ok) throw new Error(`Segment HTTP ${segRes.status}`);
    fs.writeFileSync(segPath, Buffer.from(await segRes.arrayBuffer()));

    await execAsync(`ffmpeg -y -i ${segPath} -vframes 1 -q:v 3 -f image2 ${imgPath}`);

    const img = fs.readFileSync(imgPath);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(img);

  } catch (e) {
    console.error("Snapshot error:", e.message);
    res.status(503).json({ error: "Snapshot indisponible", detail: e.message });
  } finally {
    try { if (fs.existsSync(segPath)) fs.unlinkSync(segPath); } catch {}
    try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch {}
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
