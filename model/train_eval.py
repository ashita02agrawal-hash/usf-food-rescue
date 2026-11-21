"""Offline training + evaluation for the Platewise turnout model (SAMPLE DATA).

The web app trains the same kind of model (gradient-boosted regression trees on
show rate) in the browser so it can retrain live when a club reports results.
This script is the reproducible, scikit-learn version used to check accuracy.

Time-based split: train on everything before Fall 2026 week 9, test on the rest,
so the model never sees the future.

Run:  pip install scikit-learn pandas && python model/train_eval.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

ROOT = Path(__file__).resolve().parents[1]
BUFFER = 1.15  # recommend 15% above predicted turnout
PRIOR_RATE, PRIOR_N = 0.55, 3  # shrink sparse club history toward campus average


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    """Per-club and per-club-and-event-type history, using only past events."""
    df = df.sort_values(["date", "start_hour"]).reset_index(drop=True)
    club_hist: dict = {}
    ct_hist: dict = {}
    last_left: dict = {}
    f_club, f_ct, f_prev, f_n = [], [], [], []
    for r in df.itertuples():
        h = club_hist.get(r.club, [])
        g = ct_hist.get((r.club, r.event_type), [])
        recent = h[-6:]
        f_club.append((sum(recent) + PRIOR_RATE * PRIOR_N) / (len(recent) + PRIOR_N))
        f_ct.append((sum(g[-4:]) + PRIOR_RATE * PRIOR_N) / (len(g[-4:]) + PRIOR_N))
        f_prev.append(last_left.get(r.club, 30.0))
        f_n.append(len(h))
        rate = r.checked_in / r.rsvps
        club_hist.setdefault(r.club, []).append(rate)
        ct_hist.setdefault((r.club, r.event_type), []).append(rate)
        last_left[r.club] = r.leftover_pct
    df["club_past_rate"] = f_club
    df["club_type_past_rate"] = f_ct
    df["prev_leftover_pct"] = f_prev
    df["club_events_so_far"] = f_n
    df["show_rate"] = df.checked_in / df.rsvps
    return df


def features(df: pd.DataFrame, cols=None) -> pd.DataFrame:
    X = pd.get_dummies(
        df[["club", "event_type", "day_of_week", "location"]], dtype=float
    )
    X["start_hour"] = df.start_hour
    X["rsvps"] = df.rsvps
    X["week"] = df.week
    for c in ["club_past_rate", "club_type_past_rate", "prev_leftover_pct", "club_events_so_far"]:
        X[c] = df[c]
    if cols is not None:
        X = X.reindex(columns=cols, fill_value=0.0)
    return X


def waste_report(name, df, order):
    left = np.maximum(0, order - df.checked_in)
    short = np.maximum(0, df.checked_in - order)
    return dict(
        strategy=name,
        servings_ordered=int(order.sum()),
        servings_wasted=int(left.sum()),
        events_ran_short=int((short > 0.1 * df.checked_in).sum()),
        mae_people=round(float(np.abs(order / (BUFFER if name != "Order for every RSVP" else 1) - df.checked_in).mean()), 1),
    )


def main():
    df = engineer(pd.read_csv(ROOT / "data" / "sample_events.csv"))
    test_mask = (df.semester == "Fall 2026") & (df.week >= 9)
    tr, te = df[~test_mask], df[test_mask]
    Xtr = features(tr)
    Xte = features(te, Xtr.columns)

    model = GradientBoostingRegressor(n_estimators=250, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=0)
    model.fit(Xtr, tr.show_rate)
    pred_people = np.clip(model.predict(Xte), 0.03, 1.6) * te.rsvps

    campus_rate = tr.show_rate.mean()
    rows = [
        waste_report("Order for every RSVP", te, te.rsvps.astype(float)),
        waste_report("Campus-wide average show rate", te, campus_rate * te.rsvps * BUFFER),
        waste_report("Platewise model", te, pred_people * BUFFER),
    ]
    out = pd.DataFrame(rows)
    print(f"Train events: {len(tr)}  Test events: {len(te)} (Fall 2026 weeks 9+)  -- SAMPLE DATA")
    print(out.to_string(index=False))
    base, ours = rows[0]["servings_wasted"], rows[2]["servings_wasted"]
    print(f"\nFood waste cut vs ordering for every RSVP: {100 * (base - ours) / base:.0f}%")

    imp = pd.Series(model.feature_importances_, index=Xtr.columns)
    groups = {}
    for k, v in imp.items():
        g = k.split("_")[0] if k.startswith(("club_", "event_type_", "day_of_week_", "location_")) and k not in (
            "club_past_rate", "club_type_past_rate", "club_events_so_far") else k
        g = {"event": "event_type", "day": "day_of_week"}.get(g, g)
        groups[g] = groups.get(g, 0) + v
    print("\nFeature importance (grouped):")
    for k, v in sorted(groups.items(), key=lambda x: -x[1]):
        print(f"  {k:22s} {v:.3f}")


if __name__ == "__main__":
    main()
