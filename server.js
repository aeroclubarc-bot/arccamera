import express from "express";
import fetch from "node-fetch";

const app = express();
const ORIGIN = "http://aeroclubarc.duckdns.org:8888";

app.get("/piste.m3u8", async (req, res) => {
  const r = await fetch(`${ORIGIN}/piste/index.m3u8`);
  let text = await r.text();

  text = text
    .replace(/index\.m3u8/g, "/piste.m3u8")
    .replace(/([A-Za-z0-9_\-]+\.mp4)/g, "/segment/$1")
    .replace(/([A-Za-z0-9_\-]+\.ts)/g, "/segment/$1")
    .replace(/([A-Za-z0-9_\-]+\.m4s)/g, "/segment/$1");

  res.set("Content-Type", "application/vnd.apple.mpegurl");
  res.send(text);
});

app.get("/segment/:file", async (req, res) => {
  const file = encodeURIComponent(req.params.file).replace(/%2F/g, "/");
  const r = await fetch(`${ORIGIN}/piste/${file}`);
  if (!r.ok) {
    res.status(r.status).send("Segment introuvable");
    return;
  }
  const buf = Buffer.from(await r.arrayBuffer());

  if (file.endsWith(".ts")) res.set("Content-Type", "video/mp2t");
  else if (file.endsWith(".m4s")) res.set("Content-Type", "video/iso.segment");
  else if (file.endsWith(".mp4")) res.set("Content-Type", "video/mp4");

  res.send(buf);
});

app.get("/", (req, res) => {
  res.send("ARC live proxy OK");
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
