# Bulls Bites club turnout model

Bulls Bites estimates how many people will attend a club event, then recommends enough food for that turnout plus a 15% buffer. This directory contains the model evaluation, generated sample data tools, slide charts, and the handoff for club UI owners. The current evidence is entirely **sample data**, not a measured result at USF.

## Run and reproduce

From the repository root, with Python and Node installed:

```sh
python -m pip install -r model/requirements.txt
python model/generate_sample_data.py
python model/verify_data.py
python model/train_eval.py
python model/cold_start_eval.py
python model/proof_chart.py
node --test model/
node model/benchmark.cjs
```

The parity tests use `PYTHON` if set, then a Windows Anaconda installation if present, otherwise `python`. The charts, `proof_points.csv`, and `headline.txt` are generated in ignored `model/out/`. Both charts are 16:9 PNGs and explicitly labeled Sample data. Seed 26 reproduces 243 events. `verify_data.py` compares two independent generations byte for byte and checks the committed data after regeneration.

The verification environment was Python 3.13.9, scikit-learn 1.7.2, pandas 2.3.3, matplotlib 3.10.6, and Node 24.22.0. A local normal-JavaScript benchmark took about 48 ms for 250 events and 131 ms for 1,000; phone hardware can differ. The larger fixture repeats sample events to measure training size, not accuracy. The tests exercise app boot and the existing plan/save/report/retrain handlers using a minimal DOM, not a visual browser test.

## What the model learns

The target is `checked_in / rsvps`, clipped to 0.03–1.6. A rate lets the same model work across different RSVP counts. Rates above 1 account for walk-ins; the predicted rate is multiplied by the planned RSVP count to get people. Clipping is a safety limit, not proof that more than 160% turnout is impossible. Historical averages use the observed ratios, while the tree training target is clipped.

JavaScript trains 180 gradient-boosted trees, depth 3, learning rate 0.07, minimum leaf size 5, subsampling 0.85, seed 7. Python uses scikit-learn's 250 depth-3 trees, learning rate 0.05, subsampling 0.9, seed 0. Their **features match**, but their fitted trees are not identical. Automated tests compare every feature vector and every layered prior to within floating-point tolerance, including simultaneous events, unknown clubs, missing leftovers, and different years.

Trees suit this small tabular dataset: they learn interactions such as event type with time and location, need little preprocessing, and train quickly. The app implements the trees locally in JavaScript. It does not call an external AI service or require an API key. On a real deployment it can learn from club records; today it starts with labeled synthetic records and includes locally uploaded/reported outcomes. The model itself makes no network calls. Existing app data loading and rescue sync are separate systems.

| Feature | What it captures | Why it is available before an event |
|---|---|---|
| Club one-hot | Different clubs' turnout patterns | Organizer knows the club; unknown names have all-zero club columns |
| Event-type one-hot | Workshops, meetings, socials, cultural nights, panels, floor events | Planned event type |
| Day one-hot | Weekday/weekend attendance differences | Derived from the planned date |
| Location one-hot | Building patterns and MSC foot traffic | Planned location |
| Start hour | Lunch, evening, late-night patterns | Planned time; imported minutes become fractional hours |
| RSVPs | Scale and how show rate changes with interest | RSVP count available when planning |
| Semester week | Changes through a semester | Date with core's January 12 / August 24 anchors, clamped to weeks 1–16 |
| Rain | Expected weather impact | Explicit planner assumption; defaults to 0, no weather service |
| Exam period | Midterms and end-of-term pressure | Derived from date: weeks 7–8; Spring 14+, Fall 12+ |
| Club recent rate | Last six outcomes, shrunk toward peers | Strictly earlier club events only |
| Club/type recent rate | Last four matching outcomes, shrunk toward peers | Strictly earlier matching events only |
| Previous leftover percent | The club's latest food mismatch | Previous event only; missing value defaults to 30% |
| Number of prior events | How much club history is available | Strictly earlier club events only |

Calendar anchors and exam windows mirror this sample generator; they are not an official USF academic calendar. Category is used for the priors, not as an extra one-hot feature. Campus/category rates are returned for inspection but are not extra tree columns.

`engineer()` sorts by date and hour, maintains incremental sums, and scores every event at the same timestamp before adding any of their outcomes. No event sees its own check-ins, leftovers, simultaneous outcomes, or future outcomes as inputs. `predictEvent()` filters history before the query and, for historical queries, fits temporary trees using only that earlier data. Ordinary future queries reuse `M.full`.

## Cold start and confidence

The prior weight is three pretend events. Campus overall rate defaults to 0.55 if there is no history. Campus event-type rate shrinks toward campus overall. Category overall shrinks toward campus overall, and category/type shrinks toward campus event-type rate. The club's recent six/four events then shrink toward those category priors. An absent category falls back to campus patterns. Categories are tech, professional, cultural, residential, and recreation.

