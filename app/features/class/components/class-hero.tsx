import { MapPinIcon, ClockIcon, CalendarIcon } from "lucide-react";

interface ClassHeroProps {
  title: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  locationType?: string | null;
  durationMinutes?: number | null;
  totalSessions?: number | null;
}

export default function ClassHero({
  title,
  subtitle,
  coverImageUrl,
  locationType,
  durationMinutes,
  totalSessions,
}: ClassHeroProps) {
  // 시간 포맷팅 (분 -> 시간)
  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
    }
    return `${minutes}분`;
  };

  return (
    <div className="relative">
      {/* 배경 색상 */}
      <div className="bg-[#8b6f5c] text-white pt-12 pb-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          {/* 클래스 제목 */}
          <h1 className="text-3xl md:text-4xl font-bold mb-3">{title}</h1>

          {/* 부제목 */}
          {subtitle && (
            <p className="text-lg text-white/90 mb-8">{subtitle}</p>
          )}

          {/* 커버 이미지 */}
          {coverImageUrl && (
            <div className="relative w-full max-w-xl mx-auto aspect-[4/3] rounded-2xl overflow-hidden shadow-xl mb-8">
              <img
                src={coverImageUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* 메타 정보 배지 */}
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            {/* 위치 타입 */}
            <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
              <MapPinIcon className="w-4 h-4" />
              <span>
                {locationType === "online" ? "온라인 수업" : "오프라인 수업"}
              </span>
            </div>

            {/* 수업 시간 */}
            {durationMinutes && (
              <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
                <ClockIcon className="w-4 h-4" />
                <span>{formatDuration(durationMinutes)}</span>
              </div>
            )}

            {/* 총 회차 */}
            {totalSessions && (
              <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
                <CalendarIcon className="w-4 h-4" />
                <span>총 {totalSessions}회</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
