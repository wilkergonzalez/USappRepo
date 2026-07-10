import * as Crypto from 'expo-crypto';

import { getSupabaseClient, hasSupabaseConfig } from './supabase';
import type {
  AppSession,
  BillRecord,
  BillVote,
  ProfileRecord,
  VerificationSubmissionRecord,
  VerificationStatus,
  WorkspaceMode,
  WorkspaceSnapshot,
} from '../types';

type ProfileInput = {
  fullName: string;
  city: string;
  zipCode: string;
  interests: string[];
};

type DocumentUploadInput = {
  documentType: string;
  fileName: string;
  mimeType?: string | null;
  fileUri: string;
  userId: string;
};

const DEMO_BILLS: BillRecord[] = [
  {
    id: 'hb-101',
    title: 'Utah Classroom Technology Modernization Act',
    summary: 'Expands grants for device replacement, classroom connectivity, and teacher training in Utah public schools.',
    sponsor: 'Rep. Morgan Reed',
    status: 'Introduced',
    state_scope: 'UT',
    pros: ['Better connectivity for rural schools', 'Modern devices for instruction', 'Training funds for teachers'],
    cons: ['Ongoing maintenance costs', 'Districts must manage rollout', 'May favor already-resourced schools'],
    approve_count: 1842,
    disapprove_count: 611,
    total_votes: 2453,
  },
  {
    id: 'hb-204',
    title: 'Clean Transit Corridor Grant Program',
    summary: 'Creates pilot grants for low-emission transit routes connecting Utah population centers and commuter corridors.',
    sponsor: 'Sen. Elena Vasquez',
    status: 'Committee Review',
    state_scope: 'UT',
    pros: ['Potential emissions reduction', 'Improved commuter access', 'Pilot funding is limited'],
    cons: ['Requires matching funds', 'Could shift money from road maintenance', 'Long payback horizon'],
    approve_count: 1022,
    disapprove_count: 744,
    total_votes: 1766,
  },
  {
    id: 'hb-309',
    title: 'Family Care Affordability Tax Credit',
    summary: 'Offers a refundable tax credit for families with dependents who incur qualified care expenses in Utah.',
    sponsor: 'Rep. Aiden Holt',
    status: 'On Floor Calendar',
    state_scope: 'UT',
    pros: ['Direct relief to working families', 'Refundable credit reaches lower-income households', 'Clear administrative path'],
    cons: ['Budget impact', 'Eligibility complexity', 'May not fully cover childcare gaps'],
    approve_count: 2115,
    disapprove_count: 890,
    total_votes: 3005,
  },
];

const DEMO_SESSION: AppSession = {
  userId: 'demo-user',
  email: 'ada@example.com',
};

let demoProfile: ProfileRecord = {
  id: DEMO_SESSION.userId,
  email: DEMO_SESSION.email,
  full_name: 'Ada Citizen',
  state: 'UT',
  city: 'Salt Lake City',
  zip_code: '84101',
  interests: ['Education', 'Healthcare'],
  role: 'user',
  verification_status: 'unverified',
  verification_submitted_at: null,
  verification_reviewed_at: null,
  verification_reviewed_by: null,
  verification_rejection_reason: null,
  verified_at: null,
};

let demoSubmission: VerificationSubmissionRecord | null = null;
let demoBills: BillRecord[] = DEMO_BILLS.map((bill) => ({ ...bill }));
let demoSession: AppSession | null = DEMO_SESSION;

function cloneBills(bills: BillRecord[]) {
  return bills.map((bill) => ({ ...bill, pros: bill.pros ? [...bill.pros] : undefined, cons: bill.cons ? [...bill.cons] : undefined }));
}

function setDemoSession(session: AppSession | null) {
  demoSession = session;
}

function setDemoProfile(updater: (profile: ProfileRecord) => ProfileRecord) {
  demoProfile = updater(demoProfile);
}

function setDemoSubmission(submission: VerificationSubmissionRecord | null) {
  demoSubmission = submission;
}

function setDemoBills(updater: (bills: BillRecord[]) => BillRecord[]) {
  demoBills = updater(demoBills);
}

function normalizeText(value: string) {
  return value.trim();
}

function buildDemoSubmission(documentType: string, checksum: string) {
  const submission: VerificationSubmissionRecord = {
    id: `demo-submission-${Date.now()}`,
    user_id: DEMO_SESSION.userId,
    status: 'pending',
    document_type: documentType,
    storage_paths: ['demo/private/uploads/placeholder.pdf'],
    document_checksum: checksum,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    decision_reason: null,
  };

  setDemoSubmission(submission);
  setDemoProfile((profile) => ({
    ...profile,
    verification_status: 'pending',
    verification_submitted_at: submission.submitted_at,
    verification_rejection_reason: null,
  }));

  return submission;
}

