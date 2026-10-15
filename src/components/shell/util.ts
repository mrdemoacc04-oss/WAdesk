import { cn } from "@/lib/shared/utils";
import { formatPhone } from "@/lib/shared/phone";

export { cn };
export function formatPhoneSafe(p: string) {
  return p.startsWith("+") ? formatPhone(p) : p;
}
