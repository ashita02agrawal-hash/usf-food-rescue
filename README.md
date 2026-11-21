# usf-food-rescue (Bulls Bites)

> Current UI: event planning uses manually entered serving counts; prediction panels and model insights have been removed from both roles. The student prediction feature has been deleted. The club model implementation in `web/js/model.js`, the `model/` scripts, and training data are retained for programmatic use, and reported events still update the model. This project has no separate prediction server; the retained JavaScript engine runs locally. The model explanation and original demo walkthrough below describe the earlier prediction UI.

A platform that predicts food demand and helps rescue surplus food from events across the USF community.

HackJam'26 · USF Tampa · Off Grid track

Clubs and LLCs order food for everyone who RSVPs, a fraction show up, and the rest gets thrown out. Bulls Bites fixes both ends:

1. **Predict.** Our own model (gradient-boosted trees, not an LLM) learns each club's real turnout from its RSVP and check-in history and recommends how much food to order.
2. **Rescue.** Whatever is still left over goes out as a "Rescue surplus" to students nearby: a short hold, a 15-minute pickup window, and a club "Picked up" button.
3. **Learn.** After every event the club reports turnout and leftovers, and the model retrains on the spot.

> All data here is **sample data** generated to mirror what we've seen on campus (an LLC whose floor events fell from everyone to 5-6 people, ACM meetings with 50 bagels and few attendees, workshops, MSC walk-in traffic). Every row is labeled `is_sample = 1`.

## Run it (one command)

You only need Python 3. From the repo folder:

```bash
python3 -m http.server 8000 --directory web
```

Open http://localhost:8000 and click **Start demo**. No installs, no build step. Edit a file, then refresh the browser (the app always fetches the newest code when it's online; if something looks stale, hard-refresh with Cmd/Ctrl+Shift+R).

## Use it as a phone app

Live app: **https://ashita02agrawal-hash.github.io/usf-food-rescue/** (redeploys on every merge to `main`).

- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the ⋮ menu, then **Install app** (or **Add to Home screen**).

It opens full screen like a normal app and still loads on bad Wi-Fi.

**Two-phone demo (club phone + student phone):** on the club phone, log in as a club, open **Demo tools** at the bottom and tap **Create sync code**, then **Copy join link** and open that link on the student phone (or type the code into **Join**). Posts, claims and "Picked up" now show up on both phones within a second. Sync goes through the free public relay ntfy.sh, so only demo data goes through it.

**Notifications:** on the student phone tap **Turn on alerts**. On iPhone this only works from the home-screen app (iOS 16.4+), not from Safari.

**First-time hosting setup (once, repo owner):** Settings → Pages → Source: **GitHub Actions**, then Actions → "Deploy app to GitHub Pages" → **Run workflow**.

## Who owns what

| Folder / file | What it is | Owner |
|---|---|---|
| `web/js/model.js`, `model/`, `data/` | Turnout model, features, sample data, Python evaluation | Teammate 1 (model) |
| `web/js/club.js` | Club console: plan an event, report results, live rescue, insights | Teammate 2 (club app) |
| `web/js/student.js` | Student app: feed, claim, pickup timer, no-show rule, alerts | Ashita (student app) |
| `web/js/core.js`, `web/js/app.js`, `web/js/sync.js`, `web/index.html`, `web/css/styles.css`, `web/sw.js`, `web/manifest.webmanifest` | Shared: state, two-phone sync, login, layout, styles, app install | Shared. Ask in the group chat before changing |

Swap names in this table to match who's doing what. Owning a folder means you review PRs that touch it.

## How we work together

`main` always works. Nobody pushes straight to it. Each change goes on its own branch and comes back through a pull request (PR).

**First time only**

```bash
git clone https://github.com/ashita02agrawal-hash/usf-food-rescue.git
cd usf-food-rescue
```

**Every time you start something new**

```bash
git checkout main
git pull                              # get everyone's latest work
git checkout -b student/claim-sounds  # new branch: <area>/<short-name>
# ...edit, refresh the browser, check it works...
git add -A
git commit -m "Play a sound when food is posted"
git push -u origin student/claim-sounds
```

Then open GitHub, click **Compare & pull request**, and ask one teammate to review. After it's approved, click **Merge**, and everyone runs `git checkout main && git pull`.

