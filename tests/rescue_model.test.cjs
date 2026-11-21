const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Runs the app scripts against a tiny fake DOM, so the club and student flows can be checked without a browser.
function app(){
  const nodes=new Map();
  const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',checked:false,hidden:false,querySelector:node,querySelectorAll:()=>[],addEventListener(){},setAttribute(){},getBoundingClientRect:()=>({left:0,width:720})});return nodes.get(s);};
  const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[],getElementById:()=>null},localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout:f=>f(),console});
  const run=s=>vm.runInContext(s,context);
  for(const f of ['core','model','club','student'])run(fs.readFileSync(`web/js/${f}.js`,'utf8'));
  context.meta=JSON.parse(fs.readFileSync('web/data/sample_events.json','utf8'));
  run('META=meta;LOCS=META.locations;CLUBS=META.clubs.map(c=>c.club);state=freshState();ui={club:"ACM",student:ME};buildCols();fitFull();seed("ACM");toast=()=>{};onStateChange=()=>{};bbSplash=false;');
  return {run,node};
}
test('model trains, predicts and learns from a reported event',()=>{
  const a=app();assert.equal(a.run('M.n'),a.run('META.events.length'));
  const p=a.run('predictEvent({club:"ACM",event_type:"General meeting",date:"2026-11-18",start_hour:18,location:"ENB",rsvps:73,food_item:"bagels & cookies"})');
  assert.ok(Number.isFinite(p.people)&&p.servings>0);
  a.run('state.learned.push({...META.events[0],event_id:"new"});fitFull()');assert.equal(a.run('M.n'),a.run('META.events.length')+1);
});
test('a building the model has never seen still gets a prediction',()=>{
  const a=app();
  const p=a.run('predictEvent({club:"ACM",event_type:"Workshop",date:"2026-11-18",start_hour:18,location:"Juniper-Poplar Hall",rsvps:40,food_item:"pizza"})');
  assert.ok(Number.isFinite(p.people)&&p.people>0&&p.people<=64);
});
test('club plans an event from the recommendation and saves it',()=>{
  const a=app();a.run('ui.clubTab="plan";renderClub()');
  for(const [id,v] of Object.entries({pType:'General meeting',pDate:'2026-11-18',pHour:'18',pLoc:'Engineering Building II',pRsvp:'50',pFood:'pizza',pRoom:'109'}))a.node('#'+id).value=v;
  a.run('updateRec()');assert.match(a.node('#recBox').innerHTML,/Our recommendation/);
  const before=a.run('state.planned.length');a.node('#saveEv').onclick();
  assert.equal(a.run('state.planned.length'),before+1);assert.equal(a.run('state.planned.at(-1).location'),'ENB');
});
test('CSV upload accepts any building and a header in any column order',()=>{
  const a=app();a.run('ui.clubTab="insights";renderClub()');
  a.node('#csv').value='rsvps,checked_in,date,event_type,location,start_hour\n40,12,2026-10-01,workshop,Juniper-Poplar Hall,18\n30,9,2026-10-08,Social,MSC,17\nbad,row';
  a.run('uploadCsv("ACM")');
  assert.equal(a.run('JSON.stringify(state.learned.map(r=>r.location))'),'["Juniper-Poplar Hall","MSC"]');
  assert.equal(a.run('state.learned[0].event_type'),'Workshop');
});
test('student feed, vegetarian filter, claiming and canceling',()=>{
  const a=app();a.run('renderStudent()');assert.match(a.node('#studentPane').innerHTML,/Free food right now/);
  a.run('ui.diet="veg";renderStudent()');assert.match(a.node('#studentPane').innerHTML,/No vegetarian food posted/);
  a.run('claim(state.posts[0].id,2)');assert.equal(a.run('state.claims.length'),1);
  a.run('claim(state.posts[0].id,1)');assert.equal(a.run('state.claims.length'),1);
  a.run('cancelClaim(state.claims[0].id)');assert.equal(a.run('state.claims[0].status'),'canceled');
});
test('reporting results retrains the model and posts the leftovers',()=>{
  const a=app();a.run('openReport(state.planned[0].id)');
  for(const [id,v] of Object.entries({rIn:'20',rLeft:'8',rOut:'12:00',rWin:'20',rFood:'pizza',rCaterer:'Cafe',rSpot:'Lobby'}))a.node('#'+id).value=v;
  a.node('#rRescue').checked=true;a.node('#rVeg').checked=true;a.run('submitReport(state.planned[0])');
  assert.equal(a.run('state.learned.length'),1);assert.equal(a.run('M.n'),a.run('META.events.length')+1);
  assert.equal(a.run('state.posts.at(-1).total'),8);assert.equal(a.run('state.posts.at(-1).veg'),true);
});
test('every offline shell file exists',()=>{
  const worker=fs.readFileSync('web/sw.js','utf8');
  const ctx=vm.createContext({self:{addEventListener(){}}});vm.runInContext(worker,ctx);
  for(const p of vm.runInContext('SHELL',ctx))assert.ok(fs.existsSync('web/'+p),p);
});
