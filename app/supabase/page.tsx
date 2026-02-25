"use client"

import React, { useState } from 'react';
import QuestionSelector from '../components/QuestionSelector';
import QuizEngine from '../components/QuizEngine';

export default function PracticePage() {
  const [activeQuestionIds, setActiveQuestionIds] = useState<string[]>([]);

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>

      {/* 1. The Brain */}
      {activeQuestionIds.length == 0 ? (
        <div>
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