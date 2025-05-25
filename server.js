// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const JWT_SECRET = "your_jwt_secret_key_here"; // Replace this with env var in prod

// Connect to MongoDB (replace with your URI)
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
});
const User = mongoose.model("User", userSchema);

// Chat Schema
const chatSchema = new mongoose.Schema({
  sender: String,
  message: String,
  time: String,
});
const Chat = mongoose.model("Chat", chatSchema);

// Register Route
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    res.status(201).send("User registered");
  } catch (err) {
    console.log(err);
    res.status(400).send("Error registering user");
  }
});

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).send("User not found");
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send("Invalid password");
    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );
    res.json({ token, username: user.username });
  } catch {
    res.status(500).send("Login error");
  }
});

// Get all chat messages
app.get("/chats", async (req, res) => {
  try {
    const chats = await Chat.find().sort({ _id: 1 });
    res.json(chats);
  } catch {
    res.status(500).send("Error fetching chats");
  }
});

// Socket.IO with JWT authentication middleware
const io = new Server(server, {
  cors: { origin: "*" },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error("Authentication error"));
    socket.user = user;
    next();
  });
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.user.username);

  socket.on("send_message", async (data) => {
    const chat = new Chat({
      sender: socket.user.username,
      message: data.message,
      time: new Date().toLocaleTimeString(),
    });
    await chat.save();

    io.emit("receive_message", {
      sender: socket.user.username,
      message: data.message,
      time: chat.time,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.user.username);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
