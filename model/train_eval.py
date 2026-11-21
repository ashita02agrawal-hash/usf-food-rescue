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


def history_features(prior, row, mode="layered"):
    from generate_sample_data import CATEGORIES
    def category(r):
        v=r.get("category")
        return v if isinstance(v,str) and v else CATEGORIES.get(r["club"],"")
    def shrink(a,p):
        return (sum(r["checked_in"]/r["rsvps"] for r in a)+3*p)/(len(a)+3)
    h=[r for r in prior if r["club"]==row["club"]]
    campus=np.mean([r["checked_in"]/r["rsvps"] for r in prior]) if prior else .55
    typ=shrink([r for r in prior if r["event_type"]==row["event_type"]],campus)
    cat=category(row)
    peers=[r for r in prior if cat and category(r)==cat]
    cp=shrink(peers,campus)
    ctp=shrink([r for r in peers if r["event_type"]==row["event_type"]],typ)
    previous=h[-1].get("leftover_pct") if h else None
    return dict(club_rate=shrink(h[-6:],.55 if mode=="flat" else cp),
        club_type_rate=shrink([r for r in h if r["event_type"]==row["event_type"]][-4:],.55 if mode=="flat" else ctp),
        prev_left=30 if previous is None or pd.isna(previous) else previous,n_events=len(h),
        campus_rate=campus,campus_type_rate=typ,category_rate=cp,category_type_rate=ctp)


def engineer(df,mode="layered"):
    from itertools import groupby
    rows=df.sort_values(["date","start_hour"],kind="stable").to_dict("records")
    prior,out=[],[]
    for _,batch in groupby(rows,key=lambda r:(r["date"],r["start_hour"])):
        batch=list(batch)
        for r in batch: out.append(dict(r,**history_features(prior,r,mode)))
        prior.extend(batch)
    result=pd.DataFrame(out)
    result["show_rate"]=result.checked_in/result.rsvps
    return result


def features(df: pd.DataFrame, cols=None) -> pd.DataFrame:
    X = pd.get_dummies(
        df[["club", "event_type", "day_of_week", "location"]], dtype=float
    )
    X["start_hour"] = df.start_hour
    X["rsvps"] = df.rsvps
    X["week"] = df.week
    for c in ["club_rate", "club_type_rate", "prev_left", "n_events"]:
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


def new_model():
    return GradientBoostingRegressor(n_estimators=250,max_depth=3,learning_rate=.05,subsample=.9,random_state=0)


def cold_start_rate(raw,frame):
    weight=np.minimum(1,frame.n_events/3)
    return np.clip(weight*raw+(1-weight)*(.75*frame.club_rate+.25*frame.club_type_rate),.03,1.6)


def evaluate(mode="layered",df=None):
    from generate_sample_data import CATEGORIES
    df=engineer(pd.read_csv(ROOT/"data/sample_events.csv") if df is None else df,mode)
    mask=(df.semester=="Fall 2026") & (df.week>=9)
    tr,te=df[~mask],df[mask]
    X=features(tr); m=new_model().fit(X,tr.show_rate)
    raw=m.predict(features(te,X.columns))
    pred=(np.clip(raw,.03,1.6) if mode=="flat" else cold_start_rate(raw,te))*te.rsvps
    points=te[["event_id","club","checked_in"]].rename(columns={"checked_in":"actual"}).copy()
    points["category"]=points.club.map(CATEGORIES).fillna("unknown")
    points["predicted"]=pred
    points["ordered_rsvp"]=te.rsvps.astype(float)
    points["ordered_campus"]=tr.show_rate.mean()*te.rsvps*BUFFER
    points["ordered_model"]=pred*BUFFER
    strategies=[]
    for name,col in [("Order for every RSVP","ordered_rsvp"),("Campus average","ordered_campus"),("Platewise","ordered_model")]:
        order=points[col]; actual=points.actual
        strategies.append(dict(strategy=name,servings_ordered=float(order.sum()),servings_wasted=float(np.maximum(0,order-actual).sum()),
          events_ran_short=int((actual-order>.1*actual).sum()),mae_people=float(np.abs(order/(1 if col=="ordered_rsvp" else BUFFER)-actual).mean())))
    cut=1-strategies[2]["servings_wasted"]/strategies[0]["servings_wasted"]
    return dict(train=len(tr),test=len(te),points=points,strategies=strategies,cut=cut,mae=float(np.abs(pred-te.checked_in).mean()))


def headline(r):
    pct=int(np.floor(r["cut"]*100/5)*5)
    return f"On held-out sample events, Platewise cut food waste by about {pct}% compared with ordering for every RSVP (average error {r['mae']:.1f} people)."


def main():
    r=evaluate()
    print(f"Train events: {r['train']}  Test events: {r['test']} (Fall 2026 weeks 9+) -- SAMPLE DATA")
    print(pd.DataFrame(r["strategies"]).to_string(index=False,float_format=lambda x:f"{x:.2f}"))
    print(headline(r));print(f"Unrounded cut: {r['cut']*100:.4f}%")


if __name__=="__main__":main()
