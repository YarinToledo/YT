"""Opening Range Breakout on "stocks in play" — pure logic, no IBKR dependency (unit-tested).

Rules follow Zarattini, Barbon & Aziz (2024), long side only:
  - price > $5, 14-day average daily volume >= 1M shares, 14-day ATR >= $0.50
  - relative volume of the first 5-minute bar >= 100% of its 14-day average; keep the top 20
  - first 5-minute bar bullish (close > open) -> buy-stop at its high
  - stop = entry - 10% of the 14-day ATR; exit at the close (or the trader's R:R target)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Iterable


@dataclass
class Bar:
    time: datetime  # bar start, US/Eastern
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class DayAgg:
    day: date
    open: float
    high: float
    low: float
    close: float
    volume: float
    first: Bar  # first 5-minute bar of the session


def aggregate_days(bars: Iterable[Bar]) -> list[DayAgg]:
    """Regular-hours 5-minute bars -> one row per session, oldest first."""
    by_day: dict[date, list[Bar]] = {}
    for b in bars:
        by_day.setdefault(b.time.date(), []).append(b)
    out = []
    for d in sorted(by_day):
        day_bars = sorted(by_day[d], key=lambda x: x.time)
        out.append(DayAgg(
            day=d,
            open=day_bars[0].open,
            high=max(x.high for x in day_bars),
            low=min(x.low for x in day_bars),
            close=day_bars[-1].close,
            volume=sum(x.volume for x in day_bars),
            first=day_bars[0],
        ))
    return out


def atr(days: list[DayAgg], n: int = 14) -> float | None:
    if len(days) < 2:
        return None
    trs = [max(d.high - d.low, abs(d.high - p.close), abs(d.low - p.close)) for p, d in zip(days, days[1:])]
    last = trs[-n:]
    return sum(last) / len(last)


@dataclass
class OrbFilters:
    min_price: float = 5.0
    min_avg_volume: float = 1_000_000
    min_atr: float = 0.5
    min_rel_volume: float = 1.0
    stop_atr_fraction: float = 0.10
    lookback: int = 14


@dataclass
class OrbResult:
    symbol: str
    day: str
    direction: str  # 'long' | 'short' | 'none'
    price: float  # close of the first 5-minute bar
    or_high: float
    or_low: float
    rel_volume: float | None
    avg_volume: float | None
    atr: float | None
    entry: float | None
    stop: float | None
    passes: bool
    fails: list[str] = field(default_factory=list)

    def payload(self) -> dict:
        return {
            "direction": self.direction, "price": round(self.price, 4), "or_high": round(self.or_high, 4),
            "or_low": round(self.or_low, 4), "rel_volume": None if self.rel_volume is None else round(self.rel_volume, 2),
            "avg_volume": None if self.avg_volume is None else round(self.avg_volume),
            "atr": None if self.atr is None else round(self.atr, 4),
            "entry": None if self.entry is None else round(self.entry, 2),
            "stop": None if self.stop is None else round(self.stop, 2),
            "passes": self.passes, "fails": self.fails,
        }


def evaluate_orb(symbol: str, bars: list[Bar], today: date, f: OrbFilters = OrbFilters()) -> OrbResult | None:
    """Evaluate one symbol once the first 5-minute bar of `today` has closed."""
    days = aggregate_days(bars)
    if not days or days[-1].day != today:
        return None
    hist = [d for d in days if d.day < today][-f.lookback:]
    if len(hist) < 5:
        return None
    first = days[-1].first
    avg_vol = sum(d.volume for d in hist) / len(hist)
    avg_open_vol = sum(d.first.volume for d in hist) / len(hist)
    rel = first.volume / avg_open_vol if avg_open_vol > 0 else None
    a = atr(hist, f.lookback)  # ATR from completed sessions only

    direction = "long" if first.close > first.open else "short" if first.close < first.open else "none"
    fails = []
    if first.close < f.min_price:
        fails.append("price")
    if avg_vol < f.min_avg_volume:
        fails.append("avg_volume")
    if a is None or a < f.min_atr:
        fails.append("atr")
    if rel is None or rel < f.min_rel_volume:
        fails.append("rel_volume")
    if direction != "long":
        fails.append("direction")  # long-only trader

    entry = stop = None
    if direction == "long" and a is not None:
        entry = round(first.high + 0.01, 2)
        stop = round(entry - f.stop_atr_fraction * a, 2)
        if stop >= entry:
            stop = None
    return OrbResult(
        symbol=symbol, day=today.isoformat(), direction=direction, price=first.close, or_high=first.high,
        or_low=first.low, rel_volume=rel, avg_volume=avg_vol, atr=a, entry=entry, stop=stop,
        passes=not fails and stop is not None, fails=fails,
    )


def top_signals(results: list[OrbResult], n: int = 20) -> list[OrbResult]:
    """Passing signals, highest relative volume first."""
    ok = [r for r in results if r.passes]
    return sorted(ok, key=lambda r: r.rel_volume or 0, reverse=True)[:n]


def track(entry: float, stop: float, bars_after_open: list[Bar]) -> dict:
    """Status of an ORB long through the day: waiting -> triggered -> stopped (or still open)."""
    status, trigger_time, exit_price = "waiting", None, None
    for b in sorted(bars_after_open, key=lambda x: x.time):
        if status == "waiting" and b.high >= entry:
            status, trigger_time = "triggered", b.time.isoformat()
            if b.low <= stop:  # same bar hit both: assume the worst
                status, exit_price = "stopped", stop
                break
            continue
        if status == "triggered" and b.low <= stop:
            status, exit_price = "stopped", stop
            break
    last = bars_after_open[-1].close if bars_after_open else None
    risk = entry - stop
    r_now = None
    if status == "triggered" and last is not None and risk > 0:
        r_now = round((last - entry) / risk, 2)
    elif status == "stopped":
        r_now = -1.0
    return {"status": status, "triggered_at": trigger_time, "last": last, "exit": exit_price, "r": r_now}
