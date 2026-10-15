"use client";
import * as React from "react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Opts {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}

const Ctx = React.createContext<(o: Opts) => Promise<boolean>>(() => Promise.resolve(false));
export const useConfirm = () => React.useContext(Ctx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(Opts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = React.useCallback((o: Opts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onOpenChange={(o) => !o && close(false)}
        title={state?.title ?? ""}
        description={state?.description}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.tone === "primary" ? "primary" : "danger"} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </Ctx.Provider>
  );
}
