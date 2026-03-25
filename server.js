import express from "express";

const app = express();
const ORIGIN = "http://aeroclubarc.duckdns.org:8888";

// CORS
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

// Test
app.get("/", (req, res) => {
  res.send("ARC live proxy OK");
});

// Proxy direct HLS
app.get("/piste/*", async (req, res) => {
  try {
    const path = req.params[0]; // IMPORTANT

    const url = `${ORIGIN}/piste/${path}`;
    console.log("FETCH:", url);

    const r = await fetch(url);

    if (!r.ok) {
      res.status(404).send("Not found");
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
    res.status(500).send("Erreur proxy");
  }
});

// Start serveur
app.listen(process.env.PORT || 3000, "0.0.0.0");
