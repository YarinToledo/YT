"""TradePilot IBKR worker — runs next to IB Gateway on a cloud server.

Read-only: it never places orders. During US market hours it
  1. at 9:36 ET evaluates the Opening Range Breakout on "stocks in play" (see orb.py) and pushes the signals,
  2. every 10 minutes pushes a "hot stocks" snapshot from IBKR's scanners and tracks today's ORB signals,
  3. every 15 minutes (any time) pushes a heartbeat so the app can show whether the worker is alive.
Signals go to the Supabase `ingest` Edge Function.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.request
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from ib_async import IB, ScannerSubscription, Stock, TagValue

from orb import Bar, OrbFilters, evaluate_orb, top_signals, track

ET = ZoneInfo("America/New_York")
log = logging.getLogger("worker")

IB_HOST = os.environ.get("IB_HOST", "ib-gateway")
IB_PORT = int(os.environ.get("IB_PORT", "4004"))  # 4004 = paper via the gnzsnz/ib-gateway image, 4003 = live
CLIENT_ID = int(os.environ.get("IB_CLIENT_ID", "17"))
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
INGEST_SECRET = os.environ["INGEST_SECRET"]

ORB_CANDIDATES = int(os.environ.get("ORB_CANDIDATES", "40"))
HOT_ROWS = int(os.environ.get("HOT_ROWS", "15"))
HIST_CONCURRENCY = 3  # stay well inside IBKR's historical-data pacing (60 requests / 10 min)


# --------------------------------------------------------------------------- Supabase


def _post(rows: list[dict]) -> None:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/ingest",
        data=json.dumps({"rows": rows}).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "apikey": SUPABASE_ANON_KEY,
            "x-ingest-secret": INGEST_SECRET,
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        r.read()


async def push(rows: list[dict]) -> None:
    if not rows:
        return
    try:
        await asyncio.to_thread(_post, rows)
        log.info("pushed %d rows (%s)", len(rows), rows[0]["kind"])
    except Exception as e:  # keep running; the next cycle retries
        log.warning("push failed: %s", e)


# --------------------------------------------------------------------------- IBKR helpers


async def scan(ib: IB, code: str, rows: int) -> list[Stock]:
    sub = ScannerSubscription(instrument="STK", locationCode="STK.US.MAJOR", scanCode=code, numberOfRows=rows)
    tags = [TagValue("priceAbove", "5"), TagValue("volumeAbove", "200000")]
    data = await ib.reqScannerDataAsync(sub, [], tags)
    out = []
    for d in data:
        c = d.contractDetails.contract
        if c.symbol and c.symbol.isalpha() and len(c.symbol) <= 5:
            out.append(Stock(c.symbol, "SMART", "USD", primaryExchange=c.primaryExchange or ""))
    return out


async def scan_many(ib: IB, codes: list[str], rows: int, limit: int) -> list[tuple[Stock, list[str]]]:
    seen: dict[str, tuple[Stock, list[str]]] = {}
    for code in codes:
        try:
            for s in await scan(ib, code, rows):
                seen.setdefault(s.symbol, (s, []))[1].append(code)
        except Exception as e:
            log.warning("scanner %s failed: %s", code, e)
    # Symbols that show up in several scanners first.
    return sorted(seen.values(), key=lambda x: -len(x[1]))[:limit]


def to_bars(raw) -> list[Bar]:
    out = []
    for b in raw:
        t = b.date if isinstance(b.date, datetime) else datetime.combine(b.date, time(9, 30))
        if t.tzinfo is not None:
            t = t.astimezone(ET).replace(tzinfo=None)
        out.append(Bar(t, float(b.open), float(b.high), float(b.low), float(b.close), float(b.volume)))
    return out


async def bars_5m(ib: IB, contract: Stock, duration: str, sem: asyncio.Semaphore) -> list[Bar]:
    async with sem:
        raw = await ib.reqHistoricalDataAsync(
            contract, endDateTime="", durationStr=duration, barSizeSetting="5 mins",
            whatToShow="TRADES", useRTH=True, formatDate=2,
        )
        await asyncio.sleep(0.5)
        return to_bars(raw or [])


# --------------------------------------------------------------------------- jobs


async def run_orb(ib: IB, today: date) -> list[dict]:
    """Evaluate ORB on stocks in play once the first 5-minute bar has closed."""
    candidates = await scan_many(ib, ["TOP_OPEN_PERC_GAIN", "HOT_BY_VOLUME", "TOP_PERC_GAIN", "MOST_ACTIVE"], 50, ORB_CANDIDATES)
    log.info("ORB: %d candidates", len(candidates))
    sem = asyncio.Semaphore(HIST_CONCURRENCY)

    async def one(c: Stock, sources: list[str]):
        try:
            bars = await bars_5m(ib, c, "15 D", sem)
            r = evaluate_orb(c.symbol, bars, today, OrbFilters())
            return (r, sources) if r else None
        except Exception as e:
            log.warning("ORB %s: %s", c.symbol, e)
            return None

    results = [x for x in await asyncio.gather(*(one(c, s) for c, s in candidates)) if x]
    srcs = {r.symbol: s for r, s in results}
    picked = top_signals([r for r, _ in results], 20)
    rows = [{
        "kind": "orb", "trading_day": today.isoformat(), "symbol": r.symbol,
        "payload": {**r.payload(), "sources": srcs.get(r.symbol, []), "rank": i + 1, "evaluated": len(results),
                    "status": "waiting", "created": datetime.now(ET).isoformat()},
    } for i, r in enumerate(picked)]
    log.info("ORB: %d evaluated, %d signals", len(results), len(rows))
    return rows


async def run_hot(ib: IB, today: date, orb_rows: list[dict]) -> list[dict]:
    """Snapshot of IBKR's hot stocks plus intraday status of today's ORB signals."""
    sem = asyncio.Semaphore(HIST_CONCURRENCY)
    out: list[dict] = []

    hot = await scan_many(ib, ["TOP_PERC_GAIN", "HOT_BY_VOLUME"], 25, HOT_ROWS)

    async def snap(c: Stock, sources: list[str]):
        try:
            bars = await bars_5m(ib, c, "2 D", sem)
            todays = [b for b in bars if b.time.date() == today]
            prev = [b for b in bars if b.time.date() < today]
            if not todays:
                return None
            last = todays[-1].close
            prev_close = prev[-1].close if prev else None
            return {
                "symbol": c.symbol, "sources": sources, "last": round(last, 4),
                "change_pct": None if not prev_close else round((last / prev_close - 1) * 100, 2),
                "high": round(max(b.high for b in todays), 4), "low": round(min(b.low for b in todays), 4),
                "volume": int(sum(b.volume for b in todays)),
            }
        except Exception as e:
            log.warning("hot %s: %s", c.symbol, e)
            return None

    items = [x for x in await asyncio.gather(*(snap(c, s) for c, s in hot)) if x]
    items.sort(key=lambda x: x["change_pct"] or 0, reverse=True)
    out.append({"kind": "hot_snapshot", "trading_day": today.isoformat(), "symbol": None,
                "payload": {"items": items, "at": datetime.now(ET).isoformat()}})

    # Track today's ORB signals: waiting / triggered / stopped, and R so far.
    async def follow(row: dict):
        p = row["payload"]
        try:
            bars = await bars_5m(ib, Stock(row["symbol"], "SMART", "USD"), "1 D", sem)
            after_first = [b for b in bars if b.time.date() == today and b.time.time() >= time(9, 35)]
            p.update(track(p["entry"], p["stop"], after_first))
            p["updated"] = datetime.now(ET).isoformat()
            return row
        except Exception as e:
            log.warning("track %s: %s", row["symbol"], e)
            return None

    out += [x for x in await asyncio.gather(*(follow(r) for r in orb_rows)) if x]
    return out


# --------------------------------------------------------------------------- main loop


async def ensure_connected(ib: IB) -> bool:
    if ib.isConnected():
        return True
    try:
        await ib.connectAsync(IB_HOST, IB_PORT, clientId=CLIENT_ID, timeout=20, readonly=True)
        log.info("connected to IB Gateway at %s:%s", IB_HOST, IB_PORT)
        return True
    except Exception as e:
        log.warning("connect failed: %s", e)
        return False


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ib = IB()
    orb_day: date | None = None
    orb_rows: list[dict] = []
    last_hot = datetime.min
    last_beat = datetime.min

    while True:
        now = datetime.now(ET).replace(tzinfo=None)
        today = now.date()
        weekday = now.weekday() < 5
        connected = await ensure_connected(ib)

        if now - last_beat >= timedelta(minutes=15):
            await push([{"kind": "heartbeat", "trading_day": today.isoformat(), "symbol": None,
                         "payload": {"connected": connected, "at": datetime.now(ET).isoformat()}}])
            last_beat = now

        if connected and weekday:
            t = now.time()
            if orb_day != today and time(9, 36) <= t < time(10, 30):
                try:
                    orb_rows = await run_orb(ib, today)
                    await push(orb_rows)
                except Exception as e:
                    log.warning("ORB run failed: %s", e)
                orb_day = today  # one attempt per day
            if time(9, 50) <= t <= time(16, 5) and now - last_hot >= timedelta(minutes=10):
                try:
                    rows = await run_hot(ib, today, orb_rows if orb_day == today else [])
                    await push(rows)
                except Exception as e:
                    log.warning("hot run failed: %s", e)
                last_hot = now

        await asyncio.sleep(30)


if __name__ == "__main__":
    asyncio.run(main())
