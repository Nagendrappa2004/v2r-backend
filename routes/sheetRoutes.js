const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const Product = require("../models/product");
const {
  parsePackPricesString,
  isPackPriceHeader,
  parseUpcomingFromStatus
} = require("../utils/sheetPricing");

const router = express.Router();

/** Standard columns — not treated as separate quantity/weight price columns */
const STANDARD_COLS = new Set([
  "name",
  "category",
  "image",
  "description",
  "status",
  "stock",
  "price"
]);

const RECOMMENDED_HEADERS = ["name", "category", "image", "description", "packPrice", "status"];

function headerIsStandard(h) {
  const key = (h || "").toLowerCase().trim();
  return STANDARD_COLS.has(key) || isPackPriceHeader(h);
}

function mergePriceMaps(...maps) {
  return Object.assign({}, ...maps);
}

function getRowField(row, fieldName) {
  if (row[fieldName] != null && row[fieldName] !== "") return row[fieldName];
  const lower = fieldName.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key && key.toLowerCase().trim() === lower) return row[key];
  }
  return undefined;
}

function buildProductFromRow(row, packPriceCol, quantityColumns) {
  let priceByWeight = {};

  const packVal = packPriceCol ? getRowField(row, packPriceCol) : getRowField(row, "packPrice");
  if (packVal) {
    priceByWeight = mergePriceMaps(priceByWeight, parsePackPricesString(packVal));
  }

  for (const col of quantityColumns) {
    const val = row[col];
    if (val != null && val !== "" && String(val).includes("|")) {
      priceByWeight = mergePriceMaps(priceByWeight, parsePackPricesString(val));
    } else if (val != null && val !== "" && !isNaN(Number(val))) {
      priceByWeight[col.trim()] = Number(val);
    }
  }

  const statusRaw = getRowField(row, "status");
  const upcoming = parseUpcomingFromStatus(statusRaw);

  const baseData = {
    category: getRowField(row, "category"),
    image: getRowField(row, "image"),
    description: getRowField(row, "description"),
    upcoming
  };

  const stockVal = getRowField(row, "stock");
  if (stockVal != null && stockVal !== "" && !isNaN(Number(stockVal))) {
    baseData.stock = Number(stockVal);
  }

  const priceVal = getRowField(row, "price");
  if (priceVal != null && priceVal !== "" && !isNaN(Number(priceVal))) {
    baseData.price = Number(priceVal);
  } else if (Object.keys(priceByWeight).length) {
    baseData.price = Math.min(...Object.values(priceByWeight));
  }

  Object.keys(baseData).forEach(k => {
    if (baseData[k] === undefined || baseData[k] === "") delete baseData[k];
  });

  if (Object.keys(priceByWeight).length) baseData.priceByWeight = priceByWeight;

  return baseData;
}

router.get("/sync", async (req, res) => {
  try {
    const doc = new GoogleSpreadsheet(
      process.env.GOOGLE_SHEET_ID || "1n-501X-yl6tK7HWDfzfeoen3Kv7oh4fOmQu84naUsac"
    );

    if (!process.env.GOOGLE_SHEET_API_KEY) {
      return res.status(500).json({
        error: "GOOGLE_SHEET_API_KEY is missing in .env; please add it from Google Cloud and restart the server."
      });
    }

    await doc.useApiKey(process.env.GOOGLE_SHEET_API_KEY);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    if (!rows.length) {
      return res.json({ message: "No rows found in sheet", synced: 0 });
    }

    const allHeaders = sheet.headerValues || [];
    const packPriceCol =
      allHeaders.find(h => isPackPriceHeader(h)) ||
      allHeaders.find(h => (h || "").toLowerCase().trim() === "packprice");
    const quantityColumns = allHeaders.filter(h => !headerIsStandard(h) && (h || "").toLowerCase().trim() !== "status");

    let synced = 0;

    for (const row of rows) {
      const name = getRowField(row, "name");
      if (!name) continue;

      const baseData = buildProductFromRow(row, packPriceCol, quantityColumns);
      const existingProduct = await Product.findOne({ name: String(name).trim() });

      if (existingProduct) {
        await Product.findByIdAndUpdate(existingProduct._id, baseData);
      } else {
        await Product.create({ name: String(name).trim(), ...baseData });
      }
      synced++;
    }

    res.json({
      message: "Sheet synced successfully",
      synced,
      recommendedHeaders: RECOMMENDED_HEADERS,
      packPriceColumn: packPriceCol || "packPrice",
      quantityColumns,
      statusHint: "status: true = upcoming (future launch), false = live product",
      formatHint: "packPrice cell: 300g|199,1kg|549,1.5kg|799"
    });
  } catch (err) {
    console.log("Sheet Sync Error:", err);
    res.status(500).json({ error: "Sync failed: " + (err.message || err) });
  }
});

router.get("/headers", async (req, res) => {
  try {
    const doc = new GoogleSpreadsheet(
      process.env.GOOGLE_SHEET_ID || "1n-501X-yl6tK7HWDfzfeoen3Kv7oh4fOmQu84naUsac"
    );
    if (!process.env.GOOGLE_SHEET_API_KEY) {
      return res.status(500).json({ error: "GOOGLE_SHEET_API_KEY missing" });
    }
    await doc.useApiKey(process.env.GOOGLE_SHEET_API_KEY);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    const allHeaders = sheet.headerValues || [];
    const packPriceColumn =
      allHeaders.find(h => isPackPriceHeader(h)) ||
      allHeaders.find(h => (h || "").toLowerCase().trim() === "packprice") ||
      null;
    const quantityColumns = allHeaders.filter(h => !headerIsStandard(h));
    res.json({
      headers: allHeaders,
      recommendedHeaders: RECOMMENDED_HEADERS,
      packPriceColumn,
      quantityColumns,
      hasStatusColumn: allHeaders.some(h => (h || "").toLowerCase().trim() === "status")
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
