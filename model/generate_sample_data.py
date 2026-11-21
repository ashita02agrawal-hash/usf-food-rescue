"""Generate SAMPLE event history for Platewise.

No real USF data exists yet, so this script builds a realistic, clearly labeled
sample dataset that follows patterns the team has seen on campus:

* An LLC floor where everyone came to the first event, but only 5-6 people
  come by mid-semester while the RSVP count in the group chat stays high.
* ACM general meetings with ~70 RSVPs, 50 bagels, and a fraction showing up.
* Hackathon/club workshops with low show rates.
* Events in the Marshall Student Center (MSC) get extra walk-ins: commuter
  lounge, students walking between classes, freshmen from The Village.
* Fridays, weekends, late nights, and midterm/finals weeks draw fewer people.

Every row has is_sample = 1. Run:  python model/generate_sample_data.py
"""
from __future__ import annotations

import csv
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 26
rng = random.Random(SEED)
ROOT = Path(__file__).resolve().parents[1]

# Approximate USF Tampa building coordinates (for walking distance in the demo).
LOCATIONS = {
    "MSC": {"name": "Marshall Student Center", "lat": 28.0637, "lon": -82.4134},
    "LIB": {"name": "USF Library", "lat": 28.0597, "lon": -82.4122},
    "ENB": {"name": "Engineering Building II", "lat": 28.0587, "lon": -82.4153},
    "BSN": {"name": "Muma College of Business", "lat": 28.0586, "lon": -82.4103},
    "ISA": {"name": "Interdisciplinary Sciences", "lat": 28.0614, "lon": -82.4143},
    "CPR": {"name": "Cooper Hall", "lat": 28.0598, "lon": -82.4108},
    "VIL": {"name": "The Village (LLC lounge)", "lat": 28.0676, "lon": -82.4178},
    "REC": {"name": "Campus Rec Center", "lat": 28.0603, "lon": -82.4075},
}

TYPE_MULT = {
    "General meeting": 0.80,
    "Workshop": 0.70,
    "Social": 1.05,
    "Cultural night": 1.20,
    "Speaker panel": 0.78,
    "Floor event": 1.00,
}
# Mon..Sun
DAY_MULT = [0.95, 1.05, 1.05, 1.0, 0.72, 0.60, 0.62]

# name, base show rate, RSVP mean, events [(type, loc, weekday, hour, weight)],
# novelty decay (0 = none, 0.85 = steep), food item, caterer, allergens,
# per-type overrides of the show rate, events per week
CLUBS = [
    dict(club="ACM", rate=0.42, rsvp=68, decay=0.35, every=1,
         events=[("General meeting", "ENB", 2, 18, 3), ("Workshop", "ENB", 3, 18, 2), ("Social", "MSC", 4, 17, 1)],
         food=("bagels & cookies", "Einstein Bros Bagels (MSC)", ["gluten", "dairy"]),
         override={"Workshop": 0.95}),
    dict(club="Village STEM LLC", rate=1.0, rsvp=36, decay=0.84, every=1,
         events=[("Floor event", "VIL", 2, 20, 1)],
         food=("pizza", "Domino's (Fowler Ave)", ["gluten", "dairy"]), override={}),
    dict(club="HackJam Workshops", rate=0.38, rsvp=55, decay=0.25, every=2,
         events=[("Workshop", "ISA", 5, 13, 2), ("Workshop", "MSC", 3, 18, 1)],
         food=("sandwich platters", "Jason's Deli", ["gluten", "dairy"]), override={}),
    dict(club="Society of Women Engineers", rate=0.62, rsvp=40, decay=0.2, every=1,
         events=[("General meeting", "ENB", 1, 18, 2), ("Speaker panel", "MSC", 3, 18, 1)],
         food=("pizza", "Papa John's (Fletcher Ave)", ["gluten", "dairy"]), override={}),
    dict(club="Indian Student Association", rate=0.70, rsvp=90, decay=0.15, every=2,
         events=[("Cultural night", "MSC", 4, 19, 1), ("Social", "MSC", 2, 19, 2)],
         food=("biryani & samosas", "Taj Indian Cuisine", ["gluten", "dairy", "nuts"]), override={}),
    dict(club="Pre-Med Society", rate=0.55, rsvp=60, decay=0.25, every=1,
         events=[("Speaker panel", "ISA", 1, 19, 2), ("General meeting", "ISA", 3, 19, 2)],
         food=("Chick-fil-A nuggets", "Chick-fil-A (MSC)", ["gluten", "soy"]), override={}),
    dict(club="Finance Association", rate=0.50, rsvp=45, decay=0.3, every=2,
         events=[("Speaker panel", "BSN", 2, 18, 2), ("General meeting", "BSN", 1, 18, 1)],
         food=("wraps", "Panera Bread", ["gluten", "dairy"]), override={}),
    dict(club="Robotics Club", rate=0.66, rsvp=28, decay=0.15, every=1,
         events=[("Workshop", "ENB", 4, 16, 2), ("General meeting", "ENB", 1, 19, 1)],
         food=("pizza", "Domino's (Fowler Ave)", ["gluten", "dairy"]),
         override={"Workshop": 0.88}),
    dict(club="Black Student Union", rate=0.68, rsvp=70, decay=0.15, every=2,
         events=[("Social", "MSC", 3, 19, 2), ("General meeting", "MSC", 1, 19, 1)],
         food=("wings", "Wingstop (Fowler Ave)", ["soy"]), override={}),
    dict(club="Vietnamese Student Association", rate=0.64, rsvp=65, decay=0.2, every=2,
         events=[("Cultural night", "MSC", 5, 18, 1), ("Social", "CPR", 2, 19, 2)],
         food=("banh mi", "Pho Quyen (Fowler Ave)", ["gluten", "soy"]), override={}),
    dict(club="Entrepreneurship Club", rate=0.45, rsvp=38, decay=0.35, every=2,
         events=[("Speaker panel", "BSN", 3, 18, 2), ("Workshop", "LIB", 2, 17, 1)],
         food=("cookies & coffee", "Insomnia Cookies", ["gluten", "dairy", "eggs"]), override={}),
    dict(club="Chess Club", rate=0.72, rsvp=20, decay=0.1, every=1,
         events=[("Social", "LIB", 4, 15, 1), ("Social", "MSC", 2, 12, 1)],
         food=("donuts", "Dunkin' (MSC)", ["gluten", "dairy", "eggs"]), override={}),
    dict(club="Campus Rec Outdoors", rate=0.58, rsvp=32, decay=0.2, every=2,
         events=[("General meeting", "REC", 1, 19, 2), ("Social", "REC", 6, 11, 1)],
         food=("subs", "Jersey Mike's", ["gluten"]), override={}),
]

