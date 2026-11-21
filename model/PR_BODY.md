New clubs previously received a flat 0.55 history prior and no confidence label. This change adds category/campus priors, an explicit cold-start blend, confidence, private CSV import/retraining, weather/exam features, and reproducible slide evidence. Model evaluation uses strictly earlier history and chronological validation. Only `web/js/model.js`, `model/`, `data/`, and generator-written `web/data/sample_events.json` change.

## New headline numbers

**On held-out sample events, Platewise cut food waste by about 80% compared with ordering for every RSVP (average error 3.6 people).**

`python model/train_eval.py` output, rounded to two decimals:

| Strategy | Servings ordered | Servings wasted | Events materially short | MAE people |
|---|---:|---:|---:|---:|
| Every RSVP | 2118.00 | 1175.00 | 1 | 27.58 |
| Campus average + 15% | 1253.17 | 400.66 | 6 | 10.23 |
| Platewise + 15% | 1142.30 | 204.36 | 3 | 3.59 |

243 sample events: train 200 before October 19, 2026; test 43 in Fall 2026 weeks 9+. Python's unrounded cut is **82.6079%**, MAE **3.5922**. JavaScript's cut is **82.6673%**, MAE **3.7485**; difference **0.0594 percentage points**. The headline rounds down to the nearest 5%. JS uses 180 trees at 0.07; Python uses 250 at 0.05, so predictions differ slightly despite matching features.

`python model/proof_chart.py` prints the headline above and writes `model/out/predicted_vs_actual.png`, `waste_by_strategy.png`, `proof_points.csv`, and `headline.txt`. These outputs are ignored and regenerated in one command. Both charts are 16:9, visually checked, and carry the requested sample-data footnote. The script and accuracy report call the same evaluation function.

This is synthetic evidence, not measured campus savings. The trees are fixed over the test period, but history rolls forward using earlier test outcomes when predicting subsequent events. Waste assumes one serving per attendee and continuous orders; the app rounds orders upward. "Materially short" means a shortfall over 10% of attendance. The old untouched baseline measured about 4.4 people in this environment, versus the brief's approximate 4.1; the final 3.59 is below the requested 4.4 maximum. Data changes prevent interpreting that comparison as a controlled improvement on real outcomes.

Validation:

- `node --test model/`: 13 passing tests, including app boot/plan/save/report/retrain handlers, exact JS/Python feature parity, historical and simultaneous-event leakage checks, chronological OOF stability, CSV messiness/rejections/duplicates/cap, confidence, local persistence, and no uploaded data in JSON/structured-clone/relay payloads.
- `python model/verify_data.py`: byte-for-byte repeatability with seed 26; per-date rain, exam flags, no Spring week 10, all rows `is_sample=1`, and story checks pass.
- `node model/benchmark.cjs`: approximately **48 ms / 135 ms** for 250 / 1,000 rows on this host; below the 1 s / 3 s budgets. This measures a normal JS realm and is not a mobile-device guarantee.
- `git diff --check`: clean. Python 3.13.9 / sklearn 1.7.2 / pandas 2.3.3 / matplotlib 3.10.6; Node 24.22.0. Dependencies are pinned in `model/requirements.txt`.
- The branch starts at fetched `main` (`7ec7ddf`), which has no root `tests/` directory. The separate original working copy's five rescue tests pass unchanged. In a read-only overlay of the new model/data onto that working copy, three pass and two fail solely on the known counts: `243 != 249`, `244 != 250`. No root tests or UI files were edited. Flow testing used a minimal DOM; no visual browser test is claimed.

Generator story-check output:

```text
wrote 243 sample events
Village late events (RSVPs, turnout): [(33, 5), (40, 5), (29, 5), (35, 5), (37, 5)]
ACM general meetings: average 17.3 attendees / 68.8 RSVPs
Controlled generator MSC walk-ins: weekday lunch 15.2 vs ENB 0.6
Controlled generator MSC walk-ins: Saturday 21:00 2.1 vs ENB 0.6
```

## Cold-start before/after table

`python model/cold_start_eval.py`: hold out each club completely, predict its first three events, and allow only strictly earlier other-club records. MAE in people:

