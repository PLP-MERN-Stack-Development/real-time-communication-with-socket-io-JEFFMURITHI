// controllers/chatController.js
const Chat = require("../models/chat.model");
const User = require("../models/user.model");

exports.accessChat = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    console.log("❌ userId param not sent with request");
    return res.status(400).json({ message: "User ID required" });
  }

  try {
    let chat = await Chat.findOne({
      isGroupChat: false,
      $and: [
        { users: { $elemMatch: { $eq: req.user._id } } },
        { users: { $elemMatch: { $eq: userId } } },
      ],
    })
      .populate("users", "-password")
      .populate("latestMessage");

    if (chat) {
      return res.status(200).json(chat);
    } else {
      // Create new chat if none exists
      const newChat = await Chat.create({
        chatName: "sender",
        isGroupChat: false,
        users: [req.user._id, userId],
      });

      const fullChat = await Chat.findById(newChat._id).populate("users", "-password");
      res.status(200).json(fullChat);
    }
  } catch (error) {
    console.error("❌ Error accessing chat:", error);
    res.status(500).json({ message: "Server error accessing chat" });
  }
};
