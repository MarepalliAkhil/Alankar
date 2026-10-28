/** Draws a QR code from rows of "1" (dark) and "0" (light), with the quiet border scanners need. */
export function QrImage({ rows, label }: { rows: string[]; label: string }) {
  const size = rows.length;
  const squares: string[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '1') squares.push(`M${x} ${y}h1v1h-1z`);
    }
  });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      className="size-56 rounded-nested bg-surface text-text"
      shapeRendering="crispEdges"
    >
      <path d={squares.join('')} fill="currentColor" />
    </svg>
  );
}