CATEGORIES = {
    "ACM": "tech", "HackJam Workshops": "tech", "Robotics Club": "tech",
    "Pre-Med Society": "professional", "Finance Association": "professional",
    "Entrepreneurship Club": "professional", "Society of Women Engineers": "professional",
    "Indian Student Association": "cultural", "Black Student Union": "cultural",
    "Vietnamese Student Association": "cultural", "Village STEM LLC": "residential",
    "Chess Club": "recreation", "Campus Rec Outdoors": "recreation",
}
for club in CLUBS:
    club["category"] = CATEGORIES[club["club"]]

SEMESTERS = [("Spring 2026", date(2026, 1, 12), 15), ("Fall 2026", date(2026, 8, 24), 13)]


def time_mult(hour: int, loc: str) -> float:
    m = 1.12 if loc == "MSC" else 1.0  # people already in the building stay longer
    if 11 <= hour <= 13:
        m *= 1.08
    elif hour >= 20:
        m = 0.88
    elif hour <= 10:
        m = 0.85
    return m


def walkins(hour: int, loc: str, dow: int) -> int:
    """MSC events pick up walk-ins (commuter lounge, between-class traffic)."""
    if loc == "MSC":
        lam = 15 if 11 <= hour <= 14 else 10 if hour <= 19 else 5
        if dow >= 5:
            lam *= 0.4
    elif loc in ("LIB", "ISA"):
        lam = 1.5
    else:
        lam = 0.6
    # Poisson via Knuth
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def week_mult(week: int, n_weeks: int, decay: float) -> float:
    novelty = 1 - decay * (1 - math.exp(-(week - 1) / 3.2))
    if week in (7, 8):  # midterms
        novelty *= 0.86
    if week >= n_weeks - 1:  # finals
        novelty *= 0.72
    return novelty


