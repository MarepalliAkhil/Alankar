import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DivisionId } from '../../config/divisions';
import type { ArtId } from '../../design/art';
import { cn } from '../../lib/cn';
import { PageContainer } from '../layout/PageContainer';
import { AlankarIcon, ArtImage, BrandMark, ButtonLink, type AlankarIconName } from '../ui';
import type { ThemeName } from '../../design/themes';

const HERO: Record<DivisionId, ArtId> = {
  salon: 'salonHero',
  spa: 'spaHero',
  'beauty-parlor': 'parlorHero',
};
const ICONS: Record<DivisionId, AlankarIconName[]> = {
  salon: ['scissors', 'comb', 'mirror'],
  spa: ['lotus', 'stones', 'leaf'],
  'beauty-parlor': ['flower', 'brush', 'bangle'],
};
const NUMBER: Record<DivisionId, string> = { salon: '01', spa: '02', 'beauty-parlor': '03' };

export interface DivisionHeroProps {
  id: DivisionId;
  theme: ThemeName;
  label: string;
  summary: string;
  /** "9 services in 3 categories · Every price includes GST." */
  facts: ReactNode;
  book: string | null;
  tel: string | undefined;
}

function Actions({ book, tel }: Pick<DivisionHeroProps, 'book' | 'tel'>) {
  return (
    <div className="flex flex-wrap items-center gap-sm">
      {book && <ButtonLink to={book}>Book Now</ButtonLink>}
      {tel && (
        <a
          href={`tel:${tel}`}
          className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
        >
          <Phone aria-hidden="true" className="h-4 w-4" /> Call the salon
        </a>
      )}
    </div>
  );
}

/**
 * Three different openings for three different divisions (the page already wears its theme):
 * the salon is editorial (an asymmetric split, a numeral, hairlines, a framed photo), the spa is
 * calm (centred, airy, an arch-top photo) and the parlor is lively (a bold block, a leaf-shaped
 * photo, the flower ornament).
 */
export function DivisionHero(props: DivisionHeroProps) {
  const { id, theme, label, summary, facts } = props;
  const photo = (className: string) => (
    <ArtImage slot={HERO[id]} priority className={cn('h-full w-full', className)} />
  );
  const title = (cls: string) => <h1 className={cn('text-text', cls)}>{label}</h1>;
  const icons = (
    <span className="flex gap-sm text-primary-hover" aria-hidden="true">
      {ICONS[id].map((name) => (
        <AlankarIcon key={name} name={name} className="h-6 w-6" />
      ))}
    </span>
  );

  if (id === 'salon') {
    return (
      <header className="border-b border-border">
        <PageContainer className="grid items-end gap-lg py-xl lg:grid-cols-12 lg:gap-xl">
          <div className="flex flex-col gap-md lg:col-span-7">
            <p className="tabular flex items-center gap-sm text-sm font-semibold text-primary-hover">
              <span>{NUMBER[id]}</span>
              <span aria-hidden="true" className="h-px w-12 bg-primary-hover" />
              <span>Services</span>
            </p>
            {title('text-6xl')}
            <p className="max-w-[48ch] text-lg text-text-muted">{summary}</p>
            <p className="border-t border-border pt-sm text-sm text-text">{facts}</p>
            <Actions book={props.book} tel={props.tel} />
          </div>
          <div className="relative lg:col-span-5">
            <div className="aspect-[4/5] overflow-hidden rounded-card border border-border">
              {photo('')}
            </div>
            <span className="absolute -bottom-3 left-md rounded-input bg-surface px-md py-1 shadow-card">
              {icons}
            </span>
          </div>
        </PageContainer>
      </header>
    );
  }

  if (id === 'spa') {
    return (
      <header className="relative overflow-hidden">
        <div aria-hidden="true" className="ornament absolute inset-0" />
        <PageContainer className="relative flex flex-col items-center gap-lg py-2xl text-center">
          <BrandMark theme={theme} className="mark-still h-14 w-14" />
          <div className="shape-arch h-64 w-52 overflow-hidden border border-border sm:h-80 sm:w-64">
            {photo('')}
          </div>
          {title('text-5xl')}
          <p className="max-w-[44ch] text-lg text-text-muted">{summary}</p>
          {icons}
          <p className="text-sm text-text">{facts}</p>
          <Actions book={props.book} tel={props.tel} />
        </PageContainer>
      </header>
    );
  }

  return (
    <header className="relative overflow-hidden bg-primary-soft">
      <div aria-hidden="true" className="ornament absolute inset-0" />
      <PageContainer className="relative grid items-center gap-lg py-xl md:grid-cols-2">
        <div className="flex flex-col gap-md">
          <p className="w-fit -rotate-2 rounded-full bg-accent px-md py-1 text-sm font-bold text-on-accent">
            Skin, bridal, nails
          </p>
          {title('text-6xl')}
          <p className="max-w-[44ch] text-lg text-text">{summary}</p>
          {icons}
          <p className="text-sm text-text">{facts}</p>
          <Actions book={props.book} tel={props.tel} />
        </div>
        <div className="shape-leaf mx-auto aspect-square w-full max-w-md overflow-hidden border-4 border-surface shadow-raised">
          {photo('')}
        </div>
      </PageContainer>
    </header>
  );
}
