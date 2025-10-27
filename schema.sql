CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER,
  ssid TEXT,
  bssid TEXT,
  rssi REAL,
  noise REAL,
  snr REAL,
  channel INTEGER,
  freq INTEGER,
  security TEXT,
  device TEXT,
  raw TEXT
);
