import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await db.interviewSession.findMany({
      where: { userId: user.id },
      include: {
        report: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error fetching dashboard details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
