//Category_Dropdown.tsx

"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import * as React from "react";

interface CategoryDropdownProps {
  sharedCategories?: string[];
  setSharedCategories?: (categories: string[]) => void;
}

// Use the complete Question interface from QuestionList.tsx
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
export function CategoryDropdown({ 
  sharedCategories = [], 
  setSharedCategories 
}: CategoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const response = await fetch("/api/questions");
        const data = await response.json();

        if (Array.isArray(data)) {
          const uniqueCategories = Array.from(new Set(data.map((q: Question) => q.category)));
          setCategories(uniqueCategories);
        } else {
          console.error("data.questions is not an array or is undefined");
        }
      } catch (error) {
        console.error("Error fetching questions:", error);
      }
    };

    fetchQuestions();
  }, []);

  const toggleCategory = (category: string) => {
    if (!setSharedCategories) return;
    
    setSharedCategories(
      sharedCategories.includes(category)
        ? sharedCategories.filter((c) => c !== category)
        : [...sharedCategories, category]
    );
  };
  
  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[300px] justify-between">
            {sharedCategories.length > 0 ? `${sharedCategories.length} categories selected` : "Select categories..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>No category found.</CommandEmpty>
              <CommandGroup heading="Categories">
                {categories.map((category) => (
                  <CommandItem 
                    key={category}
                    value={category}
                    onSelect={() => toggleCategory(category)}
                  >
                    {category}
                    <Check 
                      className={cn(
                        "ml-auto h-4 w-4", 
                        sharedCategories.includes(category) ? "opacity-100" : "opacity-0"
                      )} 
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}