import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ message: 'Logout successful' });
  
  // Set expired cookie to clear it
  response.headers.append(
    'Set-Cookie',
    'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
  );

  return response;
}
