const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup}=require('./test-support.cjs');
const header='date,event_type,location,start_hour,rsvps,checked_in';
function parse(csv,options={}){const {run,context}=setup();context.csv=csv;context.options=options;return JSON.parse(run('JSON.stringify(parseClubCSV(csv,"New Club","tech",options))'));}
test('clean CSV derives features, real-data label and defaults',()=>{
 const r=parse(header+'\n2026-01-15,Workshop,ENB,18,30,20');assert.equal(r.problems.length,0);
 assert.equal(r.accepted[0].day_of_week,'Thu');assert.equal(r.accepted[0].week,1);assert.equal(r.accepted[0].is_sample,0);
 assert.equal(r.accepted[0].leftover_pct,null);
});
test('spreadsheet exports support BOM CRLF quotes commas order case blank lines and fractional times',()=>{
 const r=parse('\uFEFFChecked In, Notes, Start Hour, LOCATION,Event_Type,Date,RSVPs\r\n20,"hello, ""team""",6:30 PM,enb,workshop,1/15/2026,30\r\n\r\n21,ok,18:00,LIB,Social,2026-01-22,32');
 assert.equal(r.problems.length,0);assert.equal(r.accepted.length,2);assert.equal(r.accepted[0].start_hour,18.5);
});
test('every invalid value has a clear row-level reason',()=>{
 const cases=[['2026-01-15,Workshop,NOPE,18,30,20','Unknown location'],['2026-01-15,Banana,ENB,18,30,20','Unknown event type'],
 ['2026-01-15,Workshop,ENB,18,0,20','RSVPs'],['2026-01-15,Workshop,ENB,18,30,-1','Check-ins'],
 ['2026-01-15,Workshop,ENB,18,30,91','3 times'],['2099-01-15,Workshop,ENB,18,30,20','future'],
 ['2026-02-30,Workshop,ENB,18,30,20','Invalid date'],['2026-01-15,Workshop,ENB,25,30,20','Invalid start'],
 ['2026-01-15,Workshop,ENB,18,NaN,20','RSVPs'],['2026-01-15,Workshop,ENB,18,30,','Check-ins']];
 for(const [row,reason]of cases){const r=parse(header+'\n'+row);assert.equal(r.accepted.length,0);assert.equal(r.problems[0].row,2);assert.ok(r.problems[0].reason.includes(reason));}
 for(const [extra,value,reason]of [['rain','2','Rain'],['exam_period','2','Exam'],['servings_left','-1','servings_left']]){
  assert.match(parse(header+','+extra+'\n2026-01-15,Workshop,ENB,18,30,20,'+value).problems[0].reason,new RegExp(reason));
 }
 assert.match(parse('date\n2026-01-15').problems[0].reason,/Missing/);
 assert.match(parse(header+'\n"bad').problems[0].reason,/Unclosed/);
});
test('duplicates against existing records and within an upload are skipped with physical line numbers',()=>{
 const row='2026-01-15,Workshop,ENB,18,30,20',first=parse(header+'\n'+row).accepted;
 const r=parse(header+'\n\n'+row+'\n'+row,{existingRows:first});assert.equal(r.accepted.length,0);assert.deepEqual(r.problems.map(p=>p.row),[3,4]);
 assert.equal(parse(header+'\n'+row+'\n'+row).accepted.length,1);
});
test('2000-row cap counts rejected and duplicate records as well',()=>{
 const r=parse(header+'\n'+Array(2001).fill('2026-01-15,Workshop,ENB,18,30,20').join('\n'));
 assert.match(r.problems.at(-1).reason,/2,000/);
});
test('upload retrains, improves confidence, persists privately and survives shared-state replacement',()=>{
 const {run,context}=setup();const stored=new Map();context.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
 context.structuredClone=structuredClone;context.csv=fs.readFileSync(path.join(__dirname,'../data/example_club_upload.csv'),'utf8');
 run('globalThis.calls=0;bc={postMessage:()=>calls++};fitFull();globalThis.before=predictEvent({club:"New Club",category:"tech",event_type:"Workshop",date:"2027-01-15",start_hour:18,location:"ENB",rsvps:30});globalThis.result=importClubCSV(csv,"New Club","tech");');
 assert.equal(run('before.confidence.level'),'low');assert.equal(run('result.added'),7);assert.equal(run('result.skipped'),5);assert.equal(run('result.confidence.level'),'medium');
 assert.equal(run('M.n'),context.meta.events.length+7);assert.equal(run('calls'),0);
 assert.equal(run('JSON.stringify(state).includes("New Club")'),false);assert.equal(run('JSON.stringify(structuredClone(state)).includes("New Club")'),false);
 assert.equal(run('JSON.stringify(slim()).includes("New Club")'),false);
 assert.equal(run('importClubCSV(csv,"New Club","tech").added'),0);
 run('state=freshState();fitFull();');assert.equal(run('M.n'),context.meta.events.length+7);
 // Existing report-results path still persists through the core's normal save.
 run('state.learned.push({...META.events[0],event_id:"reported",club:"Reported"});fitFull();save();');
 assert.ok(stored.get('pw_state').includes('Reported'));assert.ok(!stored.get('pw_state').includes('New Club'));
});
