import React, { useState, useEffect, useMemo } from 'react';
import { Shuffle, BookOpen, Bookmark, BarChart3, Filter, RotateCcw, Check, X, ChevronRight, Trash2, Home, AlertCircle } from 'lucide-react';
import { QUESTIONS, QUESTIONS_BY_YEAR, YEARS } from './data';

// ============ 데이터 ============
const SUBJECTS = {
  AUDIT: '감리 및 사업관리',
  SE: '소프트웨어 공학',
  DB: '데이터베이스',
  SYSTEM: '시스템 구조',
  SECURITY: '보안'
};

// ============ 메인 앱 ============
export default function App() {
  // 모드: 'home' | 'quiz' | 'wrong' | 'stats'
  const [mode, setMode] = useState('home');
  const [selectedSubjects, setSelectedSubjects] = useState(Object.values(SUBJECTS));
  
  // 학습 데이터 (localStorage에 영구 저장)
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('gamrisa_history');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      const saved = localStorage.getItem('gamrisa_bookmarks');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  
  // localStorage 동기화
  useEffect(() => {
    localStorage.setItem('gamrisa_history', JSON.stringify(history));
  }, [history]);
  useEffect(() => {
    localStorage.setItem('gamrisa_bookmarks', JSON.stringify(Array.from(bookmarks)));
  }, [bookmarks]);
  
  // 퀴즈 상태
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [questionPool, setQuestionPool] = useState([]);
  
  // 필터링된 문제 풀
  const filteredQuestions = useMemo(() => {
    return QUESTIONS.filter(q => selectedSubjects.includes(q.subject));
  }, [selectedSubjects]);
  
  // 틀린 문제 풀
  const wrongQuestions = useMemo(() => {
    return QUESTIONS.filter(q => history[q.id] && !history[q.id].correct);
  }, [history]);
  
  // 통계
  const stats = useMemo(() => {
    const total = Object.keys(history).length;
    const correct = Object.values(history).filter(h => h.correct).length;
    const wrong = total - correct;
    const subjectStats = {};
    Object.values(SUBJECTS).forEach(subj => {
      const subjQs = QUESTIONS.filter(q => q.subject === subj);
      const attempted = subjQs.filter(q => history[q.id]);
      const correctCount = attempted.filter(q => history[q.id].correct).length;
      subjectStats[subj] = {
        total: subjQs.length,
        attempted: attempted.length,
        correct: correctCount,
        accuracy: attempted.length > 0 ? Math.round((correctCount / attempted.length) * 100) : 0
      };
    });
    return { total, correct, wrong, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0, subjectStats };
  }, [history]);

  // 랜덤 문제 선택
  const pickRandomQuestion = (pool) => {
    if (pool.length === 0) return null;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  };
  
  // 퀴즈 시작
  const startQuiz = (useWrong = false) => {
    const pool = useWrong ? wrongQuestions : filteredQuestions;
    if (pool.length === 0) {
      alert(useWrong ? '아직 틀린 문제가 없어요!' : '선택된 과목이 없어요. 과목을 선택해주세요.');
      return;
    }
    setQuestionPool(pool);
    const q = pickRandomQuestion(pool);
    setCurrentQuestion(q);
    setSelectedOption(null);
    setShowAnswer(false);
    setMode(useWrong ? 'wrong' : 'quiz');
  };
  
  // 다음 문제
  const nextQuestion = () => {
    const pool = mode === 'wrong' ? wrongQuestions : filteredQuestions;
    if (pool.length === 0) {
      setMode('home');
      return;
    }
    let q = pickRandomQuestion(pool);
    // 같은 문제 연속 방지 (풀이 1개일 때 제외)
    if (pool.length > 1 && q.id === currentQuestion?.id) {
      q = pickRandomQuestion(pool.filter(x => x.id !== currentQuestion.id));
    }
    setCurrentQuestion(q);
    setSelectedOption(null);
    setShowAnswer(false);
  };
  
  // 답 선택
  const selectAnswer = (optionIdx) => {
    if (showAnswer) return;
    const isCorrect = (optionIdx + 1) === currentQuestion.answer;
    setSelectedOption(optionIdx);
    setShowAnswer(true);
    
    // 학습 기록 저장
    setHistory(prev => ({
      ...prev,
      [currentQuestion.id]: {
        correct: isCorrect,
        attempts: (prev[currentQuestion.id]?.attempts || 0) + 1,
        lastAttempt: Date.now()
      }
    }));
  };
  
  // 북마크 토글
  const toggleBookmark = (qId) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };
  
  // 기록 초기화
  const resetHistory = () => {
    if (confirm('정말로 모든 학습 기록을 초기화할까요?')) {
      setHistory({});
      setBookmarks(new Set());
    }
  };
  
  // 과목 토글
  const toggleSubject = (subj) => {
    setSelectedSubjects(prev => 
      prev.includes(subj) 
        ? prev.filter(s => s !== subj)
        : [...prev, subj]
    );
  };

  // ============ 화면 렌더 ============
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f5f1ea 0%, #e8e0d0 100%)', fontFamily: '"Noto Serif KR", "Nanum Myeongjo", serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700;900&family=Gowun+Batang:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pop { 0% { transform: scale(0.95); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        .slide-in { animation: slideIn 0.3s ease-out forwards; opacity: 0; }
        .pop { animation: pop 0.3s ease-out; }
        button { font-family: inherit; }
      `}</style>
      
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px 80px' }}>
        {/* 헤더 */}
        <header style={{ marginBottom: '32px', textAlign: 'center', paddingTop: '20px' }}>
          <div style={{ 
            display: 'inline-block',
            padding: '4px 14px',
            background: '#1a1a1a',
            color: '#f5f1ea',
            fontSize: '11px',
            letterSpacing: '0.2em',
            marginBottom: '12px',
            fontFamily: '"JetBrains Mono", monospace'
          }}>
            제26회 · 2025
          </div>
          <h1 style={{ 
            margin: 0, 
            fontSize: '32px', 
            fontWeight: 900,
            color: '#1a1a1a',
            letterSpacing: '-0.02em',
            lineHeight: 1.2
          }}>
            기출문제 학습
          </h1>
          <div style={{ 
            fontSize: '14px',
            color: '#7a6f5f',
            marginTop: '6px',
            letterSpacing: '0.05em'
          }}>
            기출문제 랜덤 풀이
          </div>
        </header>

        {/* 홈 화면 */}
        {mode === 'home' && (
          <HomeScreen 
            stats={stats}
            selectedSubjects={selectedSubjects}
            toggleSubject={toggleSubject}
            wrongCount={wrongQuestions.length}
            bookmarkCount={bookmarks.size}
            startQuiz={startQuiz}
            setMode={setMode}
            resetHistory={resetHistory}
            filteredCount={filteredQuestions.length}
          />
        )}
        
        {/* 퀴즈 화면 */}
        {(mode === 'quiz' || mode === 'wrong') && currentQuestion && (
          <QuizScreen 
            question={currentQuestion}
            selectedOption={selectedOption}
            showAnswer={showAnswer}
            selectAnswer={selectAnswer}
            nextQuestion={nextQuestion}
            isBookmarked={bookmarks.has(currentQuestion.id)}
            toggleBookmark={() => toggleBookmark(currentQuestion.id)}
            history={history[currentQuestion.id]}
            goHome={() => setMode('home')}
            poolSize={mode === 'wrong' ? wrongQuestions.length : filteredQuestions.length}
            mode={mode}
          />
        )}
        
        {/* 통계 화면 */}
        {mode === 'stats' && (
          <StatsScreen 
            stats={stats}
            bookmarks={bookmarks}
            toggleBookmark={toggleBookmark}
            goHome={() => setMode('home')}
          />
        )}
      </div>
    </div>
  );
}

// ============ 홈 화면 ============
function HomeScreen({ stats, selectedSubjects, toggleSubject, wrongCount, bookmarkCount, startQuiz, setMode, resetHistory, filteredCount }) {
  return (
    <div className="fade-in">
      {/* 빠른 통계 */}
      {stats.total > 0 && (
        <div style={{
          background: '#1a1a1a',
          color: '#f5f1ea',
          padding: '20px 24px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', opacity: 0.6, fontFamily: '"JetBrains Mono", monospace' }}>
              MY PROGRESS
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
              {stats.accuracy}<span style={{ fontSize: '14px', opacity: 0.6 }}>% 정답률</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '13px', lineHeight: 1.6 }}>
            <div>{stats.correct} / {stats.total} 문제</div>
            <div style={{ opacity: 0.6, fontSize: '12px' }}>총 120문항 중</div>
          </div>
        </div>
      )}
      
      {/* 메인 액션 버튼들 */}
      <div style={{ display: 'grid', gap: '12px', marginBottom: '32px' }}>
        <ActionButton 
          onClick={() => startQuiz(false)}
          icon={<Shuffle size={22} />}
          title="랜덤 풀이 시작"
          subtitle={`선택된 ${filteredCount}문제 중 랜덤 출제`}
          primary
        />
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <ActionButton 
            onClick={() => startQuiz(true)}
            icon={<RotateCcw size={18} />}
            title="틀린 문제"
            subtitle={`${wrongCount}문제`}
            disabled={wrongCount === 0}
          />
          <ActionButton 
            onClick={() => setMode('stats')}
            icon={<BarChart3 size={18} />}
            title="학습 통계"
            subtitle={`북마크 ${bookmarkCount}개`}
          />
        </div>
      </div>
      
      {/* 과목 필터 */}
      <div style={{ background: '#fff', padding: '20px', border: '1px solid #d4c9b5' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          letterSpacing: '0.1em',
          color: '#7a6f5f',
          fontFamily: '"JetBrains Mono", monospace'
        }}>
          <Filter size={14} />
          <span>SUBJECT FILTER</span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {Object.values(SUBJECTS).map(subj => {
            const isSelected = selectedSubjects.includes(subj);
            const subjStat = stats.subjectStats[subj];
            return (
              <button
                key={subj}
                onClick={() => toggleSubject(subj)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: isSelected ? '#1a1a1a' : 'transparent',
                  color: isSelected ? '#f5f1ea' : '#1a1a1a',
                  border: `1px solid ${isSelected ? '#1a1a1a' : '#d4c9b5'}`,
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    border: `1.5px solid ${isSelected ? '#f5f1ea' : '#7a6f5f'}`,
                    background: isSelected ? '#f5f1ea' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {isSelected && <Check size={10} color="#1a1a1a" strokeWidth={3} />}
                  </div>
                  <span>{subj}</span>
                </div>
                <div style={{ 
                  fontSize: '12px',
                  opacity: 0.7,
                  fontFamily: '"JetBrains Mono", monospace'
                }}>
                  {subjStat.attempted > 0 ? `${subjStat.accuracy}%` : `${subjStat.total}문항`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* 초기화 */}
      {stats.total > 0 && (
        <button
          onClick={resetHistory}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            margin: '24px auto 0',
            padding: '8px 14px',
            background: 'transparent',
            border: '1px solid #d4c9b5',
            color: '#7a6f5f',
            fontSize: '12px',
            cursor: 'pointer',
            letterSpacing: '0.05em'
          }}
        >
          <Trash2 size={12} /> 학습 기록 초기화
        </button>
      )}
    </div>
  );
}

// ============ 액션 버튼 ============
function ActionButton({ onClick, icon, title, subtitle, primary, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '20px 22px',
        background: disabled ? '#e8e0d0' : (primary ? '#1a1a1a' : '#fff'),
        color: disabled ? '#a89d8a' : (primary ? '#f5f1ea' : '#1a1a1a'),
        border: `1px solid ${disabled ? '#d4c9b5' : (primary ? '#1a1a1a' : '#d4c9b5')}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.2s',
        opacity: disabled ? 0.6 : 1
      }}
    >
      <div style={{
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: primary ? 'rgba(245,241,234,0.1)' : '#f5f1ea',
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }}>{subtitle}</div>
      </div>
      <ChevronRight size={18} style={{ opacity: 0.5 }} />
    </button>
  );
}

