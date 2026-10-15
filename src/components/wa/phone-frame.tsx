"use client";
import * as React from "react";
import { ArrowLeft, DotsThreeVertical, Phone, SealCheck, VideoCamera, Plus, Smiley, Microphone } from "@phosphor-icons/react";
import { cn, initials } from "@/lib/shared/utils";

/** A restrained handset: dark titanium edge, WhatsApp chat chrome, scrollable wallpaper body. */
export function PhoneFrame({
  name = "Your business",
  subtitle = "Business account",
  children,
  className,
  height = 560,
  verified = true,
}: {
  name?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  height?: number;
  verified?: boolean;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[330px]", className)}>
      <div className="rounded-[46px] bg-[#16170f] p-[9px] shadow-[0_30px_60px_-24px_rgba(20,21,15,0.55),inset_0_0_0_1.5px_rgba(255,255,255,0.1)]">
        <div className="relative overflow-hidden rounded-[38px] bg-[#0b141a]" style={{ height }}>
          {/* status bar + island */}
          <div className="absolute left-1/2 top-2 z-20 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" />
          <div className="relative z-10 flex items-center gap-2.5 bg-[#1f2c34] px-3.5 pb-2.5 pt-10 text-white">
            <ArrowLeft size={18} className="shrink-0 opacity-80" weight="regular" />
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#25d366]/25 text-[11px] font-medium text-[#8ff0b7]">{initials(name)}</div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="flex items-center gap-1 truncate text-[13px] font-medium">
                <span className="truncate">{name}</span>
                {verified && <SealCheck size={13} weight="fill" className="shrink-0 text-[#25d366]" />}
              </p>
              <p className="truncate text-[10.5px] text-white/55">{subtitle}</p>
            </div>
            <VideoCamera size={18} className="opacity-80" weight="regular" />
            <Phone size={17} className="opacity-80" weight="regular" />
            <DotsThreeVertical size={18} className="opacity-80" weight="bold" />
          </div>
          <div className="wa-wallpaper absolute inset-x-0 bottom-[52px] top-[78px] overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-14" style={{ top: 82 }}>
            <div className="-mt-12 flex min-h-full flex-col justify-end gap-1.5 pt-2">{children}</div>
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 flex h-[52px] items-center gap-2 bg-[#0b141a] px-2.5">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-[#1f2c34] px-3 text-[12px] text-white/40">
              <Smiley size={17} />
              <span className="flex-1">Message</span>
              <Plus size={16} />
            </div>
            <div className="grid size-9 place-items-center rounded-full bg-[#25d366] text-[#07261a]">
              <Microphone size={17} weight="fill" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