With zero club history, an unseen club's tree one-hot cannot help. The final rate therefore uses 75% recent-club prior and 25% club/type prior at zero history. It blends toward the tree with weight `min(1, pastEvents / 3)`, reaching the full tree at three past results. This is an explicit cold-start policy, not a claim that trees alone solved unseen clubs.

Confidence is low with 0–2 past events, medium with 3–7, and high with 8+. It drops one level when earlier validation RMS error exceeds both three people and 35% of the predicted turnout. Error adjustment needs at least four earlier residuals. If `fitOOF()` has not run, labels use history count alone. The range uses the greatest of three people, available RMS error, and 35% of turnout for fewer than four past events (otherwise 20%). Endpoints are rounded and the lower end is bounded at zero. This is a heuristic planning range, **not a calibrated statistical confidence interval**.

The leave-one-club-out evaluation hides each club completely and predicts its first three events using strictly earlier other-club outcomes. With fewer than ten donors, the flat comparison falls back to 0.55; otherwise it trains the old flat-prior model. The layered comparison includes the new cold-start blend. It measures the complete policy change rather than isolating only one feature. On 39 events: flat MAE **12.036**, layered **9.336**, campus **11.231** people. Layered improves 8 of 13 clubs; it is worse for five. These small, synthetic evaluations guided development and need independent real-data validation.

## Explanations and food buffer

`explain()` uses Saabas path attribution. For each tree, it starts with the root value and assigns each parent-to-child value change to the feature used by that split. Across trees, the base and feature contributions sum exactly to the raw model output. Multiplying by RSVPs expresses them in people. `predictEvent()` adds an explicit `cold_start` or `rate_limit` contribution for the final blend/clipping, so `base + sum(groups)` still equals `people`.

These explain the fitted model's arithmetic. They are not causal effects, SHAP values, or evidence that moving the same event to MSC will necessarily attract a particular number of people. The displayed base is the model's explanation baseline, not literally the campus-average turnout.

The production recommendation is `ceil(people * 1.15)`. The buffer reduces the risk of running out but does not eliminate it. It is a simple policy choice, not a learned optimum. The comparison tables use continuous servings for consistency with the original evaluation; production rounding may change totals slightly. Waste is estimated as `max(ordered - checked_in, 0)`, assuming one serving per attendee. An event counts as materially short when unmet servings exceed 10% of attendance. This is not a direct measurement of food eaten or thrown away.

## Current evaluation and headline

Trees train on 200 sample events before October 19, 2026 (Fall week 9). The 43 test events are Fall 2026 weeks 9+. Trees stay fixed over the test period; history features roll forward using outcomes of earlier test events as they become available. This models planning events sequentially, not planning the entire test period in advance. The separate `fitOOF()` diagnostic uses expanding chronological blocks instead of random folds; its first block has no out-of-fold predictions.

Python output shared by `train_eval.py` and `proof_chart.py`:

| Strategy | Servings ordered | Servings wasted | Events materially short | MAE, people |
|---|---:|---:|---:|---:|
| Every RSVP | 2118.00 | 1175.00 | 1 | 27.58 |
| Campus average + 15% | 1253.17 | 400.66 | 6 | 10.23 |
| Bulls Bites + 15% | 1142.30 | 204.36 | 3 | 3.59 |

> On held-out sample events, Bulls Bites cut food waste by about 80% compared with ordering for every RSVP (average error 3.6 people).

The headline rounds the 82.6079% reduction **down** to the nearest 5%. JavaScript yields 82.6673% and MAE 3.7485, a cut difference of 0.0594 percentage points. Different tree implementations explain the small discrepancy. The brief's historical reference was about 4.1 people; the untouched baseline ran at about 4.4 in this environment. The final 3.59 meets the requested maximum of 4.4. Changing the generated data also changes problem difficulty, so the before/after full-model numbers are not a controlled real-world improvement estimate.

## Backend API for club owners

Load core then model; set `META`, `LOCS`, and `CLUBS` from the JSON; initialize `state`; call `buildCols()` then `fitFull()`. Existing global names remain available. UI screens are outside this change.

