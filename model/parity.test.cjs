const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {setup,root,python}=require('./test-support.cjs');
test('every engineered vector and layered prior matches Python, including unknown clubs and tied timestamps',()=>{
 const {run}=setup();run('globalThis.rows=[...META.events,{...META.events[0],event_id:"unknown",club:"Unknown",category:"tech",rain:1,leftover_pct:null},{...META.events[0],event_id:"unknown2",club:"Unknown",date:"2026-03-02",rain:0},{...META.events[0],event_id:"unknown3",club:"Unknown",date:"2027-08-24",rain:1}];globalThis.eng=engineer(rows);');
 const p=spawnSync(python,['model/feature_dump.py'],{cwd:root,input:run('JSON.stringify({rows,cols:COLS})'),encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);const actual=JSON.parse(p.stdout),expected=JSON.parse(run('JSON.stringify({matrix:eng.map(r=>Array.from(vec(r))),history:eng.map(r=>[r.campus_rate,r.campus_type_rate,r.category_rate,r.category_type_rate])})'));
 for(const key of ['matrix','history']){assert.equal(actual[key].length,expected[key].length);actual[key].forEach((row,i)=>row.forEach((v,j)=>assert.ok(Math.abs(v-expected[key][i][j])<1e-10,`${key} row ${i} column ${j}: ${v} vs ${expected[key][i][j]}`)));}
});
test('JS and Python use matching backtest strategies and cuts within five percentage points',()=>{
 const {run}=setup();run('fitBacktest();');
 const p=spawnSync(python,['-c','import sys,json;sys.path.insert(0,"model");from train_eval import evaluate;r=evaluate();print(json.dumps({k:r[k] for k in ["train","test","cut","mae"]}))'],{cwd:root,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);const py=JSON.parse(p.stdout),js=JSON.parse(run('JSON.stringify(M.backtest)'));
 assert.equal(js.train,py.train);assert.equal(js.n,py.test);assert.ok(Math.abs(js.cut-py.cut)<.05,JSON.stringify({js:js.cut,python:py.cut}));
 assert.equal(js.points.length,js.n);assert.ok(run('backtestHeadline().includes("sample events")'));
 console.log('Sample backtest comparison:',JSON.stringify({js:{cut:js.cut,mae:js.mae},python:py}));
});
test('historical prediction and expanding-fold validation never learn future outcomes',()=>{
 const {run}=setup();run('fitFull();globalThis.ev={...META.events[35]};globalThis.old=predictEvent(ev).people;fitOOF();globalThis.oldOOF=JSON.stringify(Object.entries(M.oof).filter(([id])=>META.events.find(r=>r.event_id===id).date<"2026-09-01"));META.events=META.events.map(r=>r.date>="2026-09-01"?{...r,checked_in:r.rsvps*1.6}:r);fitFull();fitOOF();');
 assert.equal(run('predictEvent(ev).people'),run('old'));
 assert.equal(run('JSON.stringify(Object.entries(M.oof).filter(([id])=>META.events.find(r=>r.event_id===id).date<"2026-09-01"))'),run('oldOOF'));
});
