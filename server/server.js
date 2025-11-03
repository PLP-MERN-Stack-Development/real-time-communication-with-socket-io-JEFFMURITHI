// server/server.js - Optimized Socket.io Chat Server (CommonJS)

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config();

// Import routes & socket handler
const authRoutes = require("./routes/auth.routes");
const messageRoutes = require("./routes/message.routes");
const uploadRoutes = require("./routes/upload.routes");
const socketHandler = require("./socket");
const Message = require("./models/message"); // add near other requires

// ----------------------
// Initialize Express + HTTP server
// ----------------------
const app = express();
const server = http.createServer(app);

// ----------------------
// Initialize Socket.io
// ----------------------
const io = new Server(server, {
  cors: {
    origin: [process.env.CLIENT_URL || "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  pingInterval: 25000,
  pingTimeout: 60000,
});

// ----------------------
// Middleware
// ----------------------
app.use(
  cors({
    origin: [process.env.CLIENT_URL || "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug request logs
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.url}`);
  next();
});

// ----------------------
// Static file handling
// ----------------------
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(path.join(__dirname, "public"))) fs.mkdirSync(path.join(__dirname, "public"));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/api/uploads", express.static(UPLOAD_DIR));

// ----------------------
// MongoDB Connection
// ----------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

// ----------------------
// API Routes
// ----------------------
app.use("/api/upload", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// ----------------------
// Socket.io Namespaces and Logic
// ----------------------
const chatNamespace = io.of("/chat");
socketHandler(chatNamespace);

chatNamespace.on("connection", (socket) => {
  console.log(`⚡ User connected: ${socket.id}`);

  // New: handle client 'send_message' with acknowledgement (client uses socket.timeout(...).emit)
  socket.on("send_message", async (payload, callback) => {
    try {
      // Normalize payload shape and save to DB
      const msgDoc = await Message.create({
        roomId: payload.roomId || "global",
        senderId: payload.senderId,
        senderName: payload.senderName,
        recipients: payload.recipients || [],
        content: payload.content || "",
        attachments: payload.attachments || [],
      });

      // Emit to rooms / users (mirror the logic in socket handler)
      if (payload.roomId?.startsWith("private:")) {
        chatNamespace.to(payload.roomId).emit("message:new", msgDoc);
        chatNamespace.to(payload.roomId).emit("receive_message", msgDoc); // backward compatible
      } else if (payload.recipients?.length) {
        payload.recipients.forEach((recipientId) => {
          chatNamespace.to(`user:${recipientId}`).emit("message:new", msgDoc);
        });
        socket.emit("message:new", msgDoc);
        socket.emit("receive_message", msgDoc);
      } else if (payload.roomId && payload.roomId !== "global") {
        chatNamespace.to(payload.roomId).emit("message:new", msgDoc);
        chatNamespace.to(payload.roomId).emit("receive_message", msgDoc);
      } else {
        chatNamespace.emit("message:new", msgDoc);
        chatNamespace.emit("receive_message", msgDoc);
      }

      // Optionally send a notification
      chatNamespace.emit("notification", {
        type: "new-message",
        message: `${payload.senderName} sent a message`,
        data: { roomId: payload.roomId || "global", senderName: payload.senderName },
        timestamp: new Date(),
      });

      // Acknowledge to the client
      if (typeof callback === "function") {
        callback(null, { status: "delivered", message: msgDoc });
      }
    } catch (err) {
      console.error("send_message error", err);
      if (typeof callback === "function") {
        callback(err);
      }
    }
  });

  socket.on("message:delivered", (messageId) => {
    socket.broadcast.emit("message:delivered:update", messageId);
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ User disconnected: ${socket.id} (${reason})`);
  });
});

// ----------------------
// Root Test Route
// ----------------------
app.get("/", (req, res) => {
  res.status(200).send("✅ Optimized Socket.io Chat Server is running with MongoDB Atlas");
});

// ----------------------
// Error Handlers
// ----------------------
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, req, res, next) => {
  console.error("❌ Server error:", err.stack);
  res.status(500).json({ message: "Internal server error", error: err.message });
});

// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on: http://localhost:${PORT}`);
});

module.exports = { app, server, io };
