import { theme } from 'antd'

const MAX_POINTS = 60

export function MetricSparkline({
  values,
  label,
  stale = false,
  width = 240,
  height = 64,
}: {
  values: Array<number | null | undefined>
  label: string
  stale?: boolean
  width?: number
  height?: number
}) {
  const { token } = theme.useToken()
  const bounded = values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .slice(-MAX_POINTS)
    .map((value) => Math.max(0, Math.min(100, value)))
  const points = bounded
    .map((value, index) => {
      const x = bounded.length <= 1 ? width / 2 : (index / (bounded.length - 1)) * width
      const y = height - (value / 100) * (height - 4) - 2
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  const summary = bounded.length
    ? `${label}: ${bounded.at(-1)?.toFixed(1)} percent; ${bounded.length} recent samples${stale ? '; stale' : ''}.`
    : `${label}: no samples available.`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={summary}
      preserveAspectRatio="none"
    >
      <title>{summary}</title>
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke={token.colorBorderSecondary} />
      {points ? (
        <polyline
          points={points}
          fill="none"
          stroke={stale ? token.colorWarning : token.colorPrimary}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={token.colorTextQuaternary}
          strokeDasharray="4 4"
        />
      )}
    </svg>
  )
}
