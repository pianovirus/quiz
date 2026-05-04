import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Converter from './Converter.jsx'

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const isConverter = hash.startsWith('#/converter') || hash.startsWith('#converter');

  return (
    <>
      <div style={{
        position: 'fixed', top: 8, right: 8, zIndex: 9999,
        background: '#222', color: '#fff', padding: '6px 10px',
        borderRadius: 6, fontSize: 12, fontFamily: 'sans-serif'
      }}>
        <a href={isConverter ? '#/' : '#/converter'} style={{ color: '#9cf', textDecoration: 'none' }}>
          {isConverter ? '← 퀴즈로' : '변환기 열기'}
        </a>
      </div>
      {isConverter ? <Converter /> : <App />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
