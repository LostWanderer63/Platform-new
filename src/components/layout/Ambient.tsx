/** Fixed AAA ambient background — drifting glow orbs + grid texture. */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-base overflow-hidden">
      <div className="absolute inset-0 bg-base" />
      <div
        className="absolute -left-40 -top-40 h-[36rem] w-[36rem] animate-drift rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgb(var(--amb-1)/0.04), transparent 70%)" }}
      />
      <div
        className="absolute -right-40 top-32 h-[40rem] w-[40rem] animate-drift rounded-full blur-[130px]"
        style={{
          background: "radial-gradient(circle, rgb(var(--amb-2)/0.03), transparent 70%)",
          animationDelay: "-6s",
        }}
      />
    </div>
  );
}
