import React, { useState, useEffect, useRef, useCallback } from 'react';

const SUBJECTS = ['감리 및 사업관리', '소프트웨어 공학', '데이터베이스', '시스템 구조', '보안'];

function escapeJsString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function toJsModule(year, questions) {
  const sorted = [...questions].sort((a, b) => a.id - b.id);
  const body = sorted.map(q => {
    const expl = q.explanation
      ? `,\n    explanation: '${escapeJsString(q.explanation)}'`
      : '';
    const explImg = q.explanationImage
      ? `,\n    explanationImage: "${q.explanationImage}"`
      : '';
    return `  {
    id: ${q.id},
    subject: "${q.subject}",
    image: "${q.image}",
    answer: ${q.answer ?? 'null'}${expl}${explImg}
  }`;
  }).join(',\n');
  return `// ${year}년 기출문제\nexport default [\n${body}\n];\n`;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

const LAST_YEAR_KEY = 'converter_last_year';

export default function Converter() {
  const [year, setYear] = useState(() => {
    return localStorage.getItem(LAST_YEAR_KEY) || new Date().getFullYear() + '';
  });
  const [questions, setQuestions] = useState([]); // { id, subject, image, answer, explanation }
  const [savedFiles, setSavedFiles] = useState([]);

  // 입력 폼 상태
  const [editingId, setEditingId] = useState(1);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [answer, setAnswer] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [imagePreview, setImagePreview] = useState(''); // data URL or saved URL
  const [imageDirty, setImageDirty] = useState(false);  // true: 새로 받은 dataURL → 저장 필요
  const [explImagePreview, setExplImagePreview] = useState('');
  const [explImageDirty, setExplImageDirty] = useState(false);
  const [status, setStatus] = useState('');

  const formRef = useRef(null);
  const didAutoLoadRef = useRef(false);
  const explAreaRef = useRef(null);
  const explTextRef = useRef(null);

  // 과목 필터 (목록 영역)
  const [subjectFilter, setSubjectFilter] = useState('전체');

  // 연도 변경 시 localStorage에 저장
  useEffect(() => {
    if (year) localStorage.setItem(LAST_YEAR_KEY, year);
  }, [year]);

  // 저장된 연도 목록
  const refreshFiles = useCallback(async () => {
    try {
      const res = await fetch('/__list-data');
      const data = await res.json();
      setSavedFiles(data.files || []);
      return data.files || [];
    } catch { return []; }
  }, []);

  // 첫 마운트 시: 파일 목록 가져오고, 작업 중이던 연도(또는 가장 최근 연도) 자동 로드
  useEffect(() => {
    if (didAutoLoadRef.current) return;
    didAutoLoadRef.current = true;
    (async () => {
      const files = await refreshFiles();
      if (files.length === 0) return;
      const preferredFile = `${year}.js`;
      const targetFile = files.includes(preferredFile)
        ? preferredFile
        : files[files.length - 1]; // 정렬된 목록에서 가장 최근(큰) 연도
      await loadYear(targetFile, /*silent*/ true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 클립보드 붙여넣기 (전역) - 포커스 위치에 따라 문제/해설 이미지로 라우팅
  useEffect(() => {
    const onPaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type?.startsWith('image/')) {
          const file = it.getAsFile();
          if (!file) continue;
          const dataUrl = await fileToDataUrl(file);
          // 포커스가 해설 영역(이미지 박스 또는 textarea) 안이면 해설 이미지로
          const active = document.activeElement;
          const intoExpl = explAreaRef.current?.contains(active) || explTextRef.current === active;
          if (intoExpl) {
            setExplImagePreview(dataUrl);
            setExplImageDirty(true);
            setStatus('해설 이미지 붙여넣음.');
          } else {
            setImagePreview(dataUrl);
            setImageDirty(true);
            setStatus('문제 이미지 붙여넣음. 정답·과목 선택 후 저장하세요.');
          }
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // 파일 선택 (kind: 'question' | 'explanation')
  const handleFile = async (file, kind = 'question') => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('이미지 파일만 가능합니다');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    if (kind === 'explanation') {
      setExplImagePreview(dataUrl);
      setExplImageDirty(true);
      setStatus('해설 이미지 선택됨');
    } else {
      setImagePreview(dataUrl);
      setImageDirty(true);
      setStatus('문제 이미지 선택됨');
    }
  };

  const onDrop = async (e, kind = 'question') => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFile(file, kind);
  };

  const resetForm = (nextId) => {
    setEditingId(nextId);
    setAnswer(null);
    setExplanation('');
    setImagePreview('');
    setImageDirty(false);
    setExplImagePreview('');
    setExplImageDirty(false);
  };

  // 입력값 검증
  const canSave = imagePreview && answer && /^\d{4}$/.test(year);

  // 저장 + 다음 문제로 / 또는 저장만
  const saveQuestion = async (advance = false) => {
    if (!canSave) {
      alert('이미지·정답·연도를 모두 입력하세요');
      return;
    }
    setStatus('저장 중...');
    try {
      let imageUrl = imagePreview;
      if (imageDirty) {
        const res = await fetch('/__save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, id: editingId, dataUrl: imagePreview, kind: 'question' }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `image save failed`);
        imageUrl = d.url;
      }

      let explImageUrl = explImagePreview;
      if (explImageDirty && explImagePreview) {
        const res = await fetch('/__save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, id: editingId, dataUrl: explImagePreview, kind: 'explanation' }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `expl image save failed`);
        explImageUrl = d.url;
      } else if (!explImagePreview) {
        // 사용자가 해설 이미지를 비웠으면 서버에서도 삭제
        explImageUrl = '';
        await fetch('/__delete-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, id: editingId, kind: 'explanation' }),
        });
      }

      const newQ = {
        id: editingId,
        subject,
        image: imageUrl,
        answer,
        explanation: explanation.trim() || undefined,
        explanationImage: explImageUrl || undefined,
      };
      const nextList = [...questions.filter(q => q.id !== editingId), newQ];
      setQuestions(nextList);

      const dataRes = await fetch('/__save-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `${year}.js`,
          content: toJsModule(year, nextList),
        }),
      });
      const dd = await dataRes.json();
      if (!dataRes.ok) throw new Error(dd.error || 'data save failed');

      setStatus(`✅ #${editingId} 저장됨 (${nextList.length}문제)`);
      if (advance) {
        const nextId = Math.max(...nextList.map(q => q.id), 0) + 1;
        resetForm(nextId);
      } else {
        setImageDirty(false);
      }
      refreshFiles();
    } catch (err) {
      setStatus(`저장 실패: ${err.message}`);
    }
  };

  // 기존 파일 불러오기
  const loadYear = async (filename, silent = false) => {
    try {
      const res = await fetch('/__read-data?file=' + encodeURIComponent(filename));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const blob = new Blob([data.content], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const mod = await import(/* @vite-ignore */ url);
      URL.revokeObjectURL(url);
      const list = mod.default || [];
      const yr = filename.replace('.js', '');
      setYear(yr);
      setQuestions(list);
      const nextId = Math.max(...list.map(q => q.id), 0) + 1;
      resetForm(nextId);
      setStatus(`${filename} 자동 불러옴 (${list.length}문제). 다음 입력 #${nextId}`);
    } catch (err) {
      if (!silent) alert(`불러오기 실패: ${err.message}`);
    }
  };

  const editQuestion = (q) => {
    setEditingId(q.id);
    setSubject(q.subject);
    setAnswer(q.answer);
    setExplanation(q.explanation || '');
    setImagePreview(q.image);
    setImageDirty(false);
    setExplImagePreview(q.explanationImage || '');
    setExplImageDirty(false);
    setStatus(`#${q.id} 편집 모드. 이미지 바꾸려면 새로 붙여넣으세요.`);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const deleteQuestion = async (id) => {
    if (!confirm(`#${id} 문제를 삭제하시겠습니까?`)) return;
    try {
      await fetch('/__delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, id }),
      });
      const nextList = questions.filter(q => q.id !== id);
      setQuestions(nextList);
      await fetch('/__save-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `${year}.js`,
          content: toJsModule(year, nextList),
        }),
      });
      setStatus(`#${id} 삭제됨`);
    } catch (err) {
      alert(`삭제 실패: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <h1>기출문제 입력 (이미지 모드)</h1>
      <p style={{ color: '#666', fontSize: 14 }}>
        문제 영역을 캡처하고 (Win+Shift+S) → 아래 박스에 <b>Ctrl+V</b>로 붙여넣기 → 정답·과목 선택 → <b>저장 후 다음 문제</b>.
        이미지에 보기 4개가 포함되어 있다고 가정하고 정답 1~4 버튼만 사용합니다.
      </p>

      {/* 저장된 연도 목록 */}
      <div style={{ marginBottom: 12, padding: 10, background: '#f0f4ff', borderRadius: 4, fontSize: 13 }}>
        <div style={{ marginBottom: 6 }}>
          <b>저장된 연도:</b>{' '}
          {savedFiles.length === 0 && <span style={{ color: '#888' }}>아직 없음</span>}
          {savedFiles.map(f => {
            const yr = f.replace('.js', '');
            const active = yr === year;
            return (
              <button key={f} onClick={() => loadYear(f)}
                style={{
                  margin: '0 4px', padding: '4px 10px', cursor: 'pointer',
                  background: active ? '#1a1a1a' : '#fff',
                  color: active ? '#fff' : '#333',
                  border: '1px solid ' + (active ? '#1a1a1a' : '#aac'),
                  borderRadius: 3, fontWeight: active ? 'bold' : 'normal',
                }}>
                📂 {f}
              </button>
            );
          })}
          <button onClick={refreshFiles} style={{ marginLeft: 4, padding: '4px 8px', fontSize: 11 }} title="목록 새로고침">↻</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#555' }}>+ 새 연도 시작:</span>
          {[2024, 2023, 2022, 2021, 2020].map(yr => {
            const exists = savedFiles.includes(`${yr}.js`);
            if (exists) return null;
            return (
              <button key={yr}
                onClick={() => {
                  if (questions.length > 0 && !confirm(`현재 ${year}년 작업을 두고 ${yr}년 새로 시작하시겠습니까? (저장된 내용은 그대로 남습니다)`)) return;
                  setYear(String(yr));
                  setQuestions([]);
                  resetForm(1);
                  setStatus(`${yr}년 새로 시작. 첫 문제부터 입력하세요.`);
                }}
                style={{
                  padding: '3px 8px', cursor: 'pointer',
                  background: '#fff', border: '1px dashed #888',
                  borderRadius: 3, fontSize: 12,
                }}>
                ➕ {yr}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: '#888' }}>(또는 우측 폼 "연도" 입력칸에 직접 입력)</span>
        </div>
      </div>

      {/* 입력 폼 */}
      <div ref={formRef} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* 좌: 이미지 */}
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <label>연도{' '}
              <input value={year} onChange={e => setYear(e.target.value)}
                style={{ width: 70, padding: 4 }} />
            </label>
            <label>문제 #{' '}
              <input type="number" value={editingId} min={1}
                onChange={e => setEditingId(parseInt(e.target.value, 10) || 1)}
                style={{ width: 70, padding: 4 }} />
            </label>
            <label style={{ marginLeft: 'auto' }}>
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])}
                id="img-file" />
              <span onClick={() => document.getElementById('img-file').click()}
                style={{ cursor: 'pointer', fontSize: 12, color: '#06b' }}>
                📁 파일 선택
              </span>
            </label>
          </div>
          <div
            onPaste={() => {}}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            style={{
              border: '2px dashed #888', borderRadius: 6, minHeight: 320,
              background: imagePreview ? '#fff' : '#fafafa',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 8, overflow: 'auto',
            }}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="문제"
                style={{ maxWidth: '100%', maxHeight: 600, display: 'block' }} />
            ) : (
              <div style={{ color: '#888', textAlign: 'center', fontSize: 14 }}>
                여기를 클릭한 뒤 <b>Ctrl+V</b>로 캡처 이미지 붙여넣기<br/>
                또는 이미지 파일 드래그
              </div>
            )}
          </div>
        </div>

        {/* 우: 정답/과목/해설 */}
        <div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>정답 (필수)</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1,2,3,4].map(n => (
                <button key={n} onClick={() => setAnswer(n)}
                  style={{
                    flex: 1, padding: '20px 0', fontSize: 28, fontWeight: 'bold',
                    border: answer === n ? '3px solid #16a34a' : '1px solid #ccc',
                    background: answer === n ? '#dcfce7' : '#fff',
                    color: answer === n ? '#15803d' : '#333',
                    borderRadius: 6, cursor: 'pointer',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>과목</div>
            <select value={subject} onChange={e => setSubject(e.target.value)}
              style={{ width: '100%', padding: 6, fontSize: 14 }}>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>해설 (선택) — 텍스트와 이미지 모두 가능</span>
              {(explImagePreview || explImageDirty) && (
                <button
                  onClick={() => { setExplImagePreview(''); setExplImageDirty(true); }}
                  style={{ fontSize: 11, color: '#c00', background: 'none', border: '1px solid #c00', padding: '1px 6px', borderRadius: 3, cursor: 'pointer' }}
                >
                  해설 이미지 제거
                </button>
              )}
            </div>
            <textarea
              ref={explTextRef}
              value={explanation} onChange={e => setExplanation(e.target.value)}
              placeholder="텍스트 해설 (이 칸 클릭 후 Ctrl+V로 붙여넣으면 해설 이미지로 인식)"
              style={{ width: '100%', minHeight: 80, padding: 6, fontSize: 13, fontFamily: 'inherit' }} />
            <div
              ref={explAreaRef}
              tabIndex={0}
              onDrop={(e) => onDrop(e, 'explanation')}
              onDragOver={e => e.preventDefault()}
              onClick={() => explAreaRef.current?.focus()}
              style={{
                marginTop: 4,
                border: '1px dashed #c8a96a',
                borderRadius: 4,
                minHeight: explImagePreview ? 'auto' : 70,
                padding: 6,
                background: explImagePreview ? '#fff' : '#fdf9f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', outline: 'none',
              }}
            >
              {explImagePreview ? (
                <img src={explImagePreview} alt="해설"
                  style={{ maxWidth: '100%', maxHeight: 240, display: 'block' }} />
              ) : (
                <div style={{ fontSize: 12, color: '#7a6f5f', textAlign: 'center' }}>
                  📎 여기를 클릭한 뒤 <b>Ctrl+V</b>로 해설 이미지 붙여넣기 (선택)<br/>
                  또는 이미지 파일 드래그
                </div>
              )}
              <input type="file" accept="image/*" id="expl-img-file" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0], 'explanation')} />
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: '#888', textAlign: 'right' }}>
              <span onClick={() => document.getElementById('expl-img-file').click()}
                style={{ cursor: 'pointer', color: '#06b' }}>
                📁 해설 이미지 파일 선택
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => saveQuestion(true)}
              disabled={!canSave}
              style={{
                flex: 2, padding: '12px', fontSize: 15, fontWeight: 'bold',
                background: canSave ? '#16a34a' : '#aaa', color: '#fff',
                border: 'none', borderRadius: 6, cursor: canSave ? 'pointer' : 'not-allowed',
              }}>
              💾 저장 후 다음 문제 →
            </button>
            <button
              onClick={() => saveQuestion(false)}
              disabled={!canSave}
              style={{
                flex: 1, padding: '12px', fontSize: 14,
                background: canSave ? '#2563eb' : '#aaa', color: '#fff',
                border: 'none', borderRadius: 6, cursor: canSave ? 'pointer' : 'not-allowed',
              }}>
              저장만
            </button>
          </div>

          {status && (
            <div style={{
              marginTop: 8, padding: 8, fontSize: 13, borderRadius: 4,
              background: status.includes('실패') ? '#fee' : '#f0fdf4',
              color: status.includes('실패') ? '#900' : '#166534',
            }}>
              {status}
            </div>
          )}
        </div>
      </div>

      {/* 저장된 문제 목록 */}
      <h2 style={{ borderBottom: '2px solid #ccc', paddingBottom: 4 }}>
        {year}년 입력된 문제 ({questions.length}문제)
      </h2>
      {questions.length === 0 ? (
        <div style={{ padding: 20, color: '#888', textAlign: 'center' }}>
          아직 저장된 문제가 없습니다. 저장된 연도를 불러오거나 새로 입력하세요.
        </div>
      ) : (
        <>
          {/* 과목별 탭 */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10, marginBottom: 8 }}>
            {(() => {
              const counts = { '전체': questions.length };
              for (const s of SUBJECTS) counts[s] = 0;
              for (const q of questions) {
                counts[q.subject] = (counts[q.subject] || 0) + 1;
              }
              const tabs = ['전체', ...SUBJECTS];
              return tabs.map(s => {
                const active = subjectFilter === s;
                const n = counts[s] ?? 0;
                return (
                  <button
                    key={s}
                    onClick={() => setSubjectFilter(s)}
                    style={{
                      padding: '6px 12px', fontSize: 13,
                      border: '1px solid ' + (active ? '#1a1a1a' : '#ccc'),
                      background: active ? '#1a1a1a' : '#fff',
                      color: active ? '#fff' : (n === 0 ? '#bbb' : '#333'),
                      borderRadius: 4, cursor: 'pointer',
                      fontWeight: active ? 'bold' : 'normal',
                    }}
                  >
                    {s} <span style={{ opacity: 0.7, fontSize: 11 }}>({n})</span>
                  </button>
                );
              });
            })()}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10
          }}>
          {[...questions]
            .filter(q => subjectFilter === '전체' || q.subject === subjectFilter)
            .sort((a,b) => a.id - b.id).map(q => (
            <div key={q.id} style={{
              border: '1px solid #ddd', borderRadius: 4, padding: 6, background: '#fff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <b>#{q.id}</b>
                <span style={{ color: '#666' }}>{q.subject}</span>
              </div>
              <img src={q.image} alt={`Q${q.id}`}
                style={{ width: '100%', height: 120, objectFit: 'contain', background: '#f5f5f5', cursor: 'pointer' }}
                onClick={() => editQuestion(q)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                <span>정답: <b style={{ color: '#16a34a' }}>{q.answer}</b></span>
                <span>
                  <button onClick={() => editQuestion(q)} style={{ fontSize: 11, marginRight: 4 }}>편집</button>
                  <button onClick={() => deleteQuestion(q.id)} style={{ fontSize: 11, color: '#c00' }}>삭제</button>
                </span>
              </div>
              {q.explanation && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  💬 {q.explanation}
                </div>
              )}
              {q.explanationImage && (
                <div style={{ fontSize: 11, color: '#c8a96a', marginTop: 2 }}>
                  🖼 해설 이미지
                </div>
              )}
            </div>
          ))}
          </div>
        </>
      )}
    </div>
  );
}
