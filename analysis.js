'use strict';
// تحلیل تکنیکال روزانه — همه‌چیز فقط از روی داده‌ی واقعی قیمت/حجم محاسبه می‌شود.
const sma=(a,n)=>{if(a.length<n)return null;let s=0;for(let i=a.length-n;i<a.length;i++)s+=a[i];return s/n};
function emaSeries(a,n){const k=2/(n+1),out=[];let e=a[0];out.push(e);for(let i=1;i<a.length;i++){e=a[i]*k+e*(1-k);out.push(e)}return out}
function rsi(c,n=14){if(c.length<n+1)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];d>=0?g+=d:l-=d}g/=n;l/=n;for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}return l===0?100:100-100/(1+g/l)}
function macd(c){if(c.length<35)return null;const e12=emaSeries(c,12),e26=emaSeries(c,26),line=e12.map((v,i)=>v-e26[i]),sig=emaSeries(line,9),h=line.map((v,i)=>v-sig[i]);return{hist:h[h.length-1],prevHist:h[h.length-2]}}
function atr(rows,n=14){if(rows.length<n+1)return null;const tr=[];for(let i=1;i<rows.length;i++){const r=rows[i],pc=rows[i-1].close;tr.push(Math.max(r.high-r.low,Math.abs(r.high-pc),Math.abs(r.low-pc)))}let a=tr.slice(0,n).reduce((x,y)=>x+y,0)/n;for(let i=n;i<tr.length;i++)a=(a*(n-1)+tr[i])/n;return a}
const rnd=(x)=>Math.round(x);

// rows: [{date,open,high,low,close,prevClose,volume}] به ترتیب صعودی تاریخ
function analyze(rows){
  if(!rows||rows.length<50)return null;
  const closes=rows.map(r=>r.close),last=rows[rows.length-1],prior=rows.slice(0,-1);
  const s10=sma(closes,10),s20=sma(closes,20),s50=sma(closes,50),R=rsi(closes),M=macd(closes),A=atr(rows);
  if([s20,s50,R,A].some(v=>v==null)||!M)return null;
  const vols=rows.map(r=>r.volume),avg20=sma(vols.slice(0,-3),20)||sma(vols,20),recentVol=(vols.slice(-3).reduce((a,b)=>a+b,0)/3),volRatio=avg20>0?recentVol/avg20:1;
  const res=Math.max(...prior.slice(-20).map(r=>r.high)),sup=Math.min(...rows.slice(-10).map(r=>r.low));
  const price=last.close,breakout=price>res,room=(res-price)/price;
  let score=0;const reasons=[];
  // روند (۳۰)
  if(price>s20){score+=10;reasons.push({t:'pos',x:'قیمت بالاتر از میانگین ۲۰ روزه است (روند کوتاه‌مدت مثبت).'})}else reasons.push({t:'neg',x:'قیمت زیر میانگین ۲۰ روزه است (روند کوتاه‌مدت ضعیف).'});
  if(s20>s50){score+=10;reasons.push({t:'pos',x:'میانگین ۲۰ روزه بالاتر از میانگین ۵۰ روزه است (روند میان‌مدت صعودی).'})}else reasons.push({t:'neg',x:'میانگین ۲۰ روزه زیر میانگین ۵۰ روزه است (روند میان‌مدت نزولی).'});
  if(price>s50){score+=10}else reasons.push({t:'neg',x:'قیمت زیر میانگین ۵۰ روزه است.'});
  // مومنتوم RSI (۲۰)
  if(R>=45&&R<=65){score+=20;reasons.push({t:'pos',x:`RSI برابر ${R.toFixed(0)} است؛ مومنتوم سالم و نه اشباع.`})}
  else if(R>65&&R<=72){score+=12;reasons.push({t:'neu',x:`RSI برابر ${R.toFixed(0)} است؛ مومنتوم قوی ولی نزدیک به اشباع خرید.`})}
  else if(R>72){score+=4;reasons.push({t:'neg',x:`RSI برابر ${R.toFixed(0)} است؛ اشباع خرید و احتمال اصلاح.`})}
  else if(R>=35){score+=12;reasons.push({t:'neu',x:`RSI برابر ${R.toFixed(0)} است؛ مومنتوم ضعیف ولی در حال بازگشت.`})}
  else{score+=8;reasons.push({t:'neg',x:`RSI برابر ${R.toFixed(0)} است؛ اشباع فروش و ریسک ادامه‌ی ریزش.`})}
  // MACD (۲۰)
  if(M.hist>0){score+=10;reasons.push({t:'pos',x:'هیستوگرام MACD مثبت است.'})}else reasons.push({t:'neg',x:'هیستوگرام MACD منفی است.'});
  if(M.hist>M.prevHist){score+=10;reasons.push({t:'pos',x:'قدرت روند (MACD) نسبت به روز قبل بهتر شده است.'})}else reasons.push({t:'neg',x:'قدرت روند (MACD) نسبت به روز قبل ضعیف‌تر شده است.'});
  // حجم (۱۵)
  if(volRatio>=1.5){score+=15;reasons.push({t:'pos',x:`حجم معاملات اخیر ${volRatio.toFixed(1)} برابر میانگین است.`})}
  else if(volRatio>=1.1){score+=10;reasons.push({t:'pos',x:'حجم معاملات اخیر کمی بالاتر از میانگین است.'})}
  else if(volRatio>=0.8){score+=5}else reasons.push({t:'neg',x:'حجم معاملات اخیر پایین‌تر از میانگین است.'});
  // فاصله تا مقاومت (۱۵)
  if(breakout){score+=volRatio>1.2?12:8;reasons.push({t:'pos',x:'قیمت از سقف ۲۰ روزه عبور کرده است (شکست مقاومت).'})}
  else if(room>=0.05){score+=15;reasons.push({t:'pos',x:`تا مقاومت اخیر حدود ${(room*100).toFixed(0)}٪ فاصله دارد.`})}
  else if(room>=0.03){score+=10}
  else if(room>=0.015){score+=5}else reasons.push({t:'neg',x:'قیمت خیلی نزدیک به مقاومت اخیر است.'});
  score=Math.max(0,Math.min(100,Math.round(score)));
  const entryHigh=price,entryLow=Math.max(sup,price-0.75*A);
  const stop=Math.max(0,entryLow-0.5*A);
  const target=breakout?price+2*A:Math.max(res,price+1.5*A);
  const rr=price>stop?(target-price)/(price-stop):null;
  const atrPct=A/price*100,risk=atrPct<2.5?'کم':atrPct<4?'متوسط':'زیاد';
  const verdict=score>=70?'شرایط تکنیکال مثبت':score>=50?'خنثی؛ منتظر تأیید':'ضعیف؛ فعلاً مناسب نیست';
  const ref=last.prevClose>0?last.prevClose:rows[rows.length-2].close;
  return{score,verdict,risk,price:rnd(price),changePct:+(((price-ref)/ref)*100).toFixed(2),lastDate:last.date,
    levels:{entryLow:rnd(entryLow),entryHigh:rnd(entryHigh),stop:rnd(stop),target:rnd(target),support:rnd(sup),resistance:rnd(res),rr:rr==null?null:+rr.toFixed(2)},
    indicators:{rsi:+R.toFixed(1),sma20:rnd(s20),sma50:rnd(s50),macdHist:+M.hist.toFixed(2),volRatio:+volRatio.toFixed(2),atrPct:+atrPct.toFixed(2)},reasons};
}
module.exports={analyze,sma,rsi,macd,atr};
