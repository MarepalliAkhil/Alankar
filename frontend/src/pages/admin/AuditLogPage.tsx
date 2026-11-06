import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { errorDetail } from '../../api/client';
import {
  downloadAuditCsv,
  getAuditLog,
  type AuditFilters,
  type AuditPage,
  type AuditRow,
} from '../../api/security';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  SkeletonTable,
  Select,
  Table,
  useToast,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';
import { saveBlob } from '../../lib/saveBlob';

const EMPTY: AuditFilters = { action: '', actor: '', q: '', from: '', to: '' };

const details = (row: AuditRow): string =>
  Object.keys(row.metadata).length === 0 ? '' : JSON.stringify(row.metadata);

/** Admin: who did what and when. Filters, pages, and a CSV download that is itself recorded. */
export default function AuditLogPage() {
  useDocumentTitle('Audit Log');
  const toast = useToast();
  const [draft, setDraft] = useState<AuditFilters>(EMPTY);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY);
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const log = useQuery({
    queryKey: ['audit-log', applied, page],
    queryFn: () => getAuditLog(applied, page),
    placeholderData: keepPreviousData,
  });
  const set = (key: keyof AuditFilters) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const download = async () => {
    setDownloading(true);
    try {
      saveBlob(await downloadAuditCsv(applied), 'audit-log.csv');
      void log.refetch();
    } catch (error) {
      toast.show({
        tone: 'danger',
        title: 'Download failed',
        description: errorDetail(error) ?? 'Please try again.',
      });
    } finally {
      setDownloading(false);
    }
  };

  const columns: Column<AuditRow>[] = [
    {
      key: 'when',
      header: 'When',
      render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span>,
    },
    { key: 'action', header: 'Action', render: (r) => r.action.replace(/_/g, ' ') },
    { key: 'actor', header: 'By', render: (r) => r.actor_email || '—' },
    { key: 'who', header: 'About', render: (r) => r.target_email || r.email || '—' },
    { key: 'ip', header: 'IP', render: (r) => r.ip_address ?? '—' },
    {
      key: 'details',
      header: 'Details',
      render: (r) => <span className="break-all text-text-muted">{details(r)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Audit Log"
        description="Every sign-in, change and export is recorded here. Passwords, codes and tokens are never shown."
      />
      <Card variant="dense" as="section" aria-label="Filters">
        <form
          className="grid gap-md md:grid-cols-3 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(draft);
            setPage(1);
          }}
        >
          <Select
            label="Action"
            value={draft.action}
            onChange={(e) => set('action')(e.target.value)}
            options={[
              { value: '', label: 'Any action' },
              ...(log.data?.actions ?? []).map((a) => ({ value: a.value, label: a.label })),
            ]}
          />
          <Input
            label="By (email)"
            value={draft.actor}
            onChange={(e) => set('actor')(e.target.value)}
          />
          <Input label="Search" value={draft.q} onChange={(e) => set('q')(e.target.value)} />
          <Input
            label="From"
            type="date"
            value={draft.from}
            onChange={(e) => set('from')(e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={draft.to}
            onChange={(e) => set('to')(e.target.value)}
          />
          <div className="flex flex-wrap gap-sm md:col-span-3 lg:col-span-5">
            <Button type="submit">Apply filters</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
                setPage(1);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={downloading}
              onClick={() => void download()}
            >
              <Download className="size-4" aria-hidden /> Download CSV
            </Button>
          </div>
        </form>
      </Card>

      {log.isPending ? (
        <Card variant="dense">
          <SkeletonTable rows={6} columns={6} label="Loading the audit log…" />
        </Card>
      ) : log.isError ? (
        <Card variant="dense">
          <ErrorState
            description={errorDetail(log.error) ?? "We couldn't load the audit log."}
            onRetry={() => void log.refetch()}
          />
        </Card>
      ) : log.data.results.length === 0 ? (
        <Card variant="dense">
          <EmptyState title="No entries match" description="Try different filters." />
        </Card>
      ) : (
        <AuditResults data={log.data} onPage={setPage} columns={columns} />
      )}
    </div>
  );
}

function AuditResults({
  data,
  columns,
  onPage,
}: {
  data: AuditPage;
  columns: Column<AuditRow>[];
  onPage: (page: number) => void;
}) {
  return (
    <>
      <Table
        caption="Audit log"
        columns={columns}
        rows={data.results}
        rowKey={(r) => String(r.id)}
      />
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm text-text-muted">
          {data.count} entries · page {data.page} of {data.pages}
        </p>
        <div className="flex gap-sm">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => onPage(data.page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={data.page >= data.pages}
            onClick={() => onPage(data.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
