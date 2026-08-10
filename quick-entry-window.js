(function () {
  "use strict";
  const channel = new BroadcastChannel("roulette-quick-entry-v1");
  const grid = document.querySelector("#quick-grid");
  const history = document.querySelector("#quick-history");
  const input = document.querySelector("#quick-input");
  const status = document.querySelector("#quick-status");
  const topmost = document.querySelector("#quick-topmost");
  const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const color = (number) => number === 0 ? "green" : red.has(number) ? "red" : "black";

  function requestState() { channel.postMessage({ type: "request-state" }); }
  function send(action, number) {
    channel.postMessage({ type: "action", action, number });
    status.textContent = action === "undo" ? "Undo sent" : `Sent ${number}`;
    input.value = "";
    input.focus();
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
  function renderHistory(numbers) {
    history.innerHTML = '<span class="history-label">Recent</span>' + (numbers.length
      ? numbers.map((number) => `<span class="history-number ${color(number)}">${number}</span>`).join("")
      : '<span class="empty">No spins yet</span>');
  }

  const zero = document.createElement("button");
  zero.type = "button"; zero.className = "number green zero"; zero.textContent = "0";
  zero.addEventListener("click", () => send("spin", 0));
  grid.appendChild(zero);
  for (let number = 1; number <= 36; number += 1) {
    const button = document.createElement("button");
    button.type = "button"; button.className = `number ${color(number)}`; button.textContent = String(number);
    button.style.gridColumn = String(Math.floor((number - 1) / 3) + 2);
    button.style.gridRow = String(3 - ((number - 1) % 3));
    button.addEventListener("click", () => send("spin", number));
    grid.appendChild(button);
  }

  channel.addEventListener("message", (event) => {
    if (event.data?.type !== "state") return;
    renderHistory(Array.isArray(event.data.numbers) ? event.data.numbers : []);
    status.textContent = "Connected to main dashboard";
  });
  document.querySelector("#quick-enter").addEventListener("click", submitTyped);
  document.querySelector("#quick-undo").addEventListener("click", () => send("undo"));
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); submitTyped(); } });
  topmost.checked = localStorage.getItem("roulette-quick-topmost-v1") !== "false";
  async function applyTopmost() {
    localStorage.setItem("roulette-quick-topmost-v1", String(topmost.checked));
    try {
      await fetch("/api/window/topmost", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({target:"quick",enabled:topmost.checked}) });
    } catch (_) {}
  }
  topmost.addEventListener("change", applyTopmost);
  window.addEventListener("load", () => { requestState(); applyTopmost(); input.focus(); });
  window.addEventListener("beforeunload", () => channel.close());
  window.setInterval(requestState, 1500);
})();
