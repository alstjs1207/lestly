import { ExternalLinkIcon, MapPinIcon } from "lucide-react";

interface ClassLocationProps {
  address: string;
}

export default function ClassLocation({ address }: ClassLocationProps) {
  // 네이버 지도 검색 URL 생성
  const mapSearchUrl = `https://map.naver.com/v5/search/${encodeURIComponent(address)}`;

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold text-gray-800 mb-4">강의 장소</h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-4">
          {/* 주소 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#d4a574]/10 flex items-center justify-center flex-shrink-0">
              <MapPinIcon className="w-5 h-5 text-[#d4a574]" />
            </div>
            <p className="text-gray-700">{address}</p>
          </div>

          {/* 장소 보기 버튼 */}
          <a
            href={mapSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4a574] hover:bg-[#c49464] text-white rounded-lg font-medium text-sm transition-colors flex-shrink-0"
          >
            장소 보기
            <ExternalLinkIcon className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
