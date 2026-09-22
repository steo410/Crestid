import config from '../firebase-config.js';
import {normalizeGecko,publicProjection,validateMorph} from './core.mjs';
export const configured=!!(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
let f,a,db,auth;
export async function connect(){
 if(!configured)throw Error('Firebase 프로젝트 연결이 필요합니다.');
 const [{initializeApp},authSdk,firestoreSdk]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')]);
 a=authSdk;f=firestoreSdk;const app=initializeApp(config);auth=a.getAuth(app);db=f.getFirestore(app);
 // In-memory Firestore cache prevents a previous account's private documents remaining on disk.
 await a.setPersistence(auth,a.browserSessionPersistence);
}
export const watchAuth=cb=>a.onAuthStateChanged(auth,cb);
export async function login(){const provider=new a.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});return a.signInWithPopup(auth,provider);}
export const logout=()=>a.signOut(auth);
export function googleUser(){const u=auth?.currentUser;if(!u||u.isAnonymous||!u.providerData.some(p=>p.providerId==='google.com'))throw Error('Google 계정으로 로그인해 주세요.');return u;}
export function watchOwn(kind,cb,onError){const u=googleUser();return f.onSnapshot(f.collection(db,'users',u.uid,kind),s=>cb(s.docs.map(d=>({...d.data(),id:d.id}))),onError);}
export function watchCatalog(cb,onError){return f.onSnapshot(f.collection(db,'morphs'),s=>cb(s.docs.map(d=>({...d.data(),id:d.id}))),onError);}
export function watchPublic(cb,onError,count=200){return f.onSnapshot(f.query(f.collection(db,'publicGeckos'),f.orderBy('name'),f.limit(count)),s=>cb(s.docs.map(d=>({...d.data(),publicId:d.id}))),onError);}
export async function getPublic(publicId){const s=await f.getDocFromServer(f.doc(db,'publicGeckos',publicId));if(!s.exists())throw Error('이 개체는 삭제되었거나 공개가 해제되었습니다.');return {...s.data(),publicId:s.id};}
export async function saveRecord(kind,record,expected=0){
 const u=googleUser(),uid=u.uid,ref=f.doc(db,'users',uid,kind,record.id);
 if(!['geckos','growth','pairings'].includes(kind))throw Error('잘못된 기록입니다.');
 await f.runTransaction(db,async tx=>{
  const old=await tx.get(ref);const shared=kind==='geckos'?f.doc(db,'publicGeckos',uid+'__'+record.id):null;const oldShared=shared?await tx.get(shared):null;if((old.data()?.revision||0)!==expected)throw Error('다른 기기에서 수정했습니다. 창을 닫고 최신 기록을 다시 열어 주세요.');
  if(auth.currentUser?.uid!==uid)throw Error('계정이 변경되었습니다. 다시 시도하세요.');
  const next={...(kind==='geckos'?normalizeGecko(record):record),revision:expected+1,updatedAt:f.serverTimestamp()};
  tx.set(ref,next);
  if(kind==='geckos'){
   if(next.isPublic&&!next.deleted)tx.set(shared,{...publicProjection(next,uid),updatedAt:f.serverTimestamp()});else if(oldShared.exists())tx.delete(shared);
  }
 });
}
export async function removeRecord(kind,record){
 if(kind==='geckos')return saveRecord(kind,{...record,deleted:true,isPublic:false},record.revision);
 const u=googleUser(),ref=f.doc(db,'users',u.uid,kind,record.id);
 await f.runTransaction(db,async tx=>{const s=await tx.get(ref);if(s.data()?.revision!==record.revision)throw Error('기록이 변경되었습니다. 새로고침 후 시도하세요.');tx.delete(ref);});
}
export async function saveMorph(input,expected=0){
 if(!db||!auth)throw Error('공용 저장은 Firebase 연결 후 사용할 수 있습니다.');
 validateMorph(input);if(!auth.currentUser)await a.signInAnonymously(auth);
 const editorId=auth.currentUser.uid,ref=f.doc(db,'morphs',input.id);
 await f.runTransaction(db,async tx=>{
  const old=await tx.get(ref);if((old.data()?.revision||0)!==expected)throw Error('다른 사람이 먼저 수정했습니다. 창을 닫고 최신 항목을 다시 열어 주세요.');
  const next={id:input.id,name:input.name.trim(),en:input.en,group:input.group,look:input.look,note:input.note,aliases:input.aliases,sources:input.sources,inheritance:input.inheritance,deleted:input.deleted===true,revision:expected+1,editorId,updatedAt:f.serverTimestamp()};
  tx.set(ref,next);tx.set(f.doc(db,'morphs',input.id,'history',String(next.revision)),next);
 });
}
export async function morphHistory(id){const s=await f.getDocs(f.query(f.collection(db,'morphs',id,'history'),f.orderBy('revision','desc'),f.limit(30)));return s.docs.map(d=>d.data());}
export function friendlyError(e){return ({'auth/popup-closed-by-user':'로그인 창을 닫았습니다. 다시 시도할 수 있어요.','auth/popup-blocked':'로그인 팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.','auth/unauthorized-domain':'이 사이트 주소를 Firebase 인증의 승인된 도메인에 추가해야 합니다.','permission-denied':'저장 권한을 확인하지 못했습니다. 로그인 상태와 데이터베이스 보안 규칙을 확인하세요.','unavailable':'서버에 연결하지 못했습니다. 입력 내용을 유지한 채 다시 시도하세요.'})[e.code]||e.message||'요청을 처리하지 못했습니다.';}

// Create-only import: retries never overwrite existing user edits or publish records.
export async function importRecord(kind,record,expectedUid){
 const u=googleUser();if(u.uid!==expectedUid)throw Error('계정이 변경되었습니다.');
 if(!['geckos','growth','pairings'].includes(kind)||!record.id.startsWith('legacy_'))throw Error('잘못된 가져오기 기록입니다.');
 const ref=f.doc(db,'users',u.uid,kind,record.id);
 return f.runTransaction(db,async tx=>{
  const old=await tx.get(ref);
  if(googleUser().uid!==expectedUid)throw Error('계정이 변경되었습니다.');
  if(old.exists())return false;
  const data=kind==='geckos'?normalizeGecko({...record,isPublic:false,deleted:false}):record;
  tx.set(ref,{...data,revision:1,updatedAt:f.serverTimestamp()});return true;
 });
}
