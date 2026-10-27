/* =========================================================
   APP.JS — reads the data, crunches it, draws the charts
   ---------------------------------------------------------
   STARTER VERSION. The function NAMES and DESCRIPTIONS are
   already written. In Step 4, Gemini fills in the bodies.

   The descriptions are a "contract": they tell the AI exactly
   what each function receives and returns, so everyone in
   class gets code that works the same way.

   RULE: do not rename functions or change their inputs.
   ========================================================= */


// Keeps track of the charts on screen so we can replace them on switch.
let categoryChart = null;
let trendChart = null;


/**
 * parseCsv(csvText)
 * Turns raw CSV text into an array of row objects.
 * Uses the PapaParse library (loaded in index.html).
 * Example: "Genre,Global_Sales\nSports,82.74" -> [{ Genre: "Sports", Global_Sales: "82.74" }]
 * @param {string} csvText - the full CSV text, header row first
 * @returns {Object[]} one object per data row
 */
function parseCsv(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true
  });
  return result.data;
}


/**
 * cleanRows(rows, settings)
 * Keeps only rows we can trust and counts the ones we threw away.
 * A row is SKIPPED when:
 *    - its category column is empty, or
 *    - its value column is not a number, or
 *    - its trend column is empty or "N/A".
 * @param {Object[]} rows - output of parseCsv
 * @param {Object} settings - one entry of DATASETS in config.js
 * @returns {{ clean: Object[], skipped: number }}
 */
function cleanRows(rows, settings) {
  const clean = [];
  let skipped = 0;

  for (const row of rows) {
    const catVal = row[settings.categoryColumn];
    const valVal = row[settings.valueColumn];
    const trendVal = row[settings.trendColumn];

    const isCatEmpty = catVal === undefined || catVal === null || String(catVal).trim() === "";
    const isValNaN = valVal === undefined || valVal === null || String(valVal).trim() === "" || isNaN(Number(valVal));
    const isTrendEmptyOrNA = trendVal === undefined || trendVal === null || String(trendVal).trim() === "" || String(trendVal).trim() === "N/A";

    if (isCatEmpty || isValNaN || isTrendEmptyOrNA) {
      skipped++;
    } else {
      clean.push(row);
    }
  }

  return { clean, skipped };
}


/**
 * toTrendKey(rawValue, grouping)
 * Converts a value from the trend column into the label used on the x-axis.
 *    "none"  -> unchanged             ("2006"      -> "2006")
 *    "hour"  -> hour from HH:MM        ("13:08"     -> "13:00")
 *    "month" -> YYYY-MM from M/D/YYYY ("1/5/2019"  -> "2019-01")
 *    "year"  -> YYYY from M/D/YYYY    ("1/5/2019"  -> "2019")
 * @param {string} rawValue
 * @param {string} grouping - "none" | "hour" | "month" | "year"
 * @returns {string}
 */
function toTrendKey(rawValue, grouping) {
  if (!rawValue) return "";
  const val = String(rawValue).trim();

  if (grouping === "none") {
    return val;
  }

  if (grouping === "hour") {
    const parts = val.split(":");
    if (parts.length > 0) {
      const h = parts[0].padStart(2, "0");
      return h + ":00";
    }
    return val;
  }

  if (grouping === "month" || grouping === "year") {
    const parts = val.split("/");
    if (parts.length === 3) {
      const m = parts[0].padStart(2, "0");
      const d = parts[1].padStart(2, "0");
      const y = parts[2];
      if (grouping === "month") {
        return y + "-" + m;
      }
      if (grouping === "year") {
        return y;
      }
    }
  }

  return val;
}


/**
 * groupAndAggregate(rows, groupColumn, valueColumn, aggregation, grouping)
 * Groups rows by one column and combines the numbers in each group.
 * Example: sum of "Total" per "Product line".
 * @param {Object[]} rows - cleaned rows
 * @param {string} groupColumn - column to group by
 * @param {string} valueColumn - column with the numbers
 * @param {string} aggregation - "sum" | "count" | "average"
 * @param {string} grouping - passed to toTrendKey ("none" for categories)
 * @returns {{ labels: string[], values: number[] }} in the order first seen
 */
