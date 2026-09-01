export function Scaffold({ top }: { top: number }) {
  return (
    <g className="scaffold" data-testid="blocked-scaffold" aria-label="Blocked scaffold">
      <path d={`M11 134 L11 ${top} M89 122 L89 ${top - 12} M11 ${top + 12} L89 ${top - 1}`} />
      <path d={`M11 119 L89 96 M11 103 L89 80 M11 87 L89 64`} />
    </g>
  );
}
