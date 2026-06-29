'use strict';
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Calendar, ShieldAlert, Award, ArrowLeft } from 'lucide-react';

interface FeedbackReport {
  overallScore: number;
  communicationScore: number;
  technicalScore: number;
  starScore: number | null;
  positivePoints: string; // JSON string
  improvementPoints: string; // JSON string
  detailedAnalysis: string;
}

interface Message {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  type: string;
  difficulty: number;
  createdAt: string;
  transcript: string;
  report: FeedbackReport | null;
  user: {
    name: string;
    jobRole: string;
    experienceLevel: string;
  };
}

export default function FeedbackReportPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    // 1. Authenticate user
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/auth/login');
      return;
    }

    // 2. Fetch session and report data
    const fetchReport = async () => {
      try {
        const res = await fetch(`/api/interview/${sessionId}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch feedback details');
        }
        const data = await res.json();
        setSession(data.session);
      } catch (err: any) {
        setError(err.message || 'Error loading feedback data.');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [sessionId, router]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="container" style={{ textAlign: 'center', padding: '10rem 2rem' }}>
          <h2>Compiling Report</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Evaluating candidate responses and generating your scorecard...</p>
        </main>
      </>
    );
  }

  if (error || !session) {
    return (
      <>
        <Header />
        <main className="container" style={{ textAlign: 'center', padding: '6rem 2rem' }}>
          <ShieldAlert size={48} style={{ color: 'var(--danger)', marginBottom: '1.5rem' }} />
          <h2>Error Loading Report</h2>
          <p style={{ marginTop: '0.5rem', marginBottom: '2rem' }}>{error || 'The requested scorecard does not exist.'}</p>
          <Link href="/" className="btn btn-secondary">
            Go back to Dashboard
          </Link>
        </main>
      </>
    );
  }

  const { report, type, createdAt, user } = session;
  const transcript: Message[] = JSON.parse(session.transcript || '[]');

  // Safe JSON parsing for points
  let positives: string[] = [];
  let improvements: string[] = [];
  if (report) {
    try {
      positives = JSON.parse(report.positivePoints);
      improvements = JSON.parse(report.improvementPoints);
    } catch (e) {
      console.error('Error parsing point strings:', e);
    }
  }

  return (
    <>
      <Header />
      <main className="container">
        {/* Back Link */}
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
        </div>

        {/* Report Header */}
        <div className="report-header">
          <div>
            <h1>Interview Performance Evaluation</h1>
            <p style={{ marginTop: '0.25rem' }}>
              Practice round for <strong>{user.name}</strong> • {user.experienceLevel} {user.jobRole}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <Calendar size={16} />
            {new Date(createdAt).toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </div>
        </div>

        {!report ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem', marginBottom: '2rem' }}>
            <AlertCircle size={48} style={{ color: 'var(--warning)', marginBottom: '1rem' }} />
            <h3>Report Generation Pending</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: '2.5rem' }}>
              We could not find a compiled feedback scorecard for this session. It might have been closed prematurely.
            </p>
            <button onClick={() => router.refresh()} className="btn btn-primary">
              Retry Generating Report
            </button>
          </div>
        ) : (
          <>
            {/* Scorecard Radial Gauges */}
            <div className="score-grid">
              {/* Overall Score */}
              <div className="glass-card score-card" style={{ borderImage: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)) 1' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>OVERALL SCORE</span>
                <div className="score-radial" style={{ '--percentage': report.overallScore } as React.CSSProperties}>
                  <div className="score-radial-inner">{report.overallScore}%</div>
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Aggregate feedback performance</span>
              </div>

              {/* Communication Score */}
              <div className="glass-card score-card">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>COMMUNICATION</span>
                <div className="score-radial" style={{ '--percentage': (report.communicationScore / 5) * 100, background: 'conic-gradient(var(--accent-primary) calc(var(--percentage) * 1%), #27272a 0)' } as React.CSSProperties}>
                  <div className="score-radial-inner">{report.communicationScore} / 5</div>
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Clarity, speed, and vocabulary</span>
              </div>

              {/* Technical Score */}
              <div className="glass-card score-card">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>TECHNICAL DEPTH</span>
                <div className="score-radial" style={{ '--percentage': (report.technicalScore / 5) * 100, background: 'conic-gradient(var(--accent-secondary) calc(var(--percentage) * 1%), #27272a 0)' } as React.CSSProperties}>
                  <div className="score-radial-inner">{report.technicalScore} / 5</div>
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Problem-solving and reasoning</span>
              </div>

              {/* STAR Score (Conditional for Behavioral only) */}
              {type === 'Behavioral' && report.starScore !== null && (
                <div className="glass-card score-card">
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>STAR STRUCTURE</span>
                  <div className="score-radial" style={{ '--percentage': (report.starScore / 5) * 100, background: 'conic-gradient(var(--success) calc(var(--percentage) * 1%), #27272a 0)' } as React.CSSProperties}>
                    <div className="score-radial-inner">{report.starScore} / 5</div>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>STAR method alignment</span>
                </div>
              )}
            </div>

            {/* Strengths & Improvements */}
            <div className="report-split">
              {/* Positive Points */}
              <div className="glass-card positive-card">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <CheckCircle2 size={20} style={{ color: 'var(--success)' }} /> Key Strengths
                </h3>
                <ul className="point-list">
                  {positives.map((point, i) => (
                    <li key={i} className="point-item">{point}</li>
                  ))}
                </ul>
              </div>

              {/* Improvement Points */}
              <div className="glass-card improvement-card">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <AlertCircle size={20} style={{ color: 'var(--warning)' }} /> Areas for Growth
                </h3>
                <ul className="point-list">
                  {improvements.map((point, i) => (
                    <li key={i} className="point-item">{point}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Detailed Markdown Analysis */}
            <div className="glass-card" style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Award size={20} style={{ color: 'var(--accent-secondary)' }} />
                Comprehensive Coach Feedback
              </h3>
              
              <div className="analysis-content">
                {/* Format paragraphs simply. A full markdown compiler is not strictly needed for this narrative card, but we replace double newlines with paragraphs for readability */}
                {report.detailedAnalysis.split('\n\n').map((para, index) => {
                  if (para.startsWith('###')) {
                    return <h3 key={index} style={{ color: 'var(--accent-secondary)', marginTop: '1.5rem', marginBottom: '0.5rem' }}>{para.replace('###', '').trim()}</h3>;
                  }
                  if (para.startsWith('**') || para.startsWith('*')) {
                    // Render bold headings
                    return <p key={index} style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>{para.replace(/\*\*/g, '').trim()}</p>;
                  }
                  return <p key={index} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{para}</p>;
                })}
              </div>
            </div>

            {/* Transcript Expandable Card */}
            <div className="glass-card" style={{ marginBottom: '2.5rem' }}>
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '0',
                  fontWeight: 600,
                  fontSize: '1.1rem'
                }}
              >
                <span>Show Interview Transcript ({transcript.length} turns)</span>
                {showTranscript ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>

              {showTranscript && (
                <div className="transcript-timeline" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
                  {transcript.map((msg, index) => (
                    <div key={index} className={`transcript-message ${msg.role}`}>
                      <div className="msg-meta">
                        {msg.role === 'assistant' ? 'AI INTERVIEWER' : 'CANDIDATE'} • {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="msg-text">{msg.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
