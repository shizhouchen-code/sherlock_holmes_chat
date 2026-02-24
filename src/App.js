import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('chatapp_user');
      if (!stored) return null;
      try {
        return JSON.parse(stored);
      } catch {
        return { username: stored, firstName: null };
      }
    } catch {
      return null;
    }
  });

  const handleLogin = (userData) => {
    const u = typeof userData === 'string' ? { username: userData, firstName: null } : userData;
    localStorage.setItem('chatapp_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    setUser(null);
  };

  if (user) {
    const username = typeof user === 'string' ? user : user.username;
    const firstName = typeof user === 'object' && user ? user.firstName : null;
    return <Chat username={username} firstName={firstName} onLogout={handleLogout} />;
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
