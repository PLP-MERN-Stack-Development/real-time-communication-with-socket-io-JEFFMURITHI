import React, { useState } from 'react';
import Login from './pages/Login';
import ChatRoom from './pages/ChatRoom';
import SocketProvider from './socket/SocketProvider';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('chat_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {!user ? (
        <Login onLogin={(u) => { setUser(u); localStorage.setItem('chat_user', JSON.stringify(u)); }} />
      ) : (
        <SocketProvider user={user}>
          <ChatRoom user={user} onLogout={() => { localStorage.removeItem('chat_user'); setUser(null); }} />
        </SocketProvider>
      )}
    </div>
  );
}
