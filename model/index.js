// Node 24 on Windows resolves `node --test model/` as a directory entry point.
for(const file of require('node:fs').readdirSync(__dirname).filter(f=>f.endsWith('.test.cjs'))){
  require('./'+file);
}
