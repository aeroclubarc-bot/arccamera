import express from "express";
import fetch from "node-fetch";

const app = express();
const ORIGIN = "http://aeroclubarc.duckdns.org:8888";

app.get("/", (req, res) => {
  res.send("ARC live proxy OK");
});

app.get("/piste.m3u8", async (req, res) => {
  try {
    const r = await fetch(`${ORIGIN}/piste/index.m3u8`);
    if (!r.ok) {
      res.status(500).send("Erreur manifest");
      return;
    }

    let text = await r.text();

    // 🔥 rewrite TOUTES les lignes de segments
    text = text
      .split("\n")
      .map(line => {
        if (
          line.endsWith(".ts") ||
          line.endsWith(".m4s") ||
          line.endsWith(".mp4")
        ) {
          return `/segment/${line}`;
        }
        return line;
      })
      .join("\n");

    res.set("Content-Type", "application/vnd.apple.mpegurl");
    res.set("Cache-Control", "no-store");
    res.send(text);

  } catch (e) {
    res.status(500).send("Erreur proxy manifest");
  }
});

// 🔥 IMPORTANT : accepte chemins complexes
app.get("/segment/*", async (req, res) => {
  try {
    const file = req.params[0];

    const r = await fetch(`${ORIGIN}/piste/${file}`);
    if (!r.ok) {
      res.status(r.status).send("Segment introuvable");
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());

    if (file.endsWith(".ts")) res.set("Content-Type", "video/mp2t");
    else if (file.endsWith(".m4s")) res.set("Content-Type", "video/iso.segment");
    else if (file.endsWith(".mp4")) res.set("Content-Type", "video/mp4");

    res.set("Cache-Control", "no-store");
    res.send(buf);

  } catch (e) {
    res.status(500).send("Erreur proxy segment");
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
