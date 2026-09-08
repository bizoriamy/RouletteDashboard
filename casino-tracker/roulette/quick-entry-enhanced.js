(function () {
  "use strict";
  const channel = new BroadcastChannel("roulette-quick-entry-v1");
  const grid = document.querySelector("#quick-grid");
  const streets = document.querySelector("#quick-streets");
  const history = document.querySelector("#quick-history");
  const input = document.querySelector("#quick-input");
  const status = document.querySelector("#quick-status");
  const topmost = document.querySelector("#quick-topmost");
  const layout = document.querySelector("#quick-layout");
  const boardContainer = document.querySelector("#board-container");
  
  const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const color = (number) => number === 0 ? "green" : red.has(number) ? "red" : "black";
  
  const streetData = [
    { num: "1-3", numbers: [1, 2, 3] },
    { num: "4-6", numbers: [4, 5, 6] },
    { num: "7-9", numbers: [7, 8, 9] },
    { num: "10-12", numbers: [10, 11, 12] },
    { num: "13-15", numbers: [13, 14, 15] },
    { num: "16-18", numbers: [16, 17, 18] },
    { num: "19-21", numbers: [19, 20, 21] },
    { num: "22-24", numbers: [22, 23, 24] },
    { num: "25-27", numbers: [25, 26, 27] },
    { num: "28-30", numbers: [28, 29, 30] },
    { num: "31-33", numbers: [31, 32, 33] },
    { num: "34-36", numbers: [34, 35, 36] }
  ];

  const groupData = {
    d1: { name: "D1", numbers: [1,2,3,4,5,6,7,8,9,10,11,12] },
    d2: { name: "D2", numbers: [13,14,15,16,17,18,19,20,21,22,23,24] },
    d3: { name: "D3", numbers: [25,26,27,28,29,30,31,32,33,34,35,36] },
    c1: { name: "C1", numbers: [1,4,7,10,13,16,19,22,25,28,31,34] },
    c2: { name: "C2", numbers: [2,5,8,11,14,17,20,23,26,29,32,35] },
    c3: { name: "C3", numbers: [3,6,9,12,15,18,21,24,27,30,33,36] }
  };

  // Track hit counts for badges
  const numberHits = {};
  const streetHits = {};
  const groupHits = {};
  for (let i = 0; i <= 36; i++) numberHits[i] = 0;
  for (const street of streetData) streetHits[street.num] = 0;
  for (const key in groupData) groupHits[key] = 0;

  function requestState() { 
    channel.postMessage({ type: "request-state" }); 
  }

  async function send(action, number) {
    try {
      const response = await fetch("/api/quick-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "undo" ? { action } : { action, number })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Quick Entry send failed");
      if (Array.isArray(payload.history)) {
        const numbers = payload.history.slice().reverse();
        renderHistory(numbers);
        updateBadges(numbers);
      }
      status.textContent = action === "undo" ? "Undo sent" : `Sent ${number}`;
      channel.postMessage({ type: "request-state" });
    } catch (error) {
      status.textContent = error?.message || "Quick Entry send failed";
    } finally {
      input.value = "";
      input.focus();
    }
  }

  function submitTyped() {
    const text = input.value.trim();
    const number = Number(text);
    if (!/^\d{1,2}$/.test(text) || !Number.isInteger(number) || number < 0 || number > 36) {
      status.textContent = "Enter a whole number from 0 to 36";
      input.select();
      return;
    }
    send("spin", number);
  }

  function updateBadges(numbers) {
    // Reset counts
    for (let i = 0; i <= 36; i++) numberHits[i] = 0;
    for (const street of streetData) streetHits[street.num] = 0;
    for (const key in groupData) groupHits[key] = 0;
    
    // Count hits from the provided numbers
    if (Array.isArray(numbers)) {
      numbers.forEach(num => {
        if (typeof num === "number" && num >= 0 && num <= 36) {
          numberHits[num]++;
          // Update street hits
          for (const street of streetData) {
            if (street.numbers.includes(num)) {
              streetHits[street.num]++;
            }
          }
          // Update group hits
          for (const key in groupData) {
            if (groupData[key].numbers.includes(num)) {
              groupHits[key]++;
            }
          }
        }
      });
    }
    
    // Update number badges
    grid.querySelectorAll(".number").forEach(btn => {
      const num = Number(btn.textContent);
      const count = numberHits[num];
      let badge = btn.querySelector(".badge");
      if (count > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "badge";
          btn.appendChild(badge);
        }
        badge.textContent = String(count);
      } else if (badge) {
        badge.remove();
      }
    });
    
    // Update street badges
    streets.querySelectorAll(".street").forEach(btn => {
      const streetLabel = btn.textContent.trim().split("\n")[0];
      const count = streetHits[streetLabel] || 0;
      let badge = btn.querySelector(".badge");
      if (count > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "badge";
          btn.appendChild(badge);
        }
        badge.textContent = String(count);
      } else if (badge) {
        badge.remove();
      }
    });
    
    // Update group stats
    const groupsSection = document.querySelector("#quick-groups");
    if (groupsSection) {
      const totalSpins = Array.isArray(numbers) ? numbers.length : 0;
      groupsSection.querySelectorAll(".group-tile").forEach(btn => {
        const groupKey = btn.dataset.group;
        const hits = groupHits[groupKey] || 0;
        const absence = totalSpins - hits;
        
        const statSpans = btn.querySelectorAll(".stat-count");
        if (statSpans.length >= 2) {
          statSpans[0].textContent = String(hits);
          statSpans[1].textContent = String(absence);
        }
      });
    }
  }

  function renderHistory(numbers) {
    history.innerHTML = '<span class="history-label">Recent</span>' + (Array.isArray(numbers) && numbers.length
      ? numbers.map((number) => `<span class="history-number ${color(number)}">${number}</span>`).join("")
      : '<span class="empty">No spins yet</span>');
  }

  function applyLayout(value) {
    const selected = value === "top" ? "top" : "left";
    layout.value = selected;
    grid.classList.toggle("layout-left", selected === "left");
    grid.classList.toggle("layout-top", selected === "top");
    streets.classList.toggle("layout-left", selected === "left");
    streets.classList.toggle("layout-top", selected === "top");
    boardContainer.classList.toggle("layout-left", selected === "left");
    boardContainer.classList.toggle("layout-top", selected === "top");
    localStorage.setItem("roulette-quick-layout-v1", selected);
    
    grid.querySelectorAll(".number:not(.zero)").forEach((button) => {
      const number = Number(button.textContent);
      if (selected === "top") {
        button.style.gridColumn = String(((number - 1) % 3) + 1);
        button.style.gridRow = String(Math.floor((number - 1) / 3) + 2);
      } else {
        button.style.gridColumn = String(Math.floor((number - 1) / 3) + 2);
        button.style.gridRow = String(3 - ((number - 1) % 3));
      }
    });
  }

  // Initialize grid
  grid.classList.add("layout-left");
  streets.classList.add("layout-left");
  boardContainer.classList.add("layout-left");
  
  const zero = document.createElement("button");
  zero.type = "button"; 
  zero.className = "number green zero"; 
  zero.textContent = "0";
  zero.addEventListener("click", () => send("spin", 0));
  grid.appendChild(zero);
  
  for (let number = 1; number <= 36; number += 1) {
    const button = document.createElement("button");
    button.type = "button"; 
    button.className = `number ${color(number)}`; 
    button.textContent = String(number);
    button.style.gridColumn = String(Math.floor((number - 1) / 3) + 2);
    button.style.gridRow = String(3 - ((number - 1) % 3));
    button.addEventListener("click", () => send("spin", number));
    grid.appendChild(button);
  }

  // Create street tiles
  // Add a blank spacer to align with the 0 button
  const spacer = document.createElement("button");
  spacer.type = "button";
  spacer.className = "street street-spacer";
  spacer.style.visibility = "hidden";
  streets.appendChild(spacer);
  
  // Add actual street tiles
  for (const street of streetData) {
    const streetBtn = document.createElement("button");
    streetBtn.type = "button";
    streetBtn.className = "street";
    streetBtn.textContent = street.num;
    streetBtn.addEventListener("click", () => {
      status.textContent = `Street ${street.num} clicked`;
    });
    streets.appendChild(streetBtn);
  }

  // BroadcastChannel listener
  channel.addEventListener("message", (event) => {
    if (event.data?.type !== "state") return;
    const localBuild = document.querySelector("footer strong")?.textContent?.trim() || "";
    if (event.data.build && localBuild && event.data.build !== localBuild) {
      window.location.reload();
      return;
    }
    const numbers = Array.isArray(event.data.numbers) ? event.data.numbers : [];
    renderHistory(numbers);
    updateBadges(numbers);
    status.textContent = "Connected to main dashboard";
  });

  document.querySelector("#quick-enter").addEventListener("click", submitTyped);
  document.querySelector("#quick-undo").addEventListener("click", () => send("undo"));
  input.addEventListener("keydown", (event) => { 
    if (event.key === "Enter") { 
      event.preventDefault(); 
      submitTyped(); 
    } 
  });

  topmost.checked = localStorage.getItem("roulette-quick-topmost-v1") !== "false";
  async function applyTopmost() {
    localStorage.setItem("roulette-quick-topmost-v1", String(topmost.checked));
    try {
      await fetch("/api/window/topmost", { 
        method:"POST", 
        headers:{"Content-Type":"application/json"}, 
        body:JSON.stringify({target:"quick",enabled:topmost.checked}) 
      });
    } catch (_) {}
  }

  topmost.addEventListener("change", applyTopmost);
  layout.addEventListener("change", () => applyLayout(layout.value));
  
  window.addEventListener("load", () => { 
    applyLayout(localStorage.getItem("roulette-quick-layout-v1")); 
    requestState(); 
    applyTopmost(); 
    input.focus(); 
  });
  
  window.addEventListener("beforeunload", () => channel.close());
  window.setInterval(requestState, 1500);
})();
