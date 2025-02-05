import { NextResponse } from 'next/server'

const url = process.env.QUESTION_DB_URL


// const questionDB = "https://jsonplaceholder.typicode.com/todos"
const questionDB: string = url as string

export async function GET() {
  try {
    const response = await fetch(questionDB);
    if (!response.ok) {
      return NextResponse.error();
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.error();
  }
}