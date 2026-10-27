import { useState } from 'react';
import { CampaignsPanel } from '../../components/admin/marketing/CampaignsPanel';
import { CouponsPanel } from '../../components/admin/marketing/CouponsPanel';
import { LoyaltyPanel } from '../../components/admin/marketing/LoyaltyPanel';
import { OffersPanel } from '../../components/admin/marketing/OffersPanel';
import { PageHeader } from '../../components/layout/PageContainer';
import { TabPanel, Tabs, type TabItem } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

type Tab = 'coupons' | 'offers' | 'loyalty' | 'campaigns';
const TABS: readonly TabItem<Tab>[] = [
  { id: 'coupons', label: 'Coupons' },
  { id: 'offers', label: 'Offers' },
  { id: 'loyalty', label: 'Loyalty' },
  { id: 'campaigns', label: 'Campaigns' },
];

/** Admin: coupons, website offers, loyalty rules and campaigns to opted-in customers. */
export default function MarketingPage() {
  useDocumentTitle('Marketing');
  const [tab, setTab] = useState<Tab>('coupons');
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Marketing"
        description="Coupons the counter accepts, offers on the website, loyalty rules, and campaigns to customers who agreed to receive them."
      />
      <Tabs
        items={TABS}
        value={tab}
        onChange={setTab}
        label="Marketing sections"
        idPrefix="marketing"
      />
      <TabPanel idPrefix="marketing" id={tab}>
        {tab === 'coupons' && <CouponsPanel />}
        {tab === 'offers' && <OffersPanel />}
        {tab === 'loyalty' && <LoyaltyPanel />}
        {tab === 'campaigns' && <CampaignsPanel />}
      </TabPanel>
    </div>
  );
}
