import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

export interface ActivityPoint {
  label: string;
  value: number;
}

export function VaultActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="vaultFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.55} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.12)" strokeOpacity={0.35} vertical />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(value: number) =>
            value >= 1024 ? `${(value / 1024).toFixed(1)}K` : `${value}B`
          }
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
        />
        <Area
          type="linear"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={4}
          fill="url(#vaultFill)"
          activeDot={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ActivitySparkline({ data }: { data: ActivityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" hide />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#34d399"
          strokeWidth={2}
          fill="url(#sparkFill)"
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
