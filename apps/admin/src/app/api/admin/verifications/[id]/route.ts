import { NextResponse } from 'next/server';

import { authenticateAdminUser, performReviewAction } from '@/lib/verifications';
import { getAuthenticatedUserFromRequest, hasAdminSupabaseConfig } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getSubmissionId(request: Request) {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

export async function POST(request: Request) {
  const submissionId = getSubmissionId(request);
  if (!submissionId) {
    return NextResponse.json({ message: 'Submission id is required.' }, { status: 400 });
  }

  if (!hasAdminSupabaseConfig()) {
    return NextResponse.json({ message: 'Demo mode does not persist admin decisions.' });
  }

  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  const isAdmin = await authenticateAdminUser(user);
  if (!isAdmin) {
    return NextResponse.json({ message: 'Admin role required.' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let action = '';
  let reason: string | undefined;

  if (contentType.includes('application/json')) {
    const payload = await request.json();
    action = String(payload?.action ?? '');
    reason = payload?.reason ? String(payload.reason) : undefined;
  } else {
    const formData = await request.formData();
    action = String(formData.get('action') ?? '');
    const rawReason = formData.get('reason');
    reason = rawReason ? String(rawReason) : undefined;
  }

  if (!['approve', 'reject', 'request_resubmission'].includes(action)) {
    return NextResponse.json({ message: 'Unsupported action.' }, { status: 400 });
  }

  const result = await performReviewAction({
    submissionId,
    action: action as 'approve' | 'reject' | 'request_resubmission',
    reason,
  });

  return NextResponse.json(result);
}
