// Módulo principal: batching, UI update y comunicación con backend
// Nota: este archivo usa APIs browser modernas (IndexedDB, fetch). Si el proyecto usa bundler o electron,
// ajusta la importación del worker según sea necesario.

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000; // fuerza envíos periódicos
let buffer = [];
let db; // IndexedDB wrapper

// Helpers
const $ = id => document.getElementById(id);
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// IndexedDB simple adapter (promisified)
async function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('wifi-survey', 1);
    r.onupgradeneeded = () => {
      const store = r.result.createObjectStore('scans', { keyPath: 'id', autoIncrement: true });
      store.createIndex('ts', 'ts', { unique: false });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function saveLocal(items) {
  if (!db) db = await openDB();
  const tx = db.transaction('scans', 'readwrite');
  const store = tx.objectStore('scans');
  for (const item of items) store.add(item);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function clearLocal() {
  if (!db) db = await openDB();
  const tx = db.transaction('scans', 'readwrite');
  tx.objectStore('scans').clear();
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// UI
const resultsBody = $('results-body');
const totalCountEl = $('total-count');
const uniqueSsidsEl = $('unique-ssids');
const avgRssiEl = $('avg-rssi');

let stats = { total: 0, ssids: new Set(), rssiSum: 0 };

function updateStats(item) {
  stats.total += 1;
  if (item.ssid) stats.ssids.add(item.ssid);
  if (typeof item.rssi === 'number' && !Number.isNaN(item.rssi)) stats.rssiSum += item.rssi;
  totalCountEl.textContent = stats.total;
  uniqueSsidsEl.textContent = stats.ssids.size;
  avgRssiEl.textContent = stats.total ? (stats.rssiSum / stats.total).toFixed(1) : '—';
}

function renderRows(items) {
  // Append rows en fragmento para minimizar reflows
  const fragment = document.createDocumentFragment();
  for (const it of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(it.ts).toLocaleString()}</td>
      <td>${it.ssid ?? ''}</td>
      <td>${it.bssid ?? ''}</td>
      <td>${it.rssi ?? ''}</td>
      <td>${it.snr ?? ''}</td>
      <td>${it.channel ?? ''}</td>
      <td>${it.freq ?? ''}</td>
      <td>${it.security ?? ''}</td>
      <td>${it.device ?? ''}</td>
    `;
    fragment.appendChild(tr);
    updateStats(it);
  }
  resultsBody.appendChild(fragment);
}

// Worker setup: use a real Worker if available, otherwise fallback to inline processor
let workerAvailable = false;
let worker;
try {
  worker = new Worker('/static/js/worker.js', { type: 'module' });
  workerAvailable = true;
} catch (e) {
  // fallback: we'll call normalize in main thread
  workerAvailable = false;
}

function normalizeAndEnqueue(raw) {
  if (workerAvailable) {
    worker.postMessage(raw);
  } else {
    // inline normalization similar to worker
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
      device: raw.device ?? navigator.userAgent ?? null,
      raw
    };
    onEnrichedItem(item);
  }
}

// Worker message handler
if (workerAvailable) {
  worker.onmessage = (ev) => {
    onEnrichedItem(ev.data);
  };
  worker.onerror = (err) => console.error('Worker error', err);
}

function onEnrichedItem(item) {
  buffer.push(item);
  if (buffer.length >= BATCH_SIZE) {
    const toSend = buffer.splice(0, buffer.length);
    renderRows(toSend);
    sendBatch(toSend);
    saveLocal(toSend).catch(()=>{/*silent*/});
  }
}

async function sendBatch(items) {
  try {
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scans: items })
    });
    if (!res.ok) {
      console.warn('Servidor respondió con error', res.status);
      await saveLocal(items);
    }
  } catch (err) {
    console.warn('Fallo al enviar batch, guardando localmente', err);
    await saveLocal(items);
  }
}

// Periodic flush
setInterval(() => {
  if (buffer.length) {
    const toSend = buffer.splice(0, buffer.length);
    renderRows(toSend);
    sendBatch(toSend);
    saveLocal(toSend).catch(()=>{/*silent*/});
  }
}, FLUSH_INTERVAL_MS);

// Public API para recibir datos desde el mecanismo de scan (ej: electron, native, etc.)
window.receiveScan = (raw) => {
  normalizeAndEnqueue(raw);
};

// Export CSV
$('btn-export').addEventListener('click', async () => {
  const rows = [];
  for (const tr of resultsBody.children) {
    const cells = tr.children;
    rows.push({
      ts: cells[0].textContent,
      ssid: cells[1].textContent,
      bssid: cells[2].textContent,
      rssi: cells[3].textContent,
      snr: cells[4].textContent,
      channel: cells[5].textContent,
      freq: cells[6].textContent,
      security: cells[7].textContent,
      device: cells[8].textContent
    });
  }
  if (rows.length === 0) {
    alert('No hay registros visibles para exportar.');
    return;
  }
  const header = Object.keys(rows[0]).join(',');
  const csv = [header, ...rows.map(r => Object.values(r).map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wifi-survey-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Clear local cache
$('btn-clear-local').addEventListener('click', async () => {
  await clearLocal();
  alert('Cache local limpiada');
});

// Simple filters (debounced)
$('filter-ssid').addEventListener('input', debounce((e) => {
  const q = e.target.value.toLowerCase();
  for (const tr of resultsBody.children) {
    const ssid = tr.children[1].textContent.toLowerCase();
    tr.style.display = ssid.includes(q) ? '' : 'none';
  }
}, 200));

// Inicialización
(async () => {
  db = await openDB().catch(()=>null);
})();