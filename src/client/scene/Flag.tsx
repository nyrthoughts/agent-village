export function Flag({ top }: { top: number }) {
  return (
    <g className="review-flag" data-testid="review-flag" aria-label="Awaiting review flag">
      <path d={`M61 ${top} L61 ${top - 31}`} />
      <path className="review-flag__cloth" d={`M62 ${top - 30} Q78 ${top - 35} 88 ${top - 26} Q76 ${top - 21} 62 ${top - 24} Z`} />
    </g>
  );
}
