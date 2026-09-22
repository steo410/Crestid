import {mkdirSync,copyFileSync,cpSync,writeFileSync} from 'node:fs';
mkdirSync('public',{recursive:true});
for(const file of ['index.html','base.css','morphs.css','community.css','firebase-config.js'])copyFileSync(file,'public/'+file);
cpSync('src','public/src',{recursive:true});
if(process.env.FIREBASE_WEB_CONFIG){const c=JSON.parse(process.env.FIREBASE_WEB_CONFIG);for(const key of ['apiKey','authDomain','projectId','appId'])if(!c[key])throw Error('Firebase config missing '+key);const safe=Object.fromEntries(['apiKey','authDomain','projectId','appId'].map(k=>[k,c[k]]));writeFileSync('public/firebase-config.js','export default '+JSON.stringify(safe)+';\n');}
console.log('Built static site in public. No personal records or service-account keys are bundled.');
