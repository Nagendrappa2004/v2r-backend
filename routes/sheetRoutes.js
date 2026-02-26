const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const Product = require("../models/product");

const router = express.Router();

/* SYNC FROM GOOGLE SHEET */
router.get("/sync", async (req, res) => {

  try {

    const doc = new GoogleSpreadsheet(
      process.env.GOOGLE_SHEET_ID || "1n-501X-yl6tK7HWDfzfeoen3Kv7oh4fOmQu84naUsac"
    );

    // Require a valid API key so sync is reliable
    if (!process.env.GOOGLE_SHEET_API_KEY) {
      return res.status(500).json({ error: "GOOGLE_SHEET_API_KEY is missing in .env; please add it from Google Cloud and restart the server." });
    }

    await doc.useApiKey(process.env.GOOGLE_SHEET_API_KEY);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    for (let row of rows) {

  const existingProduct = await Product.findOne({
    name: row.name
  });

  const price250 = row["250g"] != null ? Number(row["250g"]) : undefined;
  const price500 = row["500g"] != null ? Number(row["500g"]) : undefined;
  const price1k = row["1kg"] != null ? Number(row["1kg"]) : undefined;
  const priceByWeight = {};
  if (price250 != null) priceByWeight["250g"] = price250;
  if (price500 != null) priceByWeight["500g"] = price500;
  if (price1k != null) priceByWeight["1kg"] = price1k;

  if(existingProduct){

    // UPDATE EXISTING
    const update = {
      price: row.price,
      category: row.category,
      image: row.image,
      description: row.description
    };
    if (Object.keys(priceByWeight).length) update.priceByWeight = priceByWeight;
    await Product.findByIdAndUpdate(existingProduct._id, update);

  }else{

    // CREATE NEW
    await Product.create({
      name: row.name,
      price: row.price,
      category: row.category,
      image: row.image,
      description: row.description,
      priceByWeight: Object.keys(priceByWeight).length ? priceByWeight : undefined
    });

  }

}

    res.json({ message: "Sheet synced successfully" });

  } catch (err) {
    console.log("Sheet Sync Error:", err);
    res.status(500).json({ error: "Sync failed" });
  }

});

module.exports = router;
