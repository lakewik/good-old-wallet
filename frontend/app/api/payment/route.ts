import { NextResponse } from "next/server"

export async function POST() {
  // Simulate network delay for the "API call"
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Return a success response
  return NextResponse.json({ success: true, message: "Payment request processed" })
}
