const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const { authUser } = require("../middleware/auth");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/reviews"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + (file.originalname || "review.jpg"));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/i;
    const ext = path.extname(file.originalname || "").slice(1) || file.mimetype?.split("/")[1];
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error("Only images allowed"));
  }
});

router.post("/review-image", authUser, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").toString().split(",")[0].trim();
  const host = req.get("host");
  const url = `${proto}://${host}/uploads/reviews/${req.file.filename}`;
  res.json({ url });
});

module.exports = router;
