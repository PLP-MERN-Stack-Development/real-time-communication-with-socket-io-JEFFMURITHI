// server/controllers/messageController.js
const Message = require("../models/message");
const User = require("../models/user");

/**
 * 📩 Send a new message
 * Handles both global and private chats
 */
exports.sendMessage = async (req, res) => {
  try {
    const { roomId, senderId, senderName, content, recipients, attachments } = req.body;

    if (!senderId || !senderName || (!content && !attachments?.length)) {
      return res.status(400).json({ message: "Missing required message fields." });
    }

    const message = await Message.create({
      roomId: roomId || "global",
      senderId,
      senderName,
      recipients: recipients || [],
      content,
      attachments,
    });

    return res.status(201).json({ message });
  } catch (error) {
    console.error("❌ sendMessage error:", error);
    res.status(500).json({ message: "Server error while sending message." });
  }
};

/**
 * 💬 Fetch messages (for a room or private chat)
 */
exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    const messages = await Message.find({ roomId })
      .sort({ createdAt: 1 })
      .populate("senderId", "username")
      .populate("recipients", "username");

    res.status(200).json({ messages });
  } catch (error) {
    console.error("❌ getMessages error:", error);
    res.status(500).json({ message: "Server error while fetching messages." });
  }
};

/**
 * 👀 Mark messages as read (read receipts)
 */
exports.markAsRead = async (req, res) => {
  try {
    const { messageId, userId } = req.body;

    await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { readBy: userId } },
      { new: true }
    );

    res.status(200).json({ message: "Message marked as read." });
  } catch (error) {
    console.error("❌ markAsRead error:", error);
    res.status(500).json({ message: "Server error while marking as read." });
  }
};

/**
 * ❤️ Add or remove reaction from a message
 */
exports.toggleReaction = async (req, res) => {
  try {
    const { messageId, userId, emoji } = req.body;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found." });

    let reaction = message.reactions.find((r) => r.emoji === emoji);

    if (reaction) {
      // If user already reacted, remove their reaction
      if (reaction.users.includes(userId)) {
        reaction.users.pull(userId);
      } else {
        reaction.users.push(userId);
      }
    } else {
      // Add new emoji reaction
      message.reactions.push({ emoji, users: [userId] });
    }

    await message.save();

    res.status(200).json({ message: "Reaction updated.", reactions: message.reactions });
  } catch (error) {
    console.error("❌ toggleReaction error:", error);
    res.status(500).json({ message: "Server error while updating reaction." });
  }
};

/**
 * 🧹 Optional: Delete message
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    await Message.findByIdAndDelete(messageId);

    res.status(200).json({ message: "Message deleted successfully." });
  } catch (error) {
    console.error("❌ deleteMessage error:", error);
    res.status(500).json({ message: "Server error while deleting message." });
  }
};
