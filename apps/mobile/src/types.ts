export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended' | 'failed';

export type WorkspaceMode = 'supabase' | 'demo';

export type BillRecord = {
  id: string;
  title: string;
  summary: string;
  sponsor: string;
  status: string;
  state_scope?: string;
  pros?: string[];
  cons?: string[];
  approve_count: number;
  disapprove_count: number;
  total_votes: number;
};

export type ProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
  state: string;
  city: string | null;
  zip_code: string | null;
  interests: string[];
  role: 'user' | 'admin';
  verification_status: VerificationStatus;
  verification_submitted_at: string | null;
  verification_reviewed_at: string | null;
  verification_reviewed_by: string | null;
  verification_rejection_reason: string | null;
  verified_at: string | null;
};

export type VerificationSubmissionRecord = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  document_type: string;
  storage_paths: string[];
  document_checksum: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  decision_reason: string | null;
};

export type AppSession = {
  userId: string;
  email: string;
};

export type WorkspaceSnapshot = {
  mode: WorkspaceMode;
  session: AppSession | null;
  profile: ProfileRecord | null;
  submission: VerificationSubmissionRecord | null;
  bills: BillRecord[];
  message: string;
};

export type BillVote = 'approve' | 'disapprove';
