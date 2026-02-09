"use client";

import { PencilIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Textarea } from "~/core/components/ui/textarea";
import { useLocalStorage } from "~/core/hooks/use-local-storage";

interface MotivationCardProps {
  streak: number;
  totalHours: number;
}

export function MotivationCard({ streak, totalHours }: MotivationCardProps) {
  const [reflection, setReflection] = useLocalStorage<string>(
    "coaching-reflection",
    ""
  );

  return (
    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-[#13131f]">
      <CardHeader className="pb-2 md:pb-3">
        <div className="flex items-center gap-2">
          <PencilIcon className="h-4 w-4 text-violet-500" />
          <CardTitle className="text-xs font-semibold md:text-sm">오늘의 회고</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        <div>
          <p className="mb-1.5 text-xs text-gray-500 md:mb-2 md:text-[13px]">
            오늘 공부하며 느낀 점이 있나요?
          </p>
          <Textarea
            placeholder="잘한 점, 어려웠던 점, 내일 해보고 싶은 것... 자유롭게 적어보세요 ✏️"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={3}
            className="min-h-[70px] resize-none border-gray-200 bg-gray-50 text-xs leading-relaxed placeholder:text-gray-400 focus:border-violet-500/50 focus:ring-violet-500/20 dark:border-gray-800 dark:bg-[#1a1a2e] dark:placeholder:text-gray-600 md:min-h-[80px] md:text-[13px]"
          />
          {reflection.length > 0 && (
            <div className="mt-1.5 text-[11px] font-medium text-[#4ecdc4] md:mt-2 md:text-xs">
              ✨ 회고를 쓰는 것만으로도 성장하고 있어요!
            </div>
          )}
        </div>

        <div className="rounded-lg border border-violet-500/10 bg-gradient-to-r from-violet-500/5 to-[#4ecdc4]/5 p-2.5 text-center text-xs italic text-violet-500 dark:text-violet-400 md:p-3 md:text-[13px]">
          "작은 진전도 진전이에요. 오늘도 한 걸음 나아갔어요 🌱"
        </div>
      </CardContent>
    </Card>
  );
}
