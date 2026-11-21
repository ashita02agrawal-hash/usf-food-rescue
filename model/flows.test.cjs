const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root}=require('./test-support.cjs');
test('unchanged main app boots and its plan/save/report/retrain flow still works',async()=>{
 const nodes=new Map(),saved=new Map();
 const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',hidden:false,querySelector:node,querySelectorAll:()=>[],setAttribute(){}});return nodes.get(s);};
 const meta=JSON.parse(fs.readFileSync(path.join(root,'web/data/sample_events.json'),'utf8'));
 const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
   fetch:async()=>({json:async()=>meta}),setTimeout:f=>f(),setInterval(){},addEventListener(){},innerWidth:1200,navigator:{},location:{protocol:'http:'},console});
 const run=code=>vm.runInContext(code,context);
 for(const file of ['core','model','club','student','app'])run(fs.readFileSync(path.join(root,'web/js/'+file+'.js'),'utf8'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(run('M.n'),meta.events.length);assert.match(node('#modelStatus').textContent,/gradient-boosted/);
 run('ui={club:"ACM",student:null,view:"club",clubTab:"plan"};toast=()=>{};');
 for(const [id,value]of Object.entries({pType:'General meeting',pDate:'2027-01-14',pHour:'18',pLoc:'ENB',pRsvp:'50',pFood:'pizza'}))node('#'+id).value=value;
 run('renderPlan();');assert.match(node('#recBox').innerHTML,/Platewise recommendation/);
 node('#saveEv').onclick();assert.ok(run('state.planned.at(-1).ordered>0'));
 run('openReport(state.planned.at(-1).id);');
 for(const [id,value]of Object.entries({rIn:'20',rLeft:'8',rOut:'12:00',rWin:'20',rFood:'pizza',rCaterer:'Cafe',rSpot:'Lobby',rDuty:'Sam'}))node('#'+id).value=value;
 node('#rRescue').checked=true;run('submitReport(state.planned.at(-1));');
 assert.equal(run('M.n'),meta.events.length+1);assert.equal(run('state.planned.at(-1).status'),'reported');assert.equal(run('state.posts.at(-1).total'),8);
 assert.equal(JSON.parse(saved.get('pw_state')).learned.length,1);
});