def main() -> None:
    rng.seed(SEED)
    rows = []
    eid = 0
    for sem, start, n_weeks in SEMESTERS:
        for c in CLUBS:
            for week in range(1, n_weeks + 1):
                if (week - 1) % c["every"]:
                    continue
                if rng.random() < 0.08:  # skipped week
                    continue
                types = [e for e in c["events"] for _ in range(e[4])]
                etype, loc, dow, hour, _ = rng.choice(types)
                # Include observed examples of the late-Friday penalty, not only
                # a formula that never runs for any scheduled sample event.
                if c['club']=='Robotics Club' and etype=='Workshop' and week>=5 and week%3==0:
                    hour=19
                if week == 1 and c["club"] == "Village STEM LLC":
                    etype = "Floor event"
                day = start + timedelta(weeks=week - 1, days=dow)
                # One deterministic weather outcome per date, independent of club order.
                rain = int(random.Random(SEED + day.toordinal()).random() < (.35 if day.month in (8,9) else .15))
                exam_period = int(week in (7,8) or week >= n_weeks-1)
                rain_effect = 1 if not rain or (loc == 'VIL' and etype == 'Floor event') else .96 if loc == 'MSC' else .87
                night_effect = (1.08 if etype in ('Social','Cultural night') else .65) if dow in (4,5) and hour >= 19 else 1
                rsvp_mean = c["rsvp"] * (1.25 if etype == "Cultural night" else 1.0)
                rsvp = max(6, round(rng.gauss(rsvp_mean, rsvp_mean * 0.12)))
                base = c["override"].get(etype, c["rate"] * TYPE_MULT[etype])
                ratio = (
                    base
                    * DAY_MULT[dow]
                    * time_mult(hour, loc)
                    * week_mult(week, n_weeks, c["decay"])
                    * rain_effect * night_effect
                    * math.exp(rng.gauss(0, 0.12))
                )
                attended = min(round(rsvp * 1.6), max(2, round(rsvp * ratio) + walkins(hour, loc, dow)))
                # Clubs today order for (roughly) everyone who RSVP'd.
                ordered = round(rsvp * rng.uniform(0.92, 1.18))
                eaten = min(ordered, round(attended * rng.uniform(0.9, 1.05)))
                left = max(0, ordered - eaten)
                food, caterer, allergens = c["food"]
                # Consume the same seeded event draws even for the break week:
                # adding a calendar exclusion must not reshuffle every later event.
                if sem.startswith('Spring') and week == 10:
                    continue
                eid += 1
                rows.append(dict(
                    event_id=f"S{eid:04d}", club=c["club"], category=c["category"], event_type=etype,
                    date=day.isoformat(), day_of_week=day.strftime("%a"), start_hour=hour,
                    location=loc, rsvps=rsvp, checked_in=attended, food_item=food,
                    caterer=caterer, allergens="|".join(allergens),
                    servings_ordered=ordered, servings_left=left,
                    leftover_pct=round(100 * left / ordered, 1), semester=sem, week=week,
                    rain=rain, exam_period=exam_period, is_sample=1,
                ))
    rows.sort(key=lambda r: (r["date"], r["start_hour"]))

    (ROOT / "data").mkdir(exist_ok=True)
    with open(ROOT / "data" / "sample_events.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    meta = {
        "label": "SAMPLE DATA: generated to mirror patterns observed at USF club events, not real records.",
        "locations": LOCATIONS,
        "clubs": [
            {"club": c["club"], "category": c["category"], "food_item": c["food"][0], "caterer": c["food"][1], "allergens": c["food"][2],
             "home": c["events"][0][1]}
            for c in CLUBS
        ],
        "events": rows,
    }
    (ROOT / "web" / "data").mkdir(parents=True, exist_ok=True)
    with open(ROOT / "web" / "data" / "sample_events.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    print(f"wrote {len(rows)} sample events")
    village=[r for r in rows if r['club']=='Village STEM LLC' and r['week']>=7]
    near=[r for r in village if r['checked_in'] in (5,6)]
    acm=[r for r in rows if r['club']=='ACM' and r['event_type']=='General meeting']
    print('SAMPLE story check: Village late events (RSVPs, turnout):', [(r['rsvps'],r['checked_in']) for r in near[:6]])
    print(f"SAMPLE story check: ACM general meetings average {sum(r['checked_in'] for r in acm)/len(acm):.1f} attendees / {sum(r['rsvps'] for r in acm)/len(acm):.1f} RSVPs")
    # Controlled generator comparison, not a causal estimate from different clubs.
    saved=rng.getstate()
    for hour,dow in [(12,2),(21,5)]:
        print(f'SAMPLE mechanism check: expected MSC walk-ins at hour {hour}, weekday index {dow}: '+
              f"{sum(walkins(hour,'MSC',dow) for _ in range(1000))/1000:.1f}; ENB: "+
              f"{sum(walkins(hour,'ENB',dow) for _ in range(1000))/1000:.1f}")
    rng.setstate(saved)


if __name__ == "__main__":
    main()
