import React, { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  // Helper: return API base (ensures single /api segment)
  const getApiBase = () => {
    const rawApi = (import.meta.env.VITE_API_URL || "").trim();
    const rawServer = (import.meta.env.VITE_SERVER_URL || "").trim();

    if (rawApi) {
      return rawApi.replace(/\/+$/, ""); // already points to API root if provided
    }

    const server = rawServer ? rawServer.replace(/\/+$/, "") : "http://localhost:5000";
    return server + "/api";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    const apiBase = getApiBase();
    const loginUrl = `${apiBase}/auth/login`;
    const registerUrl = `${apiBase}/auth/register`;

    try {
      setLoading(true);
      console.debug("🔹 Attempting login:", loginUrl);

      // Try logging in
      const loginRes = await axios.post(loginUrl, { username });
      console.log("✅ Login successful:", loginRes.data);
      onLogin(loginRes.data.user || loginRes.data);
    } catch (err) {
      console.warn("⚠️ Login error:", err.response?.data || err.message);

      // If user not found (404) → register then retry login
      if (err.response && err.response.status === 404) {
        try {
          console.log("🆕 Registering new user...", registerUrl);
          const registerRes = await axios.post(registerUrl, { username });
          console.log("✅ Registered successfully:", registerRes.data);

          // After registration, login again
          const loginRes = await axios.post(loginUrl, { username });
          console.log("✅ Login after register:", loginRes.data);
          onLogin(loginRes.data.user || loginRes.data);
        } catch (regErr) {
          console.error("❌ Registration failed:", regErr.response?.data || regErr.message);
          alert("Registration failed. Please try again.");
        }
      } else {
        // Generic error message
        if (err.response) {
          alert(`Login failed: ${err.response.status} ${err.response.statusText}`);
        } else if (err.request) {
          alert("No response from server. Check backend connection and API base URL.");
        } else {
          alert("Error: " + err.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-white to-blue-50"
    >
      <Card className="w-full max-w-md shadow-lg rounded-2xl border border-gray-200">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-semibold text-gray-800">
            Welcome to ChatSphere 💬
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <Input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Joining..." : "Join Chat"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
