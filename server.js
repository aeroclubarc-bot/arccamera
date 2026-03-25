import express from "express";
import fetch from "node-fetch";

const app = express();
const ORIGIN = "http://aeroclubarc.duckdns.org:8888";

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Origin, Range, Accept, Content-Type");
  res.set("Access-Control-Expose-Headers", "Content-Length, Content-Range");
  res.set("Cache-Control", "no-store");
}

app.options("*", (req, res) => {
  setCors(res);
  res.sendStatus(204);
});

app.get("/", (req, res) => {
  setCors(res);
  res.send("ARC live proxy OK");
});

app.get("/piste.m3u8", async (req, res) => {
  try {
    const r = await fetch(`${ORIGIN}/piste/index.m3u8`);
    if (!r.ok) {
      setCors(res);
      res.status(r.status).send("Manifest introuvable");
      return;
    }

    let text = await r.text();

    text = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();

        if (
          trimmed &&
          !trimmed.startsWith("#") &&
          (trimmed.endsWith(".ts") ||
            trimmed.endsWith(".m4s") ||
            trimmed.endsWith(".mp4"))
        ) {
          return `/segment/${trimmed}`;
        }

        return line;
      })
      .join("\n");

    setCors(res);
    res.set("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);
  } catch (e) {
    setCors(res);
    res.status(500).send("Erreur proxy manifest");
  }
});

app.get("/segment/*", async (req, res) => {
  try {
    const file = req.params[0];
    const r = await fetch(`${ORIGIN}/piste/${file}`);

    if (!r.ok) {
      setCors(res);
      res.status(r.status).send("Segment introuvable");
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());

    setCors(res);

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
    setCors(res);
    res.status(500).send("Erreur proxy segment");
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
