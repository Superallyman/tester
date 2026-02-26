// import { NextResponse } from 'next/server'
// import { supabase } from '@/utils/supabase'
// import questions from '@/db/test_bank.json'

// import questionsData from '@/db/test_bank.json'

// export async function GET() {
//   const formattedQuestions = questionsData.questions.map((q) => ({
//     category: q.category,
//     question_text: q.question,          // rename
//     options: q.options,
//     correct_answers: q.answers,         // rename
//     explanation: q.explanation,
//   }))

//   const { data, error } = await supabase
//     .from('questions')
//     .insert(formattedQuestions)
//     .select()

//   if (error) {
//     return Response.json({ error }, { status: 500 })
//   }

//   return Response.json({
//     message: 'Inserted successfully',
//     count: data.length,
//   })
// }