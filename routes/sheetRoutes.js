const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const Product = require("../models/product");
const { parsePackPricesString, isPackPriceHeader } = require("../utils/sheetPricing");

const router = express.Router();

const STANDARD_COLS = new Set([
  "name", "price", "category", "image", "description", "stock"
]);

function headerIsStandard(h) {
  const key = (h || "").toLowerCase().trim();
  return STANDARD_COLS.has(key) || isPackPriceHeader(h);
}

function mergePriceMaps(...maps) {
  return Object.assign({}, ...maps);
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
    const packPriceCol = allHeaders.find(h => isPackPriceHeader(h));
    const quantityColumns = allHeaders.filter(h => !headerIsStandard(h));

    let synced = 0;

    for (const row of rows) {
      if (!row.name) continue;

      let priceByWeight = {};

      if (packPriceCol && row[packPriceCol]) {
        priceByWeight = mergePriceMaps(priceByWeight, parsePackPricesString(row[packPriceCol]));
      }

      for (const col of quantityColumns) {
        const val = row[col];
        if (val != null && val !== "" && String(val).includes("|")) {
          priceByWeight = mergePriceMaps(priceByWeight, parsePackPricesString(val));
        } else if (val != null && val !== "" && !isNaN(Number(val))) {
          priceByWeight[col.trim()] = Number(val);
        }
      }

      const existingProduct = await Product.findOne({ name: row.name });

      const baseData = {
        price: row.price ? Number(row.price) : undefined,
        category: row.category,
        image: row.image,
        description: row.description,
        stock: row.stock ? Number(row.stock) : undefined
      };
      Object.keys(baseData).forEach(k => baseData[k] === undefined && delete baseData[k]);

      if (Object.keys(priceByWeight).length) baseData.priceByWeight = priceByWeight;

      if (existingProduct) {
        await Product.findByIdAndUpdate(existingProduct._id, baseData);
      } else {
        await Product.create({ name: row.name, ...baseData });
      }
      synced++;
    }

    res.json({
      message: "Sheet synced successfully",
      synced,
      packPriceColumn: packPriceCol || null,
      quantityColumns,
      formatHint: "Use column packPrices with cell format: 300g|199,1kg|549,1.5kg|799"
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
    const packPriceColumn = allHeaders.find(h => isPackPriceHeader(h)) || null;
    const quantityColumns = allHeaders.filter(h => !headerIsStandard(h));
    res.json({ headers: allHeaders, packPriceColumn, quantityColumns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