export async function loadWorkspaceState(): Promise<WorkspaceSnapshot> {
  const client = getSupabaseClient();

  if (!client) {
    return {
      mode: 'demo',
      session: demoSession,
      profile: demoProfile,
      submission: demoSubmission,
      bills: cloneBills(demoBills),
      message: 'Demo mode is active. Configure Supabase env vars to switch to the live backend.',
    };
  }

  const [sessionResult, userResult, billsResult] = await Promise.all([
    client.auth.getSession(),
    client.auth.getUser(),
    client
      .from('bills')
      .select('id,title,summary,sponsor,status,state_scope,pros,cons,approve_count,disapprove_count,total_votes')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (sessionResult.error) {
    throw sessionResult.error;
  }
  if (userResult.error) {
    throw userResult.error;
  }

  const activeSession = sessionResult.data.session;
  const activeUser = userResult.data.user ?? activeSession?.user ?? null;

  let profile: ProfileRecord | null = null;
  let submission: VerificationSubmissionRecord | null = null;
  if (activeUser) {
    const [profileResult, submissionResult] = await Promise.all([
      client
        .from('profiles')
        .select('id,email,full_name,state,city,zip_code,interests,role,verification_status,verification_submitted_at,verification_reviewed_at,verification_reviewed_by,verification_rejection_reason,verified_at')
        .eq('id', activeUser.id)
        .maybeSingle(),
      client
        .from('verification_submissions')
        .select('id,user_id,status,document_type,storage_paths,document_checksum,submitted_at,reviewed_at,reviewed_by,decision_reason')
        .eq('user_id', activeUser.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      throw profileResult.error;
    }
    if (submissionResult.error) {
      throw submissionResult.error;
    }

    profile = profileResult.data ? mapProfile(profileResult.data) : null;
    submission = mapSubmission(submissionResult.data);
  }

  return {
    mode: 'supabase',
    session: activeUser ? { userId: activeUser.id, email: activeUser.email ?? '' } : null,
    profile,
    submission,
    bills: mapBills(billsResult.data ?? []),
    message: hasSupabaseConfig() ? 'Connected to Supabase.' : 'Demo mode is active.',
  };
}

function mapProfile(row: any): ProfileRecord {
  return {
    id: row.id,
    email: row.email ?? '',
    full_name: row.full_name ?? null,
    state: row.state ?? 'UT',
    city: row.city ?? null,
    zip_code: row.zip_code ?? null,
    interests: Array.isArray(row.interests) ? row.interests.filter(Boolean) : [],
    role: row.role === 'admin' ? 'admin' : 'user',
    verification_status: row.verification_status,
    verification_submitted_at: row.verification_submitted_at ?? null,
    verification_reviewed_at: row.verification_reviewed_at ?? null,
    verification_reviewed_by: row.verification_reviewed_by ?? null,
    verification_rejection_reason: row.verification_rejection_reason ?? null,
    verified_at: row.verified_at ?? null,
  };
}

function mapSubmission(row: any): VerificationSubmissionRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    document_type: row.document_type,
    storage_paths: Array.isArray(row.storage_paths) ? row.storage_paths.filter(Boolean) : [],
    document_checksum: row.document_checksum ?? null,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    decision_reason: row.decision_reason ?? null,
  };
}

function mapBills(rows: any[]): BillRecord[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    sponsor: row.sponsor ?? '',
    status: row.status,
    state_scope: row.state_scope ?? 'UT',
    pros: Array.isArray(row.pros) ? row.pros.filter(Boolean) : [],
    cons: Array.isArray(row.cons) ? row.cons.filter(Boolean) : [],
    approve_count: Number(row.approve_count ?? 0),
    disapprove_count: Number(row.disapprove_count ?? 0),
    total_votes: Number(row.total_votes ?? 0),
  }));
}

export async function signUpWithEmail(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) {
    const nextSession = { userId: `demo-${normalizeText(email).toLowerCase() || 'user'}`, email: normalizeText(email) || DEMO_SESSION.email };
    setDemoSession(nextSession);
    setDemoProfile((profile) => ({
      ...profile,
      id: nextSession.userId,
      email: nextSession.email,
      verification_status: 'unverified',
    }));
    return { session: nextSession, message: 'Demo account created locally.' };
  }

  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw error;
  }

  return { session: data.session ? { userId: data.session.user.id, email: data.session.user.email ?? email } : null, message: 'Supabase sign-up complete.' };
}

export async function signInWithEmail(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) {
    const nextSession = { userId: `demo-${normalizeText(email).toLowerCase() || 'user'}`, email: normalizeText(email) || DEMO_SESSION.email };
    setDemoSession(nextSession);
    setDemoProfile((profile) => ({
      ...profile,
      id: nextSession.userId,
      email: nextSession.email,
    }));
    return { session: nextSession, message: 'Demo sign-in complete.' };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }

  return { session: data.session ? { userId: data.session.user.id, email: data.session.user.email ?? email } : null, message: 'Signed in.' };
}

