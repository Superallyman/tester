//QuestionList.tsx

"use client";

import React, { useState, useEffect } from "react";
import { CategoryDropdown } from "./Category_Dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import Phrase_Searcher from "./Phrase_Searcher";
import { Label } from "../ui/label";

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

const fetchQuestions = async (): Promise<Question[]> => {
  const response = await fetch("/api/questions", {
    next: {
      revalidate: 0,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch questions");
  }

  const data: Question[] = await response.json();
  return data;
};

interface CategoryDropdownProps {
  sharedCategories?: string[];
  setSharedCategories?: (categories: string[]) => void;
}

interface PhraseProps {
  Phrase?: string | null; // Make it optional
  setPhrase?: (categories: string) => void; // Make it optional
}

export default function QuestionList({ sharedCategories = [], setSharedCategories, Phrase, setPhrase }: CategoryDropdownProps & PhraseProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [numberOfQuestions, setNumberOfQuestions] = useState<number>(1);
  const [specificID, setSpecificID] = useState<string>("");
  const [userSelections, setUserSelections] = useState<{ [key: number]: string[] }>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [phraseMessage, setPhraseMessage] = useState<string | null>("With phrase (priority)");

  // State for holding randomization state to prevent issues during SSR
  // const [randomizationKey, setRandomizationKey] = useState<number>(0);

  // Effect hook for fetching questions
  useEffect(() => {
    fetchQuestions()
      .then((data) => {
        setQuestions(data);
      })
      .catch((error) => setError(error.message));
  }, []);

  // // Effect hook to trigger randomization only after mounting on the client side
  // useEffect(() => {
  //   // Set a randomization key when the component mounts
  //   setRandomizationKey(Math.random());
  // }, []);

  const searchQuestionsByPhrase = (allQuestions: Question[], count: number, Phrase: string) => {
    if (!Phrase.trim()) {
      console.log("No phrase typed");
      return [];
    }

    console.log("Searching for phrase in questions, options, and explanations...");

    // Normalize the search phrase: Convert to lowercase and remove punctuation
    const normalizeText = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, "");

    const normalizedPhrase = normalizeText(Phrase);

    // Filter questions based on matching normalized text
    const matchingQuestions = allQuestions.filter((q) => {
      return (
        normalizeText(q.question).includes(normalizedPhrase) || // Search in question text
        (q.explanation && normalizeText(q.explanation).includes(normalizedPhrase)) || // Search in explanation (if it exists)
        (q.options && q.options.some((option) => normalizeText(option).includes(normalizedPhrase))) // Search in options (if they exist)
      );
    });

    if (matchingQuestions.length === 0) {
      console.log("No questions found for the given phrase");
      setPhraseMessage("No match found... using random question(s) ");
      setTimeout(() => {
        setPhraseMessage("Phrase Search");
      }, 1000);
      return [];
    }

    const safeCount = Math.min(count, matchingQuestions.length);
    console.log("safeCount:", safeCount);
    return [...matchingQuestions].sort(() => 0.5 - Math.random()).slice(0, safeCount);
  };

  const selectRandomQuestions = (allQuestions: Question[], count: number, sharedCategories: string[], Phrase: string | null | undefined) => {
    // First, check if there's a phrase search
    if (!Phrase || !Phrase.trim()) {
      console.log("No phrase typed");
    } else {
      const phraseResults = searchQuestionsByPhrase(allQuestions, count, Phrase);
      if (phraseResults.length > 0) return phraseResults;
    }

    // If no phrase search results, proceed with category filtering
    if (sharedCategories.length === 0) {
      console.log("No categories selected, returning random questions");

      const safeCount = Math.min(count, allQuestions.length);
      return [...allQuestions].sort(() => 0.5 - Math.random()).slice(0, safeCount); // Returns random questions from any category
    } else {
      console.log("Filtering by categories:", sharedCategories.join(", "));

      // Filter only questions that match the selected categories
      const filteredQuestions = allQuestions.filter((q) => sharedCategories.includes(q.category));

      if (filteredQuestions.length === 0) {
        console.log("No questions found for selected categories");
        return [];
      }

      const safeCount = Math.min(count, filteredQuestions.length);
      return [...filteredQuestions].sort(() => 0.5 - Math.random()).slice(0, safeCount);
    }
  };

  const generateRandomQuestions = () => {
    console.log(sharedCategories);

    const randomQuestions = selectRandomQuestions(questions, numberOfQuestions, sharedCategories, Phrase);
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
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>
                <div className="flex items-center space-x-2">
                  <div className="">
                    <Label>Number of Questions</Label>

                    <Input
                      type="number"
                      id="questionCount"
                      min="1"
                      max={questions.length}
                      value={numberOfQuestions}
                      onChange={(e) => setNumberOfQuestions(parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>{"From Categories (defaults to all)"}</Label>

                    <CategoryDropdown
                      sharedCategories={sharedCategories}
                      setSharedCategories={setSharedCategories}
                    />
                  </div>
                  <div>
                    <Label>{phraseMessage}</Label>
                    <Phrase_Searcher
                      Phrase={Phrase ? Phrase : ""}
                      setPhrase={setPhrase}
                    />
                  </div>
                  <Button
                    onClick={generateRandomQuestions}
                    disabled={questions.length === 0}>
                    Generate
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center space-x-2">
                  <div>
                    <Label>{"Find Specific ID (comma separated)"}</Label>
                    <Input
                      type="text"
                      id="idSelect"
                      placeholder="Enter ID(s)"
                      value={specificID}
                      onChange={(e) => setSpecificID(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={generateSpecificQuestions}
                    disabled={questions.length === 0}>
                    Generate
                  </Button>
                </div>
              </TableCell>
              <TableCell>{/* Possibly you may have another field or dropdown here */}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <h1>Selected Questions</h1>
      <div>
        {selectedQuestions.map((question, questionIndex) => (
          <div
            className="my-5"
            key={questionIndex}>
            <h2>ID: {question.id}</h2>
            <h2>
              {question.question.split("&#10;").map((line, index) => (
                <React.Fragment key={index}>
                  {line}
                  {index < question.question.split("&#10;").length - 1 && <br />}
                </React.Fragment>
              ))}
            </h2>
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => (
                <Button
                  key={optionIndex}
                  variant={
                    submitted
                      ? question.answers.includes(option)
                        ? userSelections[questionIndex]?.includes(option) //if choice was right after submission -- this should be green!
                          ? "default" //style for the CORRECT answer that WAS selected -- should be green
                          : "outline" //style for the CORRECT answer that WASN'T selected -- should be blue
                        : userSelections[questionIndex]?.includes(option) //if choice was wrong after submission
                        ? "destructive" //style for the options that were selected but were WRONG -- should be red
                        : "secondary" // style for the options that weren't selected at all -- should be neutral
                      : userSelections[questionIndex]?.includes(option) //user selections BEFORE submission
                      ? "default"
                      : "secondary"
                  }
                  // className="w-full text-left"

                  className={
                    submitted
                      ? question.answers.includes(option)
                        ? userSelections[questionIndex]?.includes(option) //if choice was right after submission -- this should be green!
                          ? "w-full bg-green-500" //style for the CORRECT answer that WAS selected -- should be green
                          : "w-full bg-blue-500" //style for the CORRECT answer that WASN'T selected -- should be blue
                        : userSelections[questionIndex]?.includes(option) //if choice was wrong after submission
                        ? "w-full bg-red-500" //style for the options that were selected but were WRONG -- should be red
                        : "w-full secondary" // style for the options that weren't selected at all -- should be neutral
                      : "w-full"
                  }
                  onClick={() => toggleOptionSelection(questionIndex, option)}>
                  {/* Option {optionIndex + 1}:{" "} */}
                  {option.split("&#10;").map((line, index) => (
                    <React.Fragment key={index}>
                      <p>{line}</p>
                      {index < option.split("&#10;").length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </Button>
              ))}
            </div>
            {submitted && (
              <>
                <div
                  className={`mt-4 p-2 rounded 
                    ${isCorrectSelection(questionIndex) ? "bg-green-500" : "bg-red-500 "}
                `}>
                  {isCorrectSelection(questionIndex) ? "Correct!" : "Incorrect."}
                </div>
                {!isCorrectSelection(questionIndex) && (
                  <div className="mt-2">
                    <strong>Correct Answers:</strong>
                    {question.answers.map((answer, idx) => (
                      <div key={idx}>
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
        <Button
          onClick={handleSubmit}
          // className="w-full bg-blue-500 text-white p-2 rounded mt-4"
          className="w-full bg-teal-500"
          variant={"outline"}>
          Submit Answers
        </Button>
      )}
    </div>
  );
}
