import type { User } from '@supabase/supabase-js';

import { getAdminServerClient, hasAdminSupabaseConfig } from './supabase';

export type VerificationQueueItem = {
  submissionId: string;
  userId: string;
  name: string;
  email: string;
  city: string;
  zipCode: string;
  status: 'pending' | 'approved' | 'rejected';
  documentType: string;
  note: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  storagePaths: string[];
  signedDocumentUrl: string | null;
  profileStatus: string;
};

export type AdminQueueResponse = {
  mode: 'supabase' | 'demo';
  isAdmin: boolean;
  message: string;
  stats: {
    verifiedVoters: number;
    pendingChecks: number;
    trackedBills: number;
    actionsToday: number;
  };
  queue: VerificationQueueItem[];
  bills: Array<{
    id: string;
    title: string;
    scope: string;
    votes: string;
  }>;
  audit: string[];
};

const DEMO_QUEUE: VerificationQueueItem[] = [
  {
    submissionId: 'demo-submission-1',
    userId: 'demo-user',
    name: 'Ada Citizen',
    email: 'ada@example.com',
    city: 'Salt Lake City',
    zipCode: '84101',
    status: 'pending',
    documentType: 'Driver license',
    note: 'Document uploaded, waiting on review.',
    submittedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    storagePaths: ['demo/private/uploads/placeholder.pdf'],
    signedDocumentUrl: null,
    profileStatus: 'pending',
  },
  {
    submissionId: 'demo-submission-2',
    userId: 'demo-user-2',
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    city: 'Provo',
    zipCode: '84601',
    status: 'approved',
    documentType: 'State ID',
    note: 'Approved for Utah bill voting.',
    submittedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    reviewedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    reviewedBy: 'demo-admin',
    storagePaths: ['demo/private/uploads/jordan.pdf'],
    signedDocumentUrl: null,
    profileStatus: 'verified',
  },
  {
    submissionId: 'demo-submission-3',
    userId: 'demo-user-3',
    name: 'Maya Chen',
    email: 'maya@example.com',
    city: 'Ogden',
    zipCode: '84401',
    status: 'rejected',
    documentType: 'Utility bill',
    note: 'Mismatch between document and profile.',
    submittedAt: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
    reviewedAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    reviewedBy: 'demo-admin',
    storagePaths: ['demo/private/uploads/maya.pdf'],
    signedDocumentUrl: null,
    profileStatus: 'rejected',
  },
];

const DEMO_BILLS = [
  { id: 'hb-101', title: 'Utah Classroom Technology Modernization Act', scope: 'Education', votes: '1,842 approve / 611 disapprove' },
  { id: 'hb-204', title: 'Clean Transit Corridor Grant Program', scope: 'Environment', votes: '1,022 approve / 744 disapprove' },
  { id: 'hb-309', title: 'Family Care Affordability Tax Credit', scope: 'Economy', votes: '2,115 approve / 890 disapprove' },
];

const DEMO_AUDIT = [
  'Admin approved Ada Citizen verification',
  'Webhook replay ignored for event ve_1',
  'Failed document result queued for retry',
  'Vote lock enforced for unverified account',
];

