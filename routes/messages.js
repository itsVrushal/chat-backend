const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Middleware to verify token
const authMiddleware = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Get chat messages (optionally with a user for DMs)
router.get("/:userId?", authMiddleware, async (req, res) => {
  const me = req.userId;
  const otherUser = req.params.userId;

  try {
    let messages;
    if (otherUser) {
      // DM messages between me and otherUser
      messages = await Message.find({
        $or: [
          { sender: me, receiver: otherUser },
          { sender: otherUser, receiver: me },
        ],
      }).sort("createdAt");
    } else {
      // Public chat (receiver=null)
      messages = await Message.find({ receiver: null }).sort("createdAt");
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
