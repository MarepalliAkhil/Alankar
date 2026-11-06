import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface StackSeries {
  key: string;
  label: string;
  /** A theme colour variable, for example var(--color-primary). */
  color: string;
}

export interface StackedBarViewProps {
  data: readonly Record<string, string | number>[];
  series: readonly StackSeries[];
  /** Key of the label on the x axis. */
  xKey: string;
  title: string;
  /** Formats a value for the axis and the tooltip. */
  format?: (value: number) => string;
}

/** Stacked bars (revenue streams or booking outcomes per day). Colours come from the theme. */
export default function StackedBarView({ data, series, xKey, title, format }: StackedBarViewProps) {
  const fmt = format ?? ((value: number) => String(value));
  return (
    <div role="img" aria-label={title} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data as Record<string, string | number>[]}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            width={56}
            tickFormatter={fmt}
          />
          <Tooltip formatter={(value: unknown) => fmt(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
