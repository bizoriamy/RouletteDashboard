const WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const RACETRACK_ZONES = [
  { name: "Zero / Jeu Zéro", numbers: [12, 35, 3, 26, 0, 32, 15] },
  { name: "Voisins du Zéro", numbers: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25] },
  { name: "Orphelins", numbers: [1, 20, 14, 31, 9, 17, 34, 6] },
  { name: "Tiers du Cylindre", numbers: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33] },
];

function range(start, end, step = 1) {
  const values = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

const TABLE_BETS = {
  splits: [
    { name: "Split 0 / 1", numbers: [0, 1] },
    { name: "Split 0 / 2", numbers: [0, 2] },
    { name: "Split 0 / 3", numbers: [0, 3] },
    ...range(1, 36).flatMap((number) => {
      const bets = [];
      if ((number - 1) % 3 !== 2) bets.push({ name: `Split ${number} / ${number + 1}`, numbers: [number, number + 1] });
      if (number <= 33) bets.push({ name: `Split ${number} / ${number + 3}`, numbers: [number, number + 3] });
      return bets;
    }),
  ],
  streets: [
    { name: "Street 0 / 1 / 2", numbers: [0, 1, 2] },
    { name: "Street 0 / 2 / 3", numbers: [0, 2, 3] },
    ...range(1, 34, 3).map((start) => ({ name: `Street ${start}–${start + 2}`, numbers: range(start, start + 2) })),
  ],
  corners: [
    { name: "Corner 0 / 1 / 2 / 3", numbers: [0, 1, 2, 3] },
    ...range(1, 31, 3).flatMap((row) => [0, 1].map((offset) => ({
      name: `Corner ${row + offset}-${row + offset + 1}-${row + offset + 3}-${row + offset + 4}`,
      numbers: [row + offset, row + offset + 1, row + offset + 3, row + offset + 4],
    }))),
  ],
  sixLines: range(1, 31, 3).map((start) => ({ name: `Six-line ${start}–${start + 5}`, numbers: range(start, start + 5) })),
  dozens: [1, 2, 3].map((dozen) => ({ name: `Dozen ${dozen}`, numbers: range((dozen - 1) * 12 + 1, dozen * 12) })),
  columns: [1, 2, 3].map((column) => ({ name: `Column ${column}`, numbers: range(column, 36, 3) })),
  evenMoney: [
    { name: "Red", numbers: [...RED_NUMBERS] },
    { name: "Black", numbers: range(1, 36).filter((number) => !RED_NUMBERS.has(number)) },
    { name: "Odd", numbers: range(1, 36).filter((number) => number % 2) },
    { name: "Even", numbers: range(1, 36).filter((number) => number % 2 === 0) },
    { name: "Low 1–18", numbers: range(1, 18) },
    { name: "High 19–36", numbers: range(19, 36) },
  ],
};

const BET_TYPE_LABELS = {
  splits: "Splits", streets: "Streets", corners: "Corners", sixLines: "Six-lines",
  dozens: "Dozens", columns: "Columns", evenMoney: "Even-money",
};

// Shared source of truth. The table, wheel and racetrack all use these records.
const rouletteNumbers = Array.from({ length: 37 }, (_, number) => ({
  number,
  color: number === 0 ? "green" : RED_NUMBERS.has(number) ? "red" : "black",
  // User definition: Column 1 contains 1, Column 2 contains 2, Column 3 contains 3.
  column: number === 0 ? null : ((number - 1) % 3) + 1,
  dozen: number === 0 ? null : Math.ceil(number / 12),
  parity: number === 0 ? null : number % 2 === 0 ? "even" : "odd",
  range: number === 0 ? null : number <= 18 ? "low (1–18)" : "high (19–36)",
  wheelIndex: WHEEL_SEQUENCE.indexOf(number),
}));

const table = document.querySelector("#roulette-table");
const wheel = document.querySelector("#roulette-wheel");
const racetrack = document.querySelector("#racetrack");
const zoneControls = document.querySelector("#zone-controls");
const betType = document.querySelector("#bet-type");
const betOptions = document.querySelector("#bet-options");
const betSelectionSummary = document.querySelector("#bet-selection-summary");
const clearButton = document.querySelector("#clear-selection");
const clearAllButton = document.querySelector("#clear-all-selection");
const details = document.querySelector("#number-details");
const infoTitle = document.querySelector("#info-title");
const infoHint = document.querySelector("#info-hint");
let lockedNumber = null;
let lockedGroups = [];

function displayValue(value) {
  return value ?? "Not applicable";
}

function showNumber(number) {
  const item = rouletteNumbers[number];
  document.querySelectorAll("[data-number]").forEach((cell) => {
    cell.classList.toggle("is-active", Number(cell.dataset.number) === number);
    cell.classList.toggle("is-locked", Number(cell.dataset.number) === lockedNumber);
  });

  infoTitle.textContent = `Number ${item.number}`;
  infoHint.textContent = lockedNumber === number ? "Selection locked. Click another number to replace it." : "Current number properties";
  details.hidden = false;
  document.querySelector("#detail-color").textContent = item.color;
  document.querySelector("#detail-column").textContent = displayValue(item.column);
  document.querySelector("#detail-dozen").textContent = displayValue(item.dozen);
  document.querySelector("#detail-parity").textContent = displayValue(item.parity);
  document.querySelector("#detail-range").textContent = displayValue(item.range);
  document.querySelector("#detail-wheel").textContent = `${item.wheelIndex + 1} of 37`;
}

function showZone(zone) {
  showGroup(zone);
}

function showGroup(group, locked = false) {
  const covered = new Set(group.numbers);
  document.querySelectorAll("[data-number]").forEach((cell) => {
    cell.classList.toggle("is-active", covered.has(Number(cell.dataset.number)));
    cell.classList.toggle("is-locked", locked && covered.has(Number(cell.dataset.number)));
  });
  infoTitle.textContent = group.name;
  infoHint.textContent = `${group.numbers.length} numbers: ${group.numbers.join(", ")}`;
  details.hidden = true;
}

function showGroupUnion(groups, locked = true) {
  const covered = new Set(groups.flatMap((group) => group.numbers));
  document.querySelectorAll("[data-number]").forEach((cell) => {
    const included = covered.has(Number(cell.dataset.number));
    cell.classList.toggle("is-active", included);
    cell.classList.toggle("is-locked", locked && included);
  });
  infoTitle.textContent = `${groups.length} bet${groups.length === 1 ? "" : "s"} selected`;
  infoHint.textContent = `${covered.size} unique numbers covered: ${[...covered].sort((a, b) => a - b).join(", ")}`;
  details.hidden = true;
}

function restoreSelection() {
  if (lockedGroups.length) showGroupUnion(lockedGroups);
  else if (lockedNumber !== null) showNumber(lockedNumber);
  else clearDisplay();
}

function clearDisplay() {
  document.querySelectorAll("[data-number]").forEach((cell) => cell.classList.remove("is-active", "is-locked"));
  infoTitle.textContent = "Choose a number";
  infoHint.textContent = "Hover over any pocket to see its properties.";
  details.hidden = true;
}

function createCell(item) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = `number-cell ${item.color}${item.number === 0 ? " zero" : ""}`;
  cell.dataset.number = item.number;
  cell.textContent = item.number;
  cell.setAttribute("aria-label", `Number ${item.number}, ${item.color}`);

  if (item.number !== 0) {
    cell.style.gridColumn = item.column;
    cell.style.gridRow = Math.ceil(item.number / 3) + 1;
  }

  cell.addEventListener("mouseenter", () => showNumber(item.number));
  cell.addEventListener("focus", () => showNumber(item.number));
  cell.addEventListener("mouseleave", restoreSelection);
  cell.addEventListener("blur", restoreSelection);
  cell.addEventListener("click", () => {
    lockedGroups = [];
    lockedNumber = lockedNumber === item.number ? null : item.number;
    restoreSelection();
    updateSelectedBetButton();
  });
  return cell;
}

