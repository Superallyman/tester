"use client"

import React, { useEffect, useState } from 'react';
import QuestionSelector from './components/QuestionSelector';
import QuizEngine from './components/QuizEngine';
import DailyProgress from './components/DailyProgress';
import SmartReview from './components/SmartReview';
import { PENDING_QUIZ_KEY } from './exam/examUtils';

export default function PracticePage() {
  const [activeQuestionIds, setActiveQuestionIds] = useState<string[]>([]);

  // Other pages (e.g. practice exam results) can hand off a set of questions to drill here
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(PENDING_QUIZ_KEY);
      if (pending) {
        sessionStorage.removeItem(PENDING_QUIZ_KEY);
        const ids = JSON.parse(pending);
        if (Array.isArray(ids) && ids.length) setActiveQuestionIds(ids);
      }
    } catch { /* storage unavailable */ }
  }, []);

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>

      {activeQuestionIds.length === 0 ? (
        <div>
          <DailyProgress />
          <SmartReview onQuestionsFound={(ids) => setActiveQuestionIds(ids)} />
          <h2 style={{ fontSize: '0.75rem', letterSpacing: '0.06em', opacity: 0.6, fontWeight: 600, margin: '1.75rem 0 0.6rem' }}>TEST CUSTOMIZER</h2>
          <QuestionSelector onQuestionsFound={(ids) => setActiveQuestionIds(ids)} />
          <p style={{ textAlign: 'center', opacity: 0.5, marginTop: '1.5rem' }}>
            Use the filters above to build a custom quiz.
          </p>
        </div>
      ) : (
        <QuizEngine key={activeQuestionIds.join(',')} questionIds={activeQuestionIds} />
      )}
    </main>
  );
}