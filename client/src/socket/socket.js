// socket/socket.js - Optimized ES Module version for Vite/React
import { io } from "socket.io-client";
import { useState, useEffect } from "react";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;

/**
 * ✅ Initialize socket connection (singleton)
 */
export function initSocket() {
  if (!socket) {
    // connect to the chat namespace explicitly to match server: io.of('/chat')
    const ns = SOCKET_URL.replace(/\/+$/, "") + "/chat";
    socket = io(ns, {
      transports: ["websocket", "polling"], // Add polling as fallback
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000, // 20s
      autoConnect: true,
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
      // Try to reconnect with polling if websocket fails
      if (socket.io.opts.transports[0] === "websocket") {
        socket.io.opts.transports = ["polling", "websocket"];
      }
    });
  }
  return socket;
}

/**
 * ✅ React hook to manage all socket events
 */
export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    const s = initSocket();

    const onConnect = () => {
      console.log("🟢 Connected to Socket.io server");
      setIsConnected(true);
      s.emit("request_user_list");
    };

    const onDisconnect = () => {
      console.warn("🔴 Disconnected from server");
      setIsConnected(false);
    };

    const onMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onUserList = (list) => {
      setUsers(list);
    };

    const onTypingUsers = (list) => {
      setTypingUsers(list);
    };

    // Listen for delivery acknowledgments
    const onDeliveryAck = (ack) => {
      if (ack?.status === "delivered") {
        setMessages((prev) => {
          // Prevent duplicates
          const exists = prev.some((m) => m._id === ack.message._id);
          if (!exists) return [...prev, ack.message];
          return prev;
        });
      }
    };

    // Register events
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("receive_message", onMessage);
    s.on("user_list", onUserList);
    s.on("typing_users", onTypingUsers);
    s.on("message_ack", onDeliveryAck);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("receive_message", onMessage);
      s.off("user_list", onUserList);
      s.off("typing_users", onTypingUsers);
      s.off("message_ack", onDeliveryAck);
    };
  }, []);

  /**
   * ✅ Send a message (supports acknowledgments and rooms)
   */
  const sendMessage = (message, callback) => {
    if (!socket) {
      if (callback) callback({ status: "failed", error: "Socket not initialized" });
      return;
    }

    // Increase timeout to 10s and add retry logic
    const attemptSend = (retries = 2) => {
      socket.timeout(10000).emit("send_message", message, (err, ack) => {
        if (err) {
          console.error("Message delivery attempt failed:", err);
          if (retries > 0) {
            console.log(`Retrying message delivery... (${retries} attempts left)`);
            attemptSend(retries - 1);
          } else {
            console.error("Message delivery failed after all retries");
            if (callback) callback({ status: "failed", error: err });
          }
        } else {
          if (callback) callback(ack);
        }
      });
    };

    attemptSend();
  };

  /**
   * ✅ Send a private message to a specific user
   */
  const sendPrivateMessage = (to, message) => {
    if (!socket) return;
    socket.emit("private_message", { to, message });
  };

  /**
   * ✅ Indicate typing status
   */
  const setTyping = (isTyping) => {
    if (!socket) return;
    socket.emit("typing", isTyping);
  };

  return {
    socket,
    isConnected,
    messages,
    users,
    typingUsers,
    sendMessage,
    sendPrivateMessage,
    setTyping,
  };
}
