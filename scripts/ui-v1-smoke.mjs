// Mock Mattermost host, not a live server integration test.
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || new URL('../webapp/node_modules/playwright/index.mjs', import.meta.url).href);
const root=resolve(import.meta.dirname,'..');
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="app"></div><button id="outside">Outside</button></body></html>');}).listen(0,'127.0.0.1');
await new Promise(done=>server.on('listening',done));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
let count=0,fail=false,delay=0,state="tracked",omit=false,summaryCalls=0,viewerStatus=503;const profileBatches=[],offsets=[],limits=[],errors=[];
const post='p'.repeat(26),uid='a'.repeat(26),channel='d'.repeat(26),reader=i=>String(i).padStart(26,'0');
const stamp=Date.parse('2026-09-28T08:24:00Z');
try {
 const page=await browser.newPage({viewport:{width:900,height:700},timezoneId:'Europe/Moscow'});
 await page.clock.install({time:new Date('2026-09-28T12:00:00Z')});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/plugins/**',async route=>{
  const url=new URL(route.request().url());let data;
  if(url.pathname.endsWith('/summaries')){summaryCalls++;data={summaries:omit?{}:{[post]:{count,saturated:false,state}}};}
  else if(url.pathname.endsWith('/viewers')){
   const offset=Number(url.searchParams.get('offset'));offsets.push(offset);
   const limit=Number(url.searchParams.get('limit'));limits.push(limit);
   if(delay)await new Promise(done=>setTimeout(done,delay));
   if(fail){await route.fulfill({status:viewerStatus,contentType:'application/json',body:'{}'});return;}
   const end=Math.min(count,offset+limit);
   data={state,viewers:Array.from({length:Math.max(0,end-offset)},(_,i)=>({user_id:reader(offset+i),seen_at:stamp+(offset+i)*60000})),count,saturated:false,next_offset:end,has_more:end<count};
  }else data={results:Object.fromEntries(route.request().postDataJSON().post_ids.map(id=>[id,'ok']))};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('**/api/v4/users/ids',async route=>{const ids=route.request().postDataJSON();profileBatches.push(ids);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(ids.map(id=>({id,first_name:'Читатель',last_name:String(Number(id)),nickname:'Nick',username:'user'+id.slice(-3),delete_at:0})))});});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.addScriptTag({path:`${root}/webapp/node_modules/react/umd/react.production.min.js`});
 await page.addScriptTag({path:`${root}/webapp/node_modules/react-dom/umd/react-dom.production.min.js`});
 await page.evaluate(({post,uid,channel})=>{
  window.state={entities:{users:{currentUserId:uid,profiles:{[uid]:{id:uid,locale:'en',timezone:{useAutomaticTimezone:'false',manualTimezone:'Europe/Moscow'}}}},channels:{channels:{[channel]:{type:'G'}}},posts:{posts:{[post]:{id:post,user_id:uid,channel_id:channel,type:'',delete_at:0}}},general:{config:{SiteURL:location.origin,TeammateNameDisplay:'full_name'}}}};
  window.subscribers=new Set();window.components={};window.registerPlugin=(_id,p)=>{window.plugin=p;p.initialize({registerPostMessageAttachmentComponent:c=>window.components.attachment=c,registerRootComponent:c=>window.components.root=c,registerPostDropdownMenuAction:(_name,fn)=>window.openList=fn,registerWebSocketEventHandler:(_event,fn)=>window.ws=fn,registerReconnectHandler:()=>{}},{getState:()=>window.state,subscribe:fn=>{window.subscribers.add(fn);return()=>window.subscribers.delete(fn);}});};
 },{post,uid,channel});
 await page.addScriptTag({path:`${root}/webapp/dist/main.js`});
 await page.evaluate(post=>{const h=React.createElement;window.renderMessage=(parts=['Сообщение'])=>ReactDOM.render(h(React.Fragment,null,h(window.components.root),h('div',{style:{position:'absolute',bottom:20,left:580,width:300}},h('div',{id:'postMessageText_'+post,className:'post-message__text'},h('p',null,...parts)),h(window.components.attachment,{postId:post}))),document.getElementById('app'));window.renderMessage();},post);
 const button=page.locator('.mmseen-check');await page.getByRole('button',{name:'Not viewed yet',exact:true}).waitFor();
 assert.equal(await button.getAttribute('title'),'Not viewed yet');assert.equal(await button.locator('svg').count(),1);assert.ok((await button.getAttribute('class')).includes('mmseen-check-unread'));
 // R1: missing authorization removes the indicator, then reconnect alone recovers it.
 omit=true;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await button.waitFor({state:'detached'});const before=summaryCalls;omit=false;
 await page.evaluate(()=>window.plugin.recover());await button.waitFor();assert.ok(summaryCalls>before);
 omit=true;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);await button.waitFor({state:'detached'});
 omit=false;await page.evaluate(()=>window.plugin.refreshVisible());await button.waitFor();

 await button.click();await page.locator('dialog h4').filter({hasText:'Not viewed yet'}).waitFor();
 assert.equal(await page.locator('dialog button').count(),0);
 assert.equal(await page.locator('dialog .mmseen-scope').innerText(),'Only views from Web/Desktop are counted. Mobile app views are not tracked due to Mattermost mobile architecture.');
 assert.equal(await page.locator('dialog .mmseen-list .mmseen-scope').count(),0);
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('.mmseen-check')===document.activeElement);
 count=3;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.getByRole('button',{name:'Viewed by 3',exact:true}).waitFor();assert.equal(await button.innerText(),'3');assert.equal(await button.locator('svg').count(),1);assert.equal(await button.locator('svg').getAttribute('aria-hidden'),'true');assert.equal(await button.locator('svg').evaluate(el=>getComputedStyle(el).width),'18px');
 await page.mouse.move(10,10);await button.hover();await page.getByText('Читатель 0',{exact:true}).waitFor();await page.getByText('Today, 11:24',{exact:true}).waitFor();
 assert.equal(await page.locator('.mmseen-row').count(),3);assert.equal(await page.getByRole('button',{name:/Previous|Next|^Close$/}).count(),0);
 assert.equal(await page.locator('.mmseen-preview .mmseen-scope').isVisible(),true);
 assert.equal(await page.locator('.mmseen-row .mmseen-avatar, .mmseen-row img').first().evaluate(el=>getComputedStyle(el).width),'22px');
 count=4;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.waitForFunction(()=>document.querySelectorAll('.mmseen-panel .mmseen-row').length===4);
 await page.getByText('Читатель 3',{exact:true}).waitFor();
 await page.screenshot({path:`${root}/docs/ui-v1-light.png`});
 await page.evaluate(()=>{document.documentElement.style.cssText='--center-channel-bg:#202328;--center-channel-color:#e1e4e8;--center-channel-color-rgb:225,228,232;--link-color:#5cb4ff;background:#202328;color:#e1e4e8';});
 assert.equal(await page.locator('.mmseen-panel').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 35, 40)');
 await page.screenshot({path:`${root}/docs/ui-v1-dark.png`});
 await page.keyboard.press('Escape');await page.locator('.mmseen-panel').waitFor({state:'detached'});
 // Preview boundary: five rows fit; six adds an explicit full-list action.
 count=5;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.getByRole('button',{name:'Viewed by 5',exact:true}).waitFor();
 await page.mouse.move(10,10);await button.hover();
 await page.waitForFunction(()=>document.querySelectorAll('.mmseen-preview .mmseen-row').length===5);
 assert.equal(await page.locator('.mmseen-show-all').count(),0);
 assert.equal(await page.locator('.mmseen-preview .mmseen-list').evaluate(el=>el.scrollHeight>el.clientHeight),false);
 const previewOffsets=offsets.length;count=70;
 await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.getByRole('button',{name:'Show all · 70',exact:true}).waitFor();
 assert.equal(await page.locator('.mmseen-preview .mmseen-row').count(),5);
 assert.ok(offsets.slice(previewOffsets).every(offset=>offset===0));
 assert.ok(limits.slice(previewOffsets).every(limit=>limit===5));
 await page.screenshot({path:`${root}/docs/ui-1.1.0-preview-dark.png`});
 count=6;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.getByRole('button',{name:'Show all · 6',exact:true}).waitFor();
 await page.getByRole('button',{name:'Show all · 6',exact:true}).focus();
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelectorAll('dialog .mmseen-row').length===6);
 assert.equal(await page.locator('.mmseen-preview').count(),0);
 assert.equal(await page.locator('dialog').evaluate(el=>getComputedStyle(el).width),'460px');
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.activeElement===document.querySelector('.mmseen-check'));
 // Keyboard opens native modal; its list is keyboard-scrollable.
 await button.focus();await page.keyboard.press('ArrowDown');await page.locator('dialog .mmseen-row').first().waitFor();
 await page.locator('dialog .mmseen-list').focus();await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 count=70;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);await page.getByRole('button',{name:'Viewed by 70',exact:true}).waitFor();
 await button.click();await page.waitForFunction(()=>document.querySelectorAll('dialog .mmseen-row').length===50);
 assert.equal(await page.locator('dialog .mmseen-list').evaluate(el=>el.scrollHeight>el.clientHeight),true);
 await page.locator('dialog .mmseen-list').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelectorAll('dialog .mmseen-row').length===70);
 await page.getByText('Читатель 69',{exact:true}).waitFor();assert.ok(offsets.includes(50));assert.ok(profileBatches.every(ids=>ids.length<=50));
 const times=await page.locator('dialog time').evaluateAll(nodes=>nodes.map(el=>Date.parse(el.dateTime)));assert.deepEqual(times,[...times].sort((a,b)=>a-b));
 const headingTop=await page.locator('dialog .mmseen-heading').evaluate(el=>el.getBoundingClientRect().top);
 const scopeTop=await page.locator('dialog .mmseen-scope').evaluate(el=>el.getBoundingClientRect().top);
 await page.locator('dialog .mmseen-list').evaluate(el=>{el.scrollTop=500;});
 assert.equal(await page.locator('dialog .mmseen-heading').evaluate(el=>el.getBoundingClientRect().top),headingTop);
 assert.equal(await page.locator('dialog .mmseen-scope').evaluate(el=>el.getBoundingClientRect().top),scopeTop);
 await page.screenshot({path:`${root}/docs/ui-1.1.0-full-dark.png`});
 await page.setViewportSize({width:360,height:500});
 assert.ok(await page.locator('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.height<=innerHeight;}));
 assert.equal(await page.locator('dialog .mmseen-scope').isVisible(),true);
 await page.setViewportSize({width:900,height:700});
 // Loaded rows, focus, scroll and cached profiles survive background refresh.
 const list=page.locator('dialog .mmseen-list');await list.focus();
 await list.evaluate(el=>{el.scrollTop=450;});const scroll=await list.evaluate(el=>el.scrollTop);
 const batchesBefore=profileBatches.length;count=71;
 await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.waitForFunction(()=>document.querySelectorAll('dialog .mmseen-row').length===71);
 await page.getByText('Читатель 70',{exact:true}).waitFor();
 assert.equal(await list.evaluate(el=>el===document.activeElement),true);
 assert.equal(await list.evaluate(el=>el.scrollTop),scroll);
 assert.deepEqual(profileBatches.slice(batchesBefore).flat(),[reader(70)]);
 assert.equal(await button.getAttribute('aria-expanded'),'true');
 assert.equal(await button.getAttribute('aria-controls'),await page.locator('dialog').getAttribute('id'));
 await page.mouse.click(5,5);await page.locator('dialog').waitFor({state:'detached'});
 fail=true;delay=250;await button.click();await page.getByRole('status').filter({hasText:'Loading viewers'}).waitFor();await page.getByRole('alert').waitFor();
 assert.equal(await page.locator('dialog .mmseen-scope').isVisible(),true);
 fail=false;delay=0;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('dialog .mmseen-row').first().waitFor();
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 state='expired';count=0;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.getByRole('button',{name:'View history expired',exact:true}).waitFor();
 await button.click();await page.locator('dialog h4').filter({hasText:'View history expired'}).waitFor();
 assert.equal(await page.locator('dialog .mmseen-row').count(),0);
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 state='tracked';count=3;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.getByRole('button',{name:'Viewed by 3',exact:true}).waitFor();
 // Locale changes update labels without losing the list.
 await page.evaluate(uid=>{window.state={...window.state,entities:{...window.state.entities,users:{...window.state.entities.users,profiles:{...window.state.entities.users.profiles,[uid]:{...window.state.entities.users.profiles[uid],locale:'ru'}}}}};window.subscribers.forEach(fn=>fn());},uid);
 await page.getByRole('button',{name:'Просмотрели: 3',exact:true}).waitFor();await button.click();
 await page.getByRole('dialog',{name:'Просмотрели',exact:true}).waitFor();await page.locator('dialog .mmseen-row').first().waitFor();
 assert.equal(await page.locator('dialog .mmseen-scope').innerText(),'Учитываются только просмотры в Web/Desktop. Просмотры из мобильных приложений не учитываются из-за ограничений архитектуры Mattermost.');
 assert.match(await page.locator('dialog time').first().getAttribute('aria-label'),/Первая регистрация/);
 assert.equal(await page.locator('dialog time').first().innerText(), 'Сегодня, 11:24');
 await page.screenshot({path:`${root}/docs/ui-1.0.2-today.png`});
 await page.clock.setSystemTime(new Date('2026-09-29T12:00:00Z'));
 await page.clock.runFor(30010);
 assert.equal(await page.locator('dialog time').first().innerText(), 'Вчера, 11:24');
 // Real API denial clears the old rows while the dialog stays mounted.
 viewerStatus=403;fail=true;await page.evaluate(post=>window.ws({data:{post_ids:[post]}}),post);
 await page.getByRole('alert').waitFor();assert.equal(await page.locator('dialog .mmseen-row').count(),0);
 fail=false;await page.getByRole('button',{name:'Повторить',exact:true}).click();await page.locator('dialog .mmseen-row').first().waitFor();
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 // React keeps the paragraph but replaces its own children when a description
 // is prepended to two links. The portal must remain after the host's content.
 for (const hardBreak of [false,true]) {
  await page.evaluate(hardBreak=>{const h=React.createElement;const link=(key,url)=>h('a',{key,href:url},url);window.renderMessage([link(0,'https://example.com/one'),hardBreak?h('br',{key:1}):'\n',link(2,'https://example.com/two')]);},hardBreak);
  await page.waitForFunction(()=>{const inline=document.querySelector('.mmseen-inline');return inline?.parentElement?.tagName==='P' && inline===inline.parentElement.lastChild;});
  await page.evaluate(()=>{window.editParagraph=document.querySelector('.post-message__text p');window.editReceipt=document.querySelector('.mmseen-check');});
  for (const description of ['Описание перед ссылками','Повторно изменённое описание']) {
   await page.evaluate(({hardBreak,description})=>{const h=React.createElement;const link=(key,url)=>h('a',{key,href:url},url);const edited=h('small',{key:'edited'},' Отредактировано');window.renderMessage(hardBreak?[description,h('br',{key:1}),link(2,'https://example.com/one'),h('br',{key:3}),link(4,'https://example.com/two'),edited]:[description+'\n',link(1,'https://example.com/one'),'\n',link(3,'https://example.com/two'),edited]);},{hardBreak,description});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
   assert.deepEqual(await page.evaluate(()=>{const p=document.querySelector('.post-message__text p');const inline=p.querySelector('.mmseen-inline');return {sameParagraph:p===window.editParagraph,sameReceipt:inline?.querySelector('.mmseen-check')===window.editReceipt,trailing:inline===p.lastChild,links:Array.from(p.querySelectorAll('a'),a=>a.getAttribute('href'))};}),{sameParagraph:true,sameReceipt:true,trailing:true,links:['https://example.com/one','https://example.com/two']});
   assert.match(await page.locator('.post-message__text p').innerText(),new RegExp(description));
   assert.equal(await button.count(),1);
  }
 }
 // Complex final blocks retain the official attachment fallback.
 await page.evaluate(()=>document.querySelector('.post-message__text').innerHTML='<pre><code>code block</code></pre>');
 await page.waitForFunction(()=>document.querySelector('.mmseen-anchor > .mmseen-inline .mmseen-check'));
 assert.equal(await page.locator('.mmseen-anchor-inline').count(),0);
 // Inline reattachment after Markdown is replaced.
 await page.evaluate(()=>document.querySelector('.post-message__text').innerHTML='<p>Изменённое сообщение</p>');
 await page.waitForFunction(()=>document.querySelector('.post-message__text p .mmseen-check'));
 // Same ID in DM does not display a group count after a store update.
 await page.evaluate(({channel,post})=>{window.state={...window.state,entities:{...window.state.entities,channels:{channels:{[channel]:{type:'D'}}},posts:{posts:{...window.state.entities.posts.posts,[post]:{...window.state.entities.posts.posts[post]}}}}};window.subscribers.forEach(fn=>fn());},{channel,post});
 assert.equal(await button.innerText(),'');assert.equal(await button.locator('svg').count(),1);
 await page.evaluate(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));window.plugin.uninitialize();});
 assert.equal(await page.locator('.mmseen-inline').count(),0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',scope:'R1 reconnect recovery, refresh scroll/focus/profile cache, aria-controls/expanded, ru/en locale and denied clear, live viewer refresh and expired state, empty tooltip/dialog, inline group count, names and first-view time, 3 viewers complete, 70 viewers scroll/auto-load, profile batches, sorting, loading/error/retry, dark/light, keyboard/ESC/focus return/outside click, soft/hard-break links with prepended description and repeated edits, same paragraph/receipt, complex-block fallback, edit/DM/cleanup',offsets}));
} finally {await browser.close();server.close();}
