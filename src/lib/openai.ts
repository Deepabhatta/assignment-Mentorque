import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

// Check if API key is set
export function isOpenAIConfigured(): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!isOpenAIConfigured()) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generates the next response in the conversation using OpenAI GPT-4o-mini.
 * Falls back to basic structure if OpenAI is not configured.
 */
export async function generateChatResponse(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  systemPrompt: string
): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    console.warn('OpenAI API key not configured. Using static fallback responses.');
    // Simple fallback generator for testing without an API key
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    return `[Fallback Mode: OpenAI Key is missing] I heard you say: "${lastUserMsg}". Could you elaborate more on your experience with this topic?`;
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 150, // Keep responses short and conversational
    });

    return response.choices[0].message.content || 'I apologize, could you repeat that?';
  } catch (error) {
    console.error('Error generating chat response:', error);
    throw error;
  }
}

/**
 * Generates audio bytes (base64) from text using OpenAI Text-to-Speech (TTS-1).
 * Returns empty string if OpenAI is not configured.
 */
export async function generateSpeechAudio(text: string): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    // If not configured, client-side browser TTS will handle it
    return '';
  }

  try {
    // Clean text from any brackets or annotations (e.g. "[Evaluator note: ...]")
    const cleanedText = text.replace(/\[.*?\]/g, '').trim();

    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy', // alloy, echo, fable, onyx, nova, shimmer
      input: cleanedText,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error generating TTS audio:', error);
    // Return empty string, frontend will fall back to browser TTS
    return '';
  }
}

/**
 * Generates the final detailed feedback report at the end of the session.
 */
export async function generateFeedbackReport(
  interviewType: string,
  userProfile: { name: string; jobRole: string; experienceLevel: string },
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{
  overallScore: number;
  communicationScore: number;
  technicalScore: number;
  starScore?: number;
  positivePoints: string[];
  improvementPoints: string[];
  detailedAnalysis: string;
}> {
  const client = getOpenAIClient();
  
  const formattedTranscript = transcript
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  const systemPrompt = `You are a critical, expert hiring manager and mock interview coach.
Analyze the provided transcript of a "${interviewType}" interview for a candidate named ${userProfile.name} who is a ${userProfile.experienceLevel}-level ${userProfile.jobRole}.

You must evaluate their answers based on:
1. Communication clarity.
2. Technical depth and problem-solving.
3. If Behavioral: STAR structure (Situation, Task, Action, Result) usage.

Provide your final score card in JSON format only. The JSON must match the following schema:
{
  "overallScore": number (0 to 100),
  "communicationScore": number (1 to 5),
  "technicalScore": number (1 to 5),
  "starScore": number or null (1 to 5, only if behavioral, otherwise null),
  "positivePoints": string[] (3 main strengths identified),
  "improvementPoints": string[] (3 main actionable improvement points),
  "detailedAnalysis": string (a comprehensive narrative summary in Markdown formatting, describing their performance, where they did well, and detailed suggestions on what they could do differently. Include constructive feedback.)
}

Make sure to return ONLY the raw JSON, do not wrap it in markdown code blocks like \`\`\`json.`;

  if (!client) {
    console.warn('OpenAI API key not configured. Generating mock feedback report.');
    return {
      overallScore: 75,
      communicationScore: 4,
      technicalScore: 3,
      starScore: interviewType.toLowerCase().includes('behavioral') ? 3 : undefined,
      positivePoints: [
        'Good structured intro and description of the role.',
        'Friendly communication style.',
        'Demonstrates general familiarity with standard concepts.',
      ],
      improvementPoints: [
        'Answers were a bit brief. Try to elaborate on technical details.',
        'For behavioral questions, structure responses using the STAR method.',
        'Avoid vague statements, describe concrete actions you took.',
      ],
      detailedAnalysis: `### Mock Interview Performance Analysis (OpenAI Key Missing)

You conducted a **${interviewType}** interview for a **${userProfile.experienceLevel} ${userProfile.jobRole}** role. 

This feedback is generated in **demo mode** because the OpenAI API key is missing in the server config. To get a real, customized AI analysis of your transcript, please provide a valid \`OPENAI_API_KEY\` in your \`.env\` file.

**Next Steps for Practice:**
1. Focus on structure (e.g., STAR method for behavioral rounds).
2. Deep dive into the architectural trade-offs during system design rounds.
3. Discuss details of individual tools, architectures, and design choices.`,
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the interview transcript:\n\n${formattedTranscript}` }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      overallScore: result.overallScore || 70,
      communicationScore: result.communicationScore || 3,
      technicalScore: result.technicalScore || 3,
      starScore: result.starScore || undefined,
      positivePoints: result.positivePoints || ['Good effort'],
      improvementPoints: result.improvementPoints || ['Need practice'],
      detailedAnalysis: result.detailedAnalysis || 'No detailed analysis generated.',
    };
  } catch (error) {
    console.error('Error generating feedback report:', error);
    // Return standard fallback
    return {
      overallScore: 60,
      communicationScore: 3,
      technicalScore: 3,
      positivePoints: ['Answered questions.'],
      improvementPoints: ['Provide more detailed answers.'],
      detailedAnalysis: 'Error during feedback generation.',
    };
  }
}
