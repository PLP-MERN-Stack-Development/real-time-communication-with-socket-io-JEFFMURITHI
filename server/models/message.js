const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false }
);

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    filename: { type: String },
    contentType: { type: String },
    size: { type: Number },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    roomId: { type: String, default: "global", index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    content: { type: String, default: "", trim: true },
    attachments: [attachmentSchema],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reactions: [reactionSchema],
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        deliveredBy: [],
        editedAt: null,
      },
    },
  },
  { timestamps: true }
);

messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });

module.exports = mongoose.model("Message", messageSchema);