function groupAndAggregate(rows, groupColumn, valueColumn, aggregation, grouping) {
  const map = new Map();

  for (const row of rows) {
    const rawGroup = row[groupColumn];
    const key = toTrendKey(rawGroup, grouping);
    const num = Number(row[valueColumn]);

    if (!map.has(key)) {
      map.set(key, { sum: 0, count: 0 });
    }
    const item = map.get(key);
    item.sum += num;
    item.count += 1;
  }

  const labels = [];
  const values = [];

  for (const [key, item] of map.entries()) {
    labels.push(key);
    if (aggregation === "sum") {
      values.push(item.sum);
    } else if (aggregation === "count") {
      values.push(item.count);
    } else if (aggregation === "average") {
      values.push(item.count > 0 ? item.sum / item.count : 0);
    } else {
      values.push(item.sum);
    }
  }

  return { labels, values };
}


/**
 * sortGroups(groups, sortBy, limit)
 * Sorts grouped data and optionally keeps only the first few.
 * @param {{ labels: string[], values: number[] }} groups
 * @param {string} sortBy - "valueDesc" (biggest first) | "labelAsc" (A–Z / oldest first)
 * @param {number} [limit] - how many to keep (leave empty to keep all)
 * @returns {{ labels: string[], values: number[] }}
 */
function sortGroups(groups, sortBy, limit) {
  const combined = groups.labels.map((label, index) => {
    return { label: label, value: groups.values[index] };
  });

  if (sortBy === "valueDesc") {
    combined.sort((a, b) => b.value - a.value);
  } else if (sortBy === "labelAsc") {
    combined.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }

  const resultList = (limit && limit > 0) ? combined.slice(0, limit) : combined;

  return {
    labels: resultList.map(item => item.label),
    values: resultList.map(item => item.value)
  };
}


/**
 * formatNumber(value)
 * Formats a number with commas and CHART_SETTINGS.numberDecimals decimals.
 * Example: 322966.749 -> "322,966.75"
 */
function formatNumber(value) {
  const decimals = (typeof CHART_SETTINGS !== "undefined" && CHART_SETTINGS.numberDecimals !== undefined) 
    ? CHART_SETTINGS.numberDecimals 
    : 2;
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}


/**
 * renderSummary(settings, cleanCount, skipped, total, topCategory)
 * Writes the dataset title, description and the 4 summary cards.
 * Required element IDs: dataset-title, dataset-description, dataset-source,
 * kpi-records, kpi-total, kpi-total-label, kpi-top, kpi-skipped
 */
function renderSummary(settings, cleanCount, skipped, total, topCategory) {
  const titleEl = document.getElementById("dataset-title");
  if (titleEl) titleEl.textContent = settings.title;

  const descEl = document.getElementById("dataset-description");
  if (descEl) descEl.textContent = settings.description;

  const sourceEl = document.getElementById("dataset-source");
  if (sourceEl) sourceEl.href = settings.source;

  const recordsEl = document.getElementById("kpi-records");
  if (recordsEl) recordsEl.textContent = cleanCount.toLocaleString("en-US");

  const totalEl = document.getElementById("kpi-total");
  if (totalEl) totalEl.textContent = formatNumber(total);

  const totalLabelEl = document.getElementById("kpi-total-label");
  if (totalLabelEl) totalLabelEl.textContent = settings.valueLabel;

  const topEl = document.getElementById("kpi-top");
  if (topEl) topEl.textContent = topCategory;

  const skippedEl = document.getElementById("kpi-skipped");
  if (skippedEl) skippedEl.textContent = skipped.toLocaleString("en-US");
}


/**
 * renderCategoryChart(groups, settings)
 * Draws Chart 1 (bar chart) on <canvas id="chart-category">.
 * Destroys the previous chart first so switching datasets works.
 * Required element IDs: chart-category, chart-category-title
 */
