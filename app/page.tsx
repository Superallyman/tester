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
    <main style={{ maxWidth: '820px', margin: '0 auto', padding: '2rem 1rem 4rem' }}>

      {activeQuestionIds.length === 0 ? (
        <div>
          <DailyProgress />
          <SmartReview onQuestionsFound={(ids) => setActiveQuestionIds(ids)} />
          <h2 className="orbit-label" style={{ margin: '1.75rem 0 0.6rem' }}>Test Customizer</h2>
          <QuestionSelector onQuestionsFound={(ids) => setActiveQuestionIds(ids)} />
          <p className="orbit-muted" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            Use the filters above to build a custom quiz.
          </p>
        </div>
      ) : (
        <QuizEngine key={activeQuestionIds.join(',')} questionIds={activeQuestionIds} />
      )}
    </main>
  );
}