import {normalizeGecko,validateGecko,esc} from './core.mjs';

export function sourceUrl(repo){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('저장소를 사용자명/저장소 형식으로 입력하세요.');
 return `https://raw.githubusercontent.com/${repo}/crestie-data/data/cresties.json`;
}
function legacyId(value){if(typeof value!=='string'||!value||value.length>80||!/^[\w-]+$/.test(value))throw Error('이전 기록의 ID가 올바르지 않습니다.');return 'legacy_'+value;}
export function convertLegacy(data){
 if(!Array.isArray(data.geckos)||!Array.isArray(data.growth)||!Array.isArray(data.pairings))throw Error('개체·성장·교배 기록이 있는 백업이 아닙니다.');
 const geckos=data.geckos.map(g=>normalizeGecko({...g,id:legacyId(g.id),parent1Id:g.parent1Id?legacyId(g.parent1Id):'',parent2Id:g.parent2Id?legacyId(g.parent2Id):'',photos:[],isPublic:false,deleted:false,revision:0}));
 const ids=new Set(geckos.map(g=>g.id));if(ids.size!==geckos.length)throw Error('중복된 개체 ID가 있습니다.');
 geckos.forEach(g=>validateGecko(g,geckos));
 const measure=(v,max)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)throw Error('측정값 범위를 확인하세요.');return n;};
 const growth=data.growth.map(r=>{const geckoId=legacyId(r.geckoId);if(!ids.has(geckoId))throw Error('성장 기록에 연결된 개체가 없습니다.');if(r.weight===''||r.weight==null)throw Error('체중 없는 기록은 먼저 기존 사이트에서 확인해 주세요.');return {id:legacyId(r.id),geckoId,date:r.date,weight:measure(r.weight,1000),length:measure(r.length??'',100),condition:r.condition||'',note:r.note||'',revision:0};});
 const pairings=data.pairings.map(r=>{const aId=legacyId(r.aId),bId=legacyId(r.bId);if(!ids.has(aId)||!ids.has(bId)||aId===bId)throw Error('교배 기록의 개체 연결을 확인하세요.');return {id:legacyId(r.id),aId,bId,date:r.date,status:r.status,note:r.note||'',revision:0};});
 for(const records of [growth,pairings])if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('중복된 기록 ID가 있습니다.');
 const photos=new Map(data.geckos.map(g=>[legacyId(g.id),[...new Set([g.photoUrl,...(data.photos||[]).filter(p=>p.geckoId===g.id).map(p=>p.url)].filter(Boolean))]]));
 for(const [gid,urls] of photos){if(urls.length>3)throw Error(`${geckos.find(g=>g.id===gid).name}: 사진이 3장을 초과합니다. 기존 사이트에서 사진 구성을 확인해 주세요.`);for(const url of urls){const u=new URL(url);if(u.origin!=='https://raw.githubusercontent.com')throw Error('사진은 GitHub 원본 주소만 가져올 수 있습니다.');}}
 return {geckos,growth,pairings,photos};
}
async function get(url){const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('원본을 불러오지 못했습니다. 저장소 공개 여부와 주소를 확인하세요.');return response;}
export function openLegacyImport({dialog,store,compress,onDone}){
 const uid=store.googleUser().uid;let plan=null,busy=false;
 const sameUser=()=>{if(store.googleUser().uid!==uid)throw Error('로그인 계정이 바뀌었습니다. 창을 다시 열어 주세요.');};
 dialog.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>이전 기록 가져오기</h2><button type="button" class="icon-btn" id="legacyClose" aria-label="닫기">×</button></div><p>개인용 Crestie의 공개 GitHub 저장소에서 개체·사진·성장·교배 기록을 복사합니다. 현재 로그인한 계정에 모두 비공개로 저장하며, 원본과 기존 기록은 유지합니다.</p><label>기존 GitHub 저장소<input id="legacyRepo" placeholder="사용자명/저장소" autocomplete="off"></label><p class="help">한 개체당 사진 3장까지 압축 복사합니다. 이전에 가져온 ID는 건너뛰므로 재시도해도 중복되지 않습니다.</p><button type="button" class="btn secondary" id="legacyPreview">기록 확인</button><div id="legacySummary" class="section-gap" aria-live="polite"></div><div id="legacyError" class="form-error" role="alert"></div><div class="modal-actions"><button type="button" class="btn primary" id="legacySave" disabled>내 계정으로 복사</button></div></div>`;
 const q=s=>dialog.querySelector(s),save=q('#legacySave'),preview=q('#legacyPreview'),input=q('#legacyRepo'),status=q('#legacySummary'),error=q('#legacyError');
 q('#legacyClose').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();},{once:true});
 input.oninput=()=>{plan=null;save.disabled=true;status.textContent='';};
 preview.onclick=async()=>{busy=true;preview.disabled=true;input.disabled=true;save.disabled=true;error.textContent='';plan=null;status.textContent='기록과 사진을 확인 중…';try{
  sameUser();const data=await (await get(sourceUrl(input.value.trim()))).json();const next=convertLegacy(data);
  for(const g of next.geckos){for(const url of next.photos.get(g.id)){sameUser();g.photos.push(await compress(await (await get(url)).blob()));}validateGecko(g,next.geckos);}
  sameUser();plan=next;status.innerHTML=`<p><b>개체 ${next.geckos.length}마리 · 사진 ${next.geckos.reduce((n,g)=>n+g.photos.length,0)}장 · 성장 ${next.growth.length}개 · 교배 ${next.pairings.length}개</b></p><p>${next.geckos.map(g=>esc(g.name)).join(' · ')}</p><p>현재 계정: ${esc(store.googleUser().email||store.googleUser().displayName||'Google 계정')} · 모두 비공개</p>`;save.disabled=false;
 }catch(e){status.textContent='';error.textContent=store.friendlyError(e);}finally{busy=false;preview.disabled=false;input.disabled=false;}};
 save.onclick=async()=>{if(!plan||busy)return;busy=true;save.disabled=true;preview.disabled=true;input.disabled=true;error.textContent='';let added=0,skipped=0;
 try{for(const kind of ['geckos','growth','pairings'])for(const record of plan[kind]){sameUser();const result=await store.importRecord(kind,record,uid);result?added++:skipped++;status.textContent=`복사 중: 새 기록 ${added}개 · 이미 있는 기록 ${skipped}개`;}sameUser();status.textContent=`복사 완료: 새 기록 ${added}개 · 이미 있는 기록 ${skipped}개. 개체 관리에서 확인하세요.`;plan=null;onDone();}
 catch(e){error.textContent=`${store.friendlyError(e)} 지금까지 ${added}개를 저장했습니다. 같은 저장소로 다시 시도하면 기존 ID는 건너뜁니다.`;}
 finally{busy=false;save.disabled=!plan;preview.disabled=false;input.disabled=false;}};
 dialog.showModal();
}
