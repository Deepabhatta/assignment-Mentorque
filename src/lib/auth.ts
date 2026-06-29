import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'a_very_long_and_secure_secret_key_1234567890_mock_interview';

export function signToken(payload: { userId: number; email: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
  } catch (error) {
    return null;
  }
}

export async function getUserFromRequest(req: NextRequest) {
  try {
    // 1. Check Authorization header
    const authHeader = req.headers.get('Authorization');
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // 2. Check Cookie header
      const cookieHeader = req.headers.get('cookie') || '';
      const tokenMatch = cookieHeader.match(/token=([^;]+)/);
      if (tokenMatch) {
        token = tokenMatch[1];
      }
    }

    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded) return null;

    const user = await db.user.findUnique({
      where: { id: decoded.userId },
    });

    return user;
  } catch (error) {
    console.error('Error getting user from request:', error);
    return null;
  }
}
