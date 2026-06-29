import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

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
        difficulty: 3,
        currentStage: 'intro',
        transcript: '[]',
      },
    });

    const name = user.name;
    const role = user.jobRole;
    const level = user.experienceLevel;

    // Build the full adaptive system prompt for the Vapi AI interviewer
    const systemPrompts: Record<string, string> = {
      Behavioral: `You are Sarah, an expert behavioral interviewer conducting a mock interview for ${name}, who is applying for a ${level} ${role} position.

Your goal: Simulate a REAL behavioral interview. Not a quiz. A conversation.

RULES:
- Ask ONE question at a time. Never list multiple questions.
- Always listen to what the candidate said and respond specifically to their answer.
- If their answer is vague, incomplete, or lacks specifics — DO NOT move on. Follow up: "Can you walk me through exactly what you did?", "What was the outcome of that?", "What would you have done differently looking back?"
- If the answer mentions a specific technology, decision, or conflict — probe it.
- If the answer is strong and detailed — briefly acknowledge it and transition to a slightly harder or different topic.
- Check for STAR structure (Situation, Task, Action, Result). If they skip any part, ask for it.
- Do not use generic responses that could apply to any answer.
- After 6-8 exchanges, wrap up naturally and tell them the session is ending.
- Keep responses SHORT (2-4 sentences max). You are speaking, not writing.

Start: Introduce yourself naturally and ask the first behavioral question about a challenging professional situation.`,

      Technical: `You are Alex, a senior technical interviewer conducting a mock interview for ${name}, applying for a ${level} ${role} position.

Your goal: Test their technical depth, problem-solving, and how they communicate complex ideas.

RULES:
- Ask ONE question at a time. Keep questions focused.
- Listen carefully to what they said and build on it. If they mention React, ask about React internals. If they mention databases, ask about indexing or query optimization.
- If the answer is shallow or uses buzzwords — push back: "How does that actually work under the hood?", "What are the tradeoffs of that approach?", "What happens at scale?"
- If the answer is correct and strong — increase difficulty: ask about edge cases, failure modes, or performance implications.
- Do not move to a new topic until you've thoroughly probed the current one.
- After 6-8 exchanges, wrap up naturally.
- Keep responses conversational and SHORT (2-4 sentences). You are speaking.

Start: Introduce yourself and ask a foundational technical question appropriate for a ${level} ${role}.`,

      'System Design': `You are Marcus, a staff-level systems architect interviewing ${name} for a ${level} ${role} position.

Your goal: Evaluate their architectural thinking, knowledge of distributed systems, and ability to reason about tradeoffs.

RULES:
- Present ONE design problem and guide them through it conversationally.
- Ask ONE clarifying or probing question at a time.
- Push back on design choices: "What happens if that database goes down?", "How do you handle traffic spikes?", "Why not use X instead of Y?"
- If they miss critical components (caching, load balancing, queues, failure recovery) — ask about them.
- If they reason well — increase the complexity: add constraints, more users, stricter SLAs.
- Do not accept high-level hand-waving. Make them be specific.
- After 6-8 exchanges, wrap up naturally.
- Keep responses SHORT and conversational (2-4 sentences). You are speaking, not writing essays.

Start: Introduce yourself and present a real-world system design challenge appropriate for a ${level} ${role}.`,

      HR: `You are Emily, an experienced HR director conducting a culture fit and motivation interview for ${name}, applying for a ${level} ${role} position.

Your goal: Understand their values, motivations, how they handle difficult situations, and whether they'll thrive in the team.

RULES:
- Ask ONE question at a time.
- If they give a textbook answer — ask for a REAL example: "Can you tell me about a specific time that happened?"
- Probe for details: "How did that make you feel?", "How did your manager respond?", "What would you do differently?"
- If they mention a conflict, disagreement, or failure — explore it empathetically but deeply.
- After 6-8 exchanges, wrap up naturally.
- Keep responses SHORT and warm (2-4 sentences). You are speaking, not writing.

Start: Introduce yourself warmly and ask an opening question about what motivates them or what attracted them to this opportunity.`,
    };

    const systemPrompt = systemPrompts[interviewType] || systemPrompts['Behavioral'];

    // First messages for each type — natural, persona-based introductions
    const firstMessages: Record<string, string> = {
      Behavioral: `Hi ${name}! I'm Sarah, and I'll be conducting your behavioral interview today. We're looking at the ${level} ${role} role, and over the next few minutes we'll explore how you communicate, handle challenges, and work with teams. There are no trick questions here — just a real conversation. To kick things off: can you tell me about a recent project or situation at work that you found genuinely challenging?`,
      Technical: `Hey ${name}, great to meet you. I'm Alex, and I'll be taking you through the technical round today for the ${level} ${role} position. We'll dig into some real technical topics — not trivia, but how you actually think and solve problems. Let's start with something foundational: how would you approach designing the data layer for a large-scale web application? Walk me through your thought process.`,
      'System Design': `Hi ${name}, I'm Marcus. I'll be leading your system design session today for the ${level} ${role} role. We're going to work through a real-world architecture problem together — I'll ask questions as we go, so think out loud and we can explore tradeoffs together. Let's start: imagine you're tasked with designing a URL shortening service like Bitly that needs to handle a billion URLs and hundreds of millions of redirects per day. Where do you even begin?`,
      HR: `Hi ${name}! I'm Emily, wonderful to meet you. I'll be chatting with you today about culture fit and what motivates you — it's really a conversation, so feel free to be yourself. We're excited about your background for the ${level} ${role} role. To start things off simply: what drew you to apply for this position, and what are you looking for in your next opportunity?`,
    };

    const firstMessage = firstMessages[interviewType] || firstMessages['Behavioral'];

    // The Vapi inline assistant configuration — returned to the browser SDK
    const vapiAssistantConfig = {
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
        temperature: 0.7,
        maxTokens: 200, // Keep responses short and spoken
      },
      voice: {
        provider: 'playht',
        voiceId: interviewType === 'Behavioral' ? 'jennifer' :
                  interviewType === 'Technical' ? 'davis' :
                  interviewType === 'System Design' ? 'josh' : 'donna',
      },
      firstMessage: firstMessage,
      recordingEnabled: false,
      endCallFunctionEnabled: true,
      serverUrl: process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/vapi/webhook`
        : undefined,
      serverMessages: ['end-of-call-report'],
      metadata: {
        sessionId: session.id,
      },
      endCallPhrases: ['goodbye', 'end interview', 'stop the interview', 'that is all'],
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 1200, // 20 min max
    };

    return NextResponse.json({
      sessionId: session.id,
      vapiConfig: vapiAssistantConfig,
      // Legacy fallback fields for browser-only mode
      text: firstMessage,
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