**Rules that keep us out of trouble**

- Small PRs, merged often (a few hours of work, not a whole day). Small PRs rarely conflict.
- Stay in the files you own. If you need something in a shared file, say so in the chat first.
- Before you open a PR, click through the demo once (Start demo, plan, report, claim, picked up).
- If git says there's a **merge conflict**, don't panic: run `git pull origin main` on your branch, open the files it lists, keep the right lines, delete the `<<<<<<<`, `=======`, `>>>>>>>` markers, then commit and push again.

## Project layout

```
web/                    the app (plain HTML, CSS, JavaScript)
  index.html            page skeleton; loads the scripts in order
  css/styles.css        all styles (add new ones in your area's section)
  js/core.js            shared utilities, state, sync, view switching
  js/model.js           the turnout model (trains in the browser)
  js/club.js            club console
  js/student.js         student app
  js/sync.js            two-phone live sync (club phone <-> student phone)
  js/app.js             login, demo tools, boot (loaded last)
  sw.js, manifest.webmanifest, icons/   make it installable as a phone app
  data/sample_events.json   sample event history the app trains on
model/
  generate_sample_data.py   makes data/sample_events.csv and web/data/sample_events.json
  train_eval.py             scikit-learn version of the model + accuracy report
data/sample_events.csv      the same sample data as a spreadsheet
scripts/build_single_file.py  bundles web/ into one page for sharing (dist/)
.github/workflows/pages.yml   publishes web/ to GitHub Pages on every push to main
```

The scripts aren't modules. They share globals and load in the order in `index.html`, so a function in `core.js` can be called from `club.js`.

## The model

- **Target:** show rate = checked in ÷ RSVPs (walk-ins can push it past 100%).
- **Features:** club, event type, day, start time, location (MSC gets walk-ins from the commuter lounge, between-class traffic and Village freshmen), RSVP count, week of semester, the club's recent show rate, the club's show rate *for this event type*, last event's leftover %, and how much history the club has. History features only use earlier events.
- **Algorithm:** gradient-boosted trees (180 trees, depth 3), written from scratch in `web/js/model.js` so it trains in under a second and retrains live. `model/train_eval.py` does the same with scikit-learn.
- **"Why this number":** exact per-feature contributions from each tree's split path, shown in people.
- **Recommendation:** predicted turnout × 1.15, converted to real units (pizzas, bagels, wings, platters).

Sample-data results (train before Fall 2026 week 9, test after):

| Strategy | Servings wasted | Avg error (people) |
|---|---|---|
| Order for every RSVP (today) | 1161 | 27.2 |
| Campus-wide average show rate | 409 | 10.2 |
| **Bulls Bites model** | **234** | **4.1** |

About **80% less food wasted**. Reproduce with `pip install scikit-learn pandas` then `python3 model/train_eval.py`.

## Rescue rules

- Every post shows food out since (with a 2-hour food safety limit), allergens, the restaurant or caterer, the pickup spot, walking distance, and portions left.
- Claim 1 or 2 portions. They're held for 60 seconds while you tap "I'm on my way", then you have 15 minutes to pick up.
- Clubs set a 15/20/30-minute window. One e-board member stays for it, by rotation.
- **No-shows:** canceling within 60 seconds is free. A missed pickup or a late cancel is a strike. 2 in a row or 3 in a semester pauses claiming until next semester. A pickup resets the in-a-row count. Limits are in `POLICY` in `web/js/core.js`.

## 2-minute demo script

1. **Start demo**: club console and student phone side by side, ACM on *Plan an event*.
2. A 73-RSVP general meeting at ENB: about 10 people expected, so order about 12 bagels, not 73. Walk through "Why this number".
3. Change location to **Marshall Student Center**: turnout roughly doubles from MSC foot traffic.
4. *Events & rescue* → **Report results** on today's meeting. Save. The model retrains and its next prediction changes.
5. The student phone pings with the rescue post. Claim 2 → "I'm on my way" → 15:00 timer.
6. Club taps **Picked up**.
7. *Insights* → **Village STEM LLC**: RSVPs stay near 40 while turnout falls to 5-6, and the prediction follows it. Close on "80% less waste".

Footer demo tools: skip ahead 5 minutes (shows a no-show strike), simulate another student's claim, reset.
