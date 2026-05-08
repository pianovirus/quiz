import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Converter from './Converter.jsx'

const IS_DEV = import.meta.env.DEV;

function ConverterUnavailable() {
  return (
    <div style={{
      maxWidth: 600, margin: '60px auto', padding: 24,
      fontFamily: 'sans-serif', textAlign: 'center', lineHeight: 1.7,
    }}>
      <h2 style={{ marginTop: 0 }}>변환기는 로컬 전용입니다</h2>
      <p style={{ color: '#555' }}>
        문제 입력/편집 기능은 dev 서버(<code>npm run dev</code>)에서만 작동합니다.<br/>
        배포 환경에서는 퀴즈 풀이만 가능합니다.
      </p>
      <a href="#/" style={{
        display: 'inline-block', marginTop: 16, padding: '10px 20px',
        background: '#1a1a1a', color: '#fff', textDecoration: 'none', borderRadius: 4,
      }}>
        ← 퀴즈로 돌아가기
      </a>
    </div>
  );
}

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
      {IS_DEV && (
        <div style={{
          position: 'fixed', top: 8, right: 8, zIndex: 9999,
          background: '#222', color: '#fff', padding: '6px 10px',
          borderRadius: 6, fontSize: 12, fontFamily: 'sans-serif'
        }}>
          <a href={isConverter ? '#/' : '#/converter'} style={{ color: '#9cf', textDecoration: 'none' }}>
            {isConverter ? '← 퀴즈로' : '변환기 열기'}
          </a>
        </div>
      )}
      {isConverter ? (IS_DEV ? <Converter /> : <ConverterUnavailable />) : <App />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
