// "use client"

// import React, { useEffect, useState, useRef } from 'react';
// import { supabase } from '@/utils/supabase';
// import { useSession } from "next-auth/react";
// import { decode } from 'html-entities';

// import QuizEngine from '../components/QuizEngine';


// export default function QuizSetPage() {
//   const { data: session } = useSession();
//   const [questions, setQuestions] = useState<any[]>([]);
//   const [userSelections, setUserSelections] = useState<Record<string, string[]>>({});
//   const [ratings, setRatings] = useState<Record<string, number>>({});
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [hasSubmitted, setHasSubmitted] = useState(false);

//   // --- Timer State ---
//   const [seconds, setSeconds] = useState(0);
//   const timerRef = useRef<NodeJS.Timeout | null>(null);

//   // Helper to format 75 seconds -> "01:15"
//   const formatTime = (totalSeconds: number) => {
//     const mins = Math.floor(totalSeconds / 60);
//     const secs = totalSeconds % 60;
//     return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
//   };

//   const calculateScore = () => {
//     let correctCount = 0;
//     questions.forEach(q => {
//       const selected = userSelections[q.id] || [];
//       const isCorrect =
//         selected.length === q.correct_answers.length &&
//         selected.every(val => q.correct_answers.includes(val));
//       if (isCorrect) correctCount++;
//     });
//     return correctCount;
//   };

//   const score = hasSubmitted ? calculateScore() : 0;
//   const percentage = (score / questions.length) * 100;

//   useEffect(() => {
//     async function fetchQuizSet() {
//       const { data } = await supabase
//         .from('questions')
//         .select(`*, user_activity (*)`)
//         .limit(5);

//       if (data) {
//         const decodedData = data.map(q => ({
//           ...q,
//           question_text: decode(q.question_text),
//           options: q.options.map((opt: string) => decode(opt)),
//           explanation: decode(q.explanation)
//         }));
//         setQuestions(decodedData);
//         if (timerRef.current) clearInterval(timerRef.current);
//         // Start the timer as soon as questions are loaded
//         timerRef.current = setInterval(() => {
//           setSeconds(prev => prev + 1);
//         }, 1000);
//       }
//     }
//     fetchQuizSet();

//     // Cleanup timer on unmount
//     return () => {
//       if (timerRef.current) clearInterval(timerRef.current);
//     };
//   }, []);

//   const toggleOption = (qId: string, option: string) => {
//     if (hasSubmitted) return;
//     setUserSelections(prev => {
//       const current = prev[qId] || [];
//       const next = current.includes(option)
//         ? current.filter(i => i !== option)
//         : [...current, option];
//       return { ...prev, [qId]: next };
//     });
//   };

//   const handleAllSubmit = async () => {
//     // Stop the timer immediately
//     if (timerRef.current) clearInterval(timerRef.current);

//     setIsSubmitting(true);
//     const activities = questions.map(q => {
//       const selected = userSelections[q.id] || [];
//       const isCorrect =
//         selected.length === q.correct_answers.length &&
//         selected.every(val => q.correct_answers.includes(val));

//       return {
//         question_id: q.id,
//         is_correct: isCorrect,
//         user_rating: ratings[q.id] || 5,
//         user_email: session?.user?.email || "anonymous",
//       };
//     });

//     const { error } = await supabase.from('user_activity').insert(activities);
//     if (!error) setHasSubmitted(true);
//     setIsSubmitting(false);
//   };

//   const getOptionStyle = (q: any, opt: string) => {
//     const selected = userSelections[q.id] || [];
//     const isSelected = selected.includes(opt);
//     const isCorrect = q.correct_answers.includes(opt);

//     if (!hasSubmitted) {
//       // "grey" for selection in light mode, but maybe 'rgba(128, 128, 128, 0.5)' for dark compatibility?
//       return { backgroundColor: isSelected ? 'grey' : 'transparent', color: isSelected ? '#fff' : 'inherit', border: '1px solid #ccc' };
//     }

//     if (isSelected && isCorrect) return { backgroundColor: '#c6f6d5', color: '#22543d', border: '2px solid green' };
//     if (isSelected && !isCorrect) return { backgroundColor: '#fed7d7', color: '#822727', border: '2px solid red' };
//     if (!isSelected && isCorrect) return { backgroundColor: '#bee3f8', color: '#2a4365', border: '2px solid blue' };

