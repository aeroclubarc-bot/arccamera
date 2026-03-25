import express from "express";

const app = express();
const STREAM_ORIGIN = "http://aeroclubarc.duckdns.org:8888";

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Origin, Range, Accept, Content-Type");
  next();
});

app.options("*", (req, res) => {
  res.sendStatus(204);
});

app.get("/", (req, res) => {
  res.send("ARC live proxy OK");
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
    if (contentType) {
      res.set("Content-Type", contentType);
    }

    const buffer = Buffer.from(await r.arrayBuffer());
    res.send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur proxy flux");
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
