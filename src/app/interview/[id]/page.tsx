'use strict';
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mic, MicOff, Volume2, PhoneOff, AlertTriangle } from 'lucide-react';

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  // State Management
  const [session, setSession] = useState<any>(null);
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [subStatus, setSubStatus] = useState('Connecting to the AI voice session...');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const [usingBrowserTTS, setUsingBrowserTTS] = useState(false);

  // References for Web Speech API and Audio elements
  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechUtteranceRef = useRef<any>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // 1. Check user login
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/auth/login');
      return;
    }

    // 2. Fetch session details
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/interview/${sessionId}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load session info');
        }
        const data = await res.json();
        setSession(data.session);
        setStatus('Ready to Begin');
        setSubStatus('Click below to enter the room and start speaking.');
      } catch (err: any) {
        setError(err.message || 'Error loading interview data.');
        setStatus('Connection Error');
      }
    };

    fetchSession();

    // Cleanup on unmount
    return () => {
      stopAllVoiceActivity();
    };
  }, [sessionId, router]);

  const stopAllVoiceActivity = () => {
    // Stop microphone recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch (e) {}
    }

    // Stop audio player
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
    }

    // Stop speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const handleStartRoom = () => {
    setJoined(true);
    initializeVoiceLoop();
  };

  // Setup Web Speech Recognition and start the loop
  const initializeVoiceLoop = async () => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      // 1. Initialize SpeechRecognition browser interface
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error('Your browser does not support Speech Recognition. Please try Google Chrome or Microsoft Edge.');
      }

      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        setIsSpeaking(false);
        setIsProcessing(false);
        setStatus('Listening...');
        setSubStatus('Speak clearly. I am listening to your answer...');
      };

      rec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim().length > 0) {
          // Stop recognition immediately while we process
          rec.stop();
          setIsListening(false);
          setIsProcessing(true);
          setStatus('Processing...');
          setSubStatus('Evaluating response and planning follow-ups...');
          
          await processUserSpeech(transcript);
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          // Silent interval, restart listening
          setTimeout(() => {
            if (joined && !isSpeaking && !isProcessing && !ending) {
              try { rec.start(); } catch (e) {}
            }
          }, 1000);
        } else {
          setSubStatus(`Microphone error: ${event.error}. Retrying...`);
          setIsListening(false);
          setTimeout(() => {
            if (joined && !isSpeaking && !isProcessing && !ending) {
              try { rec.start(); } catch (e) {}
            }
          }, 3000);
        }
      };

      rec.onend = () => {
        setIsListening(false);
        // Autorestart listening if AI is not speaking and we are not processing/ending
        setTimeout(() => {
          if (joined && !isSpeaking && !isProcessing && !isListening && !ending) {
            try { rec.start(); } catch (e) {}
          }
        }, 1000);
      };

      recognitionRef.current = rec;

      // 2. Load the initial question (already generated at session start)
      if (session && session.transcript) {
        const transcriptArr = JSON.parse(session.transcript);
        const firstAssistantMsg = transcriptArr[0]?.content;
        
        if (firstAssistantMsg) {
          await speakAIPrompt(firstAssistantMsg);
        } else {
          // Fallback if no start prompt exists
          setStatus('Ready');
          setSubStatus('Speak to say hello.');
          rec.start();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize voice interface.');
      setStatus('Setup Failed');
    }
  };

  // Submit candidate answer text to Next.js API
  const processUserSpeech = async (spokenText: string) => {
    try {
      const res = await fetch('/api/interview/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          text: spokenText,
        }),
      });

      if (!res.ok) {
        throw new Error('Server error processing speech');
      }

      const data = await res.json();
      
      // Check if the AI ended the round or marked stage as wrapUp completion
      if (data.stage === 'feedback') {
        setStatus('Concluded');
        setSubStatus('Saving and generating feedback scorecard...');
        await handleEndInterview();
        return;
      }

      // Play the next AI question
      await speakAIPrompt(data.text, data.audio);
    } catch (err) {
      console.error(err);
      setStatus('Error');
      setSubStatus('Could not send response. Re-opening microphone...');
      setIsProcessing(false);
      // Restart listening fallback
      setTimeout(() => {
        if (joined && !ending) {
          try { recognitionRef.current.start(); } catch (e) {}
        }
      }, 2000);
    }
  };

  // Play audio response (via OpenAI TTS or Web Speech Synthesis fallback)
  const speakAIPrompt = async (text: string, audioBase64?: string) => {
    setIsSpeaking(true);
    setIsListening(false);
    setIsProcessing(false);
    setStatus('AI Speaking...');
    setSubStatus('Listen carefully to the question.');

    // Stop any active recognition to prevent AI hearing its own audio
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    if (audioBase64) {
      // 1. Play high-quality OpenAI TTS Audio
      setUsingBrowserTTS(false);
      const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
      const player = new Audio(audioUrl);
      audioPlayerRef.current = player;

      player.onended = () => {
        setIsSpeaking(false);
        // Start listening again
        if (joined && !ending) {
          try { recognitionRef.current.start(); } catch (e) {}
        }
      };

      player.onerror = (e) => {
        console.error('Audio playback error, falling back to browser TTS:', e);
        speakBrowserTTS(text);
      };

      await player.play().catch(err => {
        console.warn('Autoplay block, falling back to browser TTS:', err);
        speakBrowserTTS(text);
      });
    } else {
      // 2. Fallback to Browser Speech Synthesis
      speakBrowserTTS(text);
    }
  };

  const speakBrowserTTS = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSpeaking(false);
      setStatus('Ready');
      setSubStatus('Speech Synthesis unsupported. Speak to answer.');
      if (joined && !ending) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
      return;
    }

    setUsingBrowserTTS(true);
    // Cancel any active speak
    window.speechSynthesis.cancel();

    // Strip bracketed instructions from spoken text
    const cleanedText = text.replace(/\[.*?\]/g, '').trim();

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = 'en-US';
    utterance.rate = 1.05; // Slightly fast for conversational speed
    
    // Choose a premium voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                          voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
                          voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.onend = () => {
      setIsSpeaking(false);
      if (joined && !ending) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setIsSpeaking(false);
      if (joined && !ending) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleEndInterview = async () => {
    if (ending) return;
    setEnding(true);
    stopAllVoiceActivity();

    setStatus('Completing Interview...');
    setSubStatus('Finalizing transcript and compiling your detailed feedback scorecard. Please wait, this takes about 5 seconds...');

    try {
      const res = await fetch('/api/interview/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        throw new Error('Failed to compile scorecard');
      }

      router.push(`/feedback/${sessionId}`);
    } catch (err) {
      console.error(err);
      alert('Error finalizing feedback report. Redirecting to dashboard.');
      router.push('/');
    }
  };

  // Setup dynamic class names for voice visualizer styling
  const getOrbClass = () => {
    if (isSpeaking) return 'speaking';
    if (isListening) return 'listening';
    return '';
  };

  const getWaveformClass = () => {
    if (isSpeaking) return 'active speaking';
    if (isListening) return 'active listening';
    return '';
  };

  if (error) {
    return (
      <div className="auth-page">
        <div className="glass-card auth-card" style={{ textAlign: 'center', borderColor: 'var(--danger)' }}>
          <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: '1rem' }} />
          <h3>Connection Failed</h3>
          <p style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>{error}</p>
          <Link href="/" className="btn btn-secondary" style={{ width: '100%' }}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Pre-join Overlay screen to satisfy Browser Autoplay Policy
  if (!joined) {
    return (
      <div className="auth-page">
        <div className="glass-card auth-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Volume2 size={48} style={{ color: 'var(--accent-secondary)', marginBottom: '1rem', animation: 'pulse-mic 2s infinite ease-in-out' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>AI Interview Room</h3>
          <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
            You are about to start a voice-only {session?.type} round for the {session?.user.experienceLevel} {session?.user.jobRole} role.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Please make sure you are in a quiet room, your microphone is enabled, and your sound is turned up.
          </p>
          
          <button onClick={handleStartRoom} className="btn btn-primary" style={{ width: '100%' }}>
            Enter Room & Begin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'space-between', padding: '2rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge badge-${session?.type.toLowerCase().split(' ')[0]}`}>
            {session?.type}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Room ID: {sessionId.substring(0, 8)}...
          </span>
        </div>
        
        {usingBrowserTTS && (
          <span style={{ fontSize: '0.8rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={14} /> Using browser voice fallback
          </span>
        )}
      </div>

      {/* Interactive Voice Orb Screen */}
      <div className="interview-container">
        <div className="voice-orb-container">
          <div className={`voice-orb ${getOrbClass()}`}></div>
          <div className="orb-wave"></div>
          <div className="orb-wave"></div>
          <div className="orb-wave"></div>
        </div>

        <div className="voice-status">{status}</div>
        <div className="voice-substatus">{subStatus}</div>

        {/* Dynamic Waveform Visualizer */}
        <div className={`waveform ${getWaveformClass()}`}>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
        </div>
      </div>

      {/* Bottom Actions Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%', marginBottom: '2rem' }}>
        <button
          onClick={handleEndInterview}
          className="btn btn-danger"
          style={{ gap: '0.75rem', padding: '1rem 2rem', borderRadius: '12px', fontSize: '1rem' }}
          disabled={ending}
        >
          <PhoneOff size={18} />
          {ending ? 'Analyzing...' : 'Finish & View Scorecard'}
        </button>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          You can end the session at any point. A detailed scorecard will be generated immediately.
        </p>
      </div>
    </div>
  );
}
