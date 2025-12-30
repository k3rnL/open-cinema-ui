import { useState } from 'react'

export default function HomePage() {
  const [volume, setVolume] = useState(50)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>Open Cinema</h1>

      <div style={{
        display: 'grid',
        gap: '1rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        width: '100%',
        maxWidth: '800px'
      }}>
        <button style={buttonStyle}>HDMI 1</button>
        <button style={buttonStyle}>HDMI 2</button>
        <button style={buttonStyle}>HDMI 3</button>
        <button style={buttonStyle}>Optical</button>
      </div>

      <div style={{ marginTop: '3rem', width: '100%', maxWidth: '600px' }}>
        <label style={{ fontSize: '1.5rem', display: 'block', marginBottom: '1rem' }}>
          Volume: {volume}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{ width: '100%', height: '40px', cursor: 'pointer' }}
        />
      </div>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '2rem',
  fontSize: '1.5rem',
  backgroundColor: '#1a1a1a',
  color: 'white',
  border: '2px solid #333',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s',
}
