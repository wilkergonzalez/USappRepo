import { NextResponse } from 'next/server';

import { authenticateAdminUser, loadAdminQueue } from '@/lib/verifications';
import { getAuthenticatedUserFromRequest, hasAdminSupabaseConfig } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!hasAdminSupabaseConfig()) {
    const data = await loadAdminQueue();
    return NextResponse.json(data);
  }

  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  const isAdmin = await authenticateAdminUser(user);
  if (!isAdmin) {
    return NextResponse.json({ message: 'Admin role required.' }, { status: 403 });
  }

  const data = await loadAdminQueue(user.id);
  return NextResponse.json(data);
}
