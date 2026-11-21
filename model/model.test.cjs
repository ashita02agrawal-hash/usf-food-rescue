const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./test-support.cjs');
test('future and simultaneous outcomes cannot change history features',()=>{
 const {run}=setup();
 run('globalThis.rows=META.events.slice(0,20);globalThis.first=engineer(rows);rows[19]={...rows[19],checked_in:9999};globalThis.second=engineer(rows);');
 assert.equal(run('JSON.stringify(first.slice(0,19))===JSON.stringify(second.slice(0,19))'),true);
 assert.equal(run('engineer([{...rows[0],club:"A",checked_in:1},{...rows[0],club:"B",checked_in:99}])[1].campus_rate'),.55);
});
test('unknown club gets confidence and exact additive explanation without prior OOF',()=>{
 const {run}=setup();run('fitFull();globalThis.p=predictEvent({club:"New",category:"tech",event_type:"Workshop",date:"2027-01-14",start_hour:18,location:"ENB",rsvps:60});');
 assert.equal(run('p.confidence.level'),'low');assert.equal(run('p.confidence.pastEvents'),0);
 assert.ok(run('p.high-p.people>=p.people*.35-.5'));
 assert.ok(run('Math.abs(p.base+Object.values(p.groups).reduce((a,b)=>a+b,0)-p.people)<1e-8'));
});
test('confidence thresholds and error downgrade',()=>{
 const {run}=setup();assert.equal(run('modelConfidence(2).level'),'low');assert.equal(run('modelConfidence(3).level'),'medium');
 assert.equal(run('modelConfidence(8).level'),'high');assert.equal(run('modelConfidence(8,20,30).level'),'medium');
});
