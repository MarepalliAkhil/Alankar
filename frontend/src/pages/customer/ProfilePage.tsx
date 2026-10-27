import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { genericErrorMessage } from '../../api/auth-messages';
import { changePassword, getProfile, updateProfile, type ProfilePayload } from '../../api/booking';
import { serverFieldErrors } from '../../api/client';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  PasswordInput,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { fieldErrors, isIndianMobile } from '../../lib/validation';

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name is too long.'),
  phone: z.string().refine(isIndianMobile, 'Enter a valid 10-digit mobile number.'),
  allergies: z.string().max(500, 'Keep this under 500 characters.'),
  preferences: z.string().max(500, 'Keep this under 500 characters.'),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    new_password: z.string().min(8, 'Use at least 8 characters.'),
    confirm: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((data) => data.new_password === data.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match.',
  });

type ProfileField = 'full_name' | 'phone' | 'allergies' | 'preferences';
type PasswordField = 'current_password' | 'new_password' | 'confirm';

/** Profile: contact details, allergies and preferences (stored encrypted), and password. */
export default function ProfilePage() {
  useDocumentTitle('Profile');
  const profile = useQuery({ queryKey: ['my-profile'], queryFn: getProfile });

  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader
        title="Profile"
        description="Your details are used to pre-fill booking requests."
      />
      {profile.isPending ? (
        <LoadingState label="Loading your profile…" />
      ) : profile.isError ? (
        <ErrorState
          description="We couldn't load your profile."
          onRetry={() => void profile.refetch()}
        />
      ) : (
        <div className="grid gap-lg lg:grid-cols-2">
          <DetailsForm initial={profile.data} />
          <PasswordForm />
        </div>
      )}
    </section>
  );
}

function DetailsForm({
  initial,
}: {
  initial: {
    full_name: string;
    email: string;
    phone: string;
    allergies: string;
    preferences: string;
  };
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    full_name: initial.full_name,
    phone: initial.phone,
    allergies: initial.allergies,
    preferences: initial.preferences,
  });
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});

  useEffect(() => {
    setValues({
      full_name: initial.full_name,
      phone: initial.phone,
      allergies: initial.allergies,
      preferences: initial.preferences,
    });
  }, [initial]);

  const save = useMutation({
    mutationFn: (payload: ProfilePayload) => updateProfile(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      toast.show({ tone: 'success', title: 'Profile saved' });
    },
    onError: (error) => {
      const fromServer = serverFieldErrors(error) as Partial<Record<ProfileField, string>>;
      setErrors(fromServer);
      if (Object.keys(fromServer).length === 0) {
        toast.show({
          tone: 'danger',
          title: 'Profile not saved',
          description: genericErrorMessage(error, 'Please try again.'),
        });
      }
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors<ProfileField>(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  const update = (key: ProfileField) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Card variant="plain" padding="lg" as="section">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-md">
        <h2 className="text-base font-semibold text-text">Your details</h2>
        <Input
          label="Full name"
          autoComplete="name"
          required
          value={values.full_name}
          onChange={update('full_name')}
          error={errors.full_name}
        />
        <Input
          label="Email"
          type="email"
          value={initial.email}
          readOnly
          disabled
          hint="To change your email, contact the salon."
        />
        <Input
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={values.phone}
          onChange={update('phone')}
          error={errors.phone}
        />
        <Textarea
          label="Allergies or sensitivities"
          hint="Shared only with the salon team. Stored encrypted."
          value={values.allergies}
          onChange={update('allergies')}
          error={errors.allergies}
        />
        <Textarea
          label="Preferences"
          hint="For example: preferred stylist, quiet appointments, products you like."
          value={values.preferences}
          onChange={update('preferences')}
          error={errors.preferences}
        />
        <div>
          <Button type="submit" loading={save.isPending}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [values, setValues] = useState({ current_password: '', new_password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});

  const change = useMutation({
    mutationFn: (payload: { current_password: string; new_password: string }) =>
      changePassword(payload),
    onSuccess: () => {
      setValues({ current_password: '', new_password: '', confirm: '' });
      toast.show({
        tone: 'success',
        title: 'Password changed',
        description: 'You were signed out of other devices.',
      });
    },
    onError: (error) => {
      const fromServer = serverFieldErrors(error) as Partial<Record<PasswordField, string>>;
      setErrors(fromServer);
      if (Object.keys(fromServer).length === 0) {
        toast.show({
          tone: 'danger',
          title: 'Password not changed',
          description: genericErrorMessage(error, 'Please try again.'),
        });
      }
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors<PasswordField>(parsed.error));
      return;
    }
    setErrors({});
    change.mutate({
      current_password: parsed.data.current_password,
      new_password: parsed.data.new_password,
    });
  };

  const update = (key: PasswordField) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Card variant="plain" padding="lg" as="section" className="h-fit">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-md">
        <h2 className="text-base font-semibold text-text">Change password</h2>
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          required
          value={values.current_password}
          onChange={update('current_password')}
          error={errors.current_password}
        />
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          hint="At least 8 characters."
          required
          value={values.new_password}
          onChange={update('new_password')}
          error={errors.new_password}
        />
        <PasswordInput
          label="Repeat new password"
          autoComplete="new-password"
          required
          value={values.confirm}
          onChange={update('confirm')}
          error={errors.confirm}
        />
        <div>
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
