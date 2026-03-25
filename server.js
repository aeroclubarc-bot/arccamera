import express from "express";
import fetch from "node-fetch";

const app = express();
const ORIGIN = "http://aeroclubarc.duckdns.org:8888";

// 🔐 CORS helper
function setHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
}

// page test
app.get("/", (req, res) => {
  setHeaders(res);
  res.send("ARC live proxy OK");
});

// 🎯 MANIFEST
app.get("/piste.m3u8", async (req, res) => {
  try {
    const r = await fetch(`${ORIGIN}/piste/index.m3u8`);
    if (!r.ok) {
      res.status(500).send("Manifest introuvable");
      return;
    }

    let text = await r.text();

    // 🔥 réécriture simple et fiable
    text = text.replace(
      /(?!#)(.+\.(ts|m4s|mp4))/g,
      "/segment/$1"
    );

    setHeaders(res);
    res.set("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);

  } catch (e) {
    res.status(500).send("Erreur manifest");
  }
});

// 🎯 SEGMENTS (CORRECTION CRITIQUE)
app.get("/segment/*", async (req, res) => {
  try {
    const file = req.params[0];

    const url = `${ORIGIN}/piste/${file}`;
    console.log("FETCH:", url);

    const r = await fetch(url);

    if (!r.ok) {
      res.status(404).send("Segment introuvable");
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());

    setHeaders(res);

    if (file.endsWith(".ts")) {
      res.set("Content-Type", "video/mp2t");
    } else if (file.endsWith(".m4s")) {
      res.set("Content-Type", "video/iso.segment");
    } else if (file.endsWith(".mp4")) {
      res.set("Content-Type", "video/mp4");
    } else {
      res.set("Content-Type", "application/octet-stream");
    }

    res.send(buf);

  } catch (e) {
    res.status(500).send("Erreur segment");
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
