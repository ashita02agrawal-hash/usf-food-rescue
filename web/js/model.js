/* model.js
 * Owner: Model teammate
 * Turnout model: feature engineering, gradient-boosted trees, explanations, food recommendation.
 */
"use strict";
// ============================================================
// MODEL: gradient-boosted regression trees, written from scratch.
// Target = show rate (checked in / RSVPs), so walk-ins can push it over 100%.
// Trained in the browser, so it retrains the moment a club reports results.
// ============================================================
const PRIOR_RATE = 0.55, PRIOR_N = 3;
let META, CLUBS, LOCS, COLS;

function buildCols(){
  COLS = [
    ...CLUBS.map(c=>({k:"club:"+c, g:"club"})),
    ...TYPES.map(t=>({k:"type:"+t, g:"type"})),
    ...DAYS.map(d=>({k:"day:"+d, g:"day"})),
    ...Object.keys(LOCS).map(l=>({k:"loc:"+l, g:"loc"})),
    {k:"hour",g:"hour"},{k:"rsvps",g:"rsvps"},{k:"week",g:"week"},
    {k:"club_rate",g:"club_rate"},{k:"club_type_rate",g:"club_type_rate"},{k:"prev_left",g:"prev_left"},{k:"n_events",g:"n_events"},
  ];
}
// History features computed only from events BEFORE this one (no peeking).
function histFeatures(prior, club, type){
  const h = prior.filter(r=>r.club===club);
  const recent = h.slice(-6).map(r=>r.checked_in/r.rsvps);
  const ct = h.filter(r=>r.event_type===type).slice(-4).map(r=>r.checked_in/r.rsvps);
  return {
    club_rate:(recent.reduce((s,x)=>s+x,0)+PRIOR_RATE*PRIOR_N)/(recent.length+PRIOR_N),
    club_type_rate:(ct.reduce((s,x)=>s+x,0)+PRIOR_RATE*PRIOR_N)/(ct.length+PRIOR_N),
    prev_left: h.length && h[h.length-1].leftover_pct!=null ? h[h.length-1].leftover_pct : 30,
    n_events:h.length,
  };
}
function sortEvents(rows){ return rows.slice().sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:a.start_hour-b.start_hour); }
function engineer(rows){
  const sorted = sortEvents(rows), byClub = {};
  return sorted.map(r=>{
    const prior = byClub[r.club] || (byClub[r.club]=[]);
    const f = histFeatures(prior, r.club, r.event_type);
    prior.push(r);
    return {...r, ...f};
  });
}
function vec(e){
  const x = new Float64Array(COLS.length);
  COLS.forEach((c,j)=>{
    const [g,v] = c.k.split(":");
    if(v!==undefined){ x[j] = (g==="club"&&e.club===v)||(g==="type"&&e.event_type===v)||(g==="day"&&e.day_of_week===v)||(g==="loc"&&e.location===v) ? 1 : 0; }
    else x[j] = {hour:e.start_hour,rsvps:e.rsvps,week:e.week,club_rate:e.club_rate,club_type_rate:e.club_type_rate,prev_left:e.prev_left,n_events:e.n_events}[c.k];
  });
  return x;
}
function trainGBM(X, y, {trees=180, depth=3, lr=0.07, minLeaf=5, sub=0.85, seed=7}={}){
  const n=X.length, d=X[0].length, rng=makeRng(seed);
  const order=[]; for(let j=0;j<d;j++){ const idx=Array.from({length:n},(_,i)=>i); idx.sort((a,b)=>X[a][j]-X[b][j]); order.push(idx); }
  const base=mean(y), F=new Float64Array(n).fill(base), r=new Float64Array(n), inNode=new Uint8Array(n), out=[];
  function build(idx, dep){
    let sum=0; for(const i of idx) sum+=r[i];
    const node={m:sum/idx.length};
    if(dep>=depth || idx.length<2*minLeaf) return node;
    for(const i of idx) inNode[i]=1;
    const N=idx.length; let best=sum*sum/N+1e-9, bf=-1, bt=0;
    for(let j=0;j<d;j++){
      let ls=0, lc=0, last=-Infinity; const ord=order[j];
      for(let k=0;k<n;k++){ const i=ord[k]; if(!inNode[i]) continue; const v=X[i][j];
        if(v>last && lc>=minLeaf && N-lc>=minLeaf){ const rs=sum-ls, g=ls*ls/lc+rs*rs/(N-lc); if(g>best){best=g;bf=j;bt=(last+v)/2;} }
        ls+=r[i]; lc++; last=v; }
    }
    for(const i of idx) inNode[i]=0;
    if(bf<0) return node;
    const L=[], R=[]; for(const i of idx) (X[i][bf]<=bt?L:R).push(i);
    node.f=bf; node.t=bt; node.l=build(L,dep+1); node.r=build(R,dep+1);
    return node;
  }
  const leaf=(node,x)=>{ while(node.f!==undefined) node = x[node.f]<=node.t?node.l:node.r; return node.m; };
  for(let t=0;t<trees;t++){
    for(let i=0;i<n;i++) r[i]=y[i]-F[i];
    const idx=[]; for(let i=0;i<n;i++) if(rng()<sub) idx.push(i);
    const tree=build(idx,0); out.push(tree);
    for(let i=0;i<n;i++) F[i]+=lr*leaf(tree,X[i]);
  }
  return {base, lr, trees:out, d};
}
// Prediction + exact per-feature contributions (Saabas path attribution):
// each split moves the running average; that move is credited to the split's feature.
function explain(model, x){
  const c=new Float64Array(model.d); let bias=model.base, val=model.base;
  for(const tree of model.trees){
    let node=tree; bias+=model.lr*node.m;
    while(node.f!==undefined){ const ch = x[node.f]<=node.t?node.l:node.r; c[node.f]+=model.lr*(ch.m-node.m); node=ch; }
    val+=model.lr*node.m;
  }
  return {value:val, bias, contrib:c};
}
const predictRate = (model,x) => clamp(explain(model,x).value, 0.03, 1.6);

