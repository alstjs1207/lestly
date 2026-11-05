import { ChevronRightIcon, MessageCircleIcon } from "lucide-react";

interface ClassFooterProps {
  consultEnabled: boolean;
  onConsult: () => void;
}

export default function ClassFooter({
  consultEnabled,
  onConsult,
}: ClassFooterProps) {
  return (
    <footer
      aria-label="클래스 상담"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e6ddd5] bg-[#f5f0eb]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
    >
      <div className="mx-auto max-w-xl">
        <button
          type="button"
          disabled={!consultEnabled}
          onClick={onConsult}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#76533d] px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#62432f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#76533d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <MessageCircleIcon className="size-5" aria-hidden="true" />
          {consultEnabled ? "상담 신청" : "상담 신청 준비 중"}
          <ChevronRightIcon className="size-5" aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
