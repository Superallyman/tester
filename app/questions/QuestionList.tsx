"use client";

import React, { useState } from "react";

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
  const response = await fetch("/api/questions", {
    next: {
      revalidate: 0,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch questions");
  }
  return response.json();
}

export default function QuestionList() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [numberOfQuestions, setNumberOfQuestions] = useState<number>(1);
  const [specificID, setSpecificID] = useState<string>("");
  const [userSelections, setUserSelections] = useState<{ [key: number]: string[] }>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    fetchQuestions()
      .then((data) => {
        setQuestions(data);
      })
      .catch((error) => setError(error.message));
  }, []);

  const selectRandomQuestions = (allQuestions: Question[], count: number) => {
    const safeCount = Math.min(count, allQuestions.length);
    return [...allQuestions].sort(() => 0.5 - Math.random()).slice(0, safeCount);
  };

  const generateRandomQuestions = () => {
    const randomQuestions = selectRandomQuestions(questions, numberOfQuestions);
    setSelectedQuestions(randomQuestions);

    const initialSelections = randomQuestions.reduce<{ [key: number]: string[] }>((acc, _, index) => {
      acc[index] = [];
      return acc;
    }, {});
    setUserSelections(initialSelections);
    setSubmitted(false);
  };

  const generateSpecificQuestions = () => {
    // Parse IDs, handling comma-separated list
    const ids = specificID
      .split(",")
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id));

    // Find questions matching the specific IDs

    const specificQuestions = questions.filter((q) => ids.map(String).includes(String(q.id)));

    setSelectedQuestions(specificQuestions);

    const initialSelections = specificQuestions.reduce<{ [key: number]: string[] }>((acc, _, index) => {
      acc[index] = [];
      return acc;
    }, {});
    setUserSelections(initialSelections);
    setSubmitted(false);
  };

  const toggleOptionSelection = (questionIndex: number, option: string) => {
    if (submitted) return;

    setUserSelections((prev) => {
      const currentSelections = prev[questionIndex] || [];
      const isSelected = currentSelections.includes(option);

      const newSelections = isSelected ? currentSelections.filter((item) => item !== option) : [...currentSelections, option];

      return {
        ...prev,
        [questionIndex]: newSelections,
      };
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
  };

  const isCorrectSelection = (questionIndex: number) => {
    const question = selectedQuestions[questionIndex];
    const userSelected = userSelections[questionIndex] || [];

    return userSelected.length === question.answers.length && userSelected.every((selection) => question.answers.includes(selection));
  };

  if (error) {
    return (
      <div className="card">
        <h2>{error}</h2>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <table>
          <thead>
            <tr>
              <th>
                <label
                  htmlFor="questionCount"
                  className="block mb-2 bg-opacity-0">
                  Number of Questions
                </label>
              </th>
              <th>
                <label
                  htmlFor="questionCount"
                  className="block mb-2 bg-opacity-0">
                  Specific ID
                </label>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="mb-4 flex items-center space-x-2">
                  <input
                    type="number"
                    id="questionCount"
                    min="1"
                    max={questions.length}
                    value={numberOfQuestions}
                    onChange={(e) => setNumberOfQuestions(parseInt(e.target.value))}
                    className="border rounded p-2 w-full bg-blue-500 bg-opacity-50"
                  />
                  <button
                    onClick={generateRandomQuestions}
                    className="bg-blue-500 text-white p-2 rounded"
                    disabled={questions.length === 0}>
                    Generate
                  </button>
                </div>
              </td>
              <td>
                <div className="mb-4 flex items-center space-x-2">
                  <input
                    type="text"
                    id="idSelect"
                    placeholder="Enter ID(s)"
                    value={specificID}
                    onChange={(e) => setSpecificID(e.target.value)}
                    className="border rounded p-2 w-full bg-blue-500 bg-opacity-50"
                  />
                  <button
                    onClick={generateSpecificQuestions}
                    className="bg-blue-500 text-white p-2 rounded"
                    disabled={questions.length === 0}>
                    Generate
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h1>Selected Questions</h1>
      <div>
        {selectedQuestions.map((question, questionIndex) => (
          <div
            className="card my-5"
            key={questionIndex}>
            <h2>ID: {question.id}</h2>
            <h2>
              {" "}
              {question.question.split("&#10;").map((line, index) => (
                <React.Fragment key={index}>
                  {line}
                  {index < question.question.split("&#10;").length - 1 && <br />}
                </React.Fragment>
              ))}
            </h2>
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => (
                <button
                  key={optionIndex}
                  onClick={() => toggleOptionSelection(questionIndex, option)}
                  className={`
                    w-full text-left p-2 rounded 
                    ${
                      submitted
                        ? question.answers.includes(option) // Correct answer
                          ? userSelections[questionIndex]?.includes(option) // If the correct answer was selected
                            ? "bg-green-500 bg-opacity-40" // Highlight selected correct answer in green
                            : "bg-blue-500 bg-opacity-40" // Highlight unselected correct answer in blue
                          : userSelections[questionIndex]?.includes(option) // Incorrect answer selected
                          ? "bg-red-500 bg-opacity-40" // Highlight selected incorrect answer in red
                          : "bg-gray-500 bg-opacity-20" // Neutral background for unselected incorrect answers
                        : userSelections[questionIndex]?.includes(option) // During selection phase
                        ? "bg-blue-400 bg-opacity-80" // Highlight currently selected option in blue
                        : "bg-gray-500 bg-opacity-20" // Neutral background for unselected options
                    }
                  `}>
                  Option {optionIndex + 1}:{" "}
                  {option.split("&#10;").map((line, index) => (
                    <React.Fragment key={index}>
                      {line}
                      {index < option.split("&#10;").length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </button>
              ))}
            </div>
            {submitted && (
              <>
                <div
                  className={`
                  mt-4 p-2 rounded 
                  ${isCorrectSelection(questionIndex) ? "bg-green-400 bg-opacity-40" : "bg-red-300 bg-opacity-40"}
                `}>
                  {isCorrectSelection(questionIndex) ? "Correct!" : "Incorrect."}
                </div>
                {!isCorrectSelection(questionIndex) && (
                  <div className="mt-2">
                    <strong>Correct Answers:</strong>
                    {question.answers.map((answer, idx) => (
                      <div key={idx}>
                        {" "}
                        {answer.split("&#10;").map((line, index) => (
                          <React.Fragment key={index}>
                            {line}
                            {index < answer.split("&#10;").length - 1 && <br />}
                          </React.Fragment>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2">
                  {question.explanation.split("&#10;").map((line, index) => (
                    <React.Fragment key={index}>
                      {line}
                      {index < question.explanation.split("&#10;").length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </p>
                <p>
                  <b>Classification: {question.category}</b>
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      {selectedQuestions.length > 0 && !submitted && (
        <button
          onClick={handleSubmit}
          className="w-full bg-blue-500 text-white p-2 rounded mt-4">
          Submit Answers
        </button>
      )}
    </div>
  );
}
