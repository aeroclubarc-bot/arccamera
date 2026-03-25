import express from "express";

const app = express();
const ORIGIN = "http://aeroclubarc.duckdns.org:8888";

// CORS
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

// test
app.get("/", (req, res) => {
  res.send("ARC live proxy OK");
});

// 🔥 PROXY DIRECT (clé du succès)
app.get("/piste/*", async (req, res) => {
  try {
    const path = req.originalUrl.replace("/piste/", "");

    const url = `${ORIGIN}/piste/${path}`;
    console.log("FETCH:", url);

    const r = await fetch(url);

    if (!r.ok) {
      res.status(404).send("Not found");
      return;
    }

    const contentType = r.headers.get("content-type");
    if (contentType) res.set("Content-Type", contentType);

    const buffer = Buffer.from(await r.arrayBuffer());
    res.send(buffer);

  } catch (e) {
    res.status(500).send("Erreur proxy");
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
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
