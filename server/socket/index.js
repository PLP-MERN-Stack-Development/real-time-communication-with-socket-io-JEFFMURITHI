// server/socket/index.js
const Message = require("../models/message");
const User = require("../models/user");

function socketHandler(io) {
  const onlineUsers = new Map(); // socketId -> user object

  io.on("connection", (socket) => {
    console.log("✅ Socket connected:", socket.id);

    // Helper: broadcast online users list
    const broadcastOnlineUsers = () => {
      io.emit(
        "users:online",
        Array.from(onlineUsers.values()).map((u) => ({
          _id: u._id,
          username: u.username,
          isOnline: u.isOnline,
        }))
      );
    };

    // 🔔 Helper: emit real-time notifications
    const sendNotification = (type, message, data = {}) => {
      io.emit("notification", { type, message, data, timestamp: new Date() });
    };

    // ===============================
    // USER JOIN
    // ===============================
    socket.on("user:join", async (userData) => {
      try {
        const { username, userId } = userData || {};
        let user;

        if (userId) user = await User.findById(userId);
        if (!user && username) {
          user =
            (await User.findOne({ username })) ||
            (await User.create({ username, isOnline: true, socketId: socket.id }));
        }

        if (user) {
          user.isOnline = true;
          user.socketId = socket.id;
          await user.save();
          onlineUsers.set(socket.id, user);
          socket.join(`user:${user._id.toString()}`);
        }

        broadcastOnlineUsers();

        // Send last N global messages
        const history = await Message.find({ roomId: "global" })
          .sort({ createdAt: 1 })
          .limit(100);
        socket.emit("messages:history", history);

        // 🔔 Notify all users
        sendNotification("user-join", `${user?.username || "A user"} joined the chat`);
      } catch (err) {
        console.error("user:join error", err);
      }
    });

    // ===============================
    // JOIN / LEAVE ROOM
    // ===============================
    socket.on("room:join", async ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);

      const history = await Message.find({ roomId }).sort({ createdAt: 1 }).limit(100);
      socket.emit("messages:history", history);

      sendNotification("room-join", `A user joined room ${roomId}`, { roomId });
    });

    socket.on("room:leave", ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      sendNotification("room-leave", `A user left room ${roomId}`, { roomId });
    });

    // ===============================
    // SEND MESSAGE (supports attachments)
    // ===============================
    socket.on("message:send", async (payload) => {
      try {
        const msgDoc = await Message.create({
          roomId: payload.roomId || "global",
          senderId: payload.senderId,
          senderName: payload.senderName,
          recipients: payload.recipients || [],
          content: payload.content || "",
          attachments: payload.attachments || [],
        });

        // Emit message to appropriate room(s)
        if (payload.roomId?.startsWith("private:")) {
          io.to(payload.roomId).emit("message:new", msgDoc);
        } else if (payload.recipients?.length) {
          payload.recipients.forEach((recipientId) => {
            io.to(`user:${recipientId}`).emit("message:new", msgDoc);
          });
          socket.emit("message:new", msgDoc);
        } else if (payload.roomId && payload.roomId !== "global") {
          io.to(payload.roomId).emit("message:new", msgDoc);
        } else {
          io.emit("message:new", msgDoc);
        }

        // 🔔 Send notification for new message
        sendNotification("new-message", `${payload.senderName} sent a message`, {
          roomId: payload.roomId || "global",
          senderName: payload.senderName,
        });
      } catch (err) {
        console.error("message:send error", err);
      }
    });

    // ===============================
    // PRIVATE MESSAGE
    // ===============================
    socket.on(
      "private_message",
      async ({ toUserId, content, senderId, senderName, attachments }) => {
        try {
          const roomId = `private:${[senderId, toUserId].sort().join(":")}`;
          const msgDoc = await Message.create({
            roomId,
            senderId,
            senderName,
            recipients: [toUserId],
            content,
            attachments: attachments || [],
          });

          socket.join(roomId);
          io.to(`user:${toUserId}`).socketsJoin(roomId);
          io.to(roomId).emit("message:new", msgDoc);

          // 🔔 Notify recipient
          sendNotification("private-message", `New message from ${senderName}`, {
            from: senderName,
            toUserId,
          });
        } catch (err) {
          console.error("private_message error", err);
        }
      }
    );

    // ===============================
    // READ RECEIPT
    // ===============================
    socket.on("message:read", async ({ messageId, userId }) => {
      try {
        if (!messageId || !userId) return;

        const msg = await Message.findById(messageId);
        if (!msg) return;

        if (!msg.readBy.map(String).includes(String(userId))) {
          msg.readBy.push(userId);
          await msg.save();
        }

        const room = msg.roomId || "global";
        io.to(room).emit("message:read", { messageId, userId });
      } catch (err) {
        console.error("message:read error", err);
      }
    });

    // ===============================
    // MESSAGE REACTIONS
    // ===============================
    socket.on("message:react", async ({ messageId, emoji, userId }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;

        let reaction = msg.reactions.find((r) => r.emoji === emoji);
        if (!reaction) {
          reaction = { emoji, users: [userId] };
          msg.reactions.push(reaction);
        } else {
          const idx = reaction.users.findIndex((u) => String(u) === String(userId));
          if (idx === -1) reaction.users.push(userId);
          else reaction.users.splice(idx, 1);
        }

        await msg.save();
        io.emit("message:reaction", { messageId, reactions: msg.reactions });
      } catch (err) {
        console.error("message:react error", err);
      }
    });

    // ===============================
    // TYPING INDICATORS
    // ===============================
    socket.on("typing:start", ({ roomId, user }) => {
      socket.to(roomId || "global").emit("typing:start", { user });
    });
    socket.on("typing:stop", ({ roomId, user }) => {
      socket.to(roomId || "global").emit("typing:stop", { user });
    });

    // ===============================
    // DELIVERY ACK
    // ===============================
    socket.on("message:delivered", async ({ messageId, userId }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;

        msg.meta = msg.meta || {};
        msg.meta.deliveredBy = msg.meta.deliveredBy || [];
        if (!msg.meta.deliveredBy.map(String).includes(String(userId))) {
          msg.meta.deliveredBy.push(userId);
          await msg.save();
        }

        io.emit("message:delivered", { messageId, userId });
      } catch (err) {
        console.error("message:delivered error", err);
      }
    });

    // ===============================
    // DISCONNECT
    // ===============================
    socket.on("disconnect", async () => {
      const user = onlineUsers.get(socket.id);
      onlineUsers.delete(socket.id);

      if (user) {
        user.isOnline = false;
        user.socketId = null;
        await user.save().catch(() => {});
      }

      broadcastOnlineUsers();
      sendNotification("user-leave", `${user?.username || "A user"} left the chat`);
      console.log("❌ Socket disconnected", socket.id);
    });
  });
}

module.exports = socketHandler;
