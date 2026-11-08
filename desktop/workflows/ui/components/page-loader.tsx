import { useEffect, useRef } from "react";
import { CURVE } from "../../lib/catalog";

export interface PageLoaderProps {
  label?: string;
  role?: string;
  strokeScale?: number;
  pathSteps?: number;
}

export function PageLoader({
  label = "Loading",
  role = "status",
  strokeScale = 1,
  pathSteps = 240,
}: PageLoaderProps) {
  void label;
  void role;

  const pathRef = useRef<SVGPathElement | null>(null);
  const particleRefs = useRef<Array<SVGCircleElement | null>>([]);

  const norm = (progress: number) => ((progress % 1) + 1) % 1;
  function detailScaleFor(time: number, phaseOffset: number) {
    const p =
      ((time + phaseOffset * CURVE.pulseDurationMs) %
        CURVE.pulseDurationMs) /
      CURVE.pulseDurationMs;
    return 0.52 + ((Math.sin(p * (Math.PI * 2) + 0.55) + 1) / 2) * 0.48;
  }
  function buildPath(detailScale: number, steps: number) {
    return Array.from({ length: steps + 1 }, (_, i) => {
      const { x, y } = CURVE.point(i / steps, detailScale);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }
  function particleFor(
    index: number,
    progress: number,
    detailScale: number,
    scale: number,
  ) {
    const tail = index / (CURVE.particleCount - 1);
    const { x, y } = CURVE.point(
      norm(progress - tail * CURVE.trailSpan),
      detailScale,
    );
    const fade = (1 - tail) ** 0.56;
    return {
      x,
      y,
      opacity: 0.04 + fade * 0.96,
      radius: (0.9 + fade * 2.7) * scale,
    };
  }

  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const phaseOffset = Math.random();
    particleRefs.current.length = CURVE.particleCount;

    const render = (now: number) => {
      const time = now - startedAt;
      const progress =
        ((time + phaseOffset * CURVE.durationMs) % CURVE.durationMs) /
        CURVE.durationMs;
      const detailScale = detailScaleFor(time, phaseOffset);

      pathRef.current?.setAttribute("d", buildPath(detailScale, pathSteps));

      particleRefs.current.forEach((node, index) => {
        if (!node) return;
        const particle = particleFor(index, progress, detailScale, strokeScale);
        node.setAttribute("cx", particle.x.toFixed(2));
        node.setAttribute("cy", particle.y.toFixed(2));
        node.setAttribute("r", particle.radius.toFixed(2));
        node.setAttribute("opacity", particle.opacity.toFixed(3));
      });

      frame = window.requestAnimationFrame(render);
    };

    render(performance.now());
    return () => window.cancelAnimationFrame(frame);
  // The animation helpers are stable for the lifetime of this loader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathSteps, strokeScale]);

  return (
    <div className="grid h-full place-items-center">
      <div className="inline-grid size-10 place-items-center text-primary">
        <svg className="size-full overflow-visible">
          <path
            opacity="0.1"
            ref={pathRef}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={CURVE.strokeWidth * strokeScale}
          />
          {Array.from({ length: CURVE.particleCount }, (_, index) => (
            <circle
              fill="currentColor"
              key={index}
              ref={(node) => {
                particleRefs.current[index] = node;
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
