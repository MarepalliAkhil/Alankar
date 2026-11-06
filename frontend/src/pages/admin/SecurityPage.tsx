import { useState } from 'react';
import { DataRequestsPanel } from '../../components/admin/security/DataRequestsPanel';
import { SessionsPanel } from '../../components/admin/security/SessionsPanel';
import { TwoFactorPanel } from '../../components/admin/security/TwoFactorPanel';
import { SignInsPanel } from '../../components/admin/security/SignInsPanel';
import { PageHeader } from '../../components/layout/PageContainer';
import { Tabs } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const TABS = [
  { id: 'signins', label: 'Sign-ins & locks' },
  { id: 'sessions', label: 'Staff sessions' },
  { id: 'requests', label: 'Data requests' },
  { id: 'two-factor', label: 'Two-step sign-in' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Admin: failed sign-ins and locks, signed-in staff, and customer data requests. */
export default function SecurityPage() {
  useDocumentTitle('Security');
  const [tab, setTab] = useState<Tab>('signins');
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Security"
        description="Watch sign-in problems, end a staff session, handle customers' data requests, and set up your own two-step sign-in."
      />
      <Tabs items={TABS} value={tab} onChange={setTab} label="Security sections" idPrefix="sec" />
      {tab === 'signins' && <SignInsPanel />}
      {tab === 'sessions' && <SessionsPanel />}
      {tab === 'requests' && <DataRequestsPanel />}
      {tab === 'two-factor' && <TwoFactorPanel />}
    </div>
  );
}
