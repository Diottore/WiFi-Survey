// worker.js (module) - normaliza y calcula SNR en background
self.onmessage = function(ev) {
  const raw = ev.data;
  try {
    const ts = raw.ts ? new Date(raw.ts).getTime() : Date.now();
    const rssi = raw.rssi != null ? Number(raw.rssi) : null;
    const noise = raw.noise != null ? Number(raw.noise) : -95;
    const snr = (rssi != null) ? (rssi - noise) : null;
    const item = {
      ts,
      ssid: raw.ssid ?? raw.ssidName ?? null,
      bssid: raw.bssid ?? raw.mac ?? null,
      rssi,
      noise,
      snr,
      channel: raw.channel ?? null,
      freq: raw.freq ?? raw.frequency ?? null,
      security: raw.security ?? raw.encryption ?? null,
      device: raw.device ?? (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'),
      raw // also keep raw payload for debugging if needed
    };
    postMessage(item);
  } catch (err) {
    console.error('Worker error', err);
    postMessage({ ts: Date.now(), ssid: null, bssid:null, rssi:null, snr:null, error:true });
  }
};