const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
const conda=path.join(os.homedir(),'anaconda3','python.exe');
const python=process.env.PYTHON||(fs.existsSync(conda)?conda:'python');
function setup(){
 const context=vm.createContext({Date,localStorage:{getItem:()=>null,setItem:()=>{}},console});
 for(const file of ['core','model'])vm.runInContext(fs.readFileSync(path.join(root,'web/js/'+file+'.js'),'utf8'),context);
 context.meta=JSON.parse(fs.readFileSync(path.join(root,'web/data/sample_events.json'),'utf8'));
 const run=code=>vm.runInContext(code,context);
 run('META=meta;LOCS=META.locations;CLUBS=META.clubs.map(c=>c.club);state=freshState();buildCols();');
 return {run,context};
}
module.exports={setup,root,python};