export async function loadAdminQueue(currentUserId?: string): Promise<AdminQueueResponse> {
  const serverClient = getAdminServerClient();

  if (!serverClient) {
    return {
      mode: 'demo',
      isAdmin: false,
      message: 'Demo mode is active. Set Supabase env vars to load the live queue.',
      stats: {
        verifiedVoters: 1248,
        pendingChecks: 42,
        trackedBills: 83,
        actionsToday: 9,
      },
      queue: DEMO_QUEUE,
      bills: DEMO_BILLS,
      audit: DEMO_AUDIT,
    };
  }

  let isAdmin = false;
  if (currentUserId) {
    const { data: profile, error: profileError } = await serverClient
      .from('profiles')
      .select('role')
      .eq('id', currentUserId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    isAdmin = profile?.role === 'admin';
  }

  const [submissionsResult, billsResult, auditResult, verifiedResult, pendingResult, actionsResult] = await Promise.all([
    serverClient
      .from('verification_submissions')
      .select('id,user_id,status,document_type,storage_paths,submitted_at,reviewed_at,reviewed_by,decision_reason,profiles:profiles!verification_submissions_user_id_fkey(id,full_name,email,city,zip_code,verification_status,role)')
      .order('submitted_at', { ascending: false })
      .limit(25),
    serverClient
      .from('bills')
      .select('id,title,approve_count,disapprove_count,total_votes,state_scope')
      .order('updated_at', { ascending: false })
      .limit(3),
    serverClient
      .from('admin_audit_log')
      .select('action,created_at,metadata')
      .order('created_at', { ascending: false })
      .limit(5),
    serverClient.from('profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'verified'),
    serverClient.from('verification_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    serverClient.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()),
  ]);

  if (submissionsResult.error) {
    throw submissionsResult.error;
  }
  if (billsResult.error) {
    throw billsResult.error;
  }
  if (auditResult.error) {
    throw auditResult.error;
  }

  const queue = await Promise.all(
    (submissionsResult.data ?? []).map(async (row: any) => {
      const documentPath = row.storage_paths?.[0] ?? null;
      const signedDocumentUrl = documentPath
        ? (await serverClient.storage.from('verification-documents').createSignedUrl(documentPath, 60 * 10)).data?.signedUrl ?? null
        : null;

      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

      return {
        submissionId: row.id,
        userId: row.user_id,
        name: profile?.full_name ?? 'Unknown user',
        email: profile?.email ?? '',
        city: profile?.city ?? '',
        zipCode: profile?.zip_code ?? '',
        status: row.status,
        documentType: row.document_type,
        note: row.decision_reason ?? (row.reviewed_at ? 'Reviewed' : 'Awaiting review'),
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at ?? null,
        reviewedBy: row.reviewed_by ?? null,
        storagePaths: Array.isArray(row.storage_paths) ? row.storage_paths.filter(Boolean) : [],
        signedDocumentUrl,
        profileStatus: profile?.verification_status ?? 'unverified',
      } satisfies VerificationQueueItem;
    }),
  );

  return {
    mode: 'supabase',
    isAdmin,
    message: hasAdminSupabaseConfig() ? 'Connected to Supabase.' : 'Demo mode is active.',
    stats: {
      verifiedVoters: verifiedResult.count ?? 0,
      pendingChecks: pendingResult.count ?? 0,
      trackedBills: billsResult.count ?? 0,
      actionsToday: actionsResult.count ?? 0,
    },
    queue,
    bills: (billsResult.data ?? []).map((bill: any) => ({
      id: bill.id,
      title: bill.title,
      scope: bill.state_scope ?? 'UT',
      votes: `${bill.approve_count ?? 0} approve / ${bill.disapprove_count ?? 0} disapprove`,
    })),
    audit: (auditResult.data ?? []).map((row: any) => `${row.action} · ${new Date(row.created_at).toLocaleString()}`),
  };
}

export async function authenticateAdminUser(user: User | null): Promise<boolean> {
  if (!user) {
    return false;
  }

  const serverClient = getAdminServerClient();
  if (!serverClient) {
    return false;
  }

  const { data, error } = await serverClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.role === 'admin';
}

export async function performReviewAction(input: {
  submissionId: string;
  action: 'approve' | 'reject' | 'request_resubmission';
  reason?: string;
}) {
  const serverClient = getAdminServerClient();
  if (!serverClient) {
    return { message: 'Demo mode does not persist admin decisions.' };
  }

  const { data, error } = await serverClient.rpc('review_verification_submission', {
    p_submission_id: input.submissionId,
    p_action: input.action,
    p_reason: input.reason ?? null,
  });

  if (error) {
    throw error;
  }

  if (data?.storage_paths?.length) {
    await Promise.all(
      data.storage_paths.map((path: string) => serverClient.storage.from('verification-documents').remove([path])),
    );
  }

  return { message: `Submission ${actionLabel(input.action)}.` };
}

function actionLabel(action: 'approve' | 'reject' | 'request_resubmission') {
  if (action === 'request_resubmission') {
    return 'marked for resubmission';
  }
  return action === 'approve' ? 'approved' : 'rejected';
}
