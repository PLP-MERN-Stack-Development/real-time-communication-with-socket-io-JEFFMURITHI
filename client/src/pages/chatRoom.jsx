import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../socket/socket"; // ✅ Socket context hook
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const messageSound = new Audio("/sounds/message.mp3");

export default function ChatRoom({ user, onLogout }) {
  const {
    socket,
    isConnected,
    messages: socketMessages,
    sendMessage,
    setTyping,
  } = useSocket();

  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [text, setText] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState([]);

  const messagesEndRef = useRef();
  const typingTimeoutRef = useRef(null);

  // ✅ Helper for unique keys
  const uniqueMessages = (list) => {
    const seen = new Set();
    return list.filter((m) => {
      const id = m._id || m.tempId;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  // Helper: return API base (always points to <server>/api)
  const getApiBase = () => {
    const rawApi = (import.meta.env.VITE_API_URL || "").trim();
    const rawServer = (import.meta.env.VITE_SERVER_URL || "").trim();

    if (rawApi) {
      // if user set VITE_API_URL (may include /api), ensure no trailing slash
      return rawApi.replace(/\/+$/, "");
    }
    // build from VITE_SERVER_URL or fallback, ensure ends with /api
    const server = rawServer ? rawServer.replace(/\/+$/, "") : "http://localhost:5000";
    return server + "/api";
  };

  // Helper: server root (no /api) used for constructing absolute file URLs
  const getServerRoot = () => {
    const api = getApiBase();
    // strip trailing /api if present
    return api.replace(/\/api\/?$/, "");
  };

  // ----------------------
  // ✅ Load messages (with pagination)
  // ----------------------
  const fetchMessages = async (pageNumber = 1, roomId = "global") => {
    try {
      const res = await axios.get(`${getApiBase()}/messages/${roomId}?page=${pageNumber}`);
      const newMessages = res.data.messages || res.data || [];
      if (newMessages.length === 0) setHasMore(false);
      if (pageNumber === 1) setMessages(newMessages);
      else setMessages((prev) => [...newMessages, ...prev]);
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  };

  useEffect(() => {
    fetchMessages(1);
  }, []);

  // ✅ Merge socket messages safely (no duplicates)
  useEffect(() => {
    if (socketMessages.length) {
      setMessages((prev) => uniqueMessages([...prev, ...socketMessages]));
    }
  }, [socketMessages]);

  // ✅ Scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ✅ Typing debounce
  useEffect(() => {
    if (!socket) return;
    if (text) {
      setTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTyping(false), 1500);
    } else {
      setTyping(false);
    }
    return () => clearTimeout(typingTimeoutRef.current);
  }, [text]);

  // ✅ Message send handler
  const handleSend = (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    const roomId = selectedUser
      ? `private:${[user._id, selectedUser._id].sort().join(":")}`
      : "global";

    const tempMessage = {
      tempId: `temp-${Date.now()}`,
      senderId: user._id,
      senderName: user.username,
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => uniqueMessages([...prev, tempMessage]));

    sendMessage(
      {
        roomId,
        senderId: user._id,
        senderName: user.username,
        content,
      },
      (ack) => {
        if (ack?.status === "delivered") {
          setMessages((prev) =>
            uniqueMessages([
              ...prev.filter((m) => m.tempId !== tempMessage.tempId),
              ack.message,
            ])
          );
        }
      }
    );

    setText("");
  };

  // ✅ File upload handler
  const handleFileUpload = async (e) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);

      // POST to normalized API upload endpoint
      const res = await axios.post(`${getApiBase()}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const fileData = res.data.file || res.data.fileUrl || res.data;
      // Normalize url to absolute so client can fetch it directly
      let fileUrl = fileData.url || fileData.fileUrl || fileData;
      if (typeof fileUrl === "string" && fileUrl.startsWith("/")) {
        fileUrl = `${getServerRoot()}${fileUrl}`;
      }

      const attachment = {
        url: fileUrl,
        filename: fileData.filename || file.name,
        contentType: fileData.mimetype || fileData.contentType || file.type,
      };

      const roomId = selectedUser
        ? `private:${[user._id, selectedUser._id].sort().join(":")}`
        : "global";

      sendMessage({
        roomId,
        senderId: user._id,
        senderName: user.username,
        attachments: [attachment],
      });
    } catch (err) {
      console.error("Upload failed", err);
      setNotifications((n) => [...n, { id: Date.now(), text: "Upload failed" }]);
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  // ✅ Filtered messages
  const filteredMessages = messages.filter((m) =>
    m.content?.toLowerCase().includes(search.toLowerCase())
  );

  // ✅ Load older messages
  const loadOlderMessages = () => {
    if (hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchMessages(nextPage);
    }
  };

  return (
    <div className="max-w-6xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Main Chat Section */}
      <Card className="col-span-3 flex flex-col h-[80vh]">
        <CardHeader className="flex justify-between items-center border-b pb-3">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            {selectedUser
              ? `Chat with ${selectedUser.username}`
              : "Global Chat Room 🌍"}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onLogout}>
            Logout
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col flex-1 overflow-hidden">
          <div className="text-xs text-gray-500 mb-2">
            {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
          </div>

          <Input
            placeholder="Search messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3"
          />

          <div
            className="flex-1 overflow-y-auto space-y-3 p-2"
            onScroll={(e) => {
              if (e.target.scrollTop === 0 && hasMore) loadOlderMessages();
            }}
          >
            <AnimatePresence>
              {filteredMessages.map((m) => (
                <motion.div
                  key={m._id || m.tempId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`p-3 rounded-lg ${
                    m.senderName === user.username
                      ? "bg-blue-600 text-white self-end ml-auto w-fit"
                      : "bg-gray-100 text-gray-800 w-fit"
                  }`}
                >
                  <div className="text-xs opacity-70 mb-1">
                    {m.senderName} ·{" "}
                    {m.createdAt
                      ? new Date(m.createdAt).toLocaleTimeString()
                      : ""}
                  </div>

                  {m.content && <div className="text-sm">{m.content}</div>}

                  {/* Attachments */}
                  {Array.isArray(m.attachments) &&
                    m.attachments
                      .filter((att) => att && (att.url || att.fileUrl))
                      .map((att) => {
                        const rawUrl = att.url || att.fileUrl;
                        const src =
                          typeof rawUrl === "string" && rawUrl.startsWith("http")
                            ? rawUrl
                            : `${getServerRoot()}${rawUrl || ""}`;
                        return (
                          <div key={src} className="mt-2">
                            {(att.contentType || "").startsWith("image") ? (
                              <img
                                src={src}
                                alt={att.filename || "Image"}
                                className="max-w-xs rounded"
                              />
                            ) : (
                              <a
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 underline"
                              >
                                {att.filename || "Download file"}
                              </a>
                            )}
                          </div>
                        );
                      })}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="flex gap-2 mt-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
            />
            <input
              type="file"
              className="hidden"
              id="fileUpload"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <label
              htmlFor="fileUpload"
              className="px-3 py-1 bg-gray-200 rounded cursor-pointer hover:bg-gray-300"
            >
              {uploading ? "..." : "📎"}
            </label>
            <Button type="submit">Send</Button>
          </form>
        </CardContent>
      </Card>

      {/* Online Users */}
      <Card className="col-span-1 h-[80vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Online Users</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {onlineUsers.map((u) => (
              <li
                key={u._id}
                onClick={() => setSelectedUser(u)}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">
                  {u.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium">{u.username}</div>
                  <div
                    className={`text-xs ${
                      u.isOnline ? "text-green-500" : "text-gray-400"
                    }`}
                  >
                    {u.isOnline ? "online" : "offline"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Notifications */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm"
            >
              {n.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
