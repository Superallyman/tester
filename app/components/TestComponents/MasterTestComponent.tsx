"use client";

import React, { useState } from "react";
import QuestionList from "./QuestionList";

export default function MasterTestComponent() {
  const [sharedCategories, setSharedCategories] = useState<string[]>([]);

  const [Phrase, setPhrase] = useState<string>();

  return (
    <div>

      {/* You can now use sharedCategories elsewhere */}
      {/* <p>Selected Categories: {sharedCategories.join(", ")}</p> */}

      <div>
        <QuestionList
          sharedCategories={sharedCategories}
          setSharedCategories={setSharedCategories}
          Phrase={Phrase}
          setPhrase={setPhrase}
        />
      </div>
    </div>
  );
}
