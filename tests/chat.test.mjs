import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountChat} from '../src/chat-ui.mjs';
test('chat UI separates public and private streams, escapes text, sends and disposes listeners',async()=>{
 const dom=new JSDOM('<main></main>');const root=dom.window.document.querySelector('main');let stream=null,stops=0;const sent=[];
 const store={chatUser:()=>({uid:'alice',isAnonymous:false}),friendlyError:e=>e.message,chatIdentity:async()=>({name:'앨리스'}),watchRooms:cb=>{cb([{id:'alice__bob',members:['alice','bob']}]);return()=>stops++;},watchProfile:(id,cb)=>{cb({nickname:'밥'});return()=>stops++;},watchMessages:(room,cb)=>{stream={room,cb};cb([{senderId:'bob',senderName:'<img>',text:'<script>악성</script>\n둘째 줄'}]);return()=>stops++;},sendChat:async(room,text)=>sent.push({room,text})};
 const dispose=mountChat(root,store);await Promise.resolve();assert.equal(stream.room,'');assert.equal(root.querySelector('script'),null);assert(root.textContent.includes('<script>악성</script>'));
 root.querySelector('#chatPrivate').click();assert.equal(stream.room,'alice__bob');assert(root.querySelector('#chatTitle').textContent.includes('밥'));
 root.querySelector('#chatText').value='안녕하세요';root.querySelector('#chatForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve();await Promise.resolve();assert.deepEqual(sent,[{room:'alice__bob',text:'안녕하세요'}]);
 const callback=stream.cb;dispose();callback([]);assert.equal(root.innerHTML,'');assert(stops>=4);dom.window.close();
});
test('guest private chat UI requires Google login',async()=>{
 const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main');
 const store={chatUser:()=>({uid:'guest',isAnonymous:true}),friendlyError:e=>e.message,chatIdentity:async()=>({name:'게스트1'}),watchMessages:(id,cb)=>{cb([]);return()=>{};}};
 const dispose=mountChat(root,store);await Promise.resolve();assert(root.textContent.includes('게스트1'));root.querySelector('#chatPrivate').click();assert(root.querySelector('#chatForm').hidden);assert(root.querySelector('#chatRooms').textContent.includes('Google 로그인'));dispose();dom.window.close();
});
