import {before,after,test} from 'node:test';import fs from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,runTransaction,collection,query,where,getDocs,Timestamp} from 'firebase/firestore';
import {normalizeGecko,publicProjection} from '../src/core.mjs';import {SEED} from '../src/catalog-seed.mjs';
let env,a,b,anon,guest;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-crestie-community',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});a=env.authenticatedContext('alice',{firebase:{sign_in_provider:'google.com'}}).firestore();b=env.authenticatedContext('bob',{firebase:{sign_in_provider:'google.com'}}).firestore();anon=env.authenticatedContext('visitor',{firebase:{sign_in_provider:'anonymous'}}).firestore();guest=env.unauthenticatedContext().firestore();});
after(async()=>{await env?.cleanup();});
function priv(db,id){return doc(db,'users/alice/geckos/'+id);}function pub(db,id){return doc(db,'publicGeckos/alice__'+id);}
function g(id,extra={}){return {...normalizeGecko({id,name:'테스트 크레',...extra}),revision:1,updatedAt:serverTimestamp()};}
function publication(db,r){const batch=writeBatch(db);batch.set(priv(db,r.id),r);batch.set(pub(db,r.id),{...publicProjection(r,'alice'),updatedAt:serverTimestamp()});return batch;}
test('Google owner only can access private data',async()=>{await assertSucceeds(setDoc(priv(a,'private'),g('private')));await assertSucceeds(getDoc(priv(a,'private')));for(const client of [b,anon,guest])await assertFails(getDoc(priv(client,'private')));await assertFails(setDoc(doc(anon,'users/visitor/geckos/g'),g('g')));await assertFails(setDoc(priv(b,'hijack'),g('hijack')));});
test('public projection readable by guests; source remains private',async()=>{await assertSucceeds(publication(a,g('shared',{isPublic:true,notes:'PRIVATE NOTE'})).commit());await assertSucceeds(getDoc(pub(guest,'shared')));await assertFails(getDoc(priv(b,'shared')));await assertFails(updateDoc(pub(b,'shared'),{name:'hijack'}));});
test('private field injection into public projection denied',async()=>{const batch=publication(a,g('leak',{isPublic:true}));batch.update(pub(a,'leak'),{notes:'secret'});await assertFails(batch.commit());});
test('unpublishing requires atomic deletion of projection',async()=>{await assertFails(updateDoc(priv(a,'shared'),{isPublic:false,revision:2,updatedAt:serverTimestamp()}));const batch=writeBatch(a);batch.update(priv(a,'shared'),{isPublic:false,revision:2,updatedAt:serverTimestamp()});batch.delete(pub(a,'shared'));await assertSucceeds(batch.commit());if((await getDoc(pub(guest,'shared'))).exists())throw Error('Projection remains');});
test('stale revision and forged projection denied',async()=>{await assertFails(updateDoc(priv(a,'private'),{name:'stale',revision:1,updatedAt:serverTimestamp()}));await assertFails(setDoc(pub(a,'forged'),{...publicProjection(g('forged',{isPublic:true}),'alice'),updatedAt:serverTimestamp()}));});
function morph(revision=1,deleted=false){return {...SEED[0],revision,deleted,editorId:'visitor',updatedAt:serverTimestamp()};}
function edit(db,row){const batch=writeBatch(db);batch.set(doc(db,'morphs/normal'),row);batch.set(doc(db,'morphs/normal/history/'+row.revision),row);return batch.commit();}
test('anonymous edits accepted only with immutable history',async()=>{await assertSucceeds(edit(anon,morph()));await assertSucceeds(getDoc(doc(guest,'morphs/normal')));await assertFails(updateDoc(doc(anon,'morphs/normal/history/1'),{name:'tampered'}));await assertFails(deleteDoc(doc(anon,'morphs/normal/history/1')));});
test('catalog missing history and direct unauthenticated writes denied',async()=>{await assertFails(setDoc(doc(anon,'morphs/normal'),morph(2)));await assertFails(edit(guest,morph(2)));await assertFails(deleteDoc(doc(anon,'morphs/normal')));});
test('anonymous deletion and restoration are revisioned',async()=>{await assertSucceeds(edit(anon,morph(2,true)));await assertSucceeds(edit(anon,{...morph(3),name:'복원한 노멀'}));await assertSucceeds(getDoc(doc(guest,'morphs/normal/history/2')));});
test('growth belongs to Google owner and references own gecko',async()=>{const row={id:'r',geckoId:'private',date:'2026-09-22',weight:10,length:8,condition:'좋음',note:'PRIVATE',revision:1,updatedAt:serverTimestamp()};await assertSucceeds(setDoc(doc(a,'users/alice/growth/r'),row));await assertFails(getDoc(doc(b,'users/alice/growth/r')));await assertFails(setDoc(doc(a,'users/alice/growth/bad'),{...row,id:'bad',geckoId:'not-owned'}));});

