from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import aiosqlite
import os
import json

DATABASE_PATH = os.environ.get("WIFI_SURVEY_DB", "data/scans.db")
app = FastAPI(title="WiFi Survey API")

class Scan(BaseModel):
    ts: int
    ssid: Optional[str] = None
    bssid: Optional[str] = None
    rssi: Optional[float] = None
    noise: Optional[float] = None
    snr: Optional[float] = None
    channel: Optional[int] = None
    freq: Optional[int] = None
    security: Optional[str] = None
    device: Optional[str] = None
    raw: Optional[dict] = None

class Batch(BaseModel):
    scans: List[Scan] = Field(..., min_items=1)

@app.on_event("startup")
async def startup():
    os.makedirs(os.path.dirname(DATABASE_PATH) or ".", exist_ok=True)
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
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
        """)
        await db.commit()

@app.post("/api/scans")
async def receive_scans(batch: Batch):
    try:
        async with aiosqlite.connect(DATABASE_PATH) as db:
            await db.execute("BEGIN")
            stmt = """INSERT INTO scans (ts, ssid, bssid, rssi, noise, snr, channel, freq, security, device, raw)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);"""
            for s in batch.scans:
                raw_text = json.dumps(s.raw) if s.raw is not None else None
                await db.execute(stmt, (s.ts, s.ssid, s.bssid, s.rssi, s.noise, s.snr, s.channel, s.freq, s.security, s.device, raw_text))
            await db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"received": len(batch.scans)}

@app.get("/api/scans")
async def list_scans(limit: int = 100, offset: int = 0):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cur = await db.execute("SELECT ts, ssid, bssid, rssi, noise, snr, channel, freq, security, device FROM scans ORDER BY ts DESC LIMIT ? OFFSET ?", (limit, offset))
        rows = await cur.fetchall()
    data = [dict(ts=r[0], ssid=r[1], bssid=r[2], rssi=r[3], noise=r[4], snr=r[5], channel=r[6], freq=r[7], security=r[8], device=r[9]) for r in rows]
    return {"count": len(data), "scans": data}

@app.get("/api/stats")
async def stats():
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cur = await db.execute("SELECT COUNT(*), AVG(rssi) FROM scans")
        row = await cur.fetchone()
        total = row[0] if row is not None else 0
        avg = row[1] if row is not None else None
        cur2 = await db.execute("SELECT ssid, COUNT(*) as c FROM scans GROUP BY ssid ORDER BY c DESC LIMIT 10")
        top = await cur2.fetchall()
    return {"total": total or 0, "avg_rssi": avg, "top_ssids": [{"ssid":t[0],"count":t[1]} for t in top]}

@app.get("/healthz")
def health():
    return {"status":"ok"}