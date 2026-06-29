import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { generateSpeechAudio } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { interviewType } = await req.json();
    if (!interviewType) {
      return NextResponse.json({ error: 'Interview type is required' }, { status: 400 });
    }

    // Create session in PostgreSQL
    const session = await db.interviewSession.create({
      data: {
        userId: user.id,
        type: interviewType,
        status: 'ongoing',
        difficulty: 3, // starts at mid-level 3 (1-5 range)
        currentStage: 'intro',
        transcript: '[]',
      },
    });

    // Generate natural opening intro & first question based on interview type
    let introText = '';
    const name = user.name;
    const role = user.jobRole;
    const level = user.experienceLevel;

    if (interviewType === 'Behavioral') {
      introText = `Hello ${name}! Welcome. I'm Sarah, your interviewer today. I see you're applying for a ${level} ${role} role, and we'll be focusing on a behavioral evaluation. We want to understand your communication, teamwork, and how you handle real projects, ideally following a STAR format. Let's kick off: Can you describe a challenging project you worked on recently, what your specific role was, and what made it particularly difficult?`;
    } else if (interviewType === 'Technical') {
      introText = `Hello ${name}! I'm Alex, and I'll be conducting your technical depth interview today. For this ${level} ${role} position, we'll dive into technical problem solving and your actual expertise. Let's start with a foundational concept: Can you explain how you handle state management in a complex, large-scale application, and how you choose between different state architectures?`;
    } else if (interviewType === 'System Design') {
      introText = `Hi ${name}. I'm Marcus, your system design interviewer. We're going to design a distributed, high-scale application suitable for a ${level} ${role}. To start off, imagine you're tasked with building a real-time notification service that must send millions of push notifications and emails daily with low latency and high reliability. How would you approach designing the high-level architecture?`;
    } else { // HR / Culture Fit
      introText = `Hello ${name}! I'm Emily, and I'm looking forward to our culture fit conversation today. We want to see how you align with our core values, your motivators, and how you work with cross-functional partners as a ${level} ${role}. To get started, what attracted you to this company, and what kind of work environment enables you to perform at your absolute best?`;
    }

    // Update session transcript with assistant's first message
    const initialMessage = {
      role: 'assistant',
      content: introText,
      timestamp: new Date().toISOString(),
    };
    
    await db.interviewSession.update({
      where: { id: session.id },
      data: {
        transcript: JSON.stringify([initialMessage]),
      },
    });

    // Generate Text to Speech
    const audioBase64 = await generateSpeechAudio(introText);

    return NextResponse.json({
      sessionId: session.id,
      text: introText,
      audio: audioBase64, // base64 string (or empty if OpenAI is not set)
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
