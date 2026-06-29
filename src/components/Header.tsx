'use strict';
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Error parsing stored user:', e);
      }
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      localStorage.removeItem('user');
      router.push('/auth/login');
      router.refresh();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  return (
    <header>
      <div className="header-container">
        <Link href="/" className="logo">
          IntervAI
        </Link>
        
        {user ? (
          <ul className="nav-links">
            <li className="nav-user">
              Signed in as: <strong>{user.name}</strong>
            </li>
            <li>
              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                Logout
              </button>
            </li>
          </ul>
        ) : (
          <ul className="nav-links">
            <li>
              <Link href="/auth/login" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                Login
              </Link>
            </li>
          </ul>
        )}
      </div>
    </header>
  );
}