test('public nicknames editable by Google owner only, with no private fields',async()=>{
 const ref=doc(a,'profiles/alice'),row={nickname:'크레집사',updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(ref,row));await assertSucceeds(getDoc(doc(guest,'profiles/alice')));
 await assertFails(setDoc(doc(b,'profiles/alice'),row));await assertFails(setDoc(doc(anon,'profiles/visitor'),row));
 await assertFails(setDoc(ref,{...row,email:'private@example.com'}));
 await assertFails(setDoc(ref,{...row,nickname:'a'}));await assertFails(setDoc(ref,{...row,nickname:'x'.repeat(21)}));
 await assertSucceeds(setDoc(ref,{...row,nickname:'새닉네임'}));
});

async function allocate(client,uid){return runTransaction(client,async tx=>{const ref=doc(client,'chatGuests',uid),counter=doc(client,'chatMeta/guests');const g=await tx.get(ref);if(g.exists())return g.data().number;const c=await tx.get(counter),number=(c.data()?.count||0)+1;tx.set(counter,{count:number,lastUid:uid});tx.set(ref,{number,createdAt:serverTimestamp()});return number;});}
function message(client,uid,name,id,path='publicMessages',text='안녕하세요'){const batch=writeBatch(client);batch.set(doc(client,'chatSenders',uid),{lastId:id,sentAt:serverTimestamp()});batch.set(doc(client,path,id),{senderId:uid,senderName:name,text,createdAt:serverTimestamp()});return batch.commit();}
test('guests get atomic sequential identities; cannot choose a number or impersonate',async()=>{
 const v1=env.authenticatedContext('guest1',{firebase:{sign_in_provider:'anonymous'}}).firestore(),v2=env.authenticatedContext('guest2',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 const nums=await Promise.all([allocate(v1,'guest1'),allocate(v2,'guest2')]);if(new Set(nums).size!==2||Math.min(...nums)!==1||Math.max(...nums)!==2)throw Error('Guest sequence failed');
 if(await allocate(v1,'guest1')!==nums[0])throw Error('Guest identity changed');
 await assertFails(setDoc(doc(v1,'chatGuests/guest1'),{number:99,createdAt:serverTimestamp()}));
 await assertFails(message(v1,'guest1','게스트999','spoof'));
 await assertSucceeds(message(v1,'guest1','게스트'+nums[0],'hello'));
 await assertFails(message(v1,'guest1','게스트'+nums[0],'spam'));
 await assertSucceeds(getDoc(doc(guest,'publicMessages/hello')));
 await assertFails(updateDoc(doc(v1,'publicMessages/hello'),{text:'edit'}));
});
test('public chat enforces nickname and authenticated identity',async()=>{
 await assertFails(message(a,'alice','가짜닉네임','fake-name'));
 await assertSucceeds(message(a,'alice','새닉네임','alice-chat'));
 await assertFails(message(guest,'nobody','게스트1','unauthenticated'));
 await assertFails(setDoc(doc(b,'publicMessages/forged'),{senderId:'alice',senderName:'새닉네임',text:'hijack',createdAt:serverTimestamp()}));
});
test('private rooms and messages are restricted to the two Google participants',async()=>{
 await assertSucceeds(publication(a,g('dm-gecko',{isPublic:true})).commit());
 const room={members:['alice','bob'],publicId:'alice__dm-gecko',createdAt:serverTimestamp()},rid='alice__bob';
 await assertSucceeds(getDoc(doc(b,'chatRooms',rid)));await assertSucceeds(setDoc(doc(b,'chatRooms',rid),room));
 await assertSucceeds(getDocs(query(collection(b,'chatRooms'),where('members','array-contains','bob'))));
 const stranger=env.authenticatedContext('mallory',{firebase:{sign_in_provider:'google.com'}}).firestore();
 await assertFails(getDoc(doc(stranger,'chatRooms',rid)));await assertFails(getDoc(doc(anon,'chatRooms',rid)));await assertFails(getDocs(collection(b,'chatRooms')));
 await assertFails(updateDoc(doc(b,'chatRooms',rid),{members:['bob','mallory']}));
 await assertSucceeds(setDoc(doc(b,'profiles/bob'),{nickname:'밥집사',updatedAt:serverTimestamp()}));
 await assertSucceeds(message(b,'bob','밥집사','dm-msg','chatRooms/'+rid+'/messages'));
 await assertSucceeds(getDoc(doc(a,'chatRooms',rid,'messages','dm-msg')));
 await assertFails(getDoc(doc(stranger,'chatRooms',rid,'messages','dm-msg')));
 await assertFails(message(stranger,'mallory','가짜','intruder','chatRooms/'+rid+'/messages'));
 await assertFails(setDoc(doc(anon,'chatRooms/visitor__alice'),{...room,members:['visitor','alice']}));
 await assertFails(setDoc(doc(b,'chatRooms/bob__mallory'),{...room,members:['bob','mallory']}));
});
