"use client";

import React from "react";

interface Question {
  id: number;
  times_correct: number;
  attempts: number;
  category: string;
  option_count: number;
  answer_count: number;
  question: string;
  options: string[];
  answers: string[];
  explanation: string;
}

async function fetchQuestions(): Promise<Question[]> {
  const response = await fetch("/api/questions",{
    next: {
        revalidate: 0  // Disable revalidation so that fres data is fetched every time the page is loaded 
    }
  });
  if (!response.ok) {
    throw new Error("Failed to fetch questions");
  }
  const data = await response.json();
  return data;
}

export default function QuestionList() {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchQuestions()
      .then((data) => setQuestions(data))
      .catch((error) => setError(error.message));
  }, []);

  if (error) {
    return (
      <div className="card">
        <h2>{error}</h2>
      </div>
    );
  }

  return (
    <div>
        <h1>ALL QUESTIONS</h1>
      <div>
        {questions.map((question, questionIndex) => (
          // `questionIndex` is the current index of the element in the `questions` array
          // It is used as a unique key for each <div> element
          <div
            className="card my-5"
            key={questionIndex}>
            <h2>ID: {question.id}</h2>
            <h2>Question: {question.question}</h2>
            {question.options.map((option, optionIndex) => (
              // `optionIndex` is the current index of the element in the `options` array
              // It is used as a unique key for each <p> element within the options
              <div key={optionIndex}>
                <h3>
                  Option {optionIndex + 1}: {option}
                </h3>
              </div>
            ))}
            {question.answers.map((answer, answerIndex) => (
              <h4 key={answerIndex}>
                Answer {answerIndex + 1}: {answer}
              </h4>
            ))}
            <h2>{question.explanation}</h2>
            <h3>Classification: {question.category}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
