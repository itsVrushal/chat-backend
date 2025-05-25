const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Message = require("./models/Message");
require("dotenv").config();

const onlineUsers = new Map();

module.exports = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = user.id;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket) => {
    console.log("User connected:", socket.userId);
    onlineUsers.set(socket.userId, socket.id);

    // Set user online in DB
    await User.findByIdAndUpdate(socket.userId, { online: true });

    // Broadcast updated user list
    const users = await User.find({}, "username online");
    io.emit("users", users);

    // Join room for private chats
    socket.join(socket.userId);

    socket.on("send_message", async ({ receiverId, text }) => {
      const message = new Message({
        sender: socket.userId,
        receiver: receiverId || null, // null means public chat
        text,
      });
      await message.save();

      if (receiverId) {
        // DM message: emit to sender and receiver
        io.to(receiverId).to(socket.userId).emit("receive_message", message);
      } else {
        // Public message: emit to all
        io.emit("receive_message", message);
      }
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.userId);
      onlineUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { online: false });

      // Broadcast updated user list
      const users = await User.find({}, "username online");
      io.emit("users", users);
    });
  });
};