function renderCategoryChart(groups, settings) {
  const titleEl = document.getElementById("chart-category-title");
  if (titleEl) titleEl.textContent = settings.categoryColumn + " Breakdown";

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  const canvas = document.getElementById("chart-category");
  if (!canvas) return;

  categoryChart = new Chart(canvas, {
    type: CHART_SETTINGS.categoryChartType || "bar",
    data: {
      labels: groups.labels,
      datasets: [{
        label: settings.valueLabel,
        data: groups.values,
        backgroundColor: CHART_SETTINGS.primaryColor
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}


/**
 * renderTrendChart(groups, settings)
 * Draws Chart 2 (line chart) on <canvas id="chart-trend">.
 * Destroys the previous chart first so switching datasets works.
 * Required element IDs: chart-trend, chart-trend-title
 */
function renderTrendChart(groups, settings) {
  const titleEl = document.getElementById("chart-trend-title");
  if (titleEl) titleEl.textContent = settings.trendLabel + " Trend";

  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }

  const canvas = document.getElementById("chart-trend");
  if (!canvas) return;

  trendChart = new Chart(canvas, {
    type: CHART_SETTINGS.trendChartType || "line",
    data: {
      labels: groups.labels,
      datasets: [{
        label: settings.valueLabel,
        data: groups.values,
        borderColor: CHART_SETTINGS.primaryColor,
        backgroundColor: CHART_SETTINGS.secondaryColor,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}


/**
 * loadDashboard(datasetKey)
 * The main function. Runs every step in order for one dataset:
 * parse -> clean -> group -> sort -> render summary -> render 2 charts.
 * @param {string} datasetKey - a key of DATASETS, e.g. "supermarket"
 */
function loadDashboard(datasetKey) {
  const settings = DATASETS[datasetKey];
  if (!settings) return;

  const rawRows = parseCsv(settings.csv);
  const { clean, skipped } = cleanRows(rawRows, settings);

  const categoryData = groupAndAggregate(
    clean,
    settings.categoryColumn,
    settings.valueColumn,
    settings.aggregation,
    "none"
  );
  const sortedCategoryData = sortGroups(categoryData, "valueDesc", CHART_SETTINGS.maxCategories);

  const trendData = groupAndAggregate(
    clean,
    settings.trendColumn,
    settings.valueColumn,
    settings.aggregation,
    settings.trendGrouping
  );
  const sortedTrendData = sortGroups(trendData, "labelAsc");

  let totalValue = 0;
  for (const row of clean) {
    totalValue += Number(row[settings.valueColumn]);
  }

  const topCategory = sortedCategoryData.labels.length > 0 ? sortedCategoryData.labels[0] : "N/A";

  renderSummary(settings, clean.length, skipped, totalValue, topCategory);
  renderCategoryChart(sortedCategoryData, settings);
  renderTrendChart(sortedTrendData, settings);
}


/**
 * setupDatasetPicker()
 * Fills <select id="dataset-select"> with every dataset in DATASETS,
 * selects ACTIVE_DATASET, and reloads the dashboard when it changes.
 */
function setupDatasetPicker() {
  const select = document.getElementById("dataset-select");
  if (!select) return;

  select.innerHTML = "";

  for (const key in DATASETS) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = DATASETS[key].title;
    if (key === ACTIVE_DATASET) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  select.addEventListener("change", function (e) {
    loadDashboard(e.target.value);
  });
}


// Start everything once the page has loaded.
document.addEventListener("DOMContentLoaded", function () {
  setupDatasetPicker();
  loadDashboard(ACTIVE_DATASET);
});



// /* =========================================================
//    APP.JS — reads the data, crunches it, draws the charts
//    ---------------------------------------------------------
//    STARTER VERSION. The function NAMES and DESCRIPTIONS are
//    already written. In Step 4, Gemini fills in the bodies.

//    The descriptions are a "contract": they tell the AI exactly
//    what each function receives and returns, so everyone in
//    class gets code that works the same way.

//    RULE: do not rename functions or change their inputs.
//    ========================================================= */


// // Keeps track of the charts on screen so we can replace them on switch.
// let categoryChart = null;
// let trendChart = null;


// /**
//  * parseCsv(csvText)
//  * Turns raw CSV text into an array of row objects.
//  * Uses the PapaParse library (loaded in index.html).
//  * Example: "Genre,Global_Sales\nSports,82.74" -> [{ Genre: "Sports", Global_Sales: "82.74" }]
//  * @param {string} csvText - the full CSV text, header row first
//  * @returns {Object[]} one object per data row
//  */
// function parseCsv(csvText) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * cleanRows(rows, settings)
//  * Keeps only rows we can trust and counts the ones we threw away.
//  * A row is SKIPPED when:
//  *   - its category column is empty, or
//  *   - its value column is not a number, or
//  *   - its trend column is empty or "N/A".
//  * @param {Object[]} rows - output of parseCsv
//  * @param {Object} settings - one entry of DATASETS in config.js
//  * @returns {{ clean: Object[], skipped: number }}
//  */
// function cleanRows(rows, settings) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * toTrendKey(rawValue, grouping)
//  * Converts a value from the trend column into the label used on the x-axis.
//  *   "none"  -> unchanged             ("2006"      -> "2006")
//  *   "hour"  -> hour from HH:MM       ("13:08"     -> "13:00")
//  *   "month" -> YYYY-MM from M/D/YYYY ("1/5/2019"  -> "2019-01")
//  *   "year"  -> YYYY from M/D/YYYY    ("1/5/2019"  -> "2019")
//  * @param {string} rawValue
//  * @param {string} grouping - "none" | "hour" | "month" | "year"
//  * @returns {string}
//  */
// function toTrendKey(rawValue, grouping) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * groupAndAggregate(rows, groupColumn, valueColumn, aggregation, grouping)
//  * Groups rows by one column and combines the numbers in each group.
//  * Example: sum of "Total" per "Product line".
//  * @param {Object[]} rows - cleaned rows
//  * @param {string} groupColumn - column to group by
//  * @param {string} valueColumn - column with the numbers
//  * @param {string} aggregation - "sum" | "count" | "average"
//  * @param {string} grouping - passed to toTrendKey ("none" for categories)
//  * @returns {{ labels: string[], values: number[] }} in the order first seen
//  */
// function groupAndAggregate(rows, groupColumn, valueColumn, aggregation, grouping) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * sortGroups(groups, sortBy, limit)
//  * Sorts grouped data and optionally keeps only the first few.
//  * @param {{ labels: string[], values: number[] }} groups
//  * @param {string} sortBy - "valueDesc" (biggest first) | "labelAsc" (A–Z / oldest first)
//  * @param {number} [limit] - how many to keep (leave empty to keep all)
//  * @returns {{ labels: string[], values: number[] }}
//  */
// function sortGroups(groups, sortBy, limit) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * formatNumber(value)
//  * Formats a number with commas and CHART_SETTINGS.numberDecimals decimals.
//  * Example: 322966.749 -> "322,966.75"
//  */
// function formatNumber(value) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * renderSummary(settings, cleanCount, skipped, total, topCategory)
//  * Writes the dataset title, description and the 4 summary cards.
//  * Required element IDs: dataset-title, dataset-description, dataset-source,
//  * kpi-records, kpi-total, kpi-total-label, kpi-top, kpi-skipped
//  */
// function renderSummary(settings, cleanCount, skipped, total, topCategory) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * renderCategoryChart(groups, settings)
//  * Draws Chart 1 (bar chart) on <canvas id="chart-category">.
//  * Destroys the previous chart first so switching datasets works.
//  * Required element IDs: chart-category, chart-category-title
//  */
// function renderCategoryChart(groups, settings) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * renderTrendChart(groups, settings)
//  * Draws Chart 2 (line chart) on <canvas id="chart-trend">.
//  * Destroys the previous chart first so switching datasets works.
//  * Required element IDs: chart-trend, chart-trend-title
//  */
// function renderTrendChart(groups, settings) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * loadDashboard(datasetKey)
//  * The main function. Runs every step in order for one dataset:
//  * parse -> clean -> group -> sort -> render summary -> render 2 charts.
//  * @param {string} datasetKey - a key of DATASETS, e.g. "supermarket"
//  */
// function loadDashboard(datasetKey) {
//   // TODO (Step 4): Gemini writes this part.
// }


// /**
//  * setupDatasetPicker()
//  * Fills <select id="dataset-select"> with every dataset in DATASETS,
//  * selects ACTIVE_DATASET, and reloads the dashboard when it changes.
//  */
// function setupDatasetPicker() {
//   // TODO (Step 4): Gemini writes this part.
// }


// // Start everything once the page has loaded.
// document.addEventListener("DOMContentLoaded", function () {
//   setupDatasetPicker();
//   loadDashboard(ACTIVE_DATASET);
// });
