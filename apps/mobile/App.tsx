import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import {
  castBillVote,
  completeDemoReview,
  loadWorkspaceState,
  saveProfileCompletion,
  sendPasswordResetEmail,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  uploadVerificationDocument,
} from './src/lib/verification';
import { subscribeToAuthChanges } from './src/lib/supabase';
import type { BillRecord, BillVote, VerificationStatus, WorkspaceSnapshot } from './src/types';

const INTERESTS = [
  'Education',
  'Healthcare',
  'Economy',
  'Public Safety',
  'Environment',
  'Civil Rights',
  'Housing',
];

const DOCUMENT_OPTIONS = ['Driver license', 'State ID', 'Utility bill', 'Lease agreement'];

const EMPTY_WORKSPACE: WorkspaceSnapshot = {
  mode: 'demo',
  session: null,
  profile: null,
  submission: null,
  bills: [],
  message: 'Loading workspace…',
};

type TabKey = 'bills' | 'profile' | 'verify' | 'account';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'bills', label: 'Bills' },
  { key: 'profile', label: 'Profile' },
  { key: 'verify', label: 'Verify' },
  { key: 'account', label: 'Account' },
];

function AppContent() {
  const insets = useSafeAreaInsets();
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('ada@example.com');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('Ada Citizen');
  const [city, setCity] = useState('Salt Lake City');
  const [zipCode, setZipCode] = useState('84101');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['Education', 'Healthcare']);
  const [selectedDocumentType, setSelectedDocumentType] = useState(DOCUMENT_OPTIONS[0]);
  const [pickedDocument, setPickedDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [activeBillId, setActiveBillId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('bills');

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    return subscribeToAuthChanges(() => {
      void refreshWorkspace();
    });
  }, []);

  useEffect(() => {
    if (!activeBillId && workspace.bills.length > 0) {
      setActiveBillId(workspace.bills[0].id);
    }
  }, [activeBillId, workspace.bills]);

  const activeBill = useMemo(
    () => workspace.bills.find((bill) => bill.id === activeBillId) ?? workspace.bills[0] ?? null,
    [activeBillId, workspace.bills],
  );

  const status = workspace.profile?.verification_status ?? 'unverified';
  const isVerified = status === 'verified';
  const isRejected = status === 'rejected' || status === 'failed';
  const isPending = status === 'pending';
  const isOfflineDemo = workspace.mode === 'demo';

  async function refreshWorkspace() {
    try {
      const nextWorkspace = await loadWorkspaceState();
      setWorkspace(nextWorkspace);
      if (nextWorkspace.profile) {
        setFullName(nextWorkspace.profile.full_name ?? fullName);
        setCity(nextWorkspace.profile.city ?? city);
        setZipCode(nextWorkspace.profile.zip_code ?? zipCode);
        setSelectedInterests(
          nextWorkspace.profile.interests.length >= 2 ? nextWorkspace.profile.interests : selectedInterests,
        );
      }
    } catch (error) {
      Alert.alert('Could not load workspace', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  const setBusyAlert = (label: string | null) => setBusy(label);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((current) =>
      current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest],
    );
  };

  const runAction = async (label: string, task: () => Promise<void>) => {
    setBusyAlert(label);
    try {
      await task();
      await refreshWorkspace();
    } catch (error) {
      Alert.alert(label, error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusyAlert(null);
    }
  };

  const handleSignIn = () =>
    runAction('Signing in', async () => {
      await signInWithEmail(email, password);
    });

  const handleSignUp = () =>
    runAction('Creating account', async () => {
      await signUpWithEmail(email, password);
    });

  const handleReset = () =>
    runAction('Sending reset email', async () => {
      const result = await sendPasswordResetEmail(email);
      Alert.alert('Password reset', result.message);
    });

  const handleSignOut = () =>
    runAction('Signing out', async () => {
      await signOut();
    });

  const handleSaveProfile = () =>
    runAction('Saving profile', async () => {
      const result = await saveProfileCompletion({
        fullName,
        city,
        zipCode,
        interests: selectedInterests,
      });
      setWorkspace((current) => ({
        ...current,
        profile: result.profile ?? current.profile,
        message: result.message,
      }));
    });

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setPickedDocument(result.assets[0]);
    } catch (error) {
      Alert.alert('Document picker failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUploadDocument = () => {
    if (!pickedDocument) {
      Alert.alert('Pick a file first', 'Choose a document before uploading it for review.');
      return;
    }

    const userId = workspace.session?.userId ?? workspace.profile?.id;
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in before uploading a verification document.');
      return;
    }

    return runAction('Uploading document', async () => {
      const result = await uploadVerificationDocument({
        documentType: selectedDocumentType,
        fileName: pickedDocument.name ?? 'verification-document',
        mimeType: pickedDocument.mimeType,
        fileUri: pickedDocument.uri,
        userId,
      });
      const submission = result.submission;
      if (!submission) {
        throw new Error('The verification upload did not create a submission.');
      }

      setWorkspace((current) => ({
        ...current,
        submission,
        profile: current.profile
          ? {
              ...current.profile,
              verification_status: 'pending',
              verification_submitted_at: submission.submitted_at,
              verification_rejection_reason: null,
            }
          : current.profile,
        message: result.message,
      }));

    });
  };

  const handleCastVote = (billId: string, vote: BillVote) => {
    if (!isVerified) {
      Alert.alert(
        'Voting locked',
        'You can browse bills before verification, but voting unlocks only after approval.',
      );
      return;
    }

    return runAction('Casting vote', async () => {
      await castBillVote(billId, vote);
    });
  };

  const handleDemoApprove = () =>
    runAction('Completing demo review', async () => {
      const result = await completeDemoReview('approve');
      Alert.alert('Demo review', result.message);
    });

  const handleDemoReject = () =>
    runAction('Completing demo review', async () => {
      const result = await completeDemoReview('reject');
      Alert.alert('Demo review', result.message);
    });

  const statusLabel =
    status === 'verified'
      ? 'Verified: voting enabled'
      : isPending
        ? 'Pending review'
        : isRejected
          ? 'Rejected: resubmit allowed'
          : 'Unverified: browse only';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>US: The People</Text>
          <Text style={styles.title}>Utah civic flow with Supabase-backed verification</Text>
          <Text style={styles.subtitle}>
            Browse bills first, complete a Utah profile, upload one private verification document,
            and cast votes only after approval.
          </Text>
          <View style={styles.badgeRow}>
            <Badge label={workspace.mode === 'supabase' ? 'Supabase connected' : 'Demo fallback active'} tone={workspace.mode === 'supabase' ? 'success' : 'warning'} />
            <Badge label={statusLabel} tone={isVerified ? 'success' : isPending ? 'warning' : 'neutral'} />
            <Badge label="Utah only" />
          </View>
        </View>

        {activeTab === 'account' ? (
          <Section title="1. Sign up or sign in">
          <Text style={styles.helperText}>{workspace.message}</Text>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="Choose a password" secureTextEntry />
          <View style={styles.actionRowWrap}>
            <ActionButton label={busy === 'Signing in' ? 'Signing in…' : 'Sign in'} onPress={handleSignIn} />
            <ActionButton label={busy === 'Creating account' ? 'Signing up…' : 'Sign up'} onPress={handleSignUp} tone="secondary" />
            <ActionButton label={busy === 'Sending reset email' ? 'Sending…' : 'Reset password'} onPress={handleReset} tone="ghost" />
            {workspace.session ? (
              <ActionButton label={busy === 'Signing out' ? 'Signing out…' : 'Sign out'} onPress={handleSignOut} tone="ghost" />
            ) : null}
          </View>
          <Text style={styles.helperText}>
            Password recovery uses email. In demo mode, these actions stay local so the prototype still runs without env vars.
          </Text>
          {workspace.session ? <MiniStat label="Signed in as" value={workspace.session.email} /> : null}
          </Section>
        ) : null}

        {activeTab === 'profile' ? (
          <Section title="2. Utah profile completion">
          <Text style={styles.helperText}>
            Browsing is allowed before verification. Voting stays locked until approval, and rejected users can resubmit.
          </Text>
          <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Full legal name" />
          <Field label="City" value={city} onChangeText={setCity} placeholder="City" />
          <Field label="ZIP code" value={zipCode} onChangeText={setZipCode} placeholder="84101" keyboardType="numeric" />
          <View style={styles.chips}>
            {INTERESTS.map((interest) => {
              const active = selectedInterests.includes(interest);
              return (
                <Pressable
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{interest}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.inlineRow}>
            <MiniStat label="State" value="UT" />
            <MiniStat label="Interests" value={String(selectedInterests.length)} />
            <MiniStat label="Status" value={status.toUpperCase()} />
          </View>
          <ActionButton
            label={busy === 'Saving profile' ? 'Saving…' : 'Save profile'}
            onPress={handleSaveProfile}
          />
          </Section>
        ) : null}

        {activeTab === 'verify' ? (
          <Section title="3. Verification document upload">
          <Text style={styles.helperText}>
            Upload one private file from your device or browser. The file stays in a private Supabase bucket and only metadata is stored in the app record.
          </Text>
          <View style={styles.inlineRow}>
            <MiniStat label="Document" value={selectedDocumentType} />
            <MiniStat label="Picked" value={pickedDocument?.name ?? 'None'} />
            <MiniStat label="Review" value={statusLabel} />
          </View>
          <View style={styles.chips}>
            {DOCUMENT_OPTIONS.map((option) => {
              const active = selectedDocumentType === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setSelectedDocumentType(option)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.actionRowWrap}>
            <ActionButton label="Choose file" onPress={handlePickDocument} tone="secondary" />
            <ActionButton
              label={busy === 'Uploading document' ? 'Uploading…' : 'Upload & mark pending'}
              onPress={handleUploadDocument}
            />
            {isOfflineDemo ? (
              <>
                <ActionButton label="Demo approve" onPress={handleDemoApprove} tone="ghost" />
                <ActionButton label="Demo reject" onPress={handleDemoReject} tone="ghost" />
              </>
            ) : null}
          </View>
          {workspace.submission ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>{workspace.submission.document_type}</Text>
              <Text style={styles.statusValue}>Submission: {workspace.submission.status}</Text>
              <Text style={styles.statusNote}>Submitted {new Date(workspace.submission.submitted_at).toLocaleString()}</Text>
              {workspace.profile?.verification_rejection_reason ? (
                <Text style={styles.statusNote}>Reason: {workspace.profile.verification_rejection_reason}</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.helperText}>No verification submission yet.</Text>
          )}
          </Section>
        ) : null}

        {activeTab === 'bills' ? (
          <>
            <Section title="4. Bill feed and vote gating">
          <Text style={styles.helperText}>
            Bills are fetched from Supabase when configured. In demo mode, the feed comes from seeded local data.
          </Text>
          {workspace.bills.map((bill) => {
            const active = bill.id === activeBill?.id;
            const locked = !isVerified;
            return (
              <Pressable key={bill.id} onPress={() => setActiveBillId(bill.id)} style={[styles.billCard, active && styles.billCardActive]}>
                <View style={styles.billHeader}>
                  <Text style={styles.billTitle}>{bill.title}</Text>
                  <Text style={styles.billMeta}>{bill.state_scope ?? 'UT'}</Text>
                </View>
                <Text style={styles.billSummary}>{bill.summary}</Text>
                <Text style={styles.billMetaLine}>{bill.sponsor} · {bill.status}</Text>
                <View style={styles.inlineRow}>
                  <MiniStat label="Approve" value={String(bill.approve_count)} />
                  <MiniStat label="Disapprove" value={String(bill.disapprove_count)} />
                  <MiniStat label="Total" value={String(bill.total_votes)} />
                </View>
                <View style={styles.actionRowWrap}>
                  <ActionButton
                    label={locked ? 'Locked' : 'Approve'}
                    onPress={() => handleCastVote(bill.id, 'approve')}
                    tone={locked ? 'ghost' : 'secondary'}
                  />
                  <ActionButton
                    label={locked ? 'Locked' : 'Disapprove'}
                    onPress={() => handleCastVote(bill.id, 'disapprove')}
                    tone={locked ? 'ghost' : 'ghost'}
                  />
                </View>
                <Text style={styles.voteHint}>
                  {locked
                    ? 'Voting is disabled until your profile is verified.'
                    : 'You are verified, so vote buttons are enabled.'}
                </Text>
              </Pressable>
            );
          })}
        </Section>

        <Section title="5. Bill detail">
          {activeBill ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>{activeBill.title}</Text>
              <Text style={styles.billMetaLine}>{activeBill.sponsor} · {activeBill.status} · {activeBill.state_scope ?? 'UT'}</Text>
              <Text style={styles.billSummary}>{activeBill.summary}</Text>
              <View style={styles.twoColumn}>
                <SidePanel title="Pros" items={activeBill.pros ?? []} accent="#00b894" />
                <SidePanel title="Cons" items={activeBill.cons ?? []} accent="#e17055" />
              </View>
            </View>
          ) : (
            <Text style={styles.helperText}>Pick a bill to inspect details.</Text>
          )}
            </Section>
          </>
        ) : null}
      </ScrollView>
      <View style={[styles.tabBar, { paddingBottom: 12 + insets.bottom }]} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} tab${selected ? ', selected' : ''}`}
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...props} style={styles.field} placeholderTextColor="#6c7a89" />
    </View>
  );
}

function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' }) {
  return <Text style={[styles.badge, tone === 'success' && styles.badgeSuccess, tone === 'warning' && styles.badgeWarning]}>{label}</Text>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, tone = 'primary', ...props }: { label: string; tone?: 'primary' | 'secondary' | 'ghost' } & ComponentProps<typeof Pressable>) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.buttonBase, tone === 'secondary' && styles.buttonSecondary, tone === 'ghost' && styles.buttonGhost, pressed && styles.buttonPressed, props.style as any]}>
      <Text style={[styles.buttonText, tone === 'ghost' && styles.buttonGhostText]}>{label}</Text>
    </Pressable>
  );
}

function SidePanel({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  return (
    <View style={styles.sidePanel}>
      <Text style={[styles.sidePanelTitle, { color: accent }]}>{title}</Text>
      {items.length > 0 ? items.map((item) => (
        <Text key={item} style={styles.sidePanelItem}>• {item}</Text>
      )) : <Text style={styles.sidePanelItem}>• No notes available</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  scroll: {
    padding: 20,
    paddingBottom: 120,
    gap: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0d1625',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabActive: {
    backgroundColor: '#14253d',
  },
  tabLabel: {
    color: '#97a5bb',
    fontSize: 13,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#79b8ff',
  },
  hero: {
    backgroundColor: '#0f1b2d',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  kicker: {
    color: '#79b8ff',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: 'white',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  subtitle: {
    color: '#c8d2e0',
    marginTop: 10,
    lineHeight: 22,
    fontSize: 15,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  badge: {
    color: '#d8e2f1',
    backgroundColor: '#14253d',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeSuccess: { backgroundColor: 'rgba(0, 184, 148, 0.18)', color: '#7bed9f' },
  badgeWarning: { backgroundColor: 'rgba(255, 190, 11, 0.18)', color: '#ffd166' },
  section: {
    backgroundColor: '#0d1625',
    borderRadius: 24,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  helperText: {
    color: '#97a5bb',
    lineHeight: 20,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    color: '#dfe7f3',
    fontSize: 13,
    fontWeight: '700',
  },
  field: {
    backgroundColor: '#13243c',
    color: 'white',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#14253d',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'rgba(121, 184, 255, 0.2)',
    borderColor: 'rgba(121, 184, 255, 0.6)',
  },
  chipText: {
    color: '#d8e2f1',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#e8f3ff',
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  buttonBase: {
    backgroundColor: '#79b8ff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonSecondary: {
    backgroundColor: '#14253d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: '#08223d',
    fontWeight: '800',
  },
  buttonGhostText: {
    color: '#edf3fb',
  },
  miniStat: {
    backgroundColor: '#13243c',
    borderRadius: 16,
    padding: 12,
    minWidth: 112,
    gap: 4,
  },
  miniStatLabel: {
    color: '#97a5bb',
    fontSize: 12,
  },
  miniStatValue: {
    color: 'white',
    fontWeight: '800',
  },
  statusCard: {
    backgroundColor: '#13243c',
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  statusLabel: {
    color: '#79b8ff',
    fontWeight: '800',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  statusValue: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  statusNote: {
    color: '#c8d2e0',
    lineHeight: 18,
  },
  billCard: {
    backgroundColor: '#13243c',
    borderRadius: 20,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  billCardActive: {
    borderColor: 'rgba(121, 184, 255, 0.65)',
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'baseline',
  },
  billTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },
  billMeta: {
    color: '#79b8ff',
    fontWeight: '800',
    fontSize: 12,
  },
  billSummary: {
    color: '#d6dfed',
    lineHeight: 20,
  },
  billMetaLine: {
    color: '#97a5bb',
    lineHeight: 18,
  },
  voteHint: {
    color: '#97a5bb',
    lineHeight: 18,
  },
  detailCard: {
    backgroundColor: '#13243c',
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  detailTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
  },
  twoColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sidePanel: {
    flex: 1,
    minWidth: 130,
    backgroundColor: '#0f1b2d',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  sidePanelTitle: {
    fontWeight: '800',
    fontSize: 14,
  },
  sidePanelItem: {
    color: '#c8d2e0',
    lineHeight: 18,
  },
});
