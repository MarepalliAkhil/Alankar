import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import {
  getStaffDetails,
  linkStaffProfile,
  updateStaffDetails,
  WEEKDAYS,
  type StaffDetails,
  type Weekday,
  type WeeklyHours,
} from '../../api/admin';
import { errorDetail, serverFieldErrors } from '../../api/client';
import type { StaffMember } from '../../api/staff';
import {
  Button,
  Checkbox,
  Drawer,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Textarea,
  useToast,
} from '../ui';

const dayNames: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

interface DayForm {
  /** off = not working that day; custom = own hours; salon = follow the salon's hours */
  mode: 'salon' | 'custom' | 'off';
  start: string;
  end: string;
}

type HoursForm = Record<Weekday, DayForm>;

function hoursToForm(own: WeeklyHours, effective: StaffDetailsHours): HoursForm {
  const form = {} as HoursForm;
  for (const day of WEEKDAYS) {
    if (day in own) {
      const value = own[day];
      form[day] = value
        ? { mode: 'custom', start: value[0], end: value[1] }
        : { mode: 'off', start: '10:00', end: '19:00' };
    } else {
      const shop = effective[day];
      form[day] = { mode: 'salon', start: shop?.[0] ?? '10:00', end: shop?.[1] ?? '19:00' };
    }
  }
  return form;
}

type StaffDetailsHours = Record<Weekday, [string, string] | null | undefined>;

function formToHours(form: HoursForm): WeeklyHours | string {
  const out: WeeklyHours = {};
  for (const day of WEEKDAYS) {
    const row = form[day];
    if (row.mode === 'off') out[day] = null;
    else if (row.mode === 'custom') {
      if (!row.start || !row.end || row.start >= row.end) {
        return `${dayNames[day]}: the end time must be after the start time.`;
      }
      out[day] = [row.start, row.end];
    }
  }
  return out;
}

/** Admin: a stylist's team profile, services, weekly hours and public visibility. */
export function StaffDetailsDrawer({
  member,
  onClose,
}: {
  member: StaffMember | null;
  onClose: () => void;
}) {
  const id = member?.id ?? '';
  const details = useQuery({
    queryKey: ['staff-details', id],
    queryFn: () => getStaffDetails(id),
    enabled: member !== null,
  });
  return (
    <Drawer
      open={member !== null}
      onClose={onClose}
      title={member ? `Edit ${member.full_name || member.email}` : 'Edit staff'}
      description="Skills, services, working hours and the public team page. Every change is audited."
    >
      {details.isPending ? (
        <LoadingState label="Loading details…" />
      ) : details.isError ? (
        <ErrorState
          description="We couldn't load the details."
          onRetry={() => void details.refetch()}
        />
      ) : details.data.profile ? (
        <ProfileForm key={details.data.profile.id} id={id} data={details.data} />
      ) : (
        <LinkProfile id={id} data={details.data} />
      )}
    </Drawer>
  );
}

function LinkProfile({ id, data }: { id: string; data: StaffDetails }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState('');
  const link = useMutation({
    mutationFn: () => linkStaffProfile(id, profile),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Team profile linked' });
      void queryClient.invalidateQueries({ queryKey: ['staff-details', id] });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Could not link',
        description: errorDetail(error) ?? 'Please try again.',
      }),
  });
  const choices = data.unlinked_profiles ?? [];
  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-muted">
        This stylist has no team profile yet. It is created when they accept their invite; if one
        already exists for them, link it here.
      </p>
      {choices.length === 0 ? (
        <p className="text-sm text-text-muted">There are no unlinked profiles to choose from.</p>
      ) : (
        <>
          <Select
            label="Team profile"
            placeholder="Choose a profile"
            options={choices.map((c) => ({ value: c.id, label: `${c.display_name} · ${c.title}` }))}
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          />
          <Button disabled={!profile} loading={link.isPending} onClick={() => link.mutate()}>
            Link profile
          </Button>
        </>
      )}
    </div>
  );
}

