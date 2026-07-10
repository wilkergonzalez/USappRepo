'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { getAdminBrowserClient, hasAdminSupabaseConfig } from '@/lib/supabase';
import type { AdminQueueResponse, VerificationQueueItem } from '@/lib/verifications';

type QueueLoadState = {
  loading: boolean;
  message: string;
  data: AdminQueueResponse | null;
};

const initialState: QueueLoadState = {
  loading: true,
  message: 'Loading admin dashboard…',
  data: null,
};

export default function Home() {
  const [state, setState] = useState<QueueLoadState>(initialState);
  const [sessionEmail, setSessionEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const browserClient = useMemo(() => getAdminBrowserClient(), []);

  async function refreshDashboard(accessToken: string | null) {
    setState((current) => ({ ...current, loading: true, message: 'Refreshing queue…' }));

    const response = await fetch('/api/admin/verifications', {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      cache: 'no-store',
    });

    const payload = (await response.json()) as AdminQueueResponse & { message?: string };

    if (!response.ok) {
      setState({
        loading: false,
        message: payload.message ?? 'Unable to load admin queue.',
        data: null,
      });
      return;
    }

    setState({ loading: false, message: payload.message, data: payload });
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!browserClient) {
      setState((current) => ({ ...current, message: 'Supabase env vars are missing. Demo preview is read-only.' }));
      return;
    }

    const { error } = await browserClient.auth.signInWithPassword({
      email: sessionEmail,
      password,
    });

    if (error) {
      setState((current) => ({ ...current, message: error.message }));
      return;
    }

    const { data } = await browserClient.auth.getSession();
    setSignedInEmail(data.session?.user.email ?? sessionEmail);
    await refreshDashboard(data.session?.access_token ?? null);
  }

  async function handleSignOut() {
    if (!browserClient) {
      return;
    }

    await browserClient.auth.signOut();
    setSignedInEmail(null);
    await refreshDashboard(null);
  }

  async function handleAction(item: VerificationQueueItem, action: 'approve' | 'reject' | 'request_resubmission') {
    const accessToken = browserClient ? (await browserClient.auth.getSession()).data.session?.access_token ?? null : null;
    const response = await fetch(`/api/admin/verifications/${item.submissionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        action,
        reason: reasonDrafts[item.submissionId] ?? '',
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setState((current) => ({ ...current, message: payload.message ?? 'Action failed.' }));
      return;
    }

    setState((current) => ({ ...current, message: payload.message ?? 'Action saved.' }));
    setReasonDrafts((current) => ({ ...current, [item.submissionId]: '' }));
    await refreshDashboard(accessToken);
  }

  async function bootstrap() {
    if (browserClient) {
      const { data } = await browserClient.auth.getSession();
      setSignedInEmail(data.session?.user.email ?? null);
      await refreshDashboard(data.session?.access_token ?? null);
      return;
    }

    await refreshDashboard(null);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void bootstrap();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = state.data;
  const canRenderQueue = Boolean(data && (data.mode === 'demo' || data.isAdmin));
  const blocked = Boolean(data && data.mode === 'supabase' && !data.isAdmin);

  return (
    <main className="dashboard adminDashboard">
      <section className="hero">
        <div>
          <p className="eyebrow">US: The People · Admin</p>
          <h1>Verification review and civic ops dashboard</h1>
          <p className="lede">
            Live Supabase queue when configured. Demo preview remains available when env vars are absent.
          </p>
        </div>
        <div className="heroCard">
          <p className="heroLabel">Security posture</p>
          <p className="heroValue">No raw ID storage · signed URLs only · audit every override</p>
        </div>
      </section>

      <section className="statsGrid">
        <Stat label="Verified voters" value={data ? String(data.stats.verifiedVoters) : '—'} />
        <Stat label="Pending ID checks" value={data ? String(data.stats.pendingChecks) : '—'} />
        <Stat label="Bills tracked" value={data ? String(data.stats.trackedBills) : '—'} />
        <Stat label="Admin actions today" value={data ? String(data.stats.actionsToday) : '—'} />
      </section>

      <section className="panel authPanel">
        <div className="panelHeader">
          <h2>Admin access</h2>
          <span>{hasAdminSupabaseConfig() ? 'Supabase Auth' : 'Demo preview'}</span>
        </div>
        <p className="ledeSmall">{state.message}</p>
        {browserClient ? (
          <form className="authForm" onSubmit={handleSignIn}>
            <input value={sessionEmail} onChange={(event) => setSessionEmail(event.target.value)} placeholder="admin@example.com" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
            <div className="buttonRow">
              <button type="submit">Sign in</button>
              <button type="button" className="ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
            {signedInEmail ? <p className="ledeSmall">Signed in as {signedInEmail}</p> : null}
          </form>
        ) : (
          <p className="ledeSmall">Set Supabase env vars to enable live sign-in and queue review actions.</p>
        )}
        {blocked ? <p className="blockedState">You are signed in, but this account is not marked as admin.</p> : null}
      </section>

      {canRenderQueue ? (
        <section className="contentGrid">
          <article className="panel large">
            <div className="panelHeader">
              <h2>Verification queue</h2>
              <span>{data?.queue.length ?? 0} submissions</span>
            </div>
            <div className="table">
              {data?.queue.map((item) => (
                <div key={item.submissionId} className="row queueRow">
                  <div className="queueSummary">
                    <strong>{item.name}</strong>
                    <p>{item.email}</p>
                    <p>
                      {item.city} · {item.zipCode} · {item.documentType}
                    </p>
                    <p>{item.note}</p>
                    <p className="metaLine">Submitted {new Date(item.submittedAt).toLocaleString()}</p>
                    {item.signedDocumentUrl ? (
                      <a href={item.signedDocumentUrl} target="_blank" rel="noreferrer">
                        Open signed document link
                      </a>
                    ) : (
                      <span className="metaLine">Private document stored in Supabase</span>
                    )}
                  </div>
                  <div className="rowActions">
                    <Badge status={item.status} />
                    <textarea
                      value={reasonDrafts[item.submissionId] ?? ''}
                      onChange={(event) => setReasonDrafts((current) => ({ ...current, [item.submissionId]: event.target.value }))}
                      placeholder="Review reason or resubmission note"
                    />
                    <div className="buttonRow stack">
                      <button type="button" onClick={() => void handleAction(item, 'approve')}>
                        Approve
                      </button>
                      <button type="button" className="ghost" onClick={() => void handleAction(item, 'request_resubmission')}>
                        Request resubmission
                      </button>
                      <button type="button" className="ghost danger" onClick={() => void handleAction(item, 'reject')}>
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panelHeader">
              <h2>Recent audit log</h2>
              <span>Immutable notes</span>
            </div>
            <ul className="auditList">
              {data?.audit.map((entry) => <li key={entry}>{entry}</li>)}
            </ul>
          </article>

          <article className="panel">
            <div className="panelHeader">
              <h2>Tracked bills</h2>
              <span>Utah scope</span>
            </div>
            <div className="billList">
              {data?.bills.map((bill) => (
                <div key={bill.id} className="billItem">
                  <strong>{bill.title}</strong>
                  <p>{bill.scope}</p>
                  <span>{bill.votes}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : (
        <section className="panel">
          <div className="panelHeader">
            <h2>Verification queue</h2>
            <span>{data?.mode === 'demo' ? 'Demo mode' : 'Blocked'}</span>
          </div>
          <p className="ledeSmall">
            {data?.mode === 'demo'
              ? 'Demo data is available without Supabase credentials.'
              : 'Log in with an admin account to unlock the live review queue.'}
          </p>
          <div className="table">
            {data?.queue.map((item) => (
              <div key={item.submissionId} className="row queueRow">
                <div className="queueSummary">
                  <strong>{item.name}</strong>
                  <p>{item.email}</p>
                  <p>
                    {item.city} · {item.zipCode} · {item.documentType}
                  </p>
                  <p>{item.note}</p>
                </div>
                <Badge status={item.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="statCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Badge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`status ${status}`}>{label}</span>;
}
