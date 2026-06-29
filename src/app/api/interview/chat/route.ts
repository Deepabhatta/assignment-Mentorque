import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { generateChatResponse, generateSpeechAudio } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, text } = await req.json();
    if (!sessionId || !text) {
      return NextResponse.json({ error: 'Session ID and text are required' }, { status: 400 });
    }

    // Retrieve session and associated user profile
    const session = await db.interviewSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.status !== 'ongoing') {
      return NextResponse.json({ error: 'Active session not found' }, { status: 404 });
    }

    // Parse transcript
    const transcript = JSON.parse(session.transcript || '[]');

    // Append candidate's response
    const candidateMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    transcript.push(candidateMessage);

    // Determine current interview state
    const userMessageCount = transcript.filter((m: any) => m.role === 'user').length;
    let nextStage = session.currentStage;
    let nextDifficulty = session.difficulty;

    // Check if it's time to transition to wrapUp
    // Standard mock interview: 5 questions from AI, 5 user responses.
    if (userMessageCount >= 5 && session.currentStage === 'intro') {
      nextStage = 'QA'; // Intermediate stage
    }
    if (userMessageCount >= 8 && nextStage !== 'wrapUp') {
      nextStage = 'wrapUp';
    }

    // Build the specialized system prompt for the AI interviewer state machine
    let systemPrompt = '';
    const name = session.user.name;
    const role = session.user.jobRole;
    const level = session.user.experienceLevel;
    const type = session.type;

    if (nextStage === 'wrapUp') {
      systemPrompt = `You are an AI interviewer named ${type === 'Behavioral' ? 'Sarah' : type === 'Technical' ? 'Alex' : type === 'System Design' ? 'Marcus' : 'Emily'}.
Conducting a ${type} interview for a ${level} ${role} named ${name}.
We are at the END of the interview (Wrap-up stage).
Your task is to close the interview naturally and professionally.
Acknowledge the candidate's last answer, express appreciation, and ask one final question to close (e.g., if they have any final comments or questions about the next steps). Keep it brief, warm, and natural.`;
    } else {
      // Main QA / Loop stage - branching & adaptive behavior
      const stageInstructions = {
        Behavioral: `You are Sarah, a professional behavioral interviewer.
You check for communication skills, STAR structure (Situation, Task, Action, Result), and self-awareness.
- Current candidate: ${name}, applying for ${level} ${role}.
- Current difficulty level: ${nextDifficulty}/5.
- Core rules:
  1. Do NOT move on a fixed script.
  2. Ask exactly ONE question at a time. Keep it brief and conversational.
  3. If their last answer was vague, incomplete, or lacked concrete details, DO NOT move to a new topic. Dig deeper! Ask a probing follow-up like: "What was the specific action you took there?", "What would you have done differently?", or "Can you walk me through the results of that?"
  4. If their answer was strong and detailed, acknowledge it briefly and transition to a slightly harder situation (increase technical or behavioral complexity).
  5. Check if they mention metrics/results. If not, ask about the outcome.`,

        Technical: `You are Alex, a senior technical interviewer conducting a technical depth round.
You evaluate core computer science knowledge, problem-solving, architectural choices, and technical communication.
- Current candidate: ${name}, applying for ${level} ${role}.
- Current difficulty level: ${nextDifficulty}/5.
- Core rules:
  1. Ask exactly ONE question at a time.
  2. Do not let the candidate escape with high-level descriptions. If they mention a technology or library, challenge them on why they used it, how it works under the hood, or what its trade-offs/limitations are.
  3. Adapt the difficulty: If they answer correctly, increase the complexity (e.g. ask about edge cases, race conditions, concurrency, memory usage). If they struggle, guide them slightly or pivot to a simpler concept to find their boundaries.`,

        'System Design': `You are Marcus, a staff systems architect conducting a system design round.
You evaluate scalability, database choices, load balancing, caching, bottlenecks, and failure modes.
- Current candidate: ${name}, applying for ${level} ${role}.
- Current difficulty level: ${nextDifficulty}/5.
- Core rules:
  1. Ask exactly ONE question at a time.
  2. The candidate is designing a high-scale system. If they present an architecture, push back on potential failure points: "What happens if that database node goes down?", "How do you handle a sudden spike in traffic?", "How do you prevent data inconsistency?"
  3. Dig into concrete tradeoffs (e.g. SQL vs. NoSQL, polling vs. WebSockets, synchronous vs. asynchronous processing).`,

        HR: `You are Emily, an HR director conducting a cultural fit interview.
You evaluate motivation, values, alignment, and situational soft-skill judgments.
- Current candidate: ${name}, applying for ${level} ${role}.
- Current difficulty level: ${nextDifficulty}/5.
- Core rules:
  1. Ask exactly ONE question at a time.
  2. Focus on situational questions (e.g. handling conflicts with managers/peers, dealing with shifting priorities, handling feedback).
  3. If they give a standard 'textbook' answer, push them for a real historical example: "Can you tell me about a time you actually experienced that?"`
      };

      systemPrompt = stageInstructions[type as keyof typeof stageInstructions] || stageInstructions.Behavioral;
    }

    // Format chat history for LLM
    const formattedMessages = transcript.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // Generate response text
    const nextQuestionText = await generateChatResponse(formattedMessages, systemPrompt);

    // Quick analysis to adjust difficulty (optional heuristic, run on backend)
    // If user's answer is very short (less than 40 chars), we decrease difficulty or set flag
    if (text.length < 40 && nextDifficulty > 1 && nextStage !== 'wrapUp') {
      nextDifficulty -= 1;
    } else if (text.length > 250 && nextDifficulty < 5 && nextStage !== 'wrapUp') {
      nextDifficulty += 1;
    }

    // Append AI response to transcript
    const assistantMessage = {
      role: 'assistant',
      content: nextQuestionText,
      timestamp: new Date().toISOString(),
    };
    transcript.push(assistantMessage);

    // Save session back to PostgreSQL
    await db.interviewSession.update({
      where: { id: sessionId },
      data: {
        currentStage: nextStage,
        difficulty: nextDifficulty,
        transcript: JSON.stringify(transcript),
      },
    });

    // Generate base64 speech audio using TTS API
    const audioBase64 = await generateSpeechAudio(nextQuestionText);

    return NextResponse.json({
      text: nextQuestionText,
      audio: audioBase64,
      stage: nextStage,
    });
  } catch (error) {
    console.error('Error in chat loop API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
