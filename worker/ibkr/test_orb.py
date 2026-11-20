import unittest
from datetime import date, datetime, timedelta

from orb import Bar, OrbFilters, aggregate_days, atr, evaluate_orb, top_signals, track


def session(d: date, base: float, first_vol: float, first_up: bool = True, rng: float = 1.0) -> list[Bar]:
    """78 five-minute bars for one session; the first bar's volume and direction are configurable."""
    bars = []
    t = datetime(d.year, d.month, d.day, 9, 30)
    for i in range(78):
        o = base
        c = base + (0.2 if (i > 0 or first_up) else -0.2)
        vol = first_vol if i == 0 else 20_000
        bars.append(Bar(t + timedelta(minutes=5 * i), o, max(o, c) + rng / 2, min(o, c) - rng / 2, c, vol))
    return bars


def history(today: date, days: int = 15, first_vol: float = 50_000) -> list[Bar]:
    out = []
    d = today - timedelta(days=days + 6)
    n = 0
    while n < days:
        if d.weekday() < 5:
            out += session(d, 50 + n * 0.1, first_vol)
            n += 1
        d += timedelta(days=1)
    return out


TODAY = date(2026, 11, 20)


class OrbTests(unittest.TestCase):
    def test_aggregate_and_atr(self):
        days = aggregate_days(history(TODAY, 5))
        self.assertEqual(len(days), 5)
        self.assertAlmostEqual(days[0].volume, 50_000 + 77 * 20_000)
        self.assertIsNotNone(atr(days))

    def test_bullish_first_bar_with_volume_surge_passes(self):
        bars = history(TODAY) + session(TODAY, 52, first_vol=150_000, first_up=True)
        r = evaluate_orb("ABC", bars, TODAY)
        self.assertIsNotNone(r)
        self.assertAlmostEqual(r.rel_volume, 3.0)
        self.assertEqual(r.direction, "long")
        self.assertTrue(r.passes, r.fails)
        self.assertGreater(r.entry, r.or_high)
        self.assertAlmostEqual(r.entry - r.stop, 0.1 * r.atr, places=1)

    def test_bearish_first_bar_is_skipped_for_long_only(self):
        bars = history(TODAY) + session(TODAY, 52, first_vol=150_000, first_up=False)
        r = evaluate_orb("ABC", bars, TODAY)
        self.assertFalse(r.passes)
        self.assertIn("direction", r.fails)

    def test_low_relative_volume_fails(self):
        bars = history(TODAY) + session(TODAY, 52, first_vol=40_000)
        r = evaluate_orb("ABC", bars, TODAY)
        self.assertIn("rel_volume", r.fails)

    def test_thin_stock_fails_avg_volume(self):
        r = evaluate_orb("ABC", history(TODAY) + session(TODAY, 52, 150_000), TODAY, OrbFilters(min_avg_volume=5_000_000))
        self.assertIn("avg_volume", r.fails)

    def test_no_session_today_returns_none(self):
        self.assertIsNone(evaluate_orb("ABC", history(TODAY), TODAY))

    def test_top_signals_orders_by_relative_volume(self):
        a = evaluate_orb("A", history(TODAY) + session(TODAY, 52, 150_000), TODAY)
        b = evaluate_orb("B", history(TODAY) + session(TODAY, 52, 300_000), TODAY)
        self.assertEqual([x.symbol for x in top_signals([a, b])], ["B", "A"])

    def test_track_trigger_then_stop(self):
        t = datetime(2026, 11, 20, 9, 35)
        bars = [Bar(t, 10, 10.05, 9.95, 10, 1), Bar(t + timedelta(minutes=5), 10, 10.3, 10, 10.2, 1),
                Bar(t + timedelta(minutes=10), 10.2, 10.2, 9.8, 9.9, 1)]
        s = track(10.1, 9.9, bars)
        self.assertEqual(s["status"], "stopped")
        self.assertEqual(s["r"], -1.0)

    def test_track_open_winner(self):
        t = datetime(2026, 11, 20, 9, 35)
        bars = [Bar(t, 10, 10.3, 10.0, 10.25, 1), Bar(t + timedelta(minutes=5), 10.25, 10.5, 10.2, 10.4, 1)]
        s = track(10.1, 9.9, bars)
        self.assertEqual(s["status"], "triggered")
        self.assertAlmostEqual(s["r"], 1.5)

    def test_track_waiting(self):
        t = datetime(2026, 11, 20, 9, 35)
        self.assertEqual(track(11, 10, [Bar(t, 10, 10.5, 9.9, 10.2, 1)])["status"], "waiting")


if __name__ == "__main__":
    unittest.main()
