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

app.get("/debug-sub", async (req, res) => {
  try {
    const r = await fetch(`${STREAM_ORIGIN}/piste/video1_stream.m3u8`);
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

app.get("/snapshot", async (req, res) => {
  const ts = Date.now();
  const initPath = `/tmp/init_${ts}.mp4`;
  const segPath = `/tmp/segment_${ts}.mp4`;
  const combinedPath = `/tmp/combined_${ts}.mp4`;
  const imgPath = `/tmp/snapshot_${ts}.jpg`;

  try {
    const masterRes = await fetch(`${STREAM_ORIGIN}/piste/index.m3u8`);
    if (!masterRes.ok) throw new Error(`Master manifest HTTP ${masterRes.status}`);
    const master = await masterRes.text();
    const masterLines = master.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

    const subPath = masterLines[0].split("?")[0];
    const subRes = await fetch(`${STREAM_ORIGIN}/piste/${subPath}`);
    if (!subRes.ok) throw new Error(`Sub-manifest HTTP ${subRes.status}`);
    const sub = await subRes.text();
    console.log("SUB MANIFEST:", sub);

    const initLine = sub.split("\n").find(l => l.includes("EXT-X-MAP"));
    let initUrl = null;
    if (initLine) {
      const match = initLine.match(/URI="([^"]+)"/);
      if (match) {
        initUrl = `${STREAM_ORIGIN}/piste/${match[1]}`;
        console.log("Init URL:", initUrl);
      }
    }

    const subLines = sub.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    if (!subLines.length) throw new Error("Aucun segment trouve");

    const lastSeg = subLines[subLines.length - 1].split("?")[0];
    const segmentUrl = lastSeg.startsWith("http") ? lastSeg : `${STREAM_ORIGIN}/piste/${lastSeg}`;
    console.log("Segment URL:", segmentUrl);

    const segRes = await fetch(segmentUrl);
    if (!segRes.ok) throw new Error(`Segment HTTP ${segRes.status}`);
    const segBuffer = Buffer.from(await segRes.arrayBuffer());
    fs.writeFileSync(segPath, segBuffer);

    let inputPath = segPath;

    if (initUrl) {
      const initRes = await fetch(initUrl);
      if (initRes.ok) {
        const initBuffer = Buffer.from(await initRes.arrayBuffer());
        fs.writeFileSync(initPath, initBuffer);
        const combined = Buffer.concat([initBuffer, segBuffer]);
        fs.writeFileSync(combinedPath, combined);
        inputPath = combinedPath;
        console.log("Fichier combine cree");
      }
    }

    await execAsync(`ffmpeg -y -i ${inputPath} -vframes 1 -q:v 3 -f image2 ${imgPath}`);

    const img = fs.readFileSync(imgPath);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(img);

  } catch (e) {
    console.error("Snapshot error:", e.message);
    res.status(503).json({ error: "Snapshot indisponible", detail: e.message });
  } finally {
    for (const p of [initPath, segPath, combinedPath, imgPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
