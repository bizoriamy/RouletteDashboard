(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RouletteOcrGrid = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function validNumber(text) {
    const cleaned = String(text || "").trim().replace(/[oO]/g, "0");
    if (!/^\d{1,2}$/.test(cleaned)) return null;
    const number = Number(cleaned);
    return number >= 0 && number <= 36 ? number : null;
  }

  function collectWords(data) {
    if (Array.isArray(data.words) && data.words.length) return data.words;
    const words = [];
    for (const block of data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          words.push(...(line.words || []));
        }
      }
    }
    return words;
  }

  function numbersInReadingOrder(data) {
    const positioned = collectWords(data).map(word => {
      const bbox = word.bbox || {};
      const number = validNumber(word.text);
      if (number === null || !Number.isFinite(bbox.x0) || !Number.isFinite(bbox.y0)) return null;
      const x1 = Number.isFinite(bbox.x1) ? bbox.x1 : bbox.x0;
      const y1 = Number.isFinite(bbox.y1) ? bbox.y1 : bbox.y0;
      return {
        number,
        x: (bbox.x0 + x1) / 2,
        y: (bbox.y0 + y1) / 2,
        height: Math.max(1, y1 - bbox.y0),
      };
    }).filter(Boolean);

    if (!positioned.length) {
      return String(data.text || "").split(/[\s,]+/)
        .map(validNumber)
        .filter(number => number !== null);
    }

    positioned.sort((a, b) => a.y - b.y || a.x - b.x);
    const heights = positioned.map(item => item.height).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)] || 10;
    const rowTolerance = Math.max(4, medianHeight * 0.65);
    const rows = [];

    for (const item of positioned) {
      let bestRow = null;
      let bestDistance = Infinity;
      for (const row of rows) {
        const distance = Math.abs(item.y - row.y);
        if (distance <= rowTolerance && distance < bestDistance) {
          bestRow = row;
          bestDistance = distance;
        }
      }
      if (!bestRow) {
        bestRow = { y: item.y, items: [] };
        rows.push(bestRow);
      }
      bestRow.items.push(item);
      bestRow.y = bestRow.items.reduce((sum, entry) => sum + entry.y, 0) / bestRow.items.length;
    }

    rows.sort((a, b) => a.y - b.y);
    return rows.flatMap(row =>
      row.items.sort((a, b) => a.x - b.x).map(item => item.number)
    );
  }

  return { numbersInReadingOrder };
});
