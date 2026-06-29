import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, jobRole, experienceLevel } = await req.json();

    if (!email || !password || !name || !jobRole || !experienceLevel) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        jobRole,
        experienceLevel,
      },
    });

    // Sign token
    const token = signToken({ userId: user.id, email: user.email });

    // Set cookie
    const response = NextResponse.json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        jobRole: user.jobRole,
        experienceLevel: user.experienceLevel,
      },
    });

    response.headers.append(
      'Set-Cookie',
      `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
    );

    return response;
  } catch (error) {
    console.error('Error during registration:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
