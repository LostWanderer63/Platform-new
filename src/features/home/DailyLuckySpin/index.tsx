import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/lib/toast";

const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const SEGMENTS = [
  { label: "Try Again", amount: 0, fill: "#1c1f2f", text: "#cbd5e1" },
  { label: "$1.50", amount: 1.5, fill: "#7c5cff", text: "#ffffff" },
  { label: "$5.00", amount: 5, fill: "#06b6d4", text: "#ffffff" },
  { label: "$0.50", amount: 0.5, fill: "#2c314a", text: "#ffffff" },
  { label: "$10.00", amount: 10, fill: "#10b981", text: "#ffffff" },
  { label: "Try Again", amount: 0, fill: "#1c1f2f", text: "#cbd5e1" },
  { label: "$25.00", amount: 25, fill: "#f59e0b", text: "#ffffff" },
  { label: "$50.00 Mega", amount: 50, fill: "#ec4899", text: "#ffffff" },
];

/** Daily fortune wheel — awards local wallet credits, 3-minute cooldown. */
export function DailyLuckySpin() {
  const { addLocal } = useWallet();
  const { push } = useToast();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [cooldown, setCooldown] = useState<number>(() => {
    const saved = localStorage.getItem("aurora_spin_cooldown");
    if (!saved) return 0;
    const diff = Number(saved) - Date.now();
    return diff > 0 ? Math.ceil(diff / 1000) : 0;
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(t);
          localStorage.removeItem("aurora_spin_cooldown");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleSpin = () => {
    if (spinning || cooldown > 0) return;
    setSpinning(true);
    const sliceIndex = Math.floor(Math.random() * SEGMENTS.length);
    const selected = SEGMENTS[sliceIndex];
    const sliceDegrees = 360 / SEGMENTS.length;
    setRotation(1800 + (360 - (sliceIndex * sliceDegrees + sliceDegrees / 2)));

    setTimeout(() => {
      setSpinning(false);
      localStorage.setItem("aurora_spin_cooldown", String(Date.now() + 180 * 1000));
      setCooldown(180);
      if (selected.amount > 0) {
        addLocal(selected.amount);
        push(`🎉 Congratulations! You won ${fmtCurrency(selected.amount)}!`, "success");
      } else {
        push("Better luck next time! Check back in 3 minutes.", "info");
      }
    }, 4000);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <Card className="relative flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="absolute left-3 top-3">
        <Badge tone="accent">Daily Wheel</Badge>
      </div>

      <h3 className="mt-4 font-display text-[15px] font-bold text-ink">Lucky Fortune Spin</h3>
      <p className="mb-4 max-w-[200px] text-[11px] text-ink-soft">Spin to win free wallet credits!</p>

      <div className="relative my-2 h-44 w-44">
        <div className="absolute -top-2 left-[50%] z-raised h-0 w-0 -translate-x-[50%] border-l-[8px] border-r-[8px] border-t-[14px] border-l-transparent border-r-transparent border-t-accent drop-shadow-md filter" />
        <div
          className="h-full w-full overflow-hidden rounded-full border-[5px] border-line/20 bg-elevated shadow-e2 transition-transform duration-[4000ms] ease-spring"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <svg viewBox="0 0 200 200" className="h-full w-full">
            {SEGMENTS.map((seg, idx) => {
              const startAngle = (idx * 360) / 8;
              const endAngle = ((idx + 1) * 360) / 8;
              const rad1 = ((startAngle - 90) * Math.PI) / 180;
              const rad2 = ((endAngle - 90) * Math.PI) / 180;
              const cx = 100, cy = 100, r = 94;
              const x1 = cx + r * Math.cos(rad1);
              const y1 = cy + r * Math.sin(rad1);
              const x2 = cx + r * Math.cos(rad2);
              const y2 = cy + r * Math.sin(rad2);
              const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
              const midAngle = startAngle + 22.5;
              const textRad = ((midAngle - 90) * Math.PI) / 180;
              const tx = cx + r * 0.65 * Math.cos(textRad);
              const ty = cy + r * 0.65 * Math.sin(textRad);
              const flip = midAngle > 90 && midAngle < 270;
              const textRotation = flip ? midAngle + 180 : midAngle;
              return (
                <g key={idx}>
                  <path d={pathData} fill={seg.fill} stroke="rgba(6,7,13,0.3)" strokeWidth="1.5" />
                  <text
                    x={tx}
                    y={ty}
                    transform={`rotate(${textRotation}, ${tx}, ${ty})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: seg.text }}
                    className="font-sans text-[8.5px] font-extrabold tracking-tight"
                  >
                    {seg.label}
                  </text>
                </g>
              );
            })}
            {Array.from({ length: 16 }).map((_, i) => {
              const rad = (((i * 360) / 16 - 90) * Math.PI) / 180;
              return (
                <circle
                  key={i}
                  cx={100 + 88 * Math.cos(rad)}
                  cy={100 + 88 * Math.sin(rad)}
                  r="2"
                  fill="#ffffff"
                  className={`opacity-95 drop-shadow-[0_0_2px_rgba(255,255,255,0.8)] filter ${i % 2 === 0 ? "animate-pulse" : ""}`}
                  style={{ animationDelay: `${i * 100}ms`, animationDuration: "1s" }}
                />
              );
            })}
            <circle cx="100" cy="100" r="33" fill="rgba(6,7,13,0.5)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          </svg>
        </div>

        <button
          disabled={spinning || cooldown > 0}
          onClick={handleSpin}
          className={`absolute inset-[33%] z-raised flex flex-col items-center justify-center rounded-full border border-line/10 font-display text-[11px] font-extrabold shadow-md transition-all ${
            cooldown > 0
              ? "pointer-events-none bg-[#272a3a] text-ink-mut"
              : spinning
                ? "scale-95 bg-accent/40 text-ink"
                : "bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg hover:scale-105 active:scale-95"
          }`}
        >
          {cooldown > 0 ? <span className="font-stat text-[10px]">{fmtTime(cooldown)}</span> : spinning ? "..." : "SPIN"}
        </button>
      </div>
    </Card>
  );
}
