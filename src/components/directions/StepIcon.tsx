import type { ReactElement } from "react";
import type { RouteStep } from "@/lib/routing/directions";

/** Line icon for a direction step (turn arrows, stairs, lift, arrival…). */
export function StepIcon({ step, size = 16 }: { step: RouteStep; size?: number }): ReactElement {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    "aria-hidden": true as const,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (step.type) {
    case "arrive":
      return (
        <svg {...common}>
          <path d="M4 15V2m0 0h8l-2 3 2 3H4" />
        </svg>
      );
    case "stairs":
      return (
        <svg {...common}>
          <path d="M1 14h4v-4h4V6h4V2h2" />
        </svg>
      );
    case "lift":
      return (
        <svg {...common}>
          <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
          <path d="M6 7L8 4.5 10 7M6 10l2 2.5 2-2.5" />
        </svg>
      );
    case "ramp":
      return (
        <svg {...common}>
          <path d="M1 13L15 5M1 13h14" />
        </svg>
      );
    case "road-crossing":
      return (
        <svg {...common}>
          <path d="M8 1.5v2M8 6v2M8 10.5v2M1 14.5h14M1 1.5h14" />
        </svg>
      );
    default: {
      const i = step.instruction.toLowerCase();
      if (i.startsWith("turn left") || i.startsWith("bear left")) {
        return (
          <svg {...common}>
            <path d="M12 14V8a3 3 0 0 0-3-3H3m0 0l3-3M3 5l3 3" />
          </svg>
        );
      }
      if (i.startsWith("turn right") || i.startsWith("bear right")) {
        return (
          <svg {...common}>
            <path d="M4 14V8a3 3 0 0 1 3-3h6m0 0l-3-3m3 3l-3 3" />
          </svg>
        );
      }
      return (
        <svg {...common}>
          <path d="M8 14V2m0 0L4.5 5.5M8 2l3.5 3.5" />
        </svg>
      );
    }
  }
}
