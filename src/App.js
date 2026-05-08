import { useState } from 'react';
import Chat from './components/Chat';
import './App.css';

const GATE_PASSWORD = process.env.REACT_APP_GATE_PASSWORD;
const DRAG_TOKEN = 'unlock-symbol';

function App() {
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
    setGateError('Invalid access password.');
  };

  const handleLogout = () => {
    setIsUnlocked(false);
    setPassword('');
    setGateError('');
    setIsDropTargetActive(false);
  };

  if (isUnlocked) {
    return <Chat username="Guest" firstName={null} onLogout={handleLogout} />;
  }

  return (
    <div className="App gate-page">
      <div className="gate-panel">
        <h1 className="gate-title">Unlock App</h1>
        <p className="gate-subtitle">Restricted access.</p>

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
            placeholder="Enter password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setGateError('');
            }}
          />
          <button
            type="button"
            draggable
            className="gate-unlock-dragger"
            onDragStart={handleUnlockDragStart}
            title="Drag this into the password field"
            aria-label="Drag unlock icon into the password field"
          >
            🔓
          </button>
        </div>

        {gateError && <p className="gate-error">{gateError}</p>}
      </div>
    </div>
  );
}

export default App;
