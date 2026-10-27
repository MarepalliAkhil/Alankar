import { useState } from 'react';
import { PackagesPanel } from '../../components/admin/wallet/PackagesPanel';
import { PlansPanel } from '../../components/admin/wallet/PlansPanel';
import { MembersPanel, PurchasesPanel, SalesPanel } from '../../components/admin/wallet/SoldPanel';
import { PageHeader } from '../../components/layout/PageContainer';
import { TabPanel, Tabs, type TabItem } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

type Tab = 'packages' | 'plans' | 'sold' | 'members' | 'sales';
const TABS: readonly TabItem<Tab>[] = [
  { id: 'packages', label: 'Packages' },
  { id: 'plans', label: 'Membership plans' },
  { id: 'sold', label: 'Packages sold' },
  { id: 'members', label: 'Members' },
  { id: 'sales', label: 'Sales' },
];

/** Admin: packages, membership plans and everything sold from them. */
export default function PackagesPage() {
  useDocumentTitle('Packages & Plans');
  const [tab, setTab] = useState<Tab>('packages');
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Packages & Plans"
        description="Sell bundles of sessions and memberships, see what customers hold, and put a session back or refund the unused ones."
      />
      <Tabs items={TABS} value={tab} onChange={setTab} label="Wallet sections" idPrefix="wallet" />
      <TabPanel idPrefix="wallet" id={tab}>
        {tab === 'packages' && <PackagesPanel />}
        {tab === 'plans' && <PlansPanel />}
        {tab === 'sold' && <PurchasesPanel />}
        {tab === 'members' && <MembersPanel />}
        {tab === 'sales' && <SalesPanel />}
      </TabPanel>
    </div>
  );
}