// Model state
const M = { full:null, n:0, mae:null, oof:{}, backtest:null, importance:null, clubResid:{} };
function trainingRows(){ return [...META.events, ...state.learned]; }
function fitFull(){
  const rows = engineer(trainingRows());
  const X = rows.map(vec), y = rows.map(r=>r.checked_in/r.rsvps);
  M.full = trainGBM(X,y); M.n = rows.length;
  // global importance = mean |contribution| in people, grouped
  const imp = {};
  rows.forEach((r,i)=>{ const e=explain(M.full,X[i]); COLS.forEach((c,j)=>{ imp[c.g]=(imp[c.g]||0)+Math.abs(e.contrib[j])*r.rsvps; }); });
  M.importance = Object.entries(imp).map(([g,v])=>[g,v/rows.length]).sort((a,b)=>b[1]-a[1]);
}
function fitOOF(){
  // 5-fold out-of-fold predictions for the predicted-vs-actual chart
  const rows = engineer(META.events), X=rows.map(vec), y=rows.map(r=>r.checked_in/r.rsvps);
  const rng=makeRng(3), fold=rows.map(()=>Math.floor(rng()*5)), errs=[];
  for(let k=0;k<5;k++){
    const tr=rows.map((_,i)=>i).filter(i=>fold[i]!==k);
    const m=trainGBM(tr.map(i=>X[i]), tr.map(i=>y[i]), {trees:140});
    rows.forEach((r,i)=>{ if(fold[i]===k){ const p=predictRate(m,X[i])*r.rsvps; M.oof[r.event_id]=p; errs.push(Math.abs(p-r.checked_in)); (M.clubResid[r.club]||(M.clubResid[r.club]=[])).push(r.checked_in-p); } });
  }
  M.mae = mean(errs);
}
function fitBacktest(){
  // Same split as model/train_eval.py: train before Fall 2026 week 9, test after.
  const rows = engineer(META.events);
  const isTest = r => r.semester==="Fall 2026" && r.week>=9;
  const tr=rows.filter(r=>!isTest(r)), te=rows.filter(isTest);
  const m=trainGBM(tr.map(vec), tr.map(r=>r.checked_in/r.rsvps));
  let wasteBase=0, wasteModel=0, ordBase=0, ordModel=0, err=0;
  te.forEach(r=>{ const p=predictRate(m,vec(r))*r.rsvps, ord=p*BUFFER; ordBase+=r.rsvps; ordModel+=ord; wasteBase+=Math.max(0,r.rsvps-r.checked_in); wasteModel+=Math.max(0,ord-r.checked_in); err+=Math.abs(p-r.checked_in); });
  M.backtest = {n:te.length, wasteBase, wasteModel, cut:1-wasteModel/wasteBase, mae:err/te.length, servingsSaved:wasteBase-wasteModel};
}
// Predict a planned event for a club
function predictEvent(ev){
  const prior = sortEvents(trainingRows()).filter(r=>r.date<ev.date || (r.date===ev.date && r.start_hour<ev.start_hour));
  const f = histFeatures(prior, ev.club, ev.event_type);
  const e = {...ev, ...f, week:semesterWeek(ev.date), day_of_week:dow(ev.date)};
  const x = vec(e), ex = explain(M.full, x);
  const rate = clamp(ex.value,0.03,1.6), people = rate*ev.rsvps;
  const resid = M.clubResid[ev.club] || [];
  const sd = resid.length>3 ? Math.sqrt(mean(resid.map(v=>v*v))) : Math.max(3, people*0.2);
  const servings = Math.ceil(people*BUFFER);
  // group contributions into human reasons (in people)
  const groups = {};
  COLS.forEach((c,j)=>{ groups[c.g]=(groups[c.g]||0)+ex.contrib[j]*ev.rsvps; });
  return {people, rate, low:Math.max(1,Math.round(people-sd)), high:Math.round(people+sd), servings, base:ex.bias*ev.rsvps, groups, feats:e};
}
function reasonLabel(g, e){
  const L = LOCS[e.location]?.name || e.location;
  switch(g){
    case "club": return `${e.club}'s own pattern`;
    case "type": return `Event type: ${e.event_type.toLowerCase()}`;
    case "day": return `${DAY_NAMES[e.day_of_week]}`;
    case "loc": return e.location==="MSC" ? "MSC foot traffic (walk-ins)" : `Location: ${L}`;
    case "hour": return `Starts at ${fmtHour(e.start_hour)}`;
    case "rsvps": return `RSVP count (${e.rsvps})`;
    case "week": return `Week ${e.week} of the semester`;
    case "club_rate": return `Club's recent show rate (${Math.round(e.club_rate*100)}%)`;
    case "club_type_rate": return `Past ${e.event_type.toLowerCase()}s for this club (${Math.round(e.club_type_rate*100)}%)`;
    case "prev_left": return `Last event had ${Math.round(e.prev_left)}% left over`;
    case "n_events": return `How much history the club has`;
  }
  return g;
}
const GROUP_NAMES = {club:"Which club",type:"Event type",day:"Day of week",loc:"Location",hour:"Start time",rsvps:"RSVP count",week:"Point in semester",club_rate:"Club's recent show rate",club_type_rate:"Club + event type history",prev_left:"Last event's leftovers",n_events:"Club history length"};
