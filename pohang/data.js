/* ══════════════════════════════════════════════════════════════════
   포항 무료 강연 큐레이션 — 데이터 레이어
   ------------------------------------------------------------------
   ★ 운영자는 이 파일 하나만 갈아끼우면 됩니다. (오즈의 마법사 MVP)
     매주 월요일: 기관 사이트 순회 → 아래 배열 갱신 → 저장 → 배포 끝.

   필드 규격
     id          고유값 (기관약어-연도-일련번호)
     title       강연/강좌명
     host        주최 기관
     category    테마  ('인문·교양' | '건강·의학' | '재테크·경제'
                       | '디지털·AI' | '자녀교육' | '문화·예술' | '창업·취업')
     district    지역  ('남구' | '북구' | '온라인')
     venue       장소
     date        개최일 (YYYY-MM-DD)
     time        시각 표기 (예: '19:00')
     durationMin 행동 소요 시간(분) — "얼마나 시간 내야 하나"에 답하는 값
     deadline    신청 마감일 (YYYY-MM-DD)
     capacity    정원 (모르면 null)
     remaining   잔여 좌석 (모르면 null) — 소셜 프루프용
     applyUrl    신청 링크
     tags        관심 해시태그 배열
     summary     3줄 요약 (AI 요약 자리 — 지금은 수기 작성)
   ══════════════════════════════════════════════════════════════════ */

/* 실데이터로 교체하기 전까지 true. 페이지 상단에 샘플 안내 배너가 뜹니다. */
const IS_SAMPLE_DATA = true;

/* 알림 신청을 받을 엔드포인트.
   비워두면 브라우저 localStorage 에만 쌓입니다 (?admin=1 로 확인).
   Google Form / Formspree / Make.com Webhook URL 을 넣으면 즉시 전송됩니다. */
const SUBMIT_ENDPOINT = '';

/* 실측 신청자 수에 더할 기준값. 0 이면 순수 실측치만 표시됩니다. */
const SIGNUP_BASELINE = 0;

