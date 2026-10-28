import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  addAsFaq,
  dismissQuestion,
  getInsights,
  testQuestion,
  type QuestionStatus,
  type UnansweredRow,
} from '../../api/chatbotAdmin';
import { errorDetail } from '../../api/client';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  LoadingState,
  Modal,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Added as FAQ' },
  { value: 'dismissed', label: 'Dismissed' },
];

const humanize = (intent: string) => intent.replace(/[_:]/g, ' ');

function AddFaqModal({ row, onClose }: { row: UnansweredRow; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState(row.key.charAt(0).toUpperCase() + row.key.slice(1));
  const [answer, setAnswer] = useState('');
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: () => addAsFaq(row.id, { question: question.trim(), answer: answer.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chatbot-insights'] });
      toast.show({
        tone: 'success',
        title: 'Added as an FAQ',
        description: 'The bot knows it now.',
      });
      onClose();
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not save. Check both fields.'),
  });
  const ready = question.trim() !== '' && answer.trim() !== '';
  return (
    <Modal
      open
      onClose={onClose}
      title="Add as FAQ"
      description="Write the question as a customer would ask it, and the answer you want them to get. It also appears in the website FAQ."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Add FAQ'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <Input
          label="Question"
          value={question}
          maxLength={200}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Textarea
          label="Answer"
          value={answer}
          rows={4}
          maxLength={2000}
          onChange={(e) => setAnswer(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

function TestBox() {
  const [message, setMessage] = useState('');
  const test = useMutation({ mutationFn: (m: string) => testQuestion(m) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (message.trim()) test.mutate(message.trim());
  };
  const reply = test.data;
  return (
    <Card variant="dense" as="section" aria-label="Test box">
      <h2 className="text-lg font-semibold text-text">Test box</h2>
      <p className="mt-xs text-sm text-text-muted">
        Ask as a guest would. Nothing is logged and no customer data is used.
      </p>
      <form onSubmit={submit} className="mt-md flex flex-col gap-sm sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Test question"
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={test.isPending || !message.trim()}>
          {test.isPending ? 'Asking…' : 'Ask'}
        </Button>
      </form>
      {test.isError && (
        <p role="alert" className="mt-sm text-sm font-medium text-danger-text">
          {errorDetail(test.error) ?? 'The test failed.'}
        </p>
      )}
      {reply && (
        <div className="mt-md rounded-nested border border-border p-md" aria-live="polite">
          <p className="whitespace-pre-line text-sm text-text">{reply.text}</p>
          <p className="mt-xs text-xs text-text-muted">
            Understood as: {humanize(reply.intent)} · answered from: {reply.source}
          </p>
          {reply.suggestions.length > 0 && (
            <p className="mt-xs text-xs text-text-muted">
              Suggestions: {reply.suggestions.join(' · ')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Admin: what the chatbot could not answer (anonymous), what people ask most, and a test box. */
export default function ChatbotInsightsPage() {
  useDocumentTitle('Chatbot insights');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<QuestionStatus>('open');
  const [adding, setAdding] = useState<UnansweredRow | null>(null);
  const insights = useQuery({
    queryKey: ['chatbot-insights', status],
    queryFn: () => getInsights(status),
  });
  const dismiss = useMutation({
    mutationFn: (id: number) => dismissQuestion(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chatbot-insights'] });
      toast.show({ tone: 'success', title: 'Dismissed' });
    },
    onError: (e) =>
      toast.show({ tone: 'danger', title: 'Could not dismiss', description: errorDetail(e) }),
  });
  const top = insights.data?.usage[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Chatbot insights"
        description="Questions the chatbot could not answer are kept as anonymous wording with a count. No names, phone numbers or accounts are stored. Turn a frequent one into an FAQ and the bot answers it from then on."
      />

      <Card variant="dense" as="section" aria-label="Unanswered questions">
        <h2 className="text-lg font-semibold text-text">Unanswered questions</h2>
        <div className="mt-sm">
          <FilterChips
            label="Filter by state"
            options={FILTERS}
            value={status}
            onChange={(v) => setStatus(v as QuestionStatus)}
          />
        </div>
        <div className="mt-md">
          {insights.isPending ? (
            <LoadingState label="Loading the questions…" />
          ) : insights.isError ? (
            <ErrorState
              description="We couldn't load the chatbot insights."
              onRetry={() => void insights.refetch()}
            />
          ) : insights.data.unanswered.length === 0 ? (
            <EmptyState
              title="Nothing here"
              description="When someone asks something the bot cannot answer, it shows up here."
            />
          ) : (
            <ul className="flex flex-col gap-sm">
              {insights.data.unanswered.map((q) => (
                <li
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-nested border border-border p-md"
                >
                  <div>
                    <p className="font-semibold text-text">“{q.key}”</p>
                    <p className="text-xs text-text-muted">
                      Asked {q.count} {q.count === 1 ? 'time' : 'times'} · last{' '}
                      {formatDateTime(q.last_seen)}
                    </p>
                  </div>
                  {q.status === 'open' && (
                    <div className="flex gap-xs">
                      <Button type="button" size="sm" onClick={() => setAdding(q)}>
                        Add as FAQ
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate(q.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card variant="dense" as="section" aria-label="What people ask">
        <h2 className="text-lg font-semibold text-text">What people ask</h2>
        {insights.data && (
          <>
            <p className="mt-xs text-sm text-text-muted">
              Last {insights.data.days} days: {insights.data.total_questions} questions,{' '}
              {insights.data.unanswered_questions} could not be answered.
            </p>
            {insights.data.usage.length === 0 ? (
              <p className="mt-md text-sm text-text-muted">No questions yet.</p>
            ) : (
              <ul className="mt-md flex flex-col gap-xs">
                {insights.data.usage.map((u) => (
                  <li
                    key={u.intent}
                    className="grid grid-cols-[10rem_1fr_3rem] items-center gap-sm"
                  >
                    <span className="truncate text-sm text-text">{humanize(u.intent)}</span>
                    <progress
                      className="h-2 w-full accent-primary"
                      value={u.count}
                      max={top}
                      aria-label={`${humanize(u.intent)}: ${u.count}`}
                    />
                    <span className="text-right text-sm tabular-nums text-text">{u.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <TestBox />
      {adding && <AddFaqModal row={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
