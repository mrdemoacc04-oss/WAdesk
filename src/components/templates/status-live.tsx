"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { TemplateStatusBadge } from "@/components/status";
import type { TemplateStatus } from "@/lib/shared/types";

/** Status badge that cross-fades when the status changes (e.g. In review → Approved as the poll lands). */
export function LiveStatusBadge({ status }: { status: TemplateStatus }) {
  return (
    <span className="relative inline-flex">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, y: 5, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -5, scale: 0.94 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className={status === "PENDING" ? "inline-flex [&>span>span:first-child]:animate-pulse-ring" : "inline-flex"}
        >
          <TemplateStatusBadge status={status} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
