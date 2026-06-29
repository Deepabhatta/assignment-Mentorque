# IntervAI — AI Mock Interview Platform

IntervAI is a full-stack, AI-powered mock interview platform designed to conduct dynamic, voice-only practice rounds for candidates. The interviewer adapts in real time to what the candidate actually says, probes weak responses, acknowledges strong points, and transitions between technical depth, system design, behavioral, and HR questions based on target job profiles.

Once completed, candidates receive a comprehensive STAR scorecard report with qualitative insights and full timestamped transcripts.

---

## Key Features

1. **Voice-Only Focus**: No distracting text chat during the interview—simulate a real screen room with visual soundwave indicators.
2. **Adaptive Conversation Engine**: The AI asks follow-up questions, digs into vague responses, adjusts difficulty level based on candidate responses, and doesn't stick to a rigid checklist.
3. **High-Fidelity Audio**: Generates realistic audio speech using OpenAI's TTS-1 model.
4. **Built-in Audio Fallback**: If no OpenAI API Key is provided, the platform automatically switches to standard Browser Speech Synthesis (`window.speechSynthesis`), ensuring the mock room is 100% testable for free out of the box.
5. **Scorecard Dashboard**: View overall ratings, communication metrics, STAR framework scoring, strengths, actionable feedback, and expandable full transcripts.

---

## Local Setup (Under 5 Commands)

Follow these 4 simple steps to run the application locally.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or above recommended)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)

### Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Rename `.env` or edit the existing one in the root folder, and fill in your OpenAI API Key:
   ```env
   OPENAI_API_KEY="your-openai-api-key"
   ```

3. **Start PostgreSQL Database**
   ```bash
   docker-compose up -d
   ```

4. **Sync DB & Run App**
   ```bash
   npx prisma db push && npm run dev
   ```

Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to start practicing!

---

## Project Structure & Architecture

- **Frontend Views**: Built using Next.js App Router and styled with native Vanilla CSS for glassmorphism, responsive grids, and pulse waves.
  - `/` - Main Dashboard & Session Launcher
  - `/auth/login` & `/auth/register` - Profile & Auth Setup
  - `/interview/[id]` - Active Voice Interview Room
  - `/feedback/[id]` - Performance SCORECARD & Transcript Timeline
- **Database & Client**: Structured inside `prisma/schema.prisma` mapping User profiles, Sessions, and Reports. Exposes a globally cached `src/lib/db.ts` client.
- **AI Conversation Engine**: Organized in `src/app/api/interview/chat/route.ts` as a Node-based state machine that controls stage transitions (`intro` -> `QA` -> `wrapUp` -> `feedback`), assesses answer quality, dynamically alters session difficulty, and handles audio pipelines.