// ============ 퀴즈 화면 ============
function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'auto', padding: '40px 12px',
        animation: 'fadeIn 0.15s',
      }}
    >
      <button
        onClick={onClose}
        aria-label="닫기"
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 10001,
          background: 'rgba(255,255,255,0.15)', color: '#fff',
          border: 'none', borderRadius: '50%', width: 44, height: 44,
          fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}
      >
        ✕
      </button>
      <img
        src={src}
        alt="확대"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          height: 'auto',
          background: '#fff',
          borderRadius: 4,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          display: 'block',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 12, left: 0, right: 0,
        textAlign: 'center', color: 'rgba(255,255,255,0.6)',
        fontSize: 12, pointerEvents: 'none',
      }}>
        탭하거나 ✕ 눌러 닫기 · 두 손가락으로 핀치 줌
      </div>
    </div>
  );
}

function QuizScreen({ question, selectedOption, showAnswer, selectAnswer, nextQuestion, isBookmarked, toggleBookmark, history, goHome, poolSize, mode }) {
  const [zoomSrc, setZoomSrc] = useState(null);

  const subjectColor = {
    [SUBJECTS.AUDIT]: '#8b5e3c',
    [SUBJECTS.SE]: '#3d6a5e',
    [SUBJECTS.DB]: '#6b4d8a',
    [SUBJECTS.SYSTEM]: '#a05a3c',
    [SUBJECTS.SECURITY]: '#3a4f7a'
  }[question.subject] || '#1a1a1a';
  
  return (
    <div className="fade-in" key={question.id}>
      {/* 상단 컨트롤 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <button 
          onClick={goHome}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            background: 'none',
            border: 'none',
            color: '#7a6f5f',
            fontSize: '13px',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <Home size={14} /> 홈
        </button>
        
        <div style={{ 
          fontSize: '11px',
          color: '#7a6f5f',
          letterSpacing: '0.1em',
          fontFamily: '"JetBrains Mono", monospace'
        }}>
          {mode === 'wrong' ? '틀린 문제 모드' : '랜덤 모드'} · POOL {poolSize}
        </div>
        
        <button
          onClick={toggleBookmark}
          style={{ 
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: isBookmarked ? '#a05a3c' : '#7a6f5f',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Bookmark size={18} fill={isBookmarked ? '#a05a3c' : 'none'} />
        </button>
      </div>
      
      {/* 문제 카드 */}
      <div style={{ 
        background: '#fff',
        padding: '28px 24px',
        border: '1px solid #d4c9b5',
        marginBottom: '16px'
      }}>
        {/* 메타 정보 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px dashed #d4c9b5'
        }}>
          <div style={{
            padding: '3px 10px',
            background: subjectColor,
            color: '#fff',
            fontSize: '11px',
            letterSpacing: '0.05em',
            fontWeight: 600
          }}>
            {question.subject}
          </div>
          <div style={{ 
            fontSize: '12px',
            color: '#7a6f5f',
            fontFamily: '"JetBrains Mono", monospace'
          }}>
            #{String(question.id).padStart(3, '0')}
          </div>
          {history && (
            <div style={{
              marginLeft: 'auto',
              fontSize: '11px',
              color: '#7a6f5f',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>시도 {history.attempts}회</span>
            </div>
          )}
        </div>
        
        {/* 문제 이미지 */}
        {question.image && (
          <div style={{ marginBottom: '24px', textAlign: 'center', position: 'relative' }}>
            <img
              src={question.image}
              alt={`문제 ${question.id}`}
              onClick={() => setZoomSrc(question.image)}
              style={{
                maxWidth: '100%',
                height: 'auto',
                border: '1px solid #d4c9b5',
                background: '#fff',
                cursor: 'zoom-in',
              }}
            />
            <div style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              padding: '3px 8px', borderRadius: 12,
              fontSize: 11, pointerEvents: 'none',
              fontFamily: 'sans-serif',
            }}>
              🔍 탭하여 확대
            </div>
          </div>
        )}

        {/* 1~4 정답 버튼 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[0, 1, 2, 3].map((idx) => {
            const isSelected = selectedOption === idx;
            const isCorrect = (idx + 1) === question.answer;
            const isWrong = showAnswer && isSelected && !isCorrect;
            const showAsCorrect = showAnswer && isCorrect;

            let bgColor = '#fff';
            let borderColor = '#d4c9b5';
            let textColor = '#1a1a1a';

            if (showAsCorrect) {
              bgColor = '#e8f0e8';
              borderColor = '#3d6a5e';
              textColor = '#3d6a5e';
            } else if (isWrong) {
              bgColor = '#f5e6e6';
              borderColor = '#a05a3c';
              textColor = '#a05a3c';
            } else if (isSelected) {
              bgColor = '#1a1a1a';
              borderColor = '#1a1a1a';
              textColor = '#f5f1ea';
            }

            return (
              <button
                key={idx}
                onClick={() => selectAnswer(idx)}
                disabled={showAnswer}
                className="slide-in"
                style={{
                  padding: '24px 0',
                  background: bgColor,
                  border: `2px solid ${borderColor}`,
                  color: textColor,
                  cursor: showAnswer ? 'default' : 'pointer',
                  fontSize: '24px',
                  fontWeight: 700,
                  fontFamily: '"JetBrains Mono", monospace',
                  transition: 'all 0.2s',
                  animationDelay: `${idx * 60}ms`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {showAsCorrect ? <Check size={26} strokeWidth={3} /> : (isWrong ? <X size={26} strokeWidth={3} /> : (idx + 1))}
              </button>
            );
          })}
        </div>
        
        {/* 답안 결과 */}
        {showAnswer && (
          <div className="pop" style={{
            marginTop: '20px',
            padding: '16px',
            background: selectedOption + 1 === question.answer ? '#e8f0e8' : '#fef5e6',
            border: `1px solid ${selectedOption + 1 === question.answer ? '#3d6a5e' : '#a05a3c'}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <div style={{ flexShrink: 0, marginTop: '2px' }}>
              {selectedOption + 1 === question.answer ? (
                <Check size={18} color="#3d6a5e" strokeWidth={3} />
              ) : (
                <AlertCircle size={18} color="#a05a3c" />
              )}
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#1a1a1a' }}>
              <strong>{selectedOption + 1 === question.answer ? '정답!' : '오답'}</strong>
              {selectedOption + 1 !== question.answer && (
                <> · 정답은 <strong>{question.answer}번</strong>입니다.</>
              )}
              <div style={{ fontSize: '12px', color: '#7a6f5f', marginTop: '4px' }}>
                {selectedOption + 1 === question.answer
                  ? '잘하셨어요! 다음 문제로 넘어가세요.'
                  : '틀린 문제는 자동으로 저장되어 다시 풀어볼 수 있어요.'}
              </div>
              {(question.explanation || question.explanationImage) && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.6)',
                  borderLeft: '3px solid #1a1a1a',
                  fontSize: '13px',
                  lineHeight: 1.7,
                  color: '#1a1a1a',
                  whiteSpace: 'pre-wrap'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '12px', letterSpacing: '0.05em' }}>해설</div>
                  {question.explanation && <div>{question.explanation}</div>}
                  {question.explanationImage && (
                    <img
                      src={question.explanationImage}
                      alt="해설 이미지"
                      onClick={() => setZoomSrc(question.explanationImage)}
                      style={{
                        marginTop: question.explanation ? '8px' : 0,
                        maxWidth: '100%',
                        height: 'auto',
                        border: '1px solid #d4c9b5',
                        background: '#fff',
                        display: 'block',
                        cursor: 'zoom-in',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* 다음 버튼 */}
      {showAnswer && (
        <button
          onClick={nextQuestion}
          className="fade-in"
          style={{
            width: '100%',
            padding: '16px',
            background: '#1a1a1a',
            color: '#f5f1ea',
            border: 'none',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            letterSpacing: '0.05em'
          }}
        >
          다음 문제 <ChevronRight size={18} />
        </button>
      )}

      {zoomSrc && <ImageLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </div>
  );
}

// ============ 통계 화면 ============
function StatsScreen({ stats, bookmarks, toggleBookmark, goHome }) {
  const bookmarkedQs = QUESTIONS.filter(q => bookmarks.has(q.id));
  
  return (
    <div className="fade-in">
      <button 
        onClick={goHome}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px',
          background: 'none',
          border: 'none',
          color: '#7a6f5f',
          fontSize: '13px',
          cursor: 'pointer',
          padding: 0,
          marginBottom: '20px'
        }}
      >
        <Home size={14} /> 홈으로
      </button>
      
      {/* 전체 통계 */}
      <div style={{
        background: '#1a1a1a',
        color: '#f5f1ea',
        padding: '28px 24px',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.2em', opacity: 0.6, fontFamily: '"JetBrains Mono", monospace', marginBottom: '8px' }}>
          OVERALL STATISTICS
        </div>
        <div style={{ fontSize: '48px', fontWeight: 900, lineHeight: 1 }}>
          {stats.accuracy}<span style={{ fontSize: '20px', opacity: 0.6 }}>%</span>
        </div>
        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', fontSize: '13px' }}>
          <div>
            <div style={{ opacity: 0.6, fontSize: '11px', letterSpacing: '0.05em' }}>풀어본 문제</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>{stats.total}</div>
          </div>
          <div>
            <div style={{ opacity: 0.6, fontSize: '11px', letterSpacing: '0.05em' }}>정답</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px', color: '#90c090' }}>{stats.correct}</div>
          </div>
          <div>
            <div style={{ opacity: 0.6, fontSize: '11px', letterSpacing: '0.05em' }}>오답</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px', color: '#e09080' }}>{stats.wrong}</div>
          </div>
        </div>
      </div>
      
      {/* 과목별 통계 */}
      <div style={{ background: '#fff', padding: '20px', border: '1px solid #d4c9b5', marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '13px',
          letterSpacing: '0.1em',
          color: '#7a6f5f',
          fontFamily: '"JetBrains Mono", monospace',
          marginBottom: '16px'
        }}>
          BY SUBJECT
        </div>
        {Object.entries(stats.subjectStats).map(([subj, data]) => (
          <div key={subj} style={{ marginBottom: '14px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
              fontSize: '14px'
            }}>
              <span style={{ fontWeight: 500 }}>{subj}</span>
              <span style={{ fontSize: '12px', color: '#7a6f5f', fontFamily: '"JetBrains Mono", monospace' }}>
                {data.attempted}/{data.total} · {data.attempted > 0 ? `${data.accuracy}%` : '-'}
              </span>
            </div>
            <div style={{ 
              height: '6px',
              background: '#f0e8d8',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${(data.attempted / data.total) * 100}%`,
                background: data.accuracy >= 70 ? '#3d6a5e' : (data.accuracy >= 40 ? '#a08040' : '#a05a3c'),
                transition: 'width 0.5s'
              }} />
            </div>
          </div>
        ))}
      </div>
      
      {/* 북마크 */}
      {bookmarkedQs.length > 0 && (
        <div style={{ background: '#fff', padding: '20px', border: '1px solid #d4c9b5' }}>
          <div style={{ 
            fontSize: '13px',
            letterSpacing: '0.1em',
            color: '#7a6f5f',
            fontFamily: '"JetBrains Mono", monospace',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Bookmark size={12} /> BOOKMARKS · {bookmarkedQs.length}
          </div>
          {bookmarkedQs.map(q => (
            <div key={q.id} style={{ 
              padding: '12px 0',
              borderBottom: '1px dashed #d4c9b5',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start'
            }}>
              <div style={{ 
                fontSize: '11px',
                color: '#7a6f5f',
                fontFamily: '"JetBrains Mono", monospace',
                flexShrink: 0,
                paddingTop: '2px'
              }}>
                #{String(q.id).padStart(3, '0')}
              </div>
              <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.5 }}>
                <div style={{ fontSize: '11px', color: '#7a6f5f', marginBottom: '4px' }}>{q.subject}</div>
                {q.image && (
                  <img src={q.image} alt={`Q${q.id}`}
                    style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', background: '#fff', border: '1px solid #d4c9b5' }} />
                )}
              </div>
              <button 
                onClick={() => toggleBookmark(q.id)}
                style={{ 
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#a05a3c',
                  display: 'flex'
                }}
              >
                <Bookmark size={16} fill="#a05a3c" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
