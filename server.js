require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Message = require("./models/Message");
const parseJsonBody = require("./utils/parseJson");

const PORT = process.env.PORT || 3001;

// Middleware-like function to check JWT token from Authorization header
async function verifyToken(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) throw new Error("No token");

  const token = authHeader.split(" ")[1];
  if (!token) throw new Error("No token");

  return jwt.verify(token, process.env.JWT_SECRET);
}

// Basic CORS headers
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    // ROUTE: POST /api/auth/register
    if (req.url === "/api/auth/register" && req.method === "POST") {
      const { username, email, password } = await parseJsonBody(req);

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "User already exists" }));
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ username, email, password: hashedPassword });
      await user.save();

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ token, username: user.username, userId: user._id })
      );
    }

    // ROUTE: POST /api/auth/login
    if (req.url === "/api/auth/login" && req.method === "POST") {
      const { email, password } = await parseJsonBody(req);

      const user = await User.findOne({ email });
      if (!user) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Invalid credentials" }));
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Invalid credentials" }));
      }

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ token, username: user.username, userId: user._id })
      );
    }

    // ROUTE: GET /api/users (requires auth)
    if (req.url === "/api/users" && req.method === "GET") {
      const decoded = await verifyToken(req);
      const users = await User.find(
        { _id: { $ne: decoded.id } },
        "username online"
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(users));
    }

    // ROUTE: GET /api/messages or /api/messages/:userId (requires auth)
    if (req.url.startsWith("/api/messages") && req.method === "GET") {
      const decoded = await verifyToken(req);

      // Parse URL param userId if exists
      const urlParts = req.url.split("/");
      const otherUserId = urlParts.length === 4 ? urlParts[3] : null;

      let messages;
      if (otherUserId) {
        messages = await Message.find({
          $or: [
            { sender: decoded.id, receiver: otherUserId },
            { sender: otherUserId, receiver: decoded.id },
          ],
        }).sort("createdAt");
      } else {
        messages = await Message.find({ receiver: null }).sort("createdAt");
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(messages));
    }

    // Unknown route
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Route not found" }));
  } catch (err) {
    // Handle errors
    console.error(err);
    res.writeHead(
      err.message === "No token" || err.message === "invalid token" ? 401 : 500,
      {
        "Content-Type": "application/json",
      }
    );
    res.end(JSON.stringify({ message: err.message || "Server error" }));
  }
});

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
