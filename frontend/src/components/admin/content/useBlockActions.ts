import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  discardDraft,
  publishBlock,
  saveDraft,
  unpublishBlock,
  type BlockKey,
  type BlockValues,
} from '../../../api/content';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import { useToast } from '../../ui';

/** Save / discard / publish / unpublish for one content block, with one message area. */
export function useBlockActions<K extends BlockKey>(key: K) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  const done = (title: string) => {
    setProblem('');
    setFields({});
    void queryClient.invalidateQueries({ queryKey: ['content-blocks'] });
    void queryClient.invalidateQueries({ queryKey: ['site'] });
    toast.show({ tone: 'success', title });
  };
  const failed = (error: unknown) => {
    const server = serverFieldErrors(error);
    setFields(server);
    setProblem(
      Object.keys(server).length > 0
        ? `Check the highlighted fields (${Object.keys(server).join(', ')}).`
        : (errorDetail(error) ?? 'That did not work. Please try again.'),
    );
  };

  const save = useMutation({
    mutationFn: (body: BlockValues[K]) => saveDraft(key, body),
    onSuccess: () => done('Draft saved. Nothing has changed on the public site yet.'),
    onError: failed,
  });
  const discard = useMutation({
    mutationFn: () => discardDraft(key),
    onSuccess: () => done('Draft discarded'),
    onError: failed,
  });
  const publish = useMutation({
    mutationFn: () => publishBlock(key),
    onSuccess: () => done('Published on the public site'),
    onError: failed,
  });
  const unpublish = useMutation({
    mutationFn: () => unpublishBlock(key),
    onSuccess: () => done('Hidden from the public site'),
    onError: failed,
  });
  const busy = save.isPending || discard.isPending || publish.isPending || unpublish.isPending;
  return { save, discard, publish, unpublish, busy, problem, setProblem, fields };
}