function connectNumberInteraction(element, item) {
  element.addEventListener("mouseenter", () => showNumber(item.number));
  element.addEventListener("focus", () => showNumber(item.number));
  element.addEventListener("mouseleave", restoreSelection);
  element.addEventListener("blur", restoreSelection);
  element.addEventListener("click", () => {
    lockedGroups = [];
    lockedNumber = lockedNumber === item.number ? null : item.number;
    restoreSelection();
    updateSelectedBetButton();
  });
}

function createWheelPocket(number, index) {
  const item = rouletteNumbers[number];
  const pocket = document.createElement("button");
  pocket.type = "button";
  pocket.className = `wheel-pocket ${item.color}`;
  pocket.dataset.number = number;
  pocket.textContent = number;
  const angle = index * (360 / WHEEL_SEQUENCE.length);
  pocket.style.setProperty("--angle", `${angle}deg`);
  pocket.style.setProperty("--counter-angle", `${-angle}deg`);
  pocket.setAttribute("aria-label", `Wheel pocket ${number}, ${item.color}`);
  connectNumberInteraction(pocket, item);
  return pocket;
}

function createTrackPocket(number, index) {
  const item = rouletteNumbers[number];
  const pocket = document.createElement("button");
  const angle = index * (Math.PI * 2 / WHEEL_SEQUENCE.length);
  pocket.type = "button";
  pocket.className = `track-pocket ${item.color}`;
  pocket.dataset.number = number;
  pocket.textContent = number;
  pocket.style.setProperty("--x", `${50 + 44 * Math.sin(angle)}%`);
  pocket.style.setProperty("--y", `${50 - 45 * Math.cos(angle)}%`);
  pocket.setAttribute("aria-label", `Racetrack number ${number}, ${item.color}`);
  connectNumberInteraction(pocket, item);
  return pocket;
}

