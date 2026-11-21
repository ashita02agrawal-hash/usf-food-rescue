const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root}=require('./test-support.cjs');
test('app boots without prediction screens and manual planning/reporting retrains the club model',async()=>{
 const nodes=new Map(),saved=new Map();
 const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',hidden:false,querySelector:node,querySelectorAll:()=>[],setAttribute(){}});return nodes.get(s);};
 const meta=JSON.parse(fs.readFileSync(path.join(root,'web/data/sample_events.json'),'utf8'));
 const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
   fetch:async()=>({json:async()=>meta}),setTimeout:f=>f(),setInterval(){},addEventListener(){},innerWidth:1200,navigator:{},location:{protocol:'http:'},console});
 const run=code=>vm.runInContext(code,context);
 for(const file of ['core','model','club','student','app'])run(fs.readFileSync(path.join(root,'web/js/'+file+'.js'),'utf8'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(run('M.n'),meta.events.length);assert.equal(nodes.has('#modelStatus'),false);
 assert.equal(run('M.backtest'),null);
 run('ui={club:"ACM",student:null,view:"club",clubTab:"plan"};toast=()=>{};');
 run('renderPlan();');assert.match(node('#clubBody').innerHTML,/Servings ordered/);
 assert.doesNotMatch(node('#clubBody').innerHTML,/recBox|Why this number|Platewise recommendation/);
 for(const [id,value]of Object.entries({pType:'General meeting',pDate:'2027-01-14',pHour:'18',pLoc:'ENB',pRsvp:'50',pFood:'pizza',pOrdered:'28'}))node('#'+id).value=value;
 node('#planForm').onsubmit({preventDefault(){}});assert.equal(run('state.planned.at(-1).ordered'),28);
 run('openReport(state.planned.at(-1).id);');
 for(const [id,value]of Object.entries({rIn:'20',rLeft:'8',rOut:'12:00',rWin:'20',rFood:'pizza',rCaterer:'Cafe',rSpot:'Lobby',rDuty:'Sam'}))node('#'+id).value=value;
 node('#rRescue').checked=true;run('submitReport(state.planned.at(-1));');
 assert.equal(run('M.n'),meta.events.length+1);assert.equal(run('state.planned.at(-1).status'),'reported');assert.equal(run('state.posts.at(-1).total'),8);
 assert.equal(JSON.parse(saved.get('pw_state')).learned.length,1);
});
