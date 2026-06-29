import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { generateFeedbackReport } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Retrieve session with user profile info
    const session = await db.interviewSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Update status to completed
    await db.interviewSession.update({
      where: { id: sessionId },
      data: { status: 'completed' },
    });

    // Check if feedback report already exists
    const existingReport = await db.feedbackReport.findUnique({
      where: { sessionId },
    });

    if (existingReport) {
      return NextResponse.json({ report: existingReport });
    }

    // Parse transcript
    const transcript = JSON.parse(session.transcript || '[]');

    // If transcript is empty or too short, create default minimal report
    if (transcript.length < 2) {
      const minimalReport = await db.feedbackReport.create({
        data: {
          sessionId,
          overallScore: 0,
          communicationScore: 1,
          technicalScore: 1,
          positivePoints: JSON.stringify(['No speech recorded']),
          improvementPoints: JSON.stringify(['Interview ended early']),
          detailedAnalysis: 'This interview was terminated immediately after starting. No responses were captured.',
        },
      });
      return NextResponse.json({ report: minimalReport });
    }

    // Generate evaluation from OpenAI LLM
    const evaluation = await generateFeedbackReport(
      session.type,
      {
        name: session.user.name,
        jobRole: session.user.jobRole,
        experienceLevel: session.user.experienceLevel,
      },
      transcript
    );

    // Save report in PostgreSQL
    const report = await db.feedbackReport.create({
      data: {
        sessionId,
        overallScore: evaluation.overallScore,
        communicationScore: evaluation.communicationScore,
        technicalScore: evaluation.technicalScore,
        starScore: evaluation.starScore || null,
        positivePoints: JSON.stringify(evaluation.positivePoints),
        improvementPoints: JSON.stringify(evaluation.improvementPoints),
        detailedAnalysis: evaluation.detailedAnalysis,
      },
    });

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error ending interview & creating report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