```js
const prediction = predictEvent({
  club: "New Makers Club", category: "tech", event_type: "Workshop",
  date: "2027-01-14", start_hour: 18, location: "ENB", rsvps: 40, rain: 1
});
// prediction.confidence = {level, pastEvents, text}
// Existing people/rate/low/high/servings/base/groups/feats remain available.

const preview = parseClubCSV(csvText, "New Makers Club", "tech", {
  existingRows: trainingRows() // optional; parser itself never reads/writes state
});
// {accepted: [...], problems: [{row: 4, reason: "..."}]}
const summary = importClubCSV(csvText, "New Makers Club", "tech");
// {accepted, problems, added, skipped, trainingSize, confidence}

fitOOF();       // Optional diagnostics; run again after learning for fresh residuals.
fitBacktest();  // Sample-only proof; deliberately excludes private uploads.
const points = M.backtest.points;
const headline = backtestHeadline();
```

`fitBacktest()` also exposes `strategies` and existing aggregate fields. Each point has `event_id`, `club`, `category`, `actual`, `predicted`, `ordered_rsvp`, `ordered_campus`, and `ordered_model`. `backtestHeadline()` returns a prompt to run the backtest if it has not run. Prediction works without either diagnostic having run.

CSV required columns: date, event_type, location, start_hour, rsvps, checked_in. Optional: servings_ordered, servings_left, rain, exam_period. Header order/case/spaces/underscores are flexible; BOM, CRLF, escaped quotes, quoted commas, and blank lines work. Dates are ISO or M/D/YYYY; times are an hour, 24-hour time, or AM/PM. Supplied exam_period must be 0/1 but is recomputed from date. Leftover percentage is null when food quantities are missing, allowing the historical default. Validation rejects invalid dates/times/types/locations/numbers, future dates, check-ins above three times RSVPs, and impossible food counts. Dates use the device calendar, not the demo's simulated offset; tests can pass `options.today`.

Duplicate identity is club + date + exact fractional hour, checked against sample, reported, previous uploads, and the current file. The cap is 2,000 nonblank data records per call, including rejected ones. IDs are deterministic and collision-checked against existing records. Errors use physical CSV line numbers. Extra columns are ignored. `data/example_club_upload.csv` has 12 rows: use club name "New Makers Club" and category "tech"; seven rows import and five demonstrate errors/duplicates.

**Private storage detail:** core broadcasts the ordinary `state.learned` array to other tabs. Directly pushing uploaded records there would violate the privacy requirement. Without editing core, uploads instead live in a non-enumerable `state.learned.privateUploads` sublist; `trainingRows()` merges this with ordinary reported results and sample events. The separate localStorage key is `pw_model_learned`. Both JSON serialization and structured cloning exclude the private sublist; `slim()` and the relay never contain uploads. The importer calls no shared save/publish routine. It persists before adding rows, throws if local storage fails, retrains, and clears stale validation residuals. A later shared-state replacement rehydrates private rows from device storage. This is private to the browser origin/device, not encrypted storage or a per-user access boundary.

UI owners should use the returned summary rather than `state.learned.length` to count uploads. An explicit "delete local history" action must also clear `pw_model_learned`; the existing demo reset only clears shared state. Preserve category and actual rain when wiring them into report-result records. Root README, startup, screens, and root tests remain owned by their existing authors.

## Ten likely judge questions

1. **What if a club lies about check-ins?** Validation catches obvious mistakes, not dishonest plausible numbers. Authorized reporting and audits would be needed with real users; poisoned history can hurt predictions.
2. **How much data does a club need?** It can start with zero using campus/category priors. Three past events reaches medium confidence by count; eight reaches high unless errors warrant a downgrade. Those thresholds are heuristics.
3. **Why not just use the average?** A campus average ignores club, event, schedule and location differences. On this sample test its error is 10.23 people versus 3.59 for the Python model; real data still needs testing.
4. **What happens at the first event of a semester?** The date updates semester week and exam status. Earlier semesters' club history remains; history does not reset automatically. A truly new club uses peers.
5. **Is this an AI wrapper?** No external model API is involved. Small boosted trees train from the event records directly on the phone, and the Python version verifies them offline.
6. **Can you explain the recommendation?** Yes: exact additive tree-path contributions plus an explicit cold-start/clipping adjustment. They explain the model, not causal effects on people.
7. **What happens without internet?** Once the app shell/data is available, training and prediction run locally. CSV history stays on the device. Rescue synchronization is a separate network feature.
8. **What if it rains or walk-ins surge?** Enter expected rain manually and use the safety buffer. Walk-ins, small-club variability and weather changes remain hard to predict; ranges are not guarantees.
9. **How would this work with real USF data?** Import consented historical RSVP/check-in records, validate dates and definitions, confirm the local academic calendar, and evaluate prospectively on unseen events. Keep sample labels and real outcomes distinct.
10. **Does an 80% cut mean nobody runs out of food?** No. The sample model has three materially short events out of 43, versus one when ordering for every RSVP. The buffer trades extra food for lower shortage risk. The headline is simulated waste reduction, not a real-campus outcome.
