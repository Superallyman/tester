import React from "react";
import QuestionList from "./QuestionList";

export default function page() {
  return (
    <div>
        <nav>
            <a href="/questions">All Questions</a>
            <a href="/questions/new">New Question</a>
        </nav>
      <QuestionList />
    </div>
  );
}
