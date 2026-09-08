(() => {
  "use strict";
  const SIDES=["red","black","odd","even","high","low","dozen1","dozen2","dozen3","column1","column2","column3"];
  const LABELS={red:"Red",black:"Black",odd:"Odd",even:"Even",high:"High",low:"Low",dozen1:"1st Dozen",dozen2:"2nd Dozen",dozen3:"3rd Dozen",column1:"Column 1",column2:"Column 2",column3:"Column 3"};
  const OPPOSITES={red:"black",black:"red",odd:"even",even:"odd",high:"low",low:"high"};
  const WINDOW_KEY="roulette-freddy-floating-window-v1";
  const channel=new BroadcastChannel("roulette-freddy-live-v1");
  const ribbon=document.querySelector("#ribbon");
  let latest=null, settingsLoaded=false, lastMessage=0;
  const money=value=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:2});
  const signed=value=>`${Number(value||0)>=0?"+":""}${money(value)}`;
  ribbon.innerHTML=SIDES.map(side=>`<button class="pick" data-side="${side}" type="button"><strong>${LABELS[side]}</strong><span>0 hits · 0 misses</span></button>`).join("");

  function setStatus(text,error=false){
    const el=document.querySelector("#status"); el.textContent=text; el.className=error?"negative":"";
  }
  function render(message){
    latest=message.state; lastMessage=Date.now();
    document.querySelector("#connection").textContent="Connected to main dashboard";
    document.querySelector("#session-number").textContent=message.sessionNumber??"—";
    document.querySelector("#spin-count").textContent=latest.spinCount;
    document.querySelector("#active-count").textContent=`${latest.active.length}/7`;
    document.querySelector("#exposure").textContent=`${money(latest.totalExposure)} U`;
    const activeSides=new Set(latest.active.map(item=>item.side));
    for(const side of SIDES){
      const button=ribbon.querySelector(`[data-side="${side}"]`),freq=latest.frequencies[side];
      button.classList.toggle("active",activeSides.has(side));
      button.classList.toggle("paused",Boolean(latest.active.find(item=>item.side===side)?.paused));
      button.classList.toggle("blocked",Boolean(OPPOSITES[side]&&activeSides.has(OPPOSITES[side])&&!activeSides.has(side)));
      button.querySelector("span").textContent=`${freq.hits} hits · ${freq.misses} misses`;
    }
    document.querySelector("#active").innerHTML=latest.active.length?latest.active.map(t=>`
      <article class="tracker ${t.paused?"safety-paused":""}">
        <h2><span>${LABELS[t.side]}</span><span class="${t.sessionProfit>=0?"positive":"negative"}">RM ${signed(t.sessionProfit*t.config.baseUnit)} / ${signed(t.sessionProfit)} U</span></h2>
        ${t.paused?`<div class="safety-alert"><strong>Safety checkpoint: 4 consecutive losses</strong><span>This card is paused. Tracking continues; no wager is placed.</span><div><button data-safety="reset" data-side="${t.side}">Reset Level 1</button><button data-safety="continue" data-side="${t.side}">Continue</button><button class="danger" data-safety="stop" data-side="${t.side}">Stop card</button></div></div>`:""}
        <div class="tracker-grid">
          <span>${t.paused?"Held stake":"Next stake"}<b>${money(t.currentValue)} U</b></span>
          <span>Amount<b>${money(t.currentMoney)}</b></span>
          <span>Level / Position<b>${t.levelIndex+1} / ${t.positionIndex+1}</b></span>
          <span>Bankroll<b>${money(t.balance)} U</b></span>
          <span>Cycle P/L<b class="${t.cycleProfit>=0?"positive":"negative"}">${money(t.cycleProfit)} U</b></span>
          <span>Max drawdown<b>${money(t.maxDrawdown)} U</b></span>
        </div>
      </article>`).join(""):'<p class="hint">No active Freddy trackers.</p>';
    const currentCompleted=[...latest.completed].slice(-7).reverse();
    const previousCompleted=[...(latest.previousSession||[])].slice(-7).reverse();
    const resultRows=items=>items.map(t=>{
      const pl=Number(t.sessionProfitHalf||0)/2;
      return `<div class="result"><span>${LABELS[t.side]} · ${t.stopReason}</span><b class="${pl>=0?"positive":"negative"}">RM ${signed(pl*t.config.baseUnit)} / ${signed(pl)} U</b></div>`;
    }).join("");
    const completedPanel=document.querySelector("#completed");
    const recentWasOpen=completedPanel.querySelector('[data-result-section="recent"]')?.open??true;
    const previousWasOpen=completedPanel.querySelector('[data-result-section="previous"]')?.open??false;
    completedPanel.innerHTML=[
      `<details class="previous-results" data-result-section="recent" ${recentWasOpen?"open":""}><summary>Recently stopped (${currentCompleted.length})</summary>${currentCompleted.length?resultRows(currentCompleted):'<p class="hint result-empty">No stopped cards in this session.</p>'}</details>`,
      `<details class="previous-results" data-result-section="previous" ${previousWasOpen?"open":""}><summary>Previous session results (${previousCompleted.length})</summary>${previousCompleted.length?resultRows(previousCompleted):'<p class="hint result-empty">No previous session results saved.</p>'}</details>`
    ].join("");
    if(!settingsLoaded){
      const c=latest.config;
      document.querySelector("#table-rule").value=c.tableRule;
      document.querySelector("#max-level").value=c.maxLevel;
      document.querySelector("#bankroll").value=c.startingBankroll;
      document.querySelector("#base-unit").value=c.baseUnit;
      document.querySelector("#cycle-target").value=c.cycleTarget;
      document.querySelector("#loss-limit").value=c.lossLimit;
      settingsLoaded=true;
    }
    if(message.backtest)renderBacktest(message.backtest);
    setStatus("Live state received");
  }
  function renderBacktest(rows){
    const box=document.querySelector("#backtest-results"); box.hidden=false;
    box.innerHTML=`<table><thead><tr><th>Selection</th><th>P/L</th><th>Level</th><th>Drawdown</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}</td><td class="${r.netUnits>=0?"positive":"negative"}">${r.netUnits>=0?"+":""}${money(r.netUnits)}</td><td>${r.highestLevel}</td><td>${money(r.maxDrawdown)}</td></tr>`).join("")}</tbody></table>`;
  }
  channel.addEventListener("message",event=>{
    const message=event.data||{};
    if(message.type==="state")render(message);
    if(message.type==="error")setStatus(message.message,true);
  });
  ribbon.addEventListener("click",event=>{
    const button=event.target.closest("[data-side]"); if(!button)return;
    channel.postMessage({type:"toggle",side:button.dataset.side});
  });
  document.querySelector("#active").addEventListener("click",event=>{
    const button=event.target.closest("[data-safety]"); if(!button)return;
    channel.postMessage({type:"safety-action",side:button.dataset.side,action:button.dataset.safety});
    setStatus(`${LABELS[button.dataset.side]} safety choice sent`);
  });
  document.querySelector("#apply").addEventListener("click",()=>{
    channel.postMessage({type:"settings",settings:{
      tableRule:document.querySelector("#table-rule").value,
      maxLevel:document.querySelector("#max-level").value,
      startingBankroll:document.querySelector("#bankroll").value,
      baseUnit:document.querySelector("#base-unit").value,
      cycleTarget:document.querySelector("#cycle-target").value,
      lossLimit:document.querySelector("#loss-limit").value
    }});
    setStatus("Settings sent to dashboard");
  });
  document.querySelector("#backtest").addEventListener("click",()=>channel.postMessage({type:"backtest"}));
  document.querySelector("#always-on-top").addEventListener("change",async event=>{
    try{
      const response=await fetch("/api/freddy/topmost",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:event.target.checked})});
      const result=await response.json(); if(!result.ok)throw new Error(result.error||"Always-on-top failed");
      setStatus(event.target.checked?"Always on top enabled":"Always on top disabled");
    }catch(error){event.target.checked=false;setStatus(error.message,true);}
  });
  window.addEventListener("load",async()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(WINDOW_KEY)||"null");
      if(saved){
        window.moveTo(saved.x,saved.y);
        window.resizeTo(saved.width,saved.height);
      }
    }catch{}
    channel.postMessage({type:"request-state"});
    try{await fetch("/api/freddy/topmost",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true})});}catch{}
  });
  window.addEventListener("beforeunload",()=>{
    localStorage.setItem(WINDOW_KEY,JSON.stringify({
      x:window.screenX,y:window.screenY,width:window.outerWidth,height:window.outerHeight
    }));
  });
  window.setInterval(()=>{
    if(Date.now()-lastMessage>4000){
      document.querySelector("#connection").textContent="Waiting for main dashboard…";
      channel.postMessage({type:"request-state"});
    }
  },2000);
})();
