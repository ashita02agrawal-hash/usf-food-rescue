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
function calendarFeatures(r){
  const week=semesterWeek(r.date),semester=semesterName(r.date);
  return {week,semester,day_of_week:dow(r.date),rain:r.rain===true||+r.rain===1?1:0,
    exam_period:week===7||week===8||week>=(semester.startsWith('Fall')?12:14)?1:0};
}
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
    {k:"hour",g:"hour"},{k:"rsvps",g:"rsvps"},{k:"week",g:"week"},{k:"rain",g:"rain"},{k:"exam_period",g:"exam_period"},
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
    for(let k=i;k<j;k++)out.push({...sorted[k],...calendarFeatures(sorted[k]),...historyFeatures(h,sorted[k],mode)});
    for(let k=i;k<j;k++)addHistory(h,sorted[k]);i=j;
  }
  return out;
}
function vec(e){
  const x = new Float64Array(COLS.length);
  COLS.forEach((c,j)=>{
    const [g,v] = c.k.split(":");
    if(v!==undefined){ x[j] = (g==="club"&&e.club===v)||(g==="type"&&e.event_type===v)||(g==="day"&&e.day_of_week===v)||(g==="loc"&&e.location===v) ? 1 : 0; }
    else x[j] = {hour:e.start_hour,rsvps:e.rsvps,week:e.week,rain:e.rain,exam_period:e.exam_period,club_rate:e.club_rate,club_type_rate:e.club_type_rate,prev_left:e.prev_left,n_events:e.n_events}[c.k];
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
const LEARNED_STORAGE_KEY='pw_model_learned';
function localLearnedRows(){
  // The core broadcasts state.learned's array entries to other tabs. Keep CSV
  // uploads in its non-enumerable private sublist, never in those shared entries.
  // trainingRows merges both lists; existing Report results callers keep working.
  if(!state.learned)state.learned=[];
  if(!Object.hasOwn(state.learned,'privateUploads')){
    Object.defineProperty(state.learned,'privateUploads',{value:store.get(LEARNED_STORAGE_KEY)||[],enumerable:false});
  }
  return [...state.learned,...state.learned.privateUploads];
}
function trainingRows(){ return [...META.events, ...localLearnedRows()]; }
function fitFull(){
  const rows = engineer(trainingRows());
  const X = rows.map(vec), y = rows.map(r=>clamp(r.checked_in/r.rsvps,.03,1.6));
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
    const m=trainGBM(tr.map(vec),tr.map(r=>clamp(r.checked_in/r.rsvps,.03,1.6)),{trees:140});
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
  const tr=rows.filter(r=>r.date<'2026-10-19'), te=rows.filter(isTest);
  const m=trainGBM(tr.map(vec), tr.map(r=>clamp(r.checked_in/r.rsvps,.03,1.6)));
  const campus=mean(tr.map(r=>r.checked_in/r.rsvps));
  const points=te.map(r=>{
    const predicted=coldStartRate(explain(m,vec(r)).value,r)*r.rsvps;
    return {event_id:r.event_id,club:r.club,category:categoryOf(r),actual:r.checked_in,predicted,
      ordered_rsvp:r.rsvps,ordered_campus:campus*r.rsvps*BUFFER,ordered_model:predicted*BUFFER};
  });
  const strategies=[['Order for every RSVP','ordered_rsvp'],['Campus average','ordered_campus'],['Platewise','ordered_model']].map(([strategy,key])=>({
    strategy,servings_ordered:points.reduce((s,p)=>s+p[key],0),
    servings_wasted:points.reduce((s,p)=>s+Math.max(0,p[key]-p.actual),0),
    events_ran_short:points.filter(p=>p.actual-p[key]>.1*p.actual).length,
    mae_people:mean(points.map(p=>Math.abs(p[key]/(key==='ordered_rsvp'?1:BUFFER)-p.actual)))
  }));
  const wasteBase=strategies[0].servings_wasted,wasteModel=strategies[2].servings_wasted;
  M.backtest = {n:te.length,train:tr.length,points,strategies,wasteBase,wasteModel,
    cut:wasteBase?1-wasteModel/wasteBase:0,mae:strategies[2].mae_people,servingsSaved:wasteBase-wasteModel};
}
function backtestHeadline(result=M.backtest){
  if(!result)return 'Run fitBacktest() to evaluate held-out sample events.';
  return `On held-out sample events, Platewise cut food waste by about ${Math.floor(result.cut*20)*5}% compared with ordering for every RSVP (average error ${result.mae.toFixed(1)} people).`;
}
// Predict a planned event for a club
function predictEvent(ev){
  const prior = sortEvents(trainingRows()).filter(r=>r.date<ev.date || (r.date===ev.date && r.start_hour<ev.start_hour));
  const f = histFeatures(prior, ev.club, ev.event_type, ev.category);
  const e = {...ev, ...f,...calendarFeatures(ev)};
  // Historical queries must also exclude future outcomes from the fitted trees.
  let model=M.full;
  if(!model||prior.length!==M.n){
    const rows=engineer(prior);
    model=rows.length?trainGBM(rows.map(vec),rows.map(r=>clamp(r.checked_in/r.rsvps,.03,1.6))):{base:.55,lr:.07,d:COLS.length,trees:[]};
  }
  const x = vec(e), ex = explain(model, x);
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
    case "rain": return e.rain?"Rain expected":"No rain expected";
    case "exam_period": return e.exam_period?"Exam period":"Outside exam period";
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
const GROUP_NAMES = {club:"Which club",type:"Event type",day:"Day of week",loc:"Location",hour:"Start time",rsvps:"RSVP count",week:"Point in semester",rain:"Rain expected",exam_period:"Exam period",club_rate:"Club's recent show rate",club_type_rate:"Club + event type history",prev_left:"Last event's leftovers",n_events:"Club history length",cold_start:"Similar-club prior",rate_limit:"Show-rate safety limit"};

// CSV backend only. No DOM, relay calls, or dependencies.
function csvRecords(text){
  text=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const records=[];let fields=[],field='',quoted=false,closed=false,line=1,start=1,error='';
  const endField=()=>{fields.push(field.trim());field='';closed=false;};
  const endRow=()=>{endField();if(fields.some(v=>v!=='')||error)records.push({row:start,fields,error});fields=[];error='';start=line+1;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else{field+=c;if(c==='\n')line++;}continue;}
    if(c==='"'&&!field.trim()&&!closed){field='';quoted=true;}
    else if(c===',')endField();
    else if(c==='\n'){endRow();line++;}
    else{if(closed&&c.trim())error='Unexpected text after closing quote';field+=c;}
  }
  if(quoted)error='Unclosed quoted field';
  if(field||fields.length||error)endRow();
  return records;
}
function uploadDate(value){
  let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value),y,month,day;
  if(m)[,y,month,day]=m;
  else{m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);if(!m)return null;[,month,day,y]=m;}
  const date=new Date(+y,+month-1,+day,12);
  return date.getFullYear()===+y&&date.getMonth()===+month-1&&date.getDate()===+day?`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
function uploadHour(value){
  const m=/^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)?$/i.exec(value);if(!m)return null;
  let hour=+m[1];if(m[3]){if(hour<1||hour>12)return null;hour=hour%12+(m[3].toUpperCase()==='PM'?12:0);}
  if(hour>23)return null;return hour+(+(m[2]||0))/60;
}
function parseClubCSV(text,club,category='',options={}){
  const accepted=[],problems=[],records=csvRecords(text);
  const fail=(row,reason)=>problems.push({row,reason});
  const header=records.shift();if(!header){fail(1,'CSV is empty');return {accepted,problems};}
  const names=header.fields.map(s=>s.toLowerCase().replace(/[\s_]/g,''));
  const required=['date','eventtype','location','starthour','rsvps','checkedin'];
  const missing=required.filter(k=>!names.includes(k));
  if(header.error||missing.length||new Set(names).size!==names.length||!String(club).trim()){
    fail(header.row,header.error||(missing.length?'Missing required columns: '+missing.join(', '):!String(club).trim()?'Club name is required':'Duplicate column names'));
    return {accepted,problems};
  }
  const today=options.today||(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
  const existing=options.existingRows||[],key=r=>JSON.stringify([r.club,r.date,+r.start_hour]);
  const seen=new Set(existing.map(key)),ids=new Set(existing.map(r=>r.event_id));
  const locations=options.locations||Object.keys(LOCS),types=options.types||TYPES;
  for(const [index,record] of records.entries()){
    const {row,fields,error}=record;
    if(index>=2000){fail(row,'Import limit is 2,000 data rows');continue;}
    if(error||fields.length!==names.length){fail(row,error||'Column count does not match the header');continue;}
    const v=Object.fromEntries(names.map((k,i)=>[k,fields[i]])),issues=[];
    const date=uploadDate(v.date),start_hour=uploadHour(v.starthour),rsvps=Number(v.rsvps),checked_in=Number(v.checkedin);
    const location=v.location.toUpperCase(),event_type=types.find(t=>t.toLowerCase()===v.eventtype.toLowerCase());
    if(!date)issues.push('Invalid date; use YYYY-MM-DD or M/D/YYYY');else if(date>today)issues.push('Date is in the future');
    if(start_hour===null)issues.push('Invalid start hour; use 18, 18:00 or 6:00 PM');
    if(!locations.includes(location))issues.push('Unknown location; valid codes: '+locations.join(', '));
    if(!event_type)issues.push('Unknown event type; valid types: '+types.join(', '));
    if(!v.rsvps||!Number.isFinite(rsvps)||rsvps<=0)issues.push('RSVPs must be greater than 0');
    if(!v.checkedin||!Number.isFinite(checked_in)||checked_in<0)issues.push('Check-ins must be 0 or greater');
    if(Number.isFinite(rsvps)&&checked_in>3*rsvps)issues.push('Check-ins exceed 3 times RSVPs');
    const optional={};
    for(const [column,field] of [['servingsordered','servings_ordered'],['servingsleft','servings_left']]){
      if(v[column]){const n=Number(v[column]);if(!Number.isFinite(n)||n<0)issues.push(field+' must be 0 or greater');else optional[field]=n;}
    }
    if(optional.servings_left>optional.servings_ordered)issues.push('Servings left cannot exceed servings ordered');
    if(v.rain&&!['0','1'].includes(v.rain))issues.push('Rain must be 0 or 1');
    if(v.examperiod&&!['0','1'].includes(v.examperiod))issues.push('Exam period must be 0 or 1');
    if(issues.length){fail(row,issues.join('; '));continue;}
    const event={club:String(club).trim(),category,event_type,date,start_hour,location,rsvps,checked_in,
      ...optional,day_of_week:dow(date),week:semesterWeek(date),semester:semesterName(date),
      leftover_pct:optional.servings_ordered>0&&optional.servings_left!==undefined?100*optional.servings_left/optional.servings_ordered:null,
      rain:Number(v.rain||0),is_sample:0};
    Object.assign(event,calendarFeatures(event));
    if(seen.has(key(event))){fail(row,'Duplicate event for this club, date and hour');continue;}
    seen.add(key(event));
    // Deterministic unique ids make parsing side-effect free and repeatable.
    const base='U:'+encodeURIComponent(event.club)+':'+date+':'+start_hour;let id=base,n=1;
    while(ids.has(id))id=base+':'+n++;ids.add(id);event.event_id=id;
    accepted.push(event);
  }
  return {accepted,problems};
}
function importClubCSV(text,club,category='',options={}){
  const result=parseClubCSV(text,club,category,{...options,existingRows:trainingRows()});
  if(result.accepted.length){
    const combined=[...state.learned.privateUploads,...result.accepted];
    // Fail before mutating memory if the browser cannot persist the upload.
    try{localStorage.setItem(LEARNED_STORAGE_KEY,JSON.stringify(combined));}
    catch(error){throw new Error('Could not save club history on this device. No rows were added.');}
    state.learned.privateUploads.push(...result.accepted);
    fitFull();M.oof={};M.clubResid={};M.residualPoints=[];M.mae=null;
  }
  return {...result,added:result.accepted.length,skipped:result.problems.length,trainingSize:trainingRows().length,
    confidence:modelConfidence(trainingRows().filter(r=>r.club===club).length)};
}
