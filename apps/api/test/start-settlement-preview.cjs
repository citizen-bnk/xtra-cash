// Local test frontends, explicitly bound to loopback and the isolated fixture API.
const {spawn}=require('node:child_process'),path=require('node:path');
const app=process.argv[2];if(!['web','admin'].includes(app))throw Error('Choose web or admin');
const root=path.resolve(__dirname,'../../..');
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start',path.join(root,'apps',app),'-H','127.0.0.1','-p',app==='web'?'3102':'3103'],{stdio:'inherit',env:{...process.env,API_URL:'http://127.0.0.1:4142'}});
process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exit(code??1));
