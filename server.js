<div class="arc-ct-wrap">
  <div class="arc-ct-header">
    <div class="arc-ct-title">✈️ LIVE AÉRODROME LFPX</div>
    <div class="arc-ct-badge">● EN DIRECT</div>
  </div>

  <div class="arc-ct-card">
    <div class="arc-ct-video-wrap" id="arc-video-wrap">

      <video id="arc-video" autoplay muted playsinline></video>

      <!-- OVERLAY -->
      <div class="arc-ct-overlay">
        <div class="arc-ct-row">
          <span id="arc-time">--:--:--</span>
          <span id="arc-date">--/--/----</span>
        </div>

        <div class="arc-ct-row arc-ct-wind">
          <span class="arc-ct-wind-label">Vent piste</span>
          <span class="arc-ct-arrow-wrap">
            <span id="arc-wind-arrow">↑</span>
          </span>
          <span id="arc-wind-text">---</span>
        </div>
      </div>

      <!-- CONTROLS -->
      <div class="arc-ct-controls">
        <button id="arc-fullscreen-btn" class="arc-ct-btn">Plein écran</button>
      </div>

    </div>
  </div>
</div>

<style>
.arc-ct-wrap {
  max-width: 1120px;
  margin: 0 auto;
  padding: 20px;
  font-family: monospace;
}

.arc-ct-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.arc-ct-title {
  font-size: 22px;
  font-weight: bold;
}

.arc-ct-badge {
  color: #22c55e;
}

.arc-ct-card {
  background: #0f172a;
  border-radius: 12px;
  padding: 10px;
}

.arc-ct-video-wrap {
  position: relative;
  background: black;
  border-radius: 10px;
  overflow: hidden;
}

video {
  width: 100%;
  display: block;
  background: black;
}

/* Overlay */
.arc-ct-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0,0,0,0.5);
  color: #00ff88;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.arc-ct-row {
  margin: 3px 0;
}

.arc-ct-wind {
  display: flex;
  align-items: center;
  gap: 8px;
}

#arc-wind-arrow {
  font-size: 18px;
  display: inline-block;
}

/* Fullscreen */
.arc-ct-controls {
  position: absolute;
  bottom: 10px;
  right: 10px;
}

.arc-ct-btn {
  background: rgba(0,0,0,0.7);
  color: white;
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

/* 🔇 SUPPRESSION AUDIO */
video::-webkit-media-controls {
  display: none !important;
}
</style>

<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>

<script>
const video = document.getElementById("arc-video");

// 🎥 TON FLUX
const streamUrl = "https://arccamera-production.up.railway.app/piste/index.m3u8";

// HLS
if (window.Hls && Hls.isSupported()) {
  const hls = new Hls({
    maxBufferLength: 10,
    liveSyncDuration: 3
  });
  hls.loadSource(streamUrl);
  hls.attachMedia(video);
} else if (video.canPlayType("application/vnd.apple.mpegurl")) {
  video.src = streamUrl;
}

// 🕒 Horloge
function updateClock() {
  const now = new Date();
  document.getElementById("arc-time").textContent =
    now.toLocaleTimeString("fr-FR");
  document.getElementById("arc-date").textContent =
    now.toLocaleDateString("fr-FR");
}
setInterval(updateClock, 1000);
updateClock();

// 🧭 Vent (statique pour l’instant)
const windDirection = 270; // exemple piste ouest
document.getElementById("arc-wind-arrow").style.transform =
  `rotate(${windDirection}deg)`;
document.getElementById("arc-wind-text").textContent =
  windDirection + "°";

// 🔳 Fullscreen
document.getElementById("arc-fullscreen-btn").onclick = () => {
  const wrap = document.getElementById("arc-video-wrap");
  if (wrap.requestFullscreen) wrap.requestFullscreen();
  else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
};
</script>
