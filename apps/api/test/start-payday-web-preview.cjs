// Preview only: both frontends point to the isolated PGlite API fixture.
const {spawn}=require('node:child_process'),path=require('node:path');
const app=process.argv[2];if(!['web','admin'].includes(app))throw new Error('Choose web or admin');
const root=path.resolve(__dirname,'../../..');
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start',path.join(root,'apps',app),'-p',app==='web'?'3100':'3101'],{stdio:'inherit',env:{...process.env,API_URL:'http://127.0.0.1:4140'}});
process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exit(code??1));
