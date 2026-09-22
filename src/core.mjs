export const GROUPS={basic:'기본 무늬',detail:'부분 특징',spots:'점 무늬',color:'색상',genetic:'유전 모프',combo:'조합 모프',line:'라인 · 기타'};
export const INHERITANCE={codominant:'공우성',dominant:'우성',incomplete_dominant:'불완전우성',recessive:'열성',polygenic:'다인자 · 선별교배 형질',non_genetic:'유전 형질 아님',combination:'여러 형질의 조합',unknown:'미확인 · 연구 중'};
export const GENES={lilly:'릴리화이트',axanthic:'아잔틱',cappuccino:'카푸치노'};
export const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const id=()=>crypto.randomUUID();
export const splitTraits=v=>[...new Set(String(v).split(',').map(x=>x.trim()).filter(Boolean))];
export const sexLabel=s=>({male:'수컷',female:'암컷',unknown:'미확인'})[s]||'미확인';
export const dateNow=()=>new Date().toLocaleDateString('sv-SE');
export const pct=n=>(n*100).toFixed(2).replace(/\.?0+$/,'')+'%';
export function normalizeGecko(g={}){
 return {id:g.id||id(),name:String(g.name||'').trim(),morph:String(g.morph||''),sex:['male','female','unknown'].includes(g.sex)?g.sex:'unknown',hatchDate:g.hatchDate||'',acquiredDate:g.acquiredDate||'',breeder:g.breeder||'',notes:g.notes||'',breederNotation:g.breederNotation||'',parent1Id:g.parent1Id||'',parent2Id:g.parent2Id||'',customTraits:Array.isArray(g.customTraits)?g.customTraits:[],genetics:{lilly:g.genetics?.lilly||'unknown',axanthic:g.genetics?.axanthic||'unknown',cappuccino:g.genetics?.cappuccino||'unknown',solidBack:g.genetics?.solidBack||'unknown'},photos:Array.isArray(g.photos)?g.photos:[],isPublic:g.isPublic===true,deleted:g.deleted===true,revision:g.revision||0};
}
export function validateGecko(g,all=[]){
 if(!g.name||g.name.length>80)throw Error('이름은 1~80자로 입력하세요.');
 if(g.customTraits.length>60||g.customTraits.some(t=>typeof t!=='string'||t.length>100))throw Error('특징은 항목당 100자, 최대 60개까지 입력하세요.');
 if(g.photos.length>3||g.photos.some(p=>!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p)||p.length>180000))throw Error('사진은 압축된 JPEG 3장까지 저장할 수 있습니다.');
 if(g.parent1Id&&g.parent1Id===g.parent2Id)throw Error('부모 두 칸에는 서로 다른 개체를 선택하세요.');
 for(const parent of [g.parent1Id,g.parent2Id].filter(Boolean)){
  if(!all.some(x=>x.id===parent&&!x.deleted))throw Error('등록된 부모를 선택하세요.');
  if(parent===g.id||ancestors(parent,all).has(g.id))throw Error('자신 또는 자신의 후손을 부모로 지정할 수 없습니다.');
 }
 return g;
}
export function publicProjection(g,uid){
 return {ownerId:uid,geckoId:g.id,name:g.name,morph:g.morph,sex:g.sex,hatchDate:g.hatchDate,customTraits:g.customTraits,genetics:g.genetics,photos:g.photos,revision:g.revision};
}
export function ancestors(id,all,seen=new Set()){
 const g=all.find(x=>x.id===id);if(!g)return seen;
 for(const p of [g.parent1Id,g.parent2Id].filter(Boolean)){if(!seen.has(p)){seen.add(p);ancestors(p,all,seen);}}return seen;
}
export function relation(a,b,all){
 if(a.id===b.id)return '같은 개체';
 if(ancestors(a.id,all).has(b.id)||ancestors(b.id,all).has(a.id))return '직계 조상 · 후손';
 const aa=ancestors(a.id,all),bb=ancestors(b.id,all);if([...aa].some(x=>bb.has(x)))return '공통 조상이 있는 혈연';
 return '등록된 정보에서 확인된 혈연 없음';
}
export function geneDist(g,key){
 const v=g.genetics?.[key];
 if(key==='axanthic')return {visual:{2:1},het100:{1:1},het66:{0:1/3,1:2/3},het50:{0:.5,1:.5},clear:{0:1}}[v]||null;
 return {super:{2:1},lilly:{1:1},cappuccino:{1:1},normal:{0:1}}[v]||null;
}
export function crossDist(a,b){
 const result={0:0,1:0,2:0};
 for(const [ca,pa] of Object.entries(a))for(const [cb,pb] of Object.entries(b)){
  const x=Number(ca)/2,y=Number(cb)/2;
  result[0]+=pa*pb*(1-x)*(1-y);result[1]+=pa*pb*(x*(1-y)+(1-x)*y);result[2]+=pa*pb*x*y;
 }return Object.fromEntries(Object.entries(result).filter(([,p])=>p>1e-10));
}
export function offspring(a,b){
 let rows=[{p:1,genes:{}}];const unknown=[];
 for(const key of Object.keys(GENES)){
  const da=geneDist(a,key),db=geneDist(b,key);if(!da||!db){unknown.push(key);continue;}
  rows=rows.flatMap(r=>Object.entries(crossDist(da,db)).map(([copies,p])=>({p:r.p*p,genes:{...r.genes,[key]:+copies}})));
 }return {rows:unknown.length===3?[]:rows.sort((x,y)=>y.p-x.p),unknown};
}
export function offspringName(g){
 const names=[];
 if(g.lilly===1&&g.axanthic===2)names.push('릴리아잔틱');
 else {if(g.lilly===1)names.push('릴리화이트');if(g.axanthic===2)names.push('아잔틱');}
 if(g.lilly===2)names.push('슈퍼 릴리');
 if(g.cappuccino===1){if(g.lilly===1&&g.axanthic!==2){names.splice(names.indexOf('릴리화이트'),1);names.push('프라푸치노');}else names.push('카푸치노');}
 if(g.cappuccino===2)names.push('슈퍼 카푸치노');
 if(g.axanthic===1)names.push('100% 헷 아잔틱');
 return names.join(' + ')||'계산한 형질의 비발현형';
}
export function mergeCatalog(seed,overrides){const map=new Map(seed.map(m=>[m.id,m]));for(const m of overrides)map.set(m.id,m);return [...map.values()];}
export function validateMorph(m){
 const limits={id:100,name:80,en:120,look:1500,note:2000,aliases:300,sources:1500};
 for(const [field,max]of Object.entries(limits))if(typeof m[field]!=='string'||m[field].length>max)throw Error(`${field} 입력 길이를 확인하세요.`);
 if(!m.name.trim()||!m.look.trim()||!GROUPS[m.group]||!INHERITANCE[m.inheritance])throw Error('모프명·특징·분류·유전 방식을 입력하세요.');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(m.id))throw Error('잘못된 항목 ID입니다.');return m;
}
export function filterMorphs(entries,q='',group='',deleted=false){const key=s=>String(s).toLowerCase().replace(/[\s·_-]/g,'');return entries.filter(m=>m.deleted===deleted&&(!group||m.group===group)&&key([m.name,m.en,m.aliases,m.look].join(' ')).includes(key(q)));}
