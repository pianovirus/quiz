// 연도별 기출문제 데이터를 자동으로 로드합니다.
// src/data/ 폴더에 새 파일(예: 2024.js, 2023.js)을 추가하면
// 별도 등록 절차 없이 자동으로 포함됩니다.
//
// 각 파일은 `export default [ {id, subject, question, options, answer}, ... ]` 형태여야 합니다.

const modules = import.meta.glob('./[0-9][0-9][0-9][0-9].js', { eager: true });

export const QUESTIONS_BY_YEAR = {};
const allQuestions = [];
const seenIds = new Set();

for (const path of Object.keys(modules).sort()) {
  const year = path.match(/(\d{4})\.js$/)?.[1];
  if (!year) continue;
  const list = modules[path].default ?? [];
  // id 충돌 방지: 연도 prefix를 붙여 전역 고유 id 생성
  const prefixed = list.map(q => ({
    ...q,
    year,
    originalId: q.id,
    id: `${year}-${q.id}`,
  }));
  QUESTIONS_BY_YEAR[year] = prefixed;
  for (const q of prefixed) {
    if (seenIds.has(q.id)) {
      console.warn(`[data] 중복된 문제 id: ${q.id}`);
      continue;
    }
    seenIds.add(q.id);
    allQuestions.push(q);
  }
}

export const QUESTIONS = allQuestions;
export const YEARS = Object.keys(QUESTIONS_BY_YEAR).sort();
