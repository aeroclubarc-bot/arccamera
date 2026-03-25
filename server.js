import express from "express";
import { exec } from "child_process";

const app = express();
const STREAM_ORIGIN = "http://aeroclubarc.duckdns.org:8888";

// CORS
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

// TEST
app.get("/", (req, res) => {
  res.send("ARC live proxy OK");
});

// 🎥 PROXY HLS
app.get("/piste/*", async (req, res) => {
  try {
    const path = req.params[0];
    const url = `${STREAM_ORIGIN}/piste/${path}`;

    const r = await fetch(url);

    if (!r.ok) {
      res.status(404).send("Not found");
      return;
    }

    const buffer = Buffer.from(await r.arrayBuffer());

    const contentType = r.headers.get("content-type");
    if (contentType) res.set("Content-Type", contentType);

    res.send(buffer);

  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur proxy");
  }
});

// 📸 SNAPSHOT (Windy compatible)
app.get("/snapshot.jpg", async (req, res) => {
  try {
    const cmd = `ffmpeg -y -i ${STREAM_ORIGIN}/piste/index.m3u8 -frames:v 1 -f image2 -`;

    exec(cmd, { encoding: "buffer", maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (!err && stdout) {
        res.set("Content-Type", "image/jpeg");
        res.set("Cache-Control", "no-store");
        res.send(stdout);
      } else {
        // 🔥 fallback si ffmpeg ne marche pas
        res.status(500).send("FFmpeg non disponible sur Railway");
      }
    });

  } catch (e) {
    res.status(500).send("Erreur snapshot");
  }
});

// 🚀 START
app.listen(process.env.PORT || 3000, "0.0.0.0");
