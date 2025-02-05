// Phrase_Searcher.tsx

"use client";

import React from "react";
import { Input } from "@/components/ui/input";


interface PhraseProps {
    Phrase?: string; // Make it optional
    setPhrase?: (categories: string) => void; // Make it optional
  }
  

export default function Phrase_Searcher({ setPhrase }: PhraseProps) {
  return (
    <div>
      <div>
        <Input
          type="text"
          id="phraseSelect"
          placeholder="Search Phrase"
        //   value={'hi'}
          onChange={(e) => setPhrase && setPhrase(e.target.value)}
        />
      </div>
    </div>
  );
}
