const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function app(){
  const nodes=new Map();
  const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',hidden:false,querySelector:node,querySelectorAll:()=>[]});return nodes.get(s);};
  const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[]},localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout:f=>f()});
  const run=s=>vm.runInContext(s,context);
  for(const f of ['core','model','club','student'])run(fs.readFileSync(`web/js/${f}.js`,'utf8'));
  context.meta=JSON.parse(fs.readFileSync('web/data/sample_events.json','utf8'));
  run('META=meta;LOCS=META.locations;CLUBS=META.clubs.map(c=>c.club);state=freshState();ui={club:"ACM",student:ME,near:"LIB"};buildCols();fitFull();seed("ACM");toast=()=>{};onStateChange=()=>{};');
  return {run,node};
}
test('club engine trains, predicts and learns without prediction UI',()=>{
  const a=app();assert.equal(a.run('M.n'),a.run('META.events.length'));
  const p=a.run('predictEvent({club:"ACM",event_type:"General meeting",date:"2026-11-25",start_hour:18,location:"ENB",rsvps:73,food_item:"bagels & cookies"})');
  assert.ok(Number.isFinite(p.people)&&p.servings>0);
  a.run('state.learned.push({...META.events[0],event_id:"new"});fitFull()');assert.equal(a.run('M.n'),a.run('META.events.length')+1);
});
test('club renders manual event planning and safely restores an old insights tab',()=>{
  const a=app();a.run('ui.clubTab="insights";renderClub()');assert.equal(a.run('ui.clubTab'),'events');
  assert.doesNotMatch(a.node('#clubPane').innerHTML,/Insights|prediction/i);
  assert.doesNotMatch(a.node('#clubBody').innerHTML,/Platewise expects|Predicted/);
  a.run('ui.clubTab="plan";renderClub()');
  assert.match(a.node('#clubBody').innerHTML,/Servings ordered/);assert.doesNotMatch(a.node('#clubBody').innerHTML,/recBox|Why this number/);
  for(const [id,v] of Object.entries({pType:'General meeting',pDate:'2026-11-25',pHour:'18',pLoc:'ENB',pRsvp:'50',pFood:'pizza',pOrdered:'24'}))a.node('#'+id).value=v;
  a.node('#planForm').onsubmit({preventDefault(){}});assert.equal(a.run('state.planned.at(-1).ordered'),24);
});
test('student feed and claiming work without a student prediction engine',()=>{
  const a=app();a.run('renderStudent()');assert.match(a.node('#studentPane').innerHTML,/Free food near you/);
  assert.doesNotMatch(a.node('#studentPane').innerHTML,/confidence|Food predictions|Monte Carlo/i);
  a.run('claim(state.posts[0].id,2)');assert.equal(a.run('state.claims.length'),1);
  a.run('claim(state.posts[0].id,1)');assert.equal(a.run('state.claims.length'),1);
  a.run('cancelClaim(state.claims[0].id)');assert.equal(a.run('state.claims[0].status'),'canceled');
});
test('result reporting preserves model learning and rescue publication',()=>{
  const a=app();a.run('openReport(state.planned[0].id)');
  assert.doesNotMatch(a.node('#sheetRoot').innerHTML,/expected|retrain|predicted/i);
  for(const [id,v] of Object.entries({rIn:'20',rLeft:'8',rOut:'12:00',rWin:'20',rFood:'pizza',rCaterer:'Cafe',rSpot:'Lobby',rDuty:'Sam'}))a.node('#'+id).value=v;
  a.node('#rRescue').checked=true;a.run('submitReport(state.planned[0])');
  assert.equal(a.run('state.learned.length'),1);assert.equal(a.run('M.n'),a.run('META.events.length')+1);assert.equal(a.run('state.posts.at(-1).total'),8);
});
test('retired student modules are absent and all offline shell files exist',()=>{
  for(const f of ['web/js/claim_sim.js','web/js/student_food.js','web/data/sample_events.csv'])assert.equal(fs.existsSync(f),false);
  const worker=fs.readFileSync('web/sw.js','utf8');
  const ctx=vm.createContext({self:{addEventListener(){}}});vm.runInContext(worker,ctx);
  for(const p of vm.runInContext('SHELL',ctx))assert.ok(fs.existsSync('web/'+p),p);
  assert.match(worker,/bullsbites-v6/);
  const html=fs.readFileSync('web/index.html','utf8');assert.doesNotMatch(html,/claim_sim|student_food|modelStatus/);
});
