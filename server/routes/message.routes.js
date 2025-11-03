// server/routes/message.routes.js
const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getMessages,
  markAsRead,
  toggleReaction,
  deleteMessage,
} = require("../controllers/messageController");
const Message = require("../models/message");

/**
 * 📨 POST /api/messages
 * Send a new message (global, room, or private)
 */
router.post("/", sendMessage);

/**
 * 💬 GET /api/messages/:roomId
 * Get messages for a room/chat with pagination
 * Query params:
 *   - limit: number of messages to fetch (default 20)
 *   - skip: how many messages to skip (for loading older messages)
 *
 * Example: /api/messages/room123?limit=20&skip=40
 */
router.get("/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

    const messages = await Message.find({ roomId })
      .sort({ createdAt: -1 }) // latest first
      .skip(skip)
      .limit(limit)
      .lean();

    // reverse so that newest are at the bottom (chat-style)
    res.status(200).json(messages.reverse());
  } catch (error) {
    console.error("❌ Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

/**
 * 🔍 GET /api/messages/:roomId/search?query=word
 * Search messages in a specific room by keyword
 */
router.get("/:roomId/search", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({ error: "Search query is required" });
    }

    const results = await Message.find({
      roomId,
      content: { $regex: query, $options: "i" }, // case-insensitive
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json(results.reverse());
  } catch (error) {
    console.error("❌ Error searching messages:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

/**
 * 👀 POST /api/messages/read
 * Mark message(s) as read
 */
router.post("/read", markAsRead);

/**
 * ❤️ POST /api/messages/react
 * Add or remove a reaction on a message
 */
router.post("/react", toggleReaction);

/**
 * 🗑️ DELETE /api/messages/:messageId
 * Delete a specific message
 */
router.delete("/:messageId", deleteMessage);

module.exports = router;
