const jwt = require("jsonwebtoken");

/* Verify JWT and attach user to req */
function authUser(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Login required" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback-secret");
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

/* Require admin role */
function authAdmin(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Admin login required" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback-secret");
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { authUser, authAdmin };
