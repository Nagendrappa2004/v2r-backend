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

  const existingProduct = await Product.findOne({ name: row.name });

  const price300 = row["300g"] != null ? Number(row["300g"]) : undefined;
  const price1k = row["1kg"] != null ? Number(row["1kg"]) : undefined;
  const priceByWeight = {};
  if (price300 != null) priceByWeight["300g"] = price300;
  if (price1k != null) priceByWeight["1kg"] = price1k;

  // Upcoming flag (sheet-driven)
  // Supported columns: `upcoming` OR `status`
  const upcomingRaw = row["upcoming"] != null ? row["upcoming"] : (row["status"] != null ? row["status"] : row["Status"]);
  const upcomingStr = upcomingRaw != null ? String(upcomingRaw).trim().toLowerCase() : "";
  // If status includes "upcoming" => upcoming, else false
  let isUpcoming = false;
  if (upcomingStr) {
    if (upcomingStr === "true" || upcomingStr === "1" || upcomingStr === "yes" || upcomingStr === "upcoming") isUpcoming = true;
    if (upcomingStr.includes("upcoming")) isUpcoming = true;
    if (upcomingStr === "false" || upcomingStr === "0" || upcomingStr === "no" || upcomingStr === "live") isUpcoming = false;
  }

  if(existingProduct){

    // UPDATE EXISTING
    const update = {
      price: row.price,
      category: row.category,
      image: row.image,
      description: row.description
    };
    update.upcoming = isUpcoming;
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
      upcoming: isUpcoming,
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
