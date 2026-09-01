export function Roof({ y }: { y: number }) {
  return (
    <g className="roof" data-testid="verified-roof">
      <polygon className="roof__left" points={`40,${y} 18,${y - 8} 37,${y - 31} 40,${y - 18}`} />
      <polygon className="roof__right" points={`40,${y} 82,${y - 14} 61,${y - 34} 40,${y - 18}`} />
      <polygon className="roof__top" points={`18,${y - 8} 37,${y - 31} 61,${y - 34} 82,${y - 14} 40,${y}`} />
    </g>
  );
}