//     return { backgroundColor: 'transparent', color: '#a0aec0', border: '1px solid #444', opacity: 0.6 };
//   };

//   if (questions.length === 0) return <p>Loading questions...</p>;

//   return (
//     <div style={{ maxWidth: '700px', margin: '2rem auto', padding: '1rem', fontFamily: 'sans-serif' }}>

//       {/* Timer Display */}
//       <div style={{ textAlign: 'right', marginBottom: '1rem', fontSize: '1.2rem', fontWeight: 'mono' }}>
//         ⏱️ {formatTime(seconds)}
//       </div>

//       {hasSubmitted && (
//         <div style={{
//           padding: '1.5rem', borderRadius: '12px',
//           border: '2px solid #0070f3', marginBottom: '2rem', textAlign: 'center'
//         }}>
//           <h2 style={{ margin: 0 }}>Quiz Complete!</h2>
//           <p style={{ fontSize: '1.2rem', margin: '10px 0' }}>
//             You scored <strong>{score}</strong> out of <strong>{questions.length}</strong> ({percentage}%) in {formatTime(seconds)}.
//           </p>
//           <div style={{ background: '#e2e8f0', height: '12px', borderRadius: '10px', overflow: 'hidden' }}>
//             <div style={{ background: '#0070f3', height: '100%', width: `${percentage}%`, transition: 'width 1s ease-in-out' }} />
//           </div>
//         </div>
//       )}

//       <h1>Daily Quiz Set</h1>

//       {questions.map((q, idx) => (
//         <div key={q.id} style={{ marginBottom: '3rem', padding: '1.5rem', border: '1px solid #eee', borderRadius: '12px' }}>
//           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//             <h3>{idx + 1}. {q.question_text}</h3>
//             {hasSubmitted && (
//               <span style={{ fontWeight: 'bold', color: (userSelections[q.id]?.every(v => q.correct_answers.includes(v)) && userSelections[q.id]?.length === q.correct_answers.length) ? 'green' : 'red' }}>
//                 {(userSelections[q.id]?.every(v => q.correct_answers.includes(v)) && userSelections[q.id]?.length === q.correct_answers.length) ? 'CORRECT' : 'INCORRECT'}
//               </span>
//             )}
//           </div>

//           <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
//             {q.options.map((opt: string) => (
//               <button
//                 key={opt}
//                 onClick={() => toggleOption(q.id, opt)}
//                 disabled={hasSubmitted}
//                 style={{
//                   padding: '12px', textAlign: 'left', borderRadius: '6px',
//                   cursor: hasSubmitted ? 'default' : 'pointer',
//                   ...getOptionStyle(q, opt)
//                 }}
//               >
//                 {opt}
//               </button>
//             ))}
//           </div>

//           {hasSubmitted && (
//             <div style={{ marginTop: '15px', padding: '15px', borderRadius: '6px', fontSize: '0.9rem', borderLeft: '4px solid #0070f3' }}>
//               <strong>Why?</strong> {q.explanation}
//             </div>
//           )}

//           {!hasSubmitted && (
//             <div style={{ marginTop: '15px' }}>
//               <label style={{ fontSize: '0.8rem' }}>Rate difficulty (1-10):</label>
//               <input
//                 type="range" min="1" max="10"
//                 value={ratings[q.id] || 5}
//                 onChange={(e) => setRatings({ ...ratings, [q.id]: parseInt(e.target.value) })}
//                 style={{ width: '100%' }}
//               />
//             </div>
//           )}
//         </div>
//       ))}

//       {!hasSubmitted ? (
//         <button
//           onClick={handleAllSubmit}
//           disabled={isSubmitting}
//           style={{ width: '100%', padding: '15px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
//         >
//           {isSubmitting ? "Submitting..." : "Submit All Answers"}
//         </button>
//       ) : (
//         <button
//           onClick={() => window.location.reload()}
//           style={{ width: '100%', padding: '15px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
//         >
//           Take Another Quiz
//         </button>
//       )}
//     </div>
//   );
// }