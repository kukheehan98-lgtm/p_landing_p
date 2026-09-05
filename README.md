> ### 이 저장소에는 프로젝트가 둘 있습니다
>
> | | 무엇 | 상태 |
> | --- | --- | --- |
> | **[우리동네 컬처픽_포항](pohang-ontime/)** | 포항 무료 강좌·전시를 모아 **접수일에 문자로 알리는** 서비스 | **운영 중** — [사이트](https://kukheehan98-lgtm.github.io/p_landing_p/) · [문서](pohang-ontime/README.md) |
> | 착실한 내일 (아래) | 세대 상생 멘토링 랜딩페이지 | 랜딩페이지만 |

---

# 착실한 내일 (Chaksil Tomorrow)

> 한 세대의 착실함, 다음 세대의 자산이 되다

세대 상생 실무 노하우 아카이빙 & 멘토링 프로젝트 **「착실한 브릿지」** 랜딩페이지입니다.
시니어의 산업 실무 경험과 착실함을 AI로 채집해, 취약·저소득 청소년의 진로 나침반으로 잇는 서비스를 소개합니다.

## 구성

단일 파일 정적 페이지입니다. 빌드 과정이 없습니다.

```
index.html          # 랜딩페이지 전체 (마크업 + 스타일 + 스크립트)
image/              # 히어로 및 섹션 이미지 (1~4.png)
serve.ps1           # 로컬 미리보기용 정적 서버 (PowerShell)
```

## 섹션

| 섹션 | 내용 |
| --- | --- |
| GNB | 스티키 상단 네비게이션 + 멘토 신청 CTA |
| Hero | 슬로건, 3개 가치 제안 카드, Dual CTA |
| Problem | 시니어 / 청소년의 결핍과 `着實` 브릿지 메시지 |
| Process | 착실한 브릿지 3단계 운영 방식 |
| Mentor Type Test | 5문항 인터랙티브 성향 테스트 (PG / PS / EG / ES 4유형) |
| Outputs | 트러블슈팅 카드 · 미니 자서전 · 숏폼 산출물 미리보기 |
| Partnership | B2G · B2B 제휴 안내 |
| Footer | 멘토 신청 · 제휴 문의 모달 |

## 로컬에서 보기

```bash
pwsh -File serve.ps1
```

`http://localhost:5173` 으로 접속합니다. (Python이 설치되어 있다면 `python -m http.server 5173` 도 가능합니다.)

## 디자인 기준

- **컬러** — Deep Navy `#0F172A`, Warm Amber `#B45309` / `#D97706`, Warm Off-White `#FFFBEB`
- **접근성** — WCAG 2.1 AA 기준. 본문 18px(모바일 17px), 주요 색 조합 대비 최저 4.84:1
- **반응형** — 모바일 375px부터 데스크톱까지 대응

## 아직 연동되지 않은 항목

배포 전 아래 두 가지를 연결해야 실제로 동작합니다.

- **멘토 신청 / 제휴 문의 폼** — 백엔드가 없어 현재는 접수 안내 문구만 표시됩니다.
- **결과 공유** — Kakao JS SDK 앱 키가 없어 `navigator.share` + 클립보드 복사로 대체되어 있습니다.

## 기술

Tailwind CSS(CDN) · Lucide Icons · Vanilla JavaScript

> Tailwind는 CDN으로 불러옵니다. 프로덕션 배포 시에는 Tailwind CLI 빌드로 전환하는 것을 권장합니다.

---

© 2026 착실한 내일. All rights reserved.