const LECTURES = [
  {
    id: 'PLIB-2026-001',
    title: '나이 듦을 읽는 법 — 인생 후반부의 문장들',
    host: '포항시립도서관 포은중앙도서관',
    category: '인문·교양',
    district: '남구',
    venue: '포은중앙도서관 2층 시청각실',
    date: '2026-09-03', time: '19:00', durationMin: 90,
    deadline: '2026-09-01', capacity: 80, remaining: 12,
    applyUrl: 'https://lib.pohang.go.kr',
    tags: ['인문학', '중장년', '저녁강연'],
    summary: [
      '노년기를 다룬 국내외 산문 6편을 함께 읽습니다.',
      '사전 독서 없이 참석 가능하며 발제·발표는 없습니다.',
      '강연 후 20분 질의응답이 이어집니다.'
    ]
  },
  {
    id: 'PLIB-2026-002',
    title: '스마트폰으로 끝내는 관공서 민원 처리',
    host: '포항시립도서관 대잠도서관',
    category: '디지털·AI',
    district: '남구',
    venue: '대잠도서관 정보화교육실',
    date: '2026-09-05', time: '10:00', durationMin: 120,
    deadline: '2026-09-02', capacity: 25, remaining: 3,
    applyUrl: 'https://lib.pohang.go.kr',
    tags: ['스마트폰', '어르신', '실습형'],
    summary: [
      '정부24·건강보험 앱으로 서류 발급까지 직접 해봅니다.',
      '보조 강사가 1:5 로 붙어 실습을 돕습니다.',
      '본인 스마트폰을 지참해야 합니다.'
    ]
  },
  {
    id: 'PLLC-2026-011',
    title: '퇴직 전후 5년, 연금 설계 다시 보기',
    host: '포항시평생학습원',
    category: '재테크·경제',
    district: '북구',
    venue: '평생학습원 대강당',
    date: '2026-09-08', time: '14:00', durationMin: 100,
    deadline: '2026-09-04', capacity: 120, remaining: 41,
    applyUrl: 'https://lifelong.pohang.go.kr',
    tags: ['노후준비', '연금', '재무설계'],
    summary: [
      '국민연금·퇴직연금·개인연금 수령 순서를 사례로 비교합니다.',
      '특정 금융상품 판매·권유가 없는 공공 강연입니다.',
      '연금 예상 수령액 조회 방법을 현장에서 안내합니다.'
    ]
  },
  {
    id: 'PCF-2026-007',
    title: '사진으로 남기는 우리 동네 — 기초 촬영 워크숍',
    host: '포항문화재단',
    category: '문화·예술',
    district: '북구',
    venue: '포항문화예술회관 세미나실',
    date: '2026-09-10', time: '15:00', durationMin: 150,
    deadline: '2026-09-06', capacity: 20, remaining: 2,
    applyUrl: 'https://pohangcf.or.kr',
    tags: ['사진', '워크숍', '주말취미'],
    summary: [
      '스마트폰 카메라만으로 구도·빛을 잡는 법을 익힙니다.',
      '후반 60분은 회관 주변 야외 촬영 실습입니다.',
      '결과물은 참가자 온라인 전시로 이어집니다.'
    ]
  },
  {
    id: 'PLIB-2026-003',
    title: '초등 자녀와 대화가 막힐 때 — 부모 코칭 특강',
    host: '포항시립도서관 오천도서관',
    category: '자녀교육',
    district: '남구',
    venue: '오천도서관 다목적실',
    date: '2026-09-11', time: '10:30', durationMin: 90,
    deadline: '2026-09-08', capacity: 40, remaining: 18,
    applyUrl: 'https://lib.pohang.go.kr',
    tags: ['부모교육', '초등', '오전강연'],
    summary: [
      '아동상담 전문가가 실제 상담 사례를 재구성해 설명합니다.',
      '연령대별 대화 스크립트 예시를 배부합니다.',
      '자녀 동반은 불가하며 보호자만 참석합니다.'
    ]
  },
  {
    id: 'PHC-2026-022',
    title: '무릎이 보내는 신호 — 관절 통증 바로 알기',
    host: '포항시보건소',
    category: '건강·의학',
    district: '북구',
    venue: '북구보건소 3층 교육실',
    date: '2026-09-12', time: '14:00', durationMin: 60,
    deadline: '2026-09-10', capacity: 60, remaining: 33,
    applyUrl: 'https://www.pohang.go.kr',
    tags: ['건강', '중장년', '짧은강연'],
    summary: [
      '정형외과 전문의가 퇴행성 관절염 초기 신호를 설명합니다.',
      '집에서 따라 하는 근력 운동 5가지를 시연합니다.',
      '수술 여부 판단 기준을 질의응답으로 다룹니다.'
    ]
  },
  {
    id: 'PLLC-2026-012',
    title: 'AI에게 일 시키는 법 — 생성형 AI 입문',
    host: '포항시평생학습원',
    category: '디지털·AI',
    district: '온라인',
    venue: '온라인 실시간 (Zoom)',
    date: '2026-09-15', time: '19:30', durationMin: 90,
    deadline: '2026-09-12', capacity: 200, remaining: 87,
    applyUrl: 'https://lifelong.pohang.go.kr',
    tags: ['AI', '온라인', '직장인'],
    summary: [
      '문서 요약·이메일 초안 작성까지 실무 예시로 따라갑니다.',
      '별도 유료 구독 없이 무료 도구만으로 진행합니다.',
      '녹화본은 제공되지 않아 실시간 참여가 필요합니다.'
    ]
  },
  {
    id: 'PLIB-2026-004',
    title: '작가와의 만남 — 지역에서 쓴다는 것',
    host: '포항시립도서관 영암도서관',
    category: '인문·교양',
    district: '북구',
    venue: '영암도서관 북카페',
    date: '2026-09-17', time: '19:00', durationMin: 80,
    deadline: '2026-09-14', capacity: 50, remaining: 9,
    applyUrl: 'https://lib.pohang.go.kr',
    tags: ['북토크', '작가강연', '저녁강연'],
    summary: [
      '경북을 배경으로 한 소설을 쓴 작가의 창작 이야기입니다.',
      '사인회가 강연 직후 30분간 진행됩니다.',
      '도서 구매는 선택 사항입니다.'
    ]
  },
  {
    id: 'PSTP-2026-003',
    title: '1인 창업 첫걸음 — 사업자등록부터 세금까지',
    host: '포항창업지원센터',
    category: '창업·취업',
    district: '남구',
    venue: '창업지원센터 교육장',
    date: '2026-09-18', time: '14:00', durationMin: 180,
    deadline: '2026-09-15', capacity: 30, remaining: 14,
    applyUrl: 'https://www.pohang.go.kr',
    tags: ['창업', '세무', '예비창업자'],
    summary: [
      '세무사가 업종별 사업자등록 유형을 비교해 줍니다.',
      '부가세·종합소득세 신고 일정표를 배부합니다.',
      '후반 60분은 1:1 상담 순번제로 운영됩니다.'
    ]
  },
  {
    id: 'PCF-2026-008',
    title: '클래식이 어려운 사람을 위한 90분',
    host: '포항문화재단',
    category: '문화·예술',
    district: '남구',
    venue: '효자아트홀',
    date: '2026-09-19', time: '19:30', durationMin: 90,
    deadline: '2026-09-16', capacity: 150, remaining: 62,
    applyUrl: 'https://pohangcf.or.kr',
    tags: ['클래식', '해설음악회', '주말나들이'],
    summary: [
      '해설과 실연을 번갈아 진행하는 입문자용 음악회입니다.',
      '곡목은 널리 알려진 소품 위주로 구성됩니다.',
      '초등학생 이상 동반 입장이 가능합니다.'
    ]
  },
  {
    id: 'PLIB-2026-005',
    title: '가계부가 자꾸 무너지는 이유',
    host: '포항시립도서관 포은중앙도서관',
    category: '재테크·경제',
    district: '남구',
    venue: '포은중앙도서관 강의실',
    date: '2026-09-22', time: '10:00', durationMin: 120,
    deadline: '2026-09-18', capacity: 35, remaining: 21,
    applyUrl: 'https://lib.pohang.go.kr',
    tags: ['가계부', '소비습관', '오전강연'],
    summary: [
      '지출 기록이 실패하는 3가지 구조적 원인을 다룹니다.',
      '무료 가계부 앱 2종을 현장에서 세팅합니다.',
      '부채 상환 순서 정하기 실습이 포함됩니다.'
    ]
  },
  {
    id: 'PHC-2026-023',
    title: '잠이 안 오는 밤 — 수면 위생 강의',
    host: '포항시보건소',
    category: '건강·의학',
    district: '남구',
    venue: '남구보건소 교육실',
    date: '2026-09-24', time: '15:00', durationMin: 60,
    deadline: '2026-09-21', capacity: 50, remaining: 44,
    applyUrl: 'https://www.pohang.go.kr',
    tags: ['수면', '건강', '짧은강연'],
    summary: [
      '수면제 없이 시도할 수 있는 행동 요법을 소개합니다.',
      '카페인·조명·기상시간 조절 기준을 제시합니다.',
      '불면이 질환 신호인 경우의 구분법을 안내합니다.'
    ]
  }
];
