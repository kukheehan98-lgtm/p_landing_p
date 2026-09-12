# 컬처픽 기능 연결 테스트 및 배포 기록

새 디자인은 2026-09-12 기존 GitHub Pages에 배포했다.

- 운영: https://kukheehan98-lgtm.github.io/p_landing_p/
- 배포 커밋: ddc1bee078552a7fa8abe37d3ac03edfb8cbce4c
- 복원 태그: before-design-20260912-19cd08d
- 검증 결과: VERIFICATION.md
- 배포 파일 및 결과: DEPLOYMENT-MANIFEST.json

## 로컬 미리보기
1. node culturepick-integration/build-candidate.cjs
2. node culturepick-integration/server.cjs
3. http://127.0.0.1:4174/candidate/

로컬 후보는 모의 전송만 사용한다. 실제 문자 발송은 하지 않는다.
자동 검증은 integration.test.cjs, state.test.cjs, release.test.cjs, tests/reminders.test.cjs의58개를 통과했다.
실제 시트 저장과 별도15분 전 예약 문자 수신은 배포 전에 확인했다. 휴대폰 실기기 입력 검증은 사용자 요청으로 보류했다.

## 복원
과거 화면을 가져오는 새 커밋으로 복원하며 최신 data/programs.json과 index.html의 programsData/sourceUpdatedAt/dataUpdatedAt 블록은 보존한다.
시트·문자 기록·Apps Script 본문 변경은 화면 복원과 별개다.
