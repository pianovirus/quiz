import React, { useState, useMemo, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Tesseract from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SUBJECTS = ['감리 및 사업관리', '소프트웨어 공학', '데이터베이스', '시스템 구조', '보안'];

const HISTORY_KEY = 'quiz_converter_history';
const HISTORY_LIMIT = 50;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch {}
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 페이지 한 장을 캔버스로 렌더한 뒤 OCR
async function ocrPage(page, lang, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const { data } = await Tesseract.recognize(canvas, lang);
  return data.text || '';
}

function pageItemsToLines(items) {
  const arr = items
    .filter(it => it.str !== undefined)
    .map(it => ({
      str: it.str,
      x: it.transform[4],
      y: Math.round(it.transform[5]),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  let curY = null;
  let curLine = [];
  for (const it of arr) {
    if (curY === null || Math.abs(it.y - curY) <= 2) {
      curLine.push(it);
      curY = curY ?? it.y;
    } else {
      lines.push(curLine.map(s => s.str).join(' ').replace(/\s+/g, ' ').trim());
      curLine = [it];
      curY = it.y;
    }
  }
  if (curLine.length) lines.push(curLine.map(s => s.str).join(' ').replace(/\s+/g, ' ').trim());
  return lines.filter(Boolean).join('\n');
}

async function extractPdfText(file, opts) {
  const { mode = 'auto', lang = 'kor+eng', onProgress } = opts || {};
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    if (mode === 'text') {
      onProgress?.({ page: i, total: pdf.numPages, stage: '텍스트 추출' });
      const content = await page.getTextContent();
      pages.push(pageItemsToLines(content.items));
      continue;
    }

    if (mode === 'ocr') {
      onProgress?.({ page: i, total: pdf.numPages, stage: 'OCR' });
      pages.push(await ocrPage(page, lang));
      continue;
    }

    // auto: 텍스트 우선, 텍스트가 거의 없으면 OCR로 폴백
    onProgress?.({ page: i, total: pdf.numPages, stage: '텍스트 추출' });
    const content = await page.getTextContent();
    const textOut = pageItemsToLines(content.items);
    if (textOut.replace(/\s/g, '').length < 30) {
      onProgress?.({ page: i, total: pdf.numPages, stage: 'OCR 폴백' });
      const ocrOut = await ocrPage(page, lang);
      pages.push(ocrOut);
    } else {
      pages.push(textOut);
    }
  }
  return pages.join('\n\n');
}

const SAMPLE = `1. 정보시스템 장애 대응과 관련하여 가장 적절하지 않은 것은?
① 정보시스템의 장애 예방·대응계획 수립
② 관계기관에 장애사실의 즉시 통보
③ 사업자에게 외부 전문가 활용 체계 구성을 요구
④ 장애등급 조정 및 원격 백업
정답: 4

2. 「소프트웨어진흥법」에 따른 설명으로 가장 적절하지 않은 것은?
1) 상세 요구사항을 작성하기 위해 분리 발주 가능
2) 민간 자본·기술 활용 사업 추진 가능
3) 디지털서비스 심사위원회 선정 서비스는 수의계약 가능
4) 공개 SW는 직접 구매 방식 적용
정답: 4
`;

// 다양한 보기 마커 정규화
const OPTION_MARKERS = [
  /^[①②③④⑤]\s*/,
  /^[➀➁➂➃➄]\s*/,
  /^[1-5][.)]\s*/,
  /^\([1-5]\)\s*/,
  /^[가나다라마][.)]\s*/,
  /^[ABCDE][.)]\s*/i,
];

const CIRCLED_TO_NUM = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '➀': 1, '➁': 2, '➂': 3, '➃': 4, '➄': 5 };

function detectOptionNumber(line) {
  const m = line.match(/^([①②③④⑤➀➁➂➃➄])/);
  if (m) return CIRCLED_TO_NUM[m[1]];
  const n = line.match(/^\(?([1-5])[.)\s]/);
  if (n) return parseInt(n[1], 10);
  const k = line.match(/^([가나다라마])[.)\s]/);
  if (k) return '가나다라마'.indexOf(k[1]) + 1;
  return null;
}

function stripMarker(line) {
  for (const re of OPTION_MARKERS) {
    if (re.test(line)) return line.replace(re, '').trim();
  }
  return line.trim();
}

