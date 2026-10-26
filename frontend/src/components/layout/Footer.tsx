import { brand, poweredBy } from '../../config/brand';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-2xl px-sm pb-lg sm:px-lg">
      <div className="glass mx-auto flex max-w-6xl flex-col gap-1 rounded-card px-lg py-md text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {brand.shopName} · {brand.shopTagline}
        </p>
        <p className="text-xs">{poweredBy}</p>
      </div>
    </footer>
  );
}
