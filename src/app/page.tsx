'use strict';
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { Briefcase, Award, Clock, ArrowRight, Play } from 'lucide-react';

interface Session {
  id: string;
  type: string;
  status: string;
  difficulty: number;
  createdAt: string;
  report?: {
    overallScore: number;
  } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('Behavioral');
  const [startLoading, setStartLoading] = useState(false);

  useEffect(() => {
    // 1. Authenticate user client-side
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/auth/login');
      return;
    }
    setUser(JSON.parse(storedUser));

    // 2. Fetch history
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/dashboard');
        if (res.status === 401) {
          localStorage.removeItem('user');
          router.push('/auth/login');
          return;
        }
        const data = await res.json();
        if (data.sessions) {
          setSessions(data.sessions);
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [router]);

  const handleStartInterview = async () => {
    setStartLoading(true);
    try {
      const res = await fetch('/api/interview/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ interviewType: selectedType }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start interview');
      }

      router.push(`/interview/${data.sessionId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong starting the interview.');
      setStartLoading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <Header />
      <main className="container">
        <div style={{ marginBottom: '2.5rem' }}>
          <h1>Candidate Dashboard</h1>
          <p>Practice dynamic voice interviews and receive expert coaching feedback reports.</p>
        </div>

        <div className="dashboard-grid">
          {/* Main Column: Sessions History */}
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={24} style={{ color: 'var(--accent-secondary)' }} />
              Past Interview Sessions
            </h2>

            {loading ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
                <p>Loading session logs...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>You haven't conducted any mock interviews yet.</p>
                <p style={{ color: 'var(--text-muted)' }}>Choose an interview type on the right and hit start to begin your first round!</p>
              </div>
            ) : (
              <div className="session-list">
                {sessions.map((session) => (
                  <div key={session.id} className="session-item">
                    <div className="session-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className={`badge badge-${session.type.toLowerCase().split(' ')[0]}`}>
                          {session.type}
                        </span>
                        <span className={`badge badge-${session.status.toLowerCase()}`}>
                          {session.status}
                        </span>
                      </div>
                      <div className="session-meta" style={{ marginTop: '0.5rem' }}>
                        <span>Difficulty level: {session.difficulty}/5</span>
                        <span>•</span>
                        <span>{new Date(session.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                      {session.status === 'completed' && session.report && (
                        <div className="session-score">
                          {session.report.overallScore}%
                        </div>
                      )}
                      
                      {session.status === 'completed' ? (
                        <Link href={`/feedback/${session.id}`} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                          View Feedback <ArrowRight size={16} />
                        </Link>
                      ) : (
                        <Link href={`/interview/${session.id}`} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                          Resume Round <Play size={14} />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Setup Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Candidate Profile Details */}
            <div className="glass-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Briefcase size={18} style={{ color: 'var(--accent-primary)' }} />
                Your Profile
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Name:</span>
                  <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{user.name}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Target Job Role:</span>
                  <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{user.jobRole}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Experience:</span>
                  <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{user.experienceLevel} Level</div>
                </div>
              </div>
            </div>

            {/* Launch Practice Round */}
            <div className="glass-card" style={{ borderImage: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)) 1' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Award size={18} style={{ color: 'var(--accent-secondary)' }} />
                New Practice Round
              </h3>
              <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Select an interview type to start. The AI interviewer adapts dynamically based on your replies.
              </p>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="interviewType">Select Interview Type</label>
                <select
                  id="interviewType"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                >
                  <option value="Behavioral">Behavioral (STAR Method, Communication)</option>
                  <option value="Technical">Technical (Computer Science depth, problem solving)</option>
                  <option value="System Design">System Design (Scalability, trade-offs, architecture)</option>
                  <option value="HR">HR & Culture Fit (Motivation, situational soft skills)</option>
                </select>
              </div>

              <button
                onClick={handleStartInterview}
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={startLoading}
              >
                {startLoading ? 'Initializing Voice Server...' : 'Start Voice Interview'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
