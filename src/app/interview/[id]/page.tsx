'use strict';
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PhoneOff, AlertTriangle, Volume2, Mic, MicOff, Loader2 } from 'lucide-react';

type CallStatus = 'idle' | 'connecting' | 'active' | 'ai-speaking' | 'user-speaking' | 'processing' | 'ending' | 'ended' | 'error';

interface TranscriptEntry {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<any>(null);
  const [joined, setJoined] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState('');
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState('');
  const [vapiMode, setVapiMode] = useState(true); // true = Vapi, false = browser fallback
  const [callDuration, setCallDuration] = useState(0);

  // Refs
  const vapiRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Legacy browser fallback refs
  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const endingRef = useRef(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/auth/login');
      return;
    }

    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/interview/${sessionId}`);
        if (!res.ok) throw new Error('Failed to load session');
        const data = await res.json();
        setSession(data.session);
      } catch (err: any) {
        setError(err.message || 'Error loading interview.');
      }
    };
    fetchSession();

    return () => {
      cleanup();
    };
  }, [sessionId, router]);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (vapiRef.current) {
      try { vapiRef.current.stop(); } catch (e) {}
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
  };

  const startTimer = () => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleEnterRoom = async () => {
    setJoined(true);
    setCallStatus('connecting');

    try {
      // Fetch the Vapi config from backend
      const res = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewType: session?.type }),
      });

      if (!res.ok) throw new Error('Failed to start interview session');
      const data = await res.json();

      const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

      if (publicKey && publicKey.trim().length > 0) {
        // ── VAPI MODE ──
        setVapiMode(true);
        await startVapiCall(publicKey, data.vapiConfig);
      } else {
        // ── LEGACY BROWSER MODE (fallback) ──
        setVapiMode(false);
        await startBrowserFallback(data.text);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start interview. Please try again.');
      setCallStatus('error');
    }
  };

  // ─────────────────────────────────────────────
  // VAPI MANAGED VOICE MODE
  // ─────────────────────────────────────────────
  const startVapiCall = async (publicKey: string, assistantConfig: any) => {
    try {
      // Dynamic import to avoid SSR issues
      const { default: Vapi } = await import('@vapi-ai/web');
      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      // ── Event listeners ──
      vapi.on('call-start', () => {
        setCallStatus('active');
        startTimer();
      });

      vapi.on('call-end', () => {
        setCallStatus('ended');
        if (timerRef.current) clearInterval(timerRef.current);
        // Auto redirect to feedback after 3 seconds
        setTimeout(() => {
          router.push(`/feedback/${sessionId}`);
        }, 3000);
      });

      vapi.on('speech-start', () => {
        setCallStatus('ai-speaking');
        setCurrentSpeaker('AI is speaking...');
      });

      vapi.on('speech-end', () => {
        setCallStatus('active');
        setCurrentSpeaker('Your turn to speak');
      });

      vapi.on('message', (msg: any) => {
        // Capture transcript entries from real-time messages
        if (msg.type === 'transcript' && msg.transcriptType === 'final') {
          setLiveTranscript(prev => [...prev, {
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.transcript,
            timestamp: new Date().toISOString(),
          }]);
        }
        // Update speaker status from conversation updates
        if (msg.type === 'conversation-update') {
          const lastMsg = msg.conversation?.[msg.conversation.length - 1];
          if (lastMsg?.role === 'user') {
            setCallStatus('user-speaking');
            setCurrentSpeaker('You are speaking...');
          }
        }
      });

      vapi.on('volume-level', (volume: number) => {
        // volume is 0-1; we can use this for waveform visualization
        // For now we just use it to detect active speaking
      });

      vapi.on('error', (err: any) => {
        console.error('Vapi error:', err);
        setError(`Voice service error: ${err?.message || 'Unknown error'}. Please check your Vapi API key.`);
        setCallStatus('error');
      });

      // Start the call with inline config
      await vapi.start(assistantConfig);

    } catch (err: any) {
      console.error('Failed to start Vapi call:', err);
      throw new Error('Failed to connect to managed voice service. Check your Vapi public key.');
    }
  };

  const handleEndVapiCall = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setCallStatus('ending');

    if (timerRef.current) clearInterval(timerRef.current);

    if (vapiRef.current) {
      vapiRef.current.stop();
      // Webhook handles transcript save + feedback generation
      // Wait 2 seconds for webhook to process then redirect
      setTimeout(() => {
        router.push(`/feedback/${sessionId}`);
      }, 4000);
    }
  };

  // ─────────────────────────────────────────────
  // LEGACY BROWSER FALLBACK MODE
  // ─────────────────────────────────────────────
  const startBrowserFallback = async (firstText: string) => {
    setCallStatus('ai-speaking');
    setCurrentSpeaker('AI is speaking...');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Your browser does not support speech recognition. Use Chrome or Edge.');
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript?.trim()) {
        rec.stop();
        setCallStatus('processing');
        setCurrentSpeaker('Processing...');
        setLiveTranscript(prev => [...prev, { role: 'user', content: transcript, timestamp: new Date().toISOString() }]);

        try {
          const res = await fetch('/api/interview/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, text: transcript }),
          });
          const data = await res.json();
          setLiveTranscript(prev => [...prev, { role: 'assistant', content: data.text, timestamp: new Date().toISOString() }]);
          await speakFallback(data.text, data.audio);
        } catch (e) {
          setCallStatus('active');
          setTimeout(() => { try { rec.start(); } catch(e2) {} }, 1000);
        }
      }
    };

    rec.onerror = () => {
      setTimeout(() => { try { rec.start(); } catch(e) {} }, 2000);
    };

    rec.onend = () => {
      if (!endingRef.current) {
        setTimeout(() => { try { rec.start(); } catch(e) {} }, 800);
      }
    };

    recognitionRef.current = rec;
    startTimer();
    setLiveTranscript([{ role: 'assistant', content: firstText, timestamp: new Date().toISOString() }]);
    await speakFallback(firstText, '');
  };

  const speakFallback = (text: string, audioBase64: string): Promise<void> => {
    return new Promise((resolve) => {
      setCallStatus('ai-speaking');
      setCurrentSpeaker('AI is speaking...');

      const onDone = () => {
        setCallStatus('active');
        setCurrentSpeaker('Your turn to speak');
        setTimeout(() => {
          try { recognitionRef.current?.start(); } catch(e) {}
        }, 500);
        resolve();
      };

      if (audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
        audioPlayerRef.current = audio;
        audio.onended = onDone;
        audio.onerror = () => speakBrowserTTS(text, onDone);
        audio.play().catch(() => speakBrowserTTS(text, onDone));
      } else {
        speakBrowserTTS(text, onDone);
      }
    });
  };

  const speakBrowserTTS = (text: string, onDone: () => void) => {
    if (!window.speechSynthesis) { onDone(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.replace(/\[.*?\]/g, '').trim());
    utt.lang = 'en-US';
    utt.rate = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
    if (v) utt.voice = v;
    utt.onend = onDone;
    utt.onerror = onDone;
    window.speechSynthesis.speak(utt);
  };

  const handleEndFallback = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setCallStatus('ending');
    cleanup();

    const res = await fetch('/api/interview/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) router.push(`/feedback/${sessionId}`);
  };

  // ─────────────────────────────────────────────
  // UI HELPERS
  // ─────────────────────────────────────────────
  const getStatusLabel = (): string => {
    switch (callStatus) {
      case 'connecting': return 'Connecting to voice session...';
      case 'active': return 'Your turn to speak';
      case 'ai-speaking': return 'AI Interviewer is speaking...';
      case 'user-speaking': return 'Listening...';
      case 'processing': return 'Processing your response...';
      case 'ending': return 'Ending session, generating scorecard...';
      case 'ended': return 'Session complete! Redirecting to report...';
      case 'error': return 'Connection error';
      default: return 'Initializing...';
    }
  };

  const getOrbClass = (): string => {
    if (callStatus === 'ai-speaking') return 'speaking';
    if (callStatus === 'active' || callStatus === 'user-speaking') return 'listening';
    if (callStatus === 'processing') return 'processing';
    return '';
  };

  const getWaveformClass = (): string => {
    if (callStatus === 'ai-speaking') return 'active speaking';
    if (callStatus === 'active' || callStatus === 'user-speaking') return 'active listening';
    return '';
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  if (error && !joined) {
    return (
      <div className="auth-page">
        <div className="glass-card auth-card" style={{ textAlign: 'center', borderColor: 'var(--danger)' }}>
          <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: '1rem' }} />
          <h3>Could Not Load Session</h3>
          <p style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>{error}</p>
          <Link href="/" className="btn btn-secondary" style={{ width: '100%' }}>Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  // Pre-join overlay
  if (!joined) {
    return (
      <div className="auth-page">
        <div className="glass-card auth-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Volume2 size={48} style={{ color: 'var(--accent-secondary)', marginBottom: '1rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>AI Interview Room</h3>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            You are about to start a <strong>{session?.type}</strong> interview for the{' '}
            <strong>{session?.user?.experienceLevel} {session?.user?.jobRole}</strong> role.
          </p>
          {process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.08)', padding: '0.5rem', borderRadius: '6px' }}>
              ✓ Managed voice AI (Vapi) is active. High-quality real-time voice conversation enabled.
            </p>
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--warning)', marginBottom: '1.5rem', background: 'rgba(245,158,11,0.08)', padding: '0.5rem', borderRadius: '6px' }}>
              ⚠ Running in browser voice fallback mode. Add NEXT_PUBLIC_VAPI_PUBLIC_KEY to enable managed voice.
            </p>
          )}
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Ensure you are in a quiet room, microphone is enabled, and your volume is up.
          </p>
          <button onClick={handleEnterRoom} className="btn btn-primary" style={{ width: '100%' }}>
            Enter Room & Begin Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '1.5rem', justifyContent: 'space-between', background: 'var(--bg-primary)' }}>

      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`badge badge-${session?.type?.toLowerCase().split(' ')[0]}`}>
            {session?.type}
          </span>
          {vapiMode ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              ✓ Managed Voice AI
            </span>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', background: 'rgba(245,158,11,0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              Browser Voice Mode
            </span>
          )}
        </div>
        <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: '0.9rem' }}>
          {callStatus !== 'idle' && callStatus !== 'connecting' && formatDuration(callDuration)}
        </div>
      </div>

      {/* Central Voice Interface */}
      <div className="interview-container" style={{ flex: 1 }}>

        {/* Error overlay */}
        {error && callStatus === 'error' && (
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <AlertTriangle size={40} style={{ color: 'var(--danger)', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--danger)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{error}</p>
            <Link href="/" className="btn btn-secondary">Return to Dashboard</Link>
          </div>
        )}

        {/* Voice Orb */}
        {callStatus !== 'error' && (
          <>
            <div className="voice-orb-container">
              <div className={`voice-orb ${getOrbClass()}`}>
                {callStatus === 'connecting' && (
                  <Loader2 size={36} style={{ color: 'white', animation: 'spin 1s linear infinite', position: 'absolute' }} />
                )}
              </div>
              <div className="orb-wave" />
              <div className="orb-wave" />
              <div className="orb-wave" />
            </div>

            <div className="voice-status">{getStatusLabel()}</div>

            {/* Live last transcript line */}
            {liveTranscript.length > 0 && (
              <div style={{
                maxWidth: '600px',
                textAlign: 'center',
                fontSize: '0.9rem',
                color: liveTranscript[liveTranscript.length - 1]?.role === 'assistant' ? 'var(--accent-secondary)' : 'var(--text-primary)',
                background: 'rgba(255,255,255,0.04)',
                padding: '0.75rem 1.25rem',
                borderRadius: '10px',
                border: '1px solid var(--glass-border)',
                marginTop: '0.5rem',
                marginBottom: '0.5rem',
                fontStyle: liveTranscript[liveTranscript.length - 1]?.role === 'assistant' ? 'italic' : 'normal',
              }}>
                {liveTranscript[liveTranscript.length - 1]?.role === 'assistant' ? '💬 ' : '🎤 '}
                "{liveTranscript[liveTranscript.length - 1]?.content}"
              </div>
            )}

            {/* Waveform */}
            <div className={`waveform ${getWaveformClass()}`} style={{ marginTop: '1rem' }}>
              {[...Array(8)].map((_, i) => <div key={i} className="wave-bar" />)}
            </div>
          </>
        )}
      </div>

      {/* Bottom Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {(callStatus === 'ending' || callStatus === 'ended') ? (
          <div style={{ textAlign: 'center' }}>
            <Loader2 size={32} style={{ color: 'var(--accent-secondary)', animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {callStatus === 'ended' ? 'Redirecting to your scorecard...' : 'Compiling your feedback report...'}
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={vapiMode ? handleEndVapiCall : handleEndFallback}
              className="btn btn-danger"
              style={{ gap: '0.75rem', padding: '1rem 2.5rem', borderRadius: '12px', fontSize: '1rem' }}
              disabled={callStatus === 'connecting'}
            >
              <PhoneOff size={18} />
              Finish Interview & View Scorecard
            </button>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              End at any time — a detailed report is generated immediately
            </p>
          </>
        )}
      </div>

      {/* Spinner keyframe inline */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