| Club | Old flat | New layered | Campus only |
|---|---:|---:|---:|
| ACM | 20.549 | 15.019 | 17.524 |
| Black Student Union | 9.115 | 9.359 | 13.825 |
| Campus Rec Outdoors | 18.009 | 11.006 | 6.833 |
| Chess Club | 8.270 | 9.352 | 8.975 |
| Entrepreneurship Club | 14.272 | 10.369 | 13.802 |
| Finance Association | 8.368 | 8.189 | 10.074 |
| HackJam Workshops | 23.038 | 15.786 | 19.121 |
| Indian Student Association | 15.867 | 18.581 | 24.714 |
| Pre-Med Society | 4.052 | 3.112 | 6.231 |
| Robotics Club | 4.319 | 4.446 | 2.377 |
| Society of Women Engineers | 5.092 | 5.958 | 5.256 |
| Vietnamese Student Association | 15.624 | 2.227 | 9.310 |
| Village STEM LLC | 9.887 | 7.959 | 7.959 |
| **Overall, 39 events** | **12.036** | **9.336** | **11.231** |

The new policy improves **8/13 clubs**, lowering overall MAE by about 22.4%. It includes both layered priors and a zero-history blend (75% overall peer prior, 25% type peer prior), fading to the full tree at three prior events. It is not a pure feature-only ablation. With fewer than ten donor records, the old flat policy uses its 0.55 fallback. Five clubs regress, and small synthetic samples guided development; independent real-data testing is still needed.

## Changes needed from other owners

1. **Root README results table:** replace it with the 243-event/200-train/43-test table above, preserving Sample data labeling and the simulated-waste caveat. This PR does not edit root README.
2. **Root count tests:** `tests/rescue_model.test.cjs` in the original working copy needs 249 → **243** and after-one-report 250 → **244**, or preferably expectations derived from the fixture length. Preserve the tests that prohibit prediction screens. This PR does not edit `tests/`.
3. **CSV upload control, only if the club UI owner is authorized to add it:** `parseClubCSV(text, club, category?, {existingRows: trainingRows()})` returns `{accepted, problems:[{row, reason}]}` without mutations. `importClubCSV(text, club, category?)` validates against existing training rows, persists locally, retrains, and returns `{accepted, problems, added, skipped, trainingSize, confidence}`. Show each row-level problem. `data/example_club_upload.csv` imports seven rows and skips five for a new name such as "New Makers Club" / `tech`. Catch storage errors and show them. New IDs, date/time formats, defaults, and the 2,000-row cap are documented in `model/README.md`.
4. **Rain/category plumbing:** a future club planner can pass `rain: 1` or `true` for "Rain expected?" and an optional category for an unknown club. Omission means dry conditions. Pass actual rain and category through report-result records too; those UI handlers are out of scope. Exam period is date-derived, using the documented sample-calendar approximation.
5. **Confidence and chart UI, only if separately authorized:** `predictEvent()` retains all prior outputs and adds `confidence:{level,pastEvents,text}`. Its range widens to about ±35% below four results. Count thresholds are low 0–2 / medium 3–7 / high 8+, with a high-error downgrade when validation residuals exist. `M.backtest.points` has `event_id, club, category, actual, predicted, ordered_rsvp, ordered_campus, ordered_model`; `strategies` contains aggregate rows. `backtestHeadline()` provides ready-to-show sample text. Display Sample data labels and call this a heuristic range, not a calibrated confidence interval. The tree explanation base is a model baseline, not literally a campus mean.
6. **Diagnostics startup:** the original working copy intentionally removed prediction screens and startup `fitOOF`/`fitBacktest`. If a later authorized UI uses diagnostics, call them after `fitFull()` and rerun `fitOOF()` after learning. Predictions do not require either diagnostic. This PR restores no screens and adds no student prediction functionality; main already contains older club UI, untouched here.
7. **Private upload storage/count/reset:** core serializes and broadcasts normal `state.learned` entries. To satisfy privacy without changing core, imports use its non-enumerable `privateUploads` sublist plus the device-only `pw_model_learned` key; `trainingRows()` merges both. Use the importer summary rather than `state.learned.length` to count uploads. Shared-state replacement rehydrates uploads, and JSON/structured cloning excludes them. An explicit delete-history/reset control must clear the separate key. The existing demo reset deliberately does not erase this private history. No shared `save()` or publish routine is called by the importer.

The model handoff and ten judge questions are in `model/README.md`. The five commits are scoped to the five requested tasks. The original working copy's uncommitted screen removals remain intact.