function ProfileForm({ id, data }: { id: string; data: StaffDetails }) {
  const profile = data.profile!;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState({
    display_name: profile.display_name,
    title: profile.title,
    specialization: profile.specialization,
    bio: profile.bio,
    photo_url: profile.photo_url,
  });
  const [divisions, setDivisions] = useState<string[]>(profile.divisions);
  const [serviceIds, setServiceIds] = useState<string[]>(profile.service_ids);
  const [isPublic, setIsPublic] = useState(profile.is_public);
  const [hours, setHours] = useState<HoursForm>(() =>
    hoursToForm(profile.weekly_hours, profile.effective_hours),
  );
  const [problem, setProblem] = useState('');

  useEffect(() => setProblem(''), [fields, divisions, serviceIds, isPublic, hours]);

  const save = useMutation({
    mutationFn: updateStaffDetails.bind(null, id),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Details saved',
        description: 'The public team page is up to date.',
      });
      void queryClient.invalidateQueries({ queryKey: ['staff-details', id] });
    },
    onError: (error) => {
      const server = serverFieldErrors(error);
      setProblem(
        Object.values(server)[0] ?? errorDetail(error) ?? 'Could not save. Please try again.',
      );
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (fields.display_name.trim().length < 2) return setProblem('Enter the display name.');
    if (fields.title.trim().length < 2) return setProblem('Enter a title, like Senior stylist.');
    const weekly = formToHours(hours);
    if (typeof weekly === 'string') return setProblem(weekly);
    save.mutate({
      display_name: fields.display_name.trim(),
      title: fields.title.trim(),
      specialization: fields.specialization.trim(),
      bio: fields.bio.trim(),
      photo_url: fields.photo_url.trim(),
      divisions,
      service_ids: serviceIds,
      weekly_hours: weekly,
      is_public: isPublic,
    });
  };

  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...list, value] : list.filter((v) => v !== value);
  const setDay = (day: Weekday, patch: Partial<DayForm>) =>
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
  const set = (key: keyof typeof fields, value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-md"
      aria-label="Stylist details"
    >
      <Input
        label="Display name"
        required
        value={fields.display_name}
        onChange={(e) => set('display_name', e.target.value)}
      />
      <Input
        label="Title"
        required
        value={fields.title}
        onChange={(e) => set('title', e.target.value)}
      />
      <Input
        label="Specialisation"
        value={fields.specialization}
        onChange={(e) => set('specialization', e.target.value)}
      />
      <Textarea
        label="About them"
        value={fields.bio}
        onChange={(e) => set('bio', e.target.value)}
      />
      <Input
        label="Photo link"
        value={fields.photo_url}
        onChange={(e) => set('photo_url', e.target.value)}
      />

      <fieldset className="flex flex-col gap-sm rounded-card border border-border p-md">
        <legend className="px-1 text-sm font-medium text-text">Divisions</legend>
        {(data.divisions ?? []).map((d) => (
          <Checkbox
            key={d.value}
            label={d.label}
            checked={divisions.includes(d.value)}
            onChange={(e) => setDivisions((list) => toggle(list, d.value, e.target.checked))}
          />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-sm rounded-card border border-border p-md">
        <legend className="px-1 text-sm font-medium text-text">Services they can do</legend>
        {(data.services ?? []).map((s) => (
          <Checkbox
            key={s.id}
            label={`${s.name} · ${s.category}${s.is_active ? '' : ' (hidden)'}`}
            checked={serviceIds.includes(s.id)}
            onChange={(e) => setServiceIds((list) => toggle(list, s.id, e.target.checked))}
          />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-sm rounded-card border border-border p-md">
        <legend className="px-1 text-sm font-medium text-text">Weekly working hours</legend>
        <p className="text-xs text-text-muted">
          The booking page only offers this stylist inside these hours (and inside the salon's
          hours).
        </p>
        {WEEKDAYS.map((day) => (
          <div key={day} className="grid grid-cols-[5.5rem_1fr] items-end gap-sm">
            <span className="pb-3 text-sm text-text">{dayNames[day]}</span>
            <div className="flex flex-wrap items-end gap-sm">
              <Select
                label={`${dayNames[day]} hours`}
                options={[
                  { value: 'salon', label: 'Salon hours' },
                  { value: 'custom', label: 'Own hours' },
                  { value: 'off', label: 'Day off' },
                ]}
                value={hours[day].mode}
                onChange={(e) => setDay(day, { mode: e.target.value as DayForm['mode'] })}
              />
              {hours[day].mode === 'custom' && (
                <>
                  <Input
                    label={`${dayNames[day]} start`}
                    type="time"
                    value={hours[day].start}
                    onChange={(e) => setDay(day, { start: e.target.value })}
                  />
                  <Input
                    label={`${dayNames[day]} end`}
                    type="time"
                    value={hours[day].end}
                    onChange={(e) => setDay(day, { end: e.target.value })}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </fieldset>

      <Checkbox
        label="Show on the public Team page"
        checked={isPublic}
        onChange={(e) => setIsPublic(e.target.checked)}
      />
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
      <Button type="submit" loading={save.isPending}>
        Save details
      </Button>
    </form>
  );
}
