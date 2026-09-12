# 컬처픽 새 화면 배포 — 2026-09-12

사용자 승인으로 기존 GitHub Pages 주소에 적용한다.

- 주황색 알림 담기, 담기 취소, 상단 목록 숫자, 선택 강좌별 번호 입력 화면.
- 기존 Apps Script 신청 주소, 강좌 ID·접수시각, 프로그램별 전송 형식 유지.
- 기존 저장 기록 승계, 중복 전송 억제, 접수 15분 전 이후 신청 차단.
- 기관 최신 데이터16건과 수집기 JSON 블록 유지.
- 실제 시트 저장 및 별도 예약 문자 수신 확인. 휴대폰 입력 실기기 검증은 사용자 요청으로 보류.
- no-cors 응답은 실제 저장 확인이 아니므로 화면에서 신청 전송으로 안내한다.
- 그만 회신 안내 제거는 실제 Apps Script에 별도로 저장했으며 이미 예약된 본문은 변경하지 않았다.
- 원격 복원 태그: before-design-20260912-19cd08d (19cd08d3974804fe3fb882866d1dcd0e11af5442).
- 복원은 과거 화면을 가져오는 새 커밋으로 수행하되 최신 data/programs.json 및 index.html 데이터 블록을 유지한다. 시트·문자·Apps Script는 화면 복원과 별개다.
- 상세 검증: culturepick-integration/VERIFICATION.md. 배포 파일: culturepick-integration/DEPLOYMENT-MANIFEST.json.
