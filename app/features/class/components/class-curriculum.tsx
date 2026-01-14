import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { CurriculumItem } from "../queries";

interface ClassCurriculumProps {
  curriculum: CurriculumItem[];
}

export default function ClassCurriculum({ curriculum }: ClassCurriculumProps) {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (session: number) => {
    setOpenItems((prev) =>
      prev.includes(session)
        ? prev.filter((s) => s !== session)
        : [...prev, session]
    );
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-4">커리큘럼</h2>

      <div className="space-y-2">
        {curriculum.map((item) => {
          const isOpen = openItems.includes(item.session);

          return (
            <div
              key={item.session}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              {/* 헤더 */}
              <button
                type="button"
                onClick={() => toggleItem(item.session)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#d4a574] font-bold">
                    {item.session}
                    <span className="text-gray-400 font-normal ml-1">회차</span>
                  </span>
                  <span className="text-gray-800">{item.title}</span>
                </div>
                <ChevronDownIcon
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* 상세 내용 */}
              {isOpen && item.description && (
                <div className="px-4 pb-4 pt-0">
                  <div className="pl-12 text-gray-600 text-sm border-t border-gray-100 pt-3">
                    {item.description}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