function createZoneButton(zone) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zone-button";
  button.textContent = zone.name;
  connectGroupInteraction(button, zone);
  return button;
}

function connectGroupInteraction(button, group) {
  button.dataset.groupId = group.id;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("mouseenter", () => showGroup(group));
  button.addEventListener("focus", () => showGroup(group));
  button.addEventListener("mouseleave", restoreSelection);
  button.addEventListener("blur", restoreSelection);
  button.addEventListener("click", () => {
    lockedNumber = null;
    const existingIndex = lockedGroups.findIndex((item) => item.id === group.id);
    if (existingIndex >= 0) lockedGroups.splice(existingIndex, 1);
    else lockedGroups.push(group);
    restoreSelection();
    updateSelectedBetButton();
  });
}

function updateSelectedBetButton() {
  document.querySelectorAll("[data-group-id]").forEach((button) => {
    const selected = lockedGroups.some((group) => group.id === button.dataset.groupId);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const covered = new Set(lockedGroups.flatMap((group) => group.numbers));
  betSelectionSummary.textContent = lockedGroups.length
    ? `${lockedGroups.length} bet${lockedGroups.length === 1 ? "" : "s"} selected · ${covered.size} unique numbers covered`
    : "No bets selected";
}

function renderBetOptions(type) {
  betOptions.replaceChildren();
  TABLE_BETS[type].forEach((bet, index) => {
    const group = { ...bet, id: `${type}-${index}` };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bet-button";
    button.textContent = group.name.replace(/^(Split|Street|Corner|Six-line) /, "");
    button.setAttribute("aria-label", group.name);
    connectGroupInteraction(button, group);
    betOptions.append(button);
  });
  updateSelectedBetButton();
}

rouletteNumbers.forEach((item) => table.append(createCell(item)));
WHEEL_SEQUENCE.forEach((number, index) => wheel.append(createWheelPocket(number, index)));
WHEEL_SEQUENCE.forEach((number, index) => racetrack.append(createTrackPocket(number, index)));
RACETRACK_ZONES.forEach((zone, index) => zoneControls.append(createZoneButton({ ...zone, id: `zone-${index}` })));
Object.entries(BET_TYPE_LABELS).forEach(([value, label]) => betType.append(new Option(label, value)));
betType.addEventListener("change", () => renderBetOptions(betType.value));
renderBetOptions(betType.value);
function clearAllSelections() {
  lockedNumber = null;
  lockedGroups = [];
  clearDisplay();
  updateSelectedBetButton();
}

clearButton.addEventListener("click", clearAllSelections);
clearAllButton.addEventListener("click", clearAllSelections);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearAllSelections();
});