function parseAnswer(line) {
  const m = line.match(/정답\s*[:：]?\s*([①②③④⑤➀➁➂➃➄]|\(?[1-5]\)?|[가나다라마])/);
  if (!m) return null;
  const tok = m[1];
  if (CIRCLED_TO_NUM[tok]) return CIRCLED_TO_NUM[tok];
  const n = tok.match(/[1-5]/);
  if (n) return parseInt(n[0], 10);
  if ('가나다라마'.includes(tok)) return '가나다라마'.indexOf(tok) + 1;
  return null;
}

function parseQuestionStart(line) {
  // "1.", "1)", "문제 1.", "Q1.", "[1]"
  const m = line.match(/^(?:문제\s*|Q)?\[?(\d+)[.)\]]\s*(.*)$/i);
  if (!m) return null;
  return { id: parseInt(m[1], 10), rest: m[2].trim() };
}

function parseText(text, defaultSubject) {
  const lines = text.split(/\r?\n/);
  const questions = [];
  const errors = [];
  let cur = null;
  let curSubject = defaultSubject;

  const flush = () => {
    if (!cur) return;
    if (cur.options.length < 2) {
      errors.push(`Q${cur.id}: 보기가 ${cur.options.length}개뿐입니다`);
    }
    if (!cur.answer) {
      errors.push(`Q${cur.id}: 정답을 찾지 못했습니다`);
    }
    questions.push(cur);
    cur = null;
  };

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 과목 헤더: "[감리 및 사업관리]" 또는 "## 보안"
    const subjMatch = line.match(/^[\[#=]+\s*([가-힣 ]+?)\s*[\]#=]*$/);
    if (subjMatch && SUBJECTS.includes(subjMatch[1].trim())) {
      flush();
      curSubject = subjMatch[1].trim();
      continue;
    }

    // 정답 라인
    const ans = parseAnswer(line);
    if (ans && cur) {
      cur.answer = ans;
      flush();
      continue;
    }

    // 보기 라인
    const optNum = detectOptionNumber(line);
    if (optNum && cur && cur.options.length === optNum - 1) {
      cur.options.push(stripMarker(line));
      continue;
    }

    // 새 문제 시작
    const qStart = parseQuestionStart(line);
    if (qStart) {
      flush();
      cur = {
        id: qStart.id,
        subject: curSubject,
        question: qStart.rest,
        options: [],
        answer: null,
      };
      continue;
    }

    // 진행 중인 문제 본문에 이어쓰기
    if (cur) {
      if (cur.options.length === 0) {
        cur.question = cur.question ? cur.question + '\n' + line : line;
      } else {
        // 마지막 보기에 이어쓰기
        cur.options[cur.options.length - 1] += ' ' + line;
      }
    }
  }
  flush();

  return { questions, errors };
}

function escapeJsString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function toJsModule(year, questions) {
  const body = questions.map(q => {
    const opts = q.options.map(o => `      '${escapeJsString(o)}'`).join(',\n');
    return `  {
    id: ${q.id},
    subject: "${q.subject}",
    question: '${escapeJsString(q.question)}',
    options: [
${opts}
    ],
    answer: ${q.answer ?? 'null'}
  }`;
  }).join(',\n');
  return `// ${year}년 정보시스템감리사 기출문제\nexport default [\n${body}\n];\n`;
}

export default function Converter() {
  const [year, setYear] = useState(new Date().getFullYear() - 1 + '');
  const [defaultSubject, setDefaultSubject] = useState(SUBJECTS[0]);
  const [text, setText] = useState('');
  const [pdfStatus, setPdfStatus] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMode, setPdfMode] = useState('auto');
  const [ocrLang, setOcrLang] = useState('kor+eng');
  const fileInputRef = useRef(null);

  // 변환 결과 (버튼을 눌러야 채워짐)
  const [result, setResult] = useState(null); // { questions, errors, year }

  // 업로드 이력
  const [history, setHistory] = useState(loadHistory());
  const lastFileRef = useRef(null); // 직전 업로드 PDF의 메타

  const addHistory = (entry) => {
    setHistory(prev => {
      const next = [{ ...entry, ts: Date.now() }, ...prev].slice(0, HISTORY_LIMIT);
      saveHistory(next);
      return next;
    });
  };

  const handlePdf = async (file) => {
    if (!file) return;
    setPdfBusy(true);
    setResult(null);
    setPdfStatus(`"${file.name}" 읽는 중... (OCR 사용 시 첫 실행은 언어 데이터 다운로드로 1~2분 소요)`);
    const startedAt = Date.now();
    try {
      const extracted = await extractPdfText(file, {
        mode: pdfMode,
        lang: ocrLang,
        onProgress: ({ page, total, stage }) => {
          setPdfStatus(`"${file.name}" — ${stage} ${page}/${total}`);
        },
      });
      setText(extracted);
      setPdfStatus(`"${file.name}" 추출 완료 (${extracted.length.toLocaleString()}자). "변환" 버튼을 눌러 검수하세요.`);
      const yearMatch = file.name.match(/(20\d{2})/);
      const inferredYear = yearMatch ? yearMatch[1] : year;
      if (yearMatch) setYear(yearMatch[1]);

      lastFileRef.current = {
        name: file.name,
        size: file.size,
        mode: pdfMode,
        lang: ocrLang,
        year: inferredYear,
        chars: extracted.length,
        elapsedMs: Date.now() - startedAt,
      };
      addHistory({
        type: 'upload',
        ...lastFileRef.current,
      });
    } catch (err) {
      setPdfStatus(`PDF 처리 실패: ${err.message}`);
      addHistory({
        type: 'upload-failed',
        name: file.name,
        size: file.size,
        mode: pdfMode,
        error: err.message,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (pdfBusy) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') handlePdf(file);
    else setPdfStatus('PDF 파일만 가능합니다');
  };

  const runConvert = () => {
    if (!text.trim()) {
      alert('변환할 텍스트가 없습니다');
      return;
    }
    const r = parseText(text, defaultSubject);
    setResult({ ...r, year });
    addHistory({
      type: 'convert',
      year,
      defaultSubject,
      questionCount: r.questions.length,
      errorCount: r.errors.length,
      sourceName: lastFileRef.current?.name || '(직접 입력)',
    });
  };

  const clearHistory = () => {
    if (!confirm('이력을 모두 삭제하시겠습니까?')) return;
    setHistory([]);
    saveHistory([]);
  };

  const questions = result?.questions ?? [];
  const errors = result?.errors ?? [];
  const jsOutput = useMemo(
    () => questions.length ? toJsModule(result?.year ?? year, questions) : '',
    [result, year, questions]
  );

  const download = () => {
    const blob = new Blob([jsOutput], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${year}.js`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(jsOutput);
    alert('클립보드에 복사되었습니다');
  };

  const subjectStats = useMemo(() => {
    const m = {};
    for (const q of questions) m[q.subject] = (m[q.subject] || 0) + 1;
    return m;
  }, [questions]);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', maxWidth: 1400, margin: '0 auto' }}>
      <h1>기출문제 변환기</h1>
      <p style={{ color: '#666' }}>
        PDF를 업로드하거나 텍스트를 붙여넣으면 <code>src/data/YYYY.js</code> 형식으로 변환합니다.
        다운로드 후 <code>src/data/</code> 폴더에 넣으면 자동 로드됩니다.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 13, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold' }}>추출 방식:</span>
        <label><input type="radio" name="pdfMode" value="auto" checked={pdfMode === 'auto'} onChange={() => setPdfMode('auto')} disabled={pdfBusy} /> 자동 (텍스트 우선, 빈 페이지는 OCR)</label>
        <label><input type="radio" name="pdfMode" value="text" checked={pdfMode === 'text'} onChange={() => setPdfMode('text')} disabled={pdfBusy} /> 텍스트만 (빠름)</label>
        <label><input type="radio" name="pdfMode" value="ocr" checked={pdfMode === 'ocr'} onChange={() => setPdfMode('ocr')} disabled={pdfBusy} /> OCR 강제 (이미지 스캔용, 느림)</label>
        <label style={{ marginLeft: 8 }}>
          OCR 언어{' '}
          <select value={ocrLang} onChange={e => setOcrLang(e.target.value)} disabled={pdfBusy} style={{ padding: 2 }}>
            <option value="kor+eng">한국어 + 영어</option>
            <option value="kor">한국어</option>
            <option value="eng">영어</option>
          </select>
        </label>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => !pdfBusy && fileInputRef.current?.click()}
        style={{
          border: '2px dashed #888',
          borderRadius: 8,
          padding: 20,
          textAlign: 'center',
          marginBottom: 12,
          cursor: pdfBusy ? 'wait' : 'pointer',
          background: pdfBusy ? '#fffbe6' : '#fafafa',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => handlePdf(e.target.files?.[0])}
        />
        <div style={{ fontSize: 16, fontWeight: 'bold' }}>
          {pdfBusy ? '⏳ ' : '📄 '}
          PDF 파일을 여기에 드래그하거나 클릭해서 선택
        </div>
        {pdfStatus && (
          <div style={{ marginTop: 6, fontSize: 13, color: pdfStatus.includes('실패') ? '#c00' : '#555' }}>
            {pdfStatus}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 12, color: '#999' }}>
          파일명에 연도가 있으면 (예: <code>2024_기출.pdf</code>) 자동으로 연도가 채워집니다.
          OCR 첫 실행 시 언어 데이터를 자동 다운로드합니다 (한국어 ~15MB, 1~2분 소요).
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <label>
          연도{' '}
          <input
            value={year}
            onChange={e => setYear(e.target.value)}
            style={{ width: 80, padding: 4 }}
            placeholder="2024"
          />
        </label>
        <label>
          기본 과목{' '}
          <select value={defaultSubject} onChange={e => setDefaultSubject(e.target.value)} style={{ padding: 4 }}>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button onClick={() => setText(SAMPLE)}>샘플 입력</button>
        <button onClick={() => setText('')}>지우기</button>
      </div>

      <details style={{ marginBottom: 12, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>입력 형식 안내</summary>
        <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          <p><b>문제 시작:</b> <code>1.</code> <code>1)</code> <code>문제 1.</code> <code>Q1.</code> <code>[1]</code></p>
          <p><b>보기:</b> <code>① ② ③ ④</code> 또는 <code>1) 2) 3) 4)</code> 또는 <code>가. 나. 다. 라.</code></p>
          <p><b>정답:</b> <code>정답: 4</code> 또는 <code>정답: ④</code> 또는 <code>정답: 라</code></p>
          <p><b>과목 변경:</b> 줄 단독으로 <code>[보안]</code> 또는 <code>## 데이터베이스</code> (5개 과목명과 정확히 일치해야 함)</p>
          <p><b>줄바꿈:</b> 본문/보기 중간 줄바꿈은 자동 결합됨</p>
        </div>
      </details>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>입력 (텍스트)</span>
            <button
              onClick={runConvert}
              disabled={pdfBusy || !text.trim()}
              style={{
                background: '#2563eb', color: '#fff', border: 'none',
                padding: '6px 14px', borderRadius: 4, fontWeight: 'bold',
                cursor: (pdfBusy || !text.trim()) ? 'not-allowed' : 'pointer',
                opacity: (pdfBusy || !text.trim()) ? 0.5 : 1,
              }}
            >
              ▶ 변환 실행
            </button>
            {result && <span style={{ fontSize: 12, color: '#666' }}>(텍스트를 수정하면 다시 눌러주세요)</span>}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ width: '100%', height: 500, fontFamily: 'monospace', fontSize: 13, padding: 8 }}
            placeholder="여기에 기출문제 텍스트를 붙여넣으세요..."
          />
        </div>
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            출력 ({questions.length}문제)
            {jsOutput && (
              <span style={{ marginLeft: 12 }}>
                <button onClick={download}>다운로드 {result?.year ?? year}.js</button>{' '}
                <button onClick={copy}>복사</button>
              </span>
            )}
          </div>
          <textarea
            value={jsOutput}
            readOnly
            style={{ width: '100%', height: 500, fontFamily: 'monospace', fontSize: 13, padding: 8, background: '#fafafa' }}
            placeholder="'변환 실행' 버튼을 누르면 결과가 여기에 표시됩니다"
          />
        </div>
      </div>

      {result && (
        <ReviewPanel questions={questions} errors={errors} />
      )}

      <HistoryPanel history={history} onClear={clearHistory} onLoadText={(t, y) => { setText(t); if (y) setYear(y); setResult(null); }} />
    </div>
  );
}

function ReviewPanel({ questions, errors }) {
  const subjectStats = useMemo(() => {
    const m = {};
    for (const q of questions) m[q.subject] = (m[q.subject] || 0) + 1;
    return m;
  }, [questions]);

  const errorsByQ = useMemo(() => {
    const m = new Map();
    for (const e of errors) {
      const match = e.match(/Q(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(e);
      }
    }
    return m;
  }, [errors]);

  return (
    <div style={{ marginTop: 16 }}>
      <h2 style={{ borderBottom: '2px solid #ccc', paddingBottom: 4 }}>검수 ({questions.length}문제)</h2>

      {Object.keys(subjectStats).length > 0 && (
        <div style={{ padding: 8, background: '#eef', borderRadius: 4, marginBottom: 8 }}>
          <b>과목별 분포:</b>{' '}
          {Object.entries(subjectStats).map(([s, n]) => `${s} ${n}문제`).join(', ')}
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ padding: 8, background: '#fee', borderRadius: 4, color: '#900', marginBottom: 8 }}>
          <b>경고 ({errors.length}건):</b>
          <ul style={{ margin: '4px 0 0 20px' }}>
            {errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
            {errors.length > 20 && <li>... 외 {errors.length - 20}건</li>}
          </ul>
        </div>
      )}

      <div style={{ maxHeight: 600, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4, padding: 8 }}>
        {questions.map(q => {
          const qErrors = errorsByQ.get(q.id) || [];
          const hasError = qErrors.length > 0;
          return (
            <div
              key={q.id}
              style={{
                padding: 10,
                marginBottom: 8,
                background: hasError ? '#fff5f5' : '#fff',
                border: `1px solid ${hasError ? '#fcc' : '#eee'}`,
                borderRadius: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <b>#{q.id} <span style={{ color: '#666', fontSize: 12 }}>[{q.subject}]</span></b>
                <span style={{ fontSize: 12, color: '#888' }}>정답: {q.answer ?? '?'}</span>
              </div>
              <div style={{ fontSize: 14, marginBottom: 6, whiteSpace: 'pre-wrap' }}>{q.question}</div>
              <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                {q.options.map((o, i) => (
                  <li key={i} style={{
                    fontSize: 13,
                    color: q.answer === i + 1 ? '#0a7' : '#333',
                    fontWeight: q.answer === i + 1 ? 'bold' : 'normal',
                  }}>
                    {o} {q.answer === i + 1 && '✓'}
                  </li>
                ))}
              </ol>
              {hasError && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#c00' }}>
                  ⚠ {qErrors.join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryPanel({ history, onClear, onLoadText }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginTop: 16 }}>
      <h2 style={{
        borderBottom: '2px solid #ccc', paddingBottom: 4,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
          {open ? '▼' : '▶'} 작업 이력 ({history.length})
        </span>
        {history.length > 0 && (
          <button onClick={onClear} style={{ fontSize: 12, padding: '2px 8px' }}>이력 지우기</button>
        )}
      </h2>

      {open && (
        history.length === 0 ? (
          <div style={{ padding: 12, color: '#888', fontSize: 14 }}>아직 이력이 없습니다.</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                  <th style={{ padding: 6 }}>시각</th>
                  <th style={{ padding: 6 }}>작업</th>
                  <th style={{ padding: 6 }}>파일/소스</th>
                  <th style={{ padding: 6 }}>연도</th>
                  <th style={{ padding: 6 }}>모드</th>
                  <th style={{ padding: 6 }}>크기/문제</th>
                  <th style={{ padding: 6 }}>비고</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: 6, color: '#666', whiteSpace: 'nowrap' }}>{formatTime(h.ts)}</td>
                    <td style={{ padding: 6 }}>
                      {h.type === 'upload' && <span style={{ color: '#06b' }}>📄 업로드</span>}
                      {h.type === 'upload-failed' && <span style={{ color: '#c00' }}>❌ 업로드 실패</span>}
                      {h.type === 'convert' && <span style={{ color: '#080' }}>▶ 변환</span>}
                    </td>
                    <td style={{ padding: 6, wordBreak: 'break-all' }}>{h.name || h.sourceName || '-'}</td>
                    <td style={{ padding: 6 }}>{h.year || '-'}</td>
                    <td style={{ padding: 6 }}>{h.mode || '-'}</td>
                    <td style={{ padding: 6 }}>
                      {h.size ? formatBytes(h.size) : ''}
                      {h.questionCount != null ? `${h.questionCount}문제` : ''}
                    </td>
                    <td style={{ padding: 6, color: '#666' }}>
                      {h.error && <span style={{ color: '#c00' }}>{h.error}</span>}
                      {h.chars != null && `${h.chars.toLocaleString()}자 추출`}
                      {h.elapsedMs != null && ` (${(h.elapsedMs / 1000).toFixed(1)}s)`}
                      {h.errorCount > 0 && <span style={{ color: '#c80' }}> 경고 {h.errorCount}건</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
