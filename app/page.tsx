"use client"

import React, { useEffect, useState } from 'react';
import QuestionSelector from './components/QuestionSelector';
import QuizEngine from './components/QuizEngine';
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

      {/* 1. The Brain */}
      {activeQuestionIds.length == 0 ? (
        <div>
          <SmartReview onQuestionsFound={(ids) => setActiveQuestionIds(ids)} />
          <h1>Test Customizer</h1>
          <QuestionSelector onQuestionsFound={(ids) => setActiveQuestionIds(ids)} />
        </div>
      ) : (
        <></>
      )}

      <hr style={{ margin: '2rem 0', opacity: 0.2 }} />

      {/* 2. The Body (only shows when IDs are found) */}
      {activeQuestionIds.length > 0 ? (
        <QuizEngine key={activeQuestionIds.join(',')} questionIds={activeQuestionIds} />
      ) : (
        <p style={{ textAlign: 'center', opacity: 0.5 }}>
          Use filters above create a custom quiz session.
        </p>
      )}
    </main>
  );
}