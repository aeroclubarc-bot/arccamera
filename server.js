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

app.get("/debug-manifest", async (req, res) => {
  const r = await fetch(`${STREAM_ORIGIN}/piste/index.m3u8`);
  const text = await r.text();
  res.set("Content-Type", "text/plain");
  res.send(text);
});

app.get("/piste/*", async (req, res) => {
  try {
    const subpath = req.params[0];

    // IMPORTANT : conserver les query params type ?session=...
    const query = req.url.includes("?")
      ? req.url.substring(req.url.indexOf("?"))
      : "";

    const url = `${STREAM_ORIGIN}/piste/${subpath}${query}`;

    console.log("FETCH:", url);

    const r = await fetch(url);

    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).send(text);
      return;
    }

    const contentType = r.headers.get("content-type");
    if (contentType) {
      res.set("Content-Type", contentType);
    }

    res.set("Cache-Control", "no-store");

    const buffer = Buffer.from(await r.arrayBuffer());
    res.send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur proxy flux");
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