export async function sendPasswordResetEmail(email: string) {
  const client = getSupabaseClient();
  if (!client) {
    return { message: `Demo reset link would be sent to ${normalizeText(email) || DEMO_SESSION.email}.` };
  }

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: process.env.EXPO_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? undefined,
  });
  if (error) {
    throw error;
  }

  return { message: 'Password reset email requested.' };
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) {
    setDemoSession(null);
    return { message: 'Signed out of demo mode.' };
  }

  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }

  return { message: 'Signed out.' };
}

export async function saveProfileCompletion(input: ProfileInput) {
  const client = getSupabaseClient();
  const normalizedInterests = [...new Set(input.interests.map(normalizeText).filter(Boolean))];

  if (!client) {
    setDemoProfile((profile) => ({
      ...profile,
      full_name: normalizeText(input.fullName) || profile.full_name,
      city: normalizeText(input.city) || profile.city,
      zip_code: normalizeText(input.zipCode) || profile.zip_code,
      interests: normalizedInterests.length >= 2 ? normalizedInterests : profile.interests,
    }));

    return { message: 'Demo profile saved.', profile: demoProfile };
  }

  const { data, error } = await client.rpc('save_my_profile', {
    p_full_name: input.fullName,
    p_city: input.city,
    p_zip_code: input.zipCode,
    p_interests: normalizedInterests,
  });

  if (error) {
    throw error;
  }

  return { message: 'Profile saved in Supabase.', profile: mapProfile(data) };
}

async function blobChecksum(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, binary);
}

export async function uploadVerificationDocument(input: DocumentUploadInput) {
  const client = getSupabaseClient();
  const normalizedFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const storagePath = `${input.userId}/${Date.now()}-${normalizedFileName}`;

  if (!client) {
    const checksum = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${input.fileName}:${input.mimeType ?? 'application/octet-stream'}:${input.fileUri}`,
    );
    const submission = buildDemoSubmission(input.documentType, checksum);
    return {
      submission,
      storagePaths: submission.storage_paths,
      checksum,
      message: 'Demo upload recorded locally.',
    };
  }

  const response = await fetch(input.fileUri);
  if (!response.ok) {
    throw new Error(`Unable to read selected file: ${response.status}`);
  }

  const blob = await response.blob();
  const checksum = await blobChecksum(blob);
  const { error: uploadError } = await client.storage
    .from('verification-documents')
    .upload(storagePath, blob, {
      contentType: input.mimeType ?? 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data, error } = await client.rpc('submit_verification_document', {
    p_document_type: input.documentType,
    p_storage_paths: [storagePath],
    p_document_checksum: checksum,
    p_metadata: {
      file_name: input.fileName,
      mime_type: input.mimeType ?? 'application/octet-stream',
      file_size: blob.size,
    },
  });

  if (error) {
    throw error;
  }

  return {
    submission: mapSubmission(data),
    storagePaths: [storagePath],
    checksum,
    message: 'Verification document uploaded to Supabase Storage.',
  };
}

export async function castBillVote(billId: string, vote: BillVote) {
  const client = getSupabaseClient();
  if (!client) {
    setDemoBills((bills) =>
      bills.map((bill) =>
        bill.id === billId
          ? {
              ...bill,
              approve_count: vote === 'approve' ? bill.approve_count + 1 : bill.approve_count,
              disapprove_count: vote === 'disapprove' ? bill.disapprove_count + 1 : bill.disapprove_count,
              total_votes: bill.total_votes + 1,
            }
          : bill,
      ),
    );
    return { message: `Demo vote recorded: ${vote}.` };
  }

  const { data, error } = await client.rpc('cast_bill_vote', {
    p_bill_id: billId,
    p_stance: vote,
  });

  if (error) {
    throw error;
  }

  return { message: `Vote recorded in Supabase: ${vote}.`, vote: data };
}

export async function completeDemoReview(decision: 'approve' | 'reject') {
  if (hasSupabaseConfig()) {
    return { message: 'Demo review is only available when Supabase env vars are missing.' };
  }

  if (decision === 'approve') {
    setDemoProfile((profile) => ({
      ...profile,
      verification_status: 'verified',
      verified_at: new Date().toISOString(),
      verification_reviewed_at: new Date().toISOString(),
      verification_rejection_reason: null,
    }));
  } else {
    setDemoProfile((profile) => ({
      ...profile,
      verification_status: 'rejected',
      verification_reviewed_at: new Date().toISOString(),
      verification_rejection_reason: 'Demo reviewer requested a clearer document scan.',
    }));
  }

  return { message: `Demo submission ${decision === 'approve' ? 'approved' : 'rejected'}.` };
}
