'use strict';
// دریافت داده‌ی واقعی از TSETMC + کش روی دیسک + تحلیل
// نکته: سرورهای TSETMC معمولاً فقط از داخل ایران در دسترس‌اند. اگر سرور شما خارج از ایران است،
// TSETMC_BASE را روی یک رله/پروکسی داخل ایران بگذارید.
const fs=require('fs'),path=require('path');const{analyze}=require('./analysis');
const BASE=(process.env.TSETMC_BASE||'https://cdn.tsetmc.com/api').replace(/\/+$/,'');
const REFRESH_MIN=Number(process.env.REFRESH_MIN||30),DELAY=Number(process.env.TSETMC_DELAY_MS||400);
const CACHE=path.join(__dirname,'data','cache'),HIST=path.join(CACHE,'hist'),MAPF=path.join(CACHE,'map.json');
fs.mkdirSync(HIST,{recursive:true});
const WATCHLIST=['فملی','فولاد','شپنا','وبملت','شستا','خودرو','خساپا','شبندر','شتران','پارسان','تاپیکو','فارس','حکشتی','وغدیر','وبصادر','وتجارت','وبانک','رمپنا','ذوب','کگل','کچاد','ومعادن','اخابر','همراه','وصندوق','وپارس','دسبحان','دعبید','تیپیکو','کروی','کساوه','کاما','سفارس','سپاها','سشرق','شپدیس','زاگرس','جم','شاراک','کرماشا','پکرمان','خشرق','کفرا','وتوصا','وبوعلی','پترول','آریا'];
const norm=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]/g,'').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HEADERS={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36','Accept':'application/json'};
async function getJson(url,tries=3){let err;for(let i=0;i<tries;i++){try{const r=await fetch(url,{headers:HEADERS,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}catch(e){err=e;await sleep(800*(i+1))}}throw err}
const firstArray=d=>Array.isArray(d)?d:(d&&typeof d==='object'?Object.values(d).find(Array.isArray)||[]:[]);
const readJson=(f,def)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return def}};

let map=readJson(MAPF,{}),results=[],state={lastSuccess:0,lastAttempt:0,error:null,running:false,missing:[]};
// آخرین نتیجه‌ی ذخیره‌شده را در شروع برگردان تا بعد از ری‌استارت صفحه خالی نماند
const SNAP=path.join(CACHE,'snapshot.json');{const s=readJson(SNAP,null);if(s&&Array.isArray(s.results)){results=s.results;state.lastSuccess=s.lastSuccess||0}}

async function resolveMap(){
  const need=WATCHLIST.filter(s=>!map[s]);if(!need.length)return;
  try{ // ۱) لیست کامل دیده‌بان بازار
    const d=await getJson(BASE+'/ClosingPrice/GetMarketWatch?market=1&industrialGroup=&paperTypes%5B0%5D=8&showTraded=false&withBestLimits=true&hEven=0&RefID=0');
    const idx=new Map();for(const r of firstArray(d)){const i=r.instrumentInfo||{},code=r.insCode??i.insCode,sym=r.lVal18AFC??i.lVal18AFC,nm=r.lVal30??i.lVal30;if(code&&sym)idx.set(norm(sym),{insCode:String(code),name:nm||sym})}
    for(const s of need){const h=idx.get(norm(s));if(h)map[s]=h}
  }catch(e){console.warn('[market] market-watch:',e.message)}
  for(const s of WATCHLIST.filter(x=>!map[x])){ // ۲) جستجوی تکی
    try{const d=await getJson(BASE+'/Instrument/GetInstrumentSearch/'+encodeURIComponent(s),2);const h=firstArray(d).find(r=>norm(r.lVal18AFC)===norm(s));if(h)map[s]={insCode:String(h.insCode),name:h.lVal30||s}}catch(e){}
    await sleep(DELAY)}
  fs.writeFileSync(MAPF,JSON.stringify(map,null,1));
}
function parseHistory(d){
  const arr=firstArray(d&&d.closingPriceData?d.closingPriceData:d);
  return arr.filter(r=>r&&r.dEven&&Number(r.pClosing)>0&&Number(r.zTotTran)>0).map(r=>({date:Number(r.dEven),open:Number(r.priceFirst)||Number(r.pClosing),high:Number(r.priceMax)||Number(r.pClosing),low:Number(r.priceMin)||Number(r.pClosing),close:Number(r.pClosing),prevClose:Number(r.priceYesterday)||0,volume:Number(r.qTotTran5J)||0}))
   .sort((a,b)=>a.date-b.date).slice(-160);
}
async function refreshAll(){
  if(state.running)return;state.running=true;state.lastAttempt=Date.now();
  try{
    await resolveMap();
    const out=[],miss=[];let failed=0;
    for(const sym of WATCHLIST){
      const m=map[sym];if(!m){miss.push(sym);continue}
      const f=path.join(HIST,m.insCode+'.json');let rows=null;
      try{rows=parseHistory(await getJson(BASE+'/ClosingPrice/GetClosingPriceDailyList/'+m.insCode+'/0'));if(rows.length)fs.writeFileSync(f,JSON.stringify(rows))}catch(e){failed++;rows=readJson(f,null)}
      const a=rows&&analyze(rows);if(a)out.push({symbol:sym,name:m.name,...a});
      await sleep(DELAY);
    }
    state.missing=miss;
    if(out.length){results=out;if(failed<out.length)state.lastSuccess=Date.now();state.error=failed?`${failed} نماد از کش خوانده شد`:null;fs.writeFileSync(SNAP,JSON.stringify({results,lastSuccess:state.lastSuccess}))}
    else state.error='دریافت داده از منبع بازار ناموفق بود (شبکه یا دسترسی به TSETMC را بررسی کنید).';
    console.log(`[market] ${out.length}/${WATCHLIST.length} نماد، ناموجود: ${miss.join('،')||'-'}، خطا: ${failed}`);
  }catch(e){state.error=e.message;console.error('[market]',e)}
  finally{state.running=false}
}
function snapshot(){
  const stocks=[...results].sort((a,b)=>b.score-a.score||b.indicators.volRatio-a.indicators.volRatio);
  const stale=state.lastSuccess?(Date.now()-state.lastSuccess>3*3600*1000):true;
  return{ok:stocks.length>0,stale,updatedAt:state.lastSuccess||null,lastDate:stocks.reduce((m,s)=>Math.max(m,s.lastDate),0)||null,error:state.error,count:stocks.length,best:stocks[0]?stocks[0].symbol:null,stocks};
}
function start(){refreshAll();setInterval(refreshAll,REFRESH_MIN*60*1000).unref?.()}
module.exports={start,snapshot,refreshAll,parseHistory};
