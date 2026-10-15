import * as React from "react";

export function StepHeader({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-medium tracking-[-0.02em]">{title}</h2>
        {description && <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ title, description, className }: { title: string; description?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-[15px] font-medium tracking-tight">{title}</h3>
      {description && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{description}</p>}
    </div>
  );
}
