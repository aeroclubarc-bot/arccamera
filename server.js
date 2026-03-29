import express from "express";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);
const app = express();
const STREAM_ORIGIN = "http://aeroclubarc.duckdns.org:8888";

// CORS
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Origin, Range, Accept, Content-Type");
  next();
});

app.options("*", (req, res) => {
  res.sendStatus(204);
});

// test
app.get("/", (req, res) => {
  res.send("ARC live proxy OK");
});

// proxy flux HLS
app.get("/piste/*", async (req, res) => {
  try {
    const subpath = req.params[0];
    const url = `${STREAM_ORIGIN}/piste/${subpath}`;
    const r = await fetch(url);
    if (!r.ok) {
      res.status(r.status).send("Fichier introuvable");
      return;
    }
    const contentType = r.headers.get("content-type");
    if (contentType) res.set("Content-Type", contentType);
    const buffer = Buffer.from(await r.arrayBuffer());
    res.send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur proxy flux");
  }
});

// snapshot — capture une frame JPEG depuis le flux HLS
app.get("/snapshot", async (req, res) => {
  const ts = Date.now();
  const segPath = `/tmp/segment_${ts}.ts`;
  const imgPath = `/tmp/snapshot_${ts}.jpg`;

  try {
    // 1. Récupère le manifest HLS
    const manifestUrl = `${STREAM_ORIGIN}/piste/index.m3u8`;
    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) throw new Error(`Manifest HTTP ${manifestRes.status}`);
    const manifest = await manifestRes.text();

    // 2. Extrait le dernier segment .ts
    const segments = manifest.split("\n").filter(l => l.trim().endsWith(".ts"));
    if (!segments.length) throw new Error("Aucun segment .ts trouvé dans le manifest");
    const lastSeg = segments[segments.length - 1].trim();
    const segmentUrl = `${STREAM_ORIGIN}/piste/${lastSeg}`;

    // 3. Télécharge le segment
    const segRes = await fetch(segmentUrl);
    if (!segRes.ok) throw new Error(`Segment HTTP ${segRes.status}`);
    const segBuffer = Buffer.from(await segRes.arrayBuffer());
    fs.writeFileSync(segPath, segBuffer);

    // 4. Extrait la première frame avec ffmpeg
    await execAsync(`ffmpeg -y -i ${segPath} -vframes 1 -q:v 3 -f image2 ${imgPath}`);

    // 5. Renvoie l'image JPEG
    const img = fs.readFileSync(imgPath);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(img);

  } catch (e) {
    console.error("Snapshot error:", e.message);
    res.status(503).json({ error: "Snapshot indisponible", detail: e.message });
  } finally {
    // Nettoyage des fichiers temporaires
    try { if (fs.existsSync(segPath)) fs.unlinkSync(segPath); } catch {}
    try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch {}
  }
});

// start serveur
app.listen(process.env.PORT || 3000, "0.0.0.0");
