// Run in a normal JS realm (as in the app), not a VM's slower global proxies.
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),meta=JSON.parse(fs.readFileSync(path.join(root,'web/data/sample_events.json'),'utf8'));
const code=['core','model'].map(n=>fs.readFileSync(path.join(root,'web/js/'+n+'.js'),'utf8')).join('\n');
const benchmark=new Function('data','performance','localStorage',code+`
META=data;LOCS=META.locations;CLUBS=META.clubs.map(c=>c.club);state=freshState();buildCols();
const original=META.events;
for(const n of [250,1000]){
 META.events=Array.from({length:n},(_,i)=>({...original[i%original.length],event_id:'B'+i}));
 const t=performance.now();fitFull();const ms=performance.now()-t;
 console.log(n+' events: fitFull '+ms.toFixed(1)+' ms');
 if(ms>(n===250?1000:3000))throw Error('Training exceeds requested laptop budget');
}`);
benchmark(meta,performance,{getItem:()=>null,setItem:()=>{}});
