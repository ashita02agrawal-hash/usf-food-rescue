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
const CLUB_CATEGORIES = {ACM:"tech","HackJam Workshops":"tech","Robotics Club":"tech","Pre-Med Society":"professional","Finance Association":"professional","Entrepreneurship Club":"professional","Society of Women Engineers":"professional","Indian Student Association":"cultural","Black Student Union":"cultural","Vietnamese Student Association":"cultural","Village STEM LLC":"residential","Chess Club":"recreation","Campus Rec Outdoors":"recreation"};
const categoryOf = r => r.category || META?.clubs?.find(c=>c.club===r.club)?.category || CLUB_CATEGORIES[r.club] || "";
const beforeEvent = (a,b) => a.date<b.date || (a.date===b.date && +a.start_hour<+b.start_hour);
function historyIndex(){ return {all:[],types:new Map(),categories:new Map(),categoryTypes:new Map(),clubs:new Map()}; }
function addHistory(h,r){
  const push=a=>{a.push(r);a.rateSum=(a.rateSum||0)+r.checked_in/r.rsvps;};
  const append=(map,key)=>{ if(!map.has(key))map.set(key,[]);push(map.get(key)); };
  push(h.all);append(h.types,r.event_type);append(h.clubs,r.club);
  const cat=categoryOf(r);if(cat){append(h.categories,cat);append(h.categoryTypes,cat+"|"+r.event_type);}
}
function historyFeatures(h,ev,mode="layered"){
  const rate=a=>a.checked_in/a.rsvps;
  const sum=a=>a.rateSum??a.reduce((s,r)=>s+rate(r),0);
  const average=(a,fallback)=>a.length?sum(a)/a.length:fallback;
  const shrink=(a,prior)=>(sum(a)+PRIOR_N*prior)/(a.length+PRIOR_N);
  const club=h.clubs.get(ev.club)||[],cat=categoryOf(ev);
  const campus=average(h.all,PRIOR_RATE);
  const type=shrink(h.types.get(ev.event_type)||[],campus);
  const category=shrink(h.categories.get(cat)||[],campus);
  const categoryType=shrink(h.categoryTypes.get(cat+"|"+ev.event_type)||[],type);
  const recent=club.slice(-6),ct=club.filter(r=>r.event_type===ev.event_type).slice(-4);
  return {club_rate:shrink(recent,mode==="flat"?PRIOR_RATE:category),
    club_type_rate:shrink(ct,mode==="flat"?PRIOR_RATE:categoryType),
    prev_left:club.at(-1)?.leftover_pct??30,n_events:club.length,
    campus_rate:campus,campus_type_rate:type,category_rate:category,category_type_rate:categoryType};
}

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
function histFeatures(prior, club, type, category){
  const h=historyIndex();sortEvents(prior).forEach(r=>addHistory(h,r));
  return historyFeatures(h,{club,event_type:type,category});
}
function sortEvents(rows){ return rows.slice().sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:a.start_hour-b.start_hour); }
function engineer(rows, mode="layered"){
  const sorted=sortEvents(rows),h=historyIndex(),out=[];
  // Score simultaneous events as a batch before adding any of their outcomes.
  for(let i=0;i<sorted.length;){
    let j=i+1;while(j<sorted.length && !beforeEvent(sorted[i],sorted[j]))j++;
    for(let k=i;k<j;k++)out.push({...sorted[k],...historyFeatures(h,sorted[k],mode)});
    for(let k=i;k<j;k++)addHistory(h,sorted[k]);i=j;
  }
  return out;
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
    if(!idx.length)idx.push(0);
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
function coldStartRate(raw,e){
  const weight=Math.min(1,e.n_events/3);
  return clamp(weight*raw+(1-weight)*(0.75*e.club_rate+0.25*e.club_type_rate),0.03,1.6);
}

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
  // Expanding time folds replace random folds, which trained on future outcomes.
  const rows=engineer(trainingRows()),errs=[];M.oof={};M.clubResid={};M.residualPoints=[];
  const size=Math.max(1,Math.ceil(rows.length/6));
  for(let start=size;start<rows.length;start+=size){
    const tr=rows.slice(0,start).filter(r=>beforeEvent(r,rows[start]));if(!tr.length)continue;
    const m=trainGBM(tr.map(vec),tr.map(r=>r.checked_in/r.rsvps),{trees:140});
    rows.slice(start,start+size).forEach(r=>{const p=coldStartRate(explain(m,vec(r)).value,r)*r.rsvps,error=r.checked_in-p;
      M.oof[r.event_id]=p;errs.push(Math.abs(error));(M.clubResid[r.club]||(M.clubResid[r.club]=[])).push(error);
      M.residualPoints.push({club:r.club,date:r.date,start_hour:r.start_hour,error});});
  }
  M.mae=errs.length?mean(errs):null;
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
  const f = histFeatures(prior, ev.club, ev.event_type, ev.category);
  const e = {...ev, ...f, week:semesterWeek(ev.date), day_of_week:dow(ev.date)};
  const x = vec(e), ex = explain(M.full, x);
  const rate = coldStartRate(ex.value,e), people = rate*ev.rsvps;
  const resid = (M.residualPoints||[]).filter(r=>r.club===ev.club && beforeEvent(r,ev)).map(r=>r.error);
  const typical=resid.length>3?Math.sqrt(mean(resid.map(v=>v*v))):0;
  const sd = Math.max(typical,3,people*(f.n_events<4?0.35:0.2));
  const confidence=modelConfidence(f.n_events,typical,people);
  const servings = Math.ceil(people*BUFFER);
  // group contributions into human reasons (in people)
  const groups = {};
  COLS.forEach((c,j)=>{ groups[c.g]=(groups[c.g]||0)+ex.contrib[j]*ev.rsvps; });
  // Account for output clipping so grouped explanations still sum to people.
  if(rate!==ex.value)groups[f.n_events<3?"cold_start":"rate_limit"]=(rate-ex.value)*ev.rsvps;
  return {people, rate, low:Math.max(0,Math.round(people-sd)), high:Math.round(people+sd), servings, base:ex.bias*ev.rsvps, groups, feats:e,confidence};
}
function modelConfidence(pastEvents,typicalError=0,people=Infinity){
  let level=pastEvents<3?0:pastEvents<8?1:2;
  if(typicalError>Math.max(3,people*0.35))level=Math.max(0,level-1);
  const name=["low","medium","high"][level];
  return {level:name,pastEvents,text:`${name[0].toUpperCase()+name.slice(1)} confidence · ${pastEvents} past events`};
}
function reasonLabel(g, e){
  const L = LOCS[e.location]?.name || e.location;
  switch(g){
    case "cold_start": return "Similar-club prior while history is limited";
    case "rate_limit": return "Show-rate safety limit";
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
