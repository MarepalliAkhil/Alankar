import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listBlocks, type ContentBlock } from '../../api/content';
import { AboutEditor, HeroEditor } from '../../components/admin/content/HomeBlocks';
import { AchievementsPanel } from '../../components/admin/content/AchievementsPanel';
import { AnnouncementsEditor } from '../../components/admin/content/AnnouncementsEditor';
import { FaqPanel } from '../../components/admin/content/FaqPanel';
import { ZenotiansEditor } from '../../components/admin/content/ZenotiansEditor';
import { PageHeader } from '../../components/layout/PageContainer';
import { Card, ErrorState, LoadingState, TabPanel, Tabs, type TabItem } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

type Tab = 'home' | 'announcements' | 'faqs' | 'achievements' | 'zenotians';
const TABS: readonly TabItem<Tab>[] = [
  { id: 'home', label: 'Banner and About' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'zenotians', label: 'Zenotians page' },
];

/** Admin: the public site's content. Edits are drafts until you press Publish. */
export default function ContentPage() {
  useDocumentTitle('Website content');
  const [tab, setTab] = useState<Tab>('home');
  const blocks = useQuery({ queryKey: ['content-blocks'], queryFn: listBlocks });
  const find = <K extends ContentBlock['key']>(key: K) =>
    blocks.data?.find((b) => b.key === key) as ContentBlock<K> | undefined;

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Website content"
        description="Edit what visitors see. Banner, About, announcements and the Zenotians page are saved as drafts first: check the preview, then publish. Shop details, hours and the GST number are in Settings."
      />
      <Tabs
        items={TABS}
        value={tab}
        onChange={setTab}
        label="Content sections"
        idPrefix="content"
      />
      {tab === 'faqs' || tab === 'achievements' ? (
        <TabPanel idPrefix="content" id={tab}>
          {tab === 'faqs' ? <FaqPanel /> : <AchievementsPanel />}
        </TabPanel>
      ) : blocks.isPending ? (
        <Card variant="dense">
          <LoadingState label="Loading content…" />
        </Card>
      ) : blocks.isError ? (
        <Card variant="dense">
          <ErrorState
            description="We couldn't load the content."
            onRetry={() => void blocks.refetch()}
          />
        </Card>
      ) : (
        <TabPanel idPrefix="content" id={tab}>
          {tab === 'home' && (
            <div className="flex flex-col gap-lg">
              <HeroEditor key={JSON.stringify(find('hero'))} block={find('hero')!} />
              <AboutEditor key={JSON.stringify(find('about'))} block={find('about')!} />
            </div>
          )}
          {tab === 'announcements' && (
            <AnnouncementsEditor
              key={JSON.stringify(find('announcements'))}
              block={find('announcements')!}
            />
          )}
          {tab === 'zenotians' && (
            <ZenotiansEditor key={JSON.stringify(find('zenotians'))} block={find('zenotians')!} />
          )}
        </TabPanel>
      )}
    </div>
  );
}
