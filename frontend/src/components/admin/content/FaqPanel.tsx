import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createFaq,
  deleteFaq,
  listFaqs,
  updateFaq,
  type Faq,
  type FaqInput,
} from '../../../api/content';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Textarea,
  useToast,
} from '../../ui';

/** FAQs are also what the chatbot answers from. A draft FAQ is hidden from the site and bot. */
export function FaqPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const faqs = useQuery({ queryKey: ['content-faqs'], queryFn: listFaqs });
  const [editing, setEditing] = useState<Faq | 'new' | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['content-faqs'] });
    void queryClient.invalidateQueries({ queryKey: ['site'] });
  };
  const flip = useMutation({
    mutationFn: (faq: Faq) => updateFaq(faq.id, { is_active: !faq.is_active }),
    onSuccess: (faq) => {
      refresh();
      toast.show({ tone: 'success', title: faq.is_active ? 'FAQ published' : 'FAQ hidden' });
    },
  });
  const remove = useMutation({
    mutationFn: (faq: Faq) => deleteFaq(faq.id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'FAQ deleted' });
    },
  });

  return (
    <Card variant="dense" as="section" aria-label="FAQs">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">FAQs</h2>
          <p className="mt-1 text-sm text-text-muted">
            Questions shown on the home page. The chatbot answers from the published ones.
          </p>
        </div>
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> Add a question
        </Button>
      </div>
      <div className="mt-md">
        {faqs.isPending ? (
          <LoadingState label="Loading FAQs…" />
        ) : faqs.isError ? (
          <ErrorState
            description="We couldn't load the FAQs."
            onRetry={() => void faqs.refetch()}
          />
        ) : faqs.data.length === 0 ? (
          <EmptyState title="No questions yet" description="Add the questions guests ask most." />
        ) : (
          <ul className="flex flex-col gap-sm">
            {faqs.data.map((faq) => (
              <li key={faq.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-medium text-text">{faq.question}</p>
                  <Badge tone={faq.is_active ? 'success' : 'neutral'}>
                    {faq.is_active ? 'Published' : 'Draft'}
                  </Badge>
                  {!faq.show_in_faq && <Badge tone="info">Chatbot only</Badge>}
                </div>
                <p className="mt-xs text-sm text-text-muted">{faq.answer}</p>
                <div className="mt-sm flex flex-wrap gap-sm">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(faq)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => flip.mutate(faq)}
                    disabled={flip.isPending}
                  >
                    {faq.is_active ? 'Hide' : 'Publish'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => remove.mutate(faq)}
                    disabled={remove.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <FaqForm
          faq={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function FaqForm({
  faq,
  onClose,
  onSaved,
}: {
  faq: Faq | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    question: faq?.question ?? '',
    answer: faq?.answer ?? '',
    tags: (faq?.tags ?? []).join(', '),
    show_in_faq: faq?.show_in_faq ?? true,
    is_active: faq?.is_active ?? false,
  });
  const [problem, setProblem] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: FaqInput) => (faq ? updateFaq(faq.id, body) : createFaq(body)),
    onSuccess: () => {
      toast.show({ tone: 'success', title: faq ? 'FAQ saved' : 'FAQ added' });
      onSaved();
    },
    onError: (error) => {
      const server = serverFieldErrors(error);
      setFields(server);
      setProblem(
        Object.keys(server).length
          ? 'Check the highlighted fields.'
          : (errorDetail(error) ?? 'Could not save.'),
      );
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.question.trim().length < 3 || form.answer.trim().length < 3) {
      return setProblem('Write both the question and the answer.');
    }
    save.mutate({
      question: form.question.trim(),
      answer: form.answer.trim(),
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      show_in_faq: form.show_in_faq,
      is_active: form.is_active,
    });
  };
  return (
    <Modal open onClose={onClose} title={faq ? 'Edit question' : 'Add a question'} size="md">
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <Input
          label="Question"
          value={form.question}
          maxLength={200}
          error={fields.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
        />
        <Textarea
          label="Answer"
          rows={5}
          value={form.answer}
          error={fields.answer}
          onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
        />
        <Input
          label="Tags"
          hint="Words that help the chatbot find it, separated by commas."
          value={form.tags}
          error={fields.tags}
          onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
        />
        <Checkbox
          label="Show on the home page FAQ"
          checked={form.show_in_faq}
          onChange={(e) => setForm((f) => ({ ...f, show_in_faq: e.target.checked }))}
        />
        <Checkbox
          label="Published (visible to guests and the chatbot)"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
