import { useState } from 'react';
import Chat from './components/Chat';
import './App.css';

const GATE_PASSWORD = process.env.REACT_APP_GATE_PASSWORD;
const DRAG_TOKEN = 'unlock-symbol';

function App() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [gateError, setGateError] = useState('');
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);

  const handleUnlockDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', DRAG_TOKEN);
    setGateError('');
  };

  const handleDropIntoField = (event) => {
    event.preventDefault();
    setIsDropTargetActive(false);
    const dragData = event.dataTransfer.getData('text/plain');
    if (dragData !== DRAG_TOKEN) return;

    if (!GATE_PASSWORD) {
      setGateError('Gate password is not configured. Set REACT_APP_GATE_PASSWORD in your .env and restart.');
      return;
    }

    if (password.trim() === GATE_PASSWORD) {
      setIsUnlocked(true);
      setGateError('');
      return;
    }
    setGateError('That key does not fit the lock.');
  };

  const handleLogout = () => {
    setIsUnlocked(false);
    setPassword('');
    setGateError('');
    setIsDropTargetActive(false);
  };

  if (isUnlocked) {
    return <Chat username={name.trim() || 'Guest'} firstName={null} onLogout={handleLogout} />;
  }

  return (
    <div className="App gate-page">
      <div className="gate-panel">
        <header className="gate-header">
          <p className="gate-eyebrow">221B Baker Street</p>
          <h1 className="gate-title">Talk to Sherlock Holmes</h1>
          <p className="gate-tagline">
            AI chatbot based on the original canon
            <br />
            by Sir Arthur Conan Doyle
          </p>
          <p className="gate-subtitle">Sign in and begin!</p>
        </header>

        <div className="gate-divider" aria-hidden="true">
          <span className="gate-divider-line" />
          <span className="gate-divider-glyph">✦</span>
          <span className="gate-divider-line" />
        </div>

        <div className="gate-form">
          <label className="gate-field">
            <span className="gate-field-label">Your name</span>
            <div className="gate-input-row">
              <input
                type="text"
                className="gate-password-input"
                placeholder="Watson, Lestrade, or another visitor…"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </div>
          </label>

          <label className="gate-field">
            <span className="gate-field-label">The key</span>
            <div
              className={`gate-input-row ${isDropTargetActive ? 'drop-active' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDropTargetActive(true);
              }}
              onDragLeave={() => setIsDropTargetActive(false)}
              onDrop={handleDropIntoField}
            >
              <input
                type="password"
                className="gate-password-input"
                placeholder="A word known only to those admitted…"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setGateError('');
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                draggable
                className="gate-unlock-dragger"
                onDragStart={handleUnlockDragStart}
                title="Drag onto the key field"
                aria-label="Drag the brass key onto the key field"
              >
                <span className="gate-key-icon" aria-hidden="true">🗝</span>
              </button>
            </div>
          </label>
        </div>

        {gateError && <p className="gate-error" role="alert">{gateError}</p>}
      </div>
    </div>
  );
}

export default App;
