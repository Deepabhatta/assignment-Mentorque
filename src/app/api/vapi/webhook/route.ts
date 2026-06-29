import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateFeedbackReport } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body?.message;

    if (!message) {
      return NextResponse.json({ received: true });
    }

    console.log('Vapi webhook received:', message.type);

    // Handle end-of-call-report event
    if (message.type === 'end-of-call-report') {
      const callMetadata = message.call?.metadata || {};
      const sessionId = callMetadata.sessionId;

      if (!sessionId) {
        console.warn('No sessionId in call metadata');
        return NextResponse.json({ received: true });
      }

      // Find the session and associated user
      const session = await db.interviewSession.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });

      if (!session) {
        console.warn('Session not found for webhook:', sessionId);
        return NextResponse.json({ received: true });
      }

      // Parse the Vapi transcript artifact — array of {role, message} objects
      const vapiMessages: Array<{ role: string; message: string; time?: number }> =
        message.artifact?.messages || [];

      // Convert Vapi message format to our transcript format
      const transcript = vapiMessages
        .filter((m) => m.role === 'assistant' || m.role === 'user')
        .map((m) => ({
          role: m.role as 'assistant' | 'user',
          content: m.message || '',
          timestamp: new Date().toISOString(),
        }));

      // Save transcript to session
      await db.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          transcript: JSON.stringify(transcript),
        },
      });

      // Generate feedback report if we have enough transcript data
      if (transcript.length >= 2) {
        try {
          const evaluation = await generateFeedbackReport(
            session.type,
            {
              name: session.user.name,
              jobRole: session.user.jobRole,
              experienceLevel: session.user.experienceLevel,
            },
            transcript
          );

          await db.feedbackReport.create({
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

          console.log('Feedback report generated for session:', sessionId);
        } catch (feedbackError) {
          console.error('Error generating feedback from webhook:', feedbackError);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Vapi webhook error:', error);
    return NextResponse.json({ received: true }, { status: 200 }); // Always return 200 to Vapi
  }
}
