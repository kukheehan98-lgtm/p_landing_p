# 신청 데이터 수집 연결하기 (무료 · 약 10분)

지금은 알림 신청이 **방문자 브라우저에만** 저장됩니다. 운영자가 볼 수 없다는 뜻입니다.
아래 절차를 마치면 신청이 들어오는 즉시 **내 구글 시트에 한 줄씩 쌓입니다.**

- 비용 없음, 건수 제한 사실상 없음
- 개인정보(휴대폰 번호)가 **남의 서버가 아니라 본인 구글 계정**에만 저장됨
- 구글 계정 하나만 있으면 됨

> **연결 전에 들어온 신청도 잃지 않습니다.** 미전송 건은 브라우저 큐에 쌓여 있다가,
> 연결 후 `?admin=1` → 「미전송분 재전송」을 누르면 한 번에 올라갑니다.

---

## STEP 1 · 시트 만들기

[sheets.new](https://sheets.new) 로 새 스프레드시트를 만들고 이름을 `포항 키즈&패밀리 신청자` 로 정합니다.

## STEP 2 · 스크립트 붙여넣기

상단 메뉴 **확장 프로그램 → Apps Script** 를 열고, 기본 코드를 **전부 지운 뒤** 아래를 붙여넣습니다.

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                       // 동시 신청 시 행 겹침 방지
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('신청자') || ss.insertSheet('신청자');

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['신청시각', '이름', '휴대폰', '주로 다니는 때',
                       '찜한 프로그램', '찜 ID', '유입 경로']);
      sheet.setFrozenRows(1);
      sheet.getRange('A1:G1').setFontWeight('bold');
      sheet.setColumnWidth(1, 150);
      sheet.setColumnWidth(5, 320);
    }

    var p = (e && e.parameter) || {};
    sheet.appendRow([
      p.at ? new Date(p.at) : new Date(),
      p.name    || '',
      "'" + (p.phone || ''),                  // 앞자리 0 이 사라지지 않도록 텍스트로
      p.slot    || '',
      p.likes   || '',
      p.likeIds || '',
      p.ref     || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

## STEP 3 · 웹 앱으로 배포

오른쪽 위 **배포 → 새 배포** → 톱니바퀴 아이콘에서 **웹 앱** 선택 후:

| 항목 | 설정값 |
| --- | --- |
| 설명 | `포항 키즈&패밀리 신청 수집` |
| 실행 계정 | **나** |
| 액세스 권한이 있는 사용자 | **모든 사용자** ← 여기가 가장 많이 틀립니다 |

**배포**를 누르면 권한 승인 창이 뜹니다. 「고급 → (안전하지 않음)으로 이동」을 거쳐 허용하세요.
본인이 방금 만든 스크립트라서 나오는 경고입니다.

## STEP 4 · 주소 붙여넣기

배포 후 나오는 `https://script.google.com/macros/s/AKfy……/exec` 주소를 복사해
`index.html` 상단의 설정에 넣습니다.

```js
var SUBMIT = {
  provider:  'appsscript',
  endpoint:  'https://script.google.com/macros/s/AKfy……/exec',
  accessKey: ''
};
```

## STEP 5 · 확인

1. 페이지에서 알림 신청을 **실제로 한 번** 제출합니다.
2. 주소 뒤에 `?admin=1` 을 붙여 다시 엽니다.
3. **전송 상태**가 `● 연결됨 (appsscript)` 이고 **미전송 대기**가 `0` 이면 성공입니다.
4. 구글 시트 `신청자` 탭에 행이 들어왔는지 확인합니다.

**미전송 대기에 숫자가 남아 있다면** 원인은 둘 중 하나입니다.

- `/exec` 주소 오타 (끝이 `/dev` 면 안 됩니다)
- 배포 시 「액세스 권한」이 `모든 사용자` 가 아님

고친 뒤 「미전송분 재전송」을 누르면 밀린 건이 한 번에 올라갑니다.

---

## 시트에 쌓이는 값

| 열 | 예시 | 쓸모 |
| --- | --- | --- |
| 신청시각 | 2026-09-01 09:12 | 유입 시간대 파악 |
| 이름 | 김민서 | 문자 발송용 |
| 휴대폰 | 010-1234-5678 | 문자 발송용 |
| 주로 다니는 때 | 주말 아이와 | **어느 시간대 수요가 큰지** |
| 찜한 프로그램 | 포은중앙 · 9월 책놀이터 (7세) / 포은오천 · 네트망 위빙아트 (저학년) | **어떤 프로그램에 반응하는지 · 누구에게 뭘 보낼지** |
| 찜 ID | phlib-3571\|phlib-3553 | 자동화 전환 시 사용 |
| 유입 경로 | …?utm_source=danggeun | **어느 채널에서 왔는지** |

> **유입 채널을 나누고 싶다면** 홍보할 때 주소 뒤에 표시를 붙이세요.
> 당근 → `?from=danggeun`, 맘카페 → `?from=cafe`
> 이 값이 「유입 경로」 열에 그대로 남아 채널별 성과를 비교할 수 있습니다.

---

## 스크립트를 고친 뒤에는

**배포 → 배포 관리 → 연필 아이콘 → 버전: 새 버전 → 배포**
이 과정을 거쳐야 반영됩니다. `/exec` 주소는 그대로 유지됩니다.

## 다른 방법 (참고)

| | Apps Script **(권장)** | Formspree | Web3Forms |
| --- | --- | --- | --- |
| 월 한도 | 사실상 없음 | 50건 | 250건 |
| 데이터 보관 | **내 구글 시트** | 업체 서버 | 업체 서버 |
| 준비물 | 구글 계정 | 가입 | 이메일만 |

Formspree · Web3Forms 를 쓰려면 `SUBMIT` 의 `provider` 를 각각 `'formspree'` / `'web3forms'` 로
바꾸고, 발급받은 주소나 키를 `endpoint` / `accessKey` 에 넣으면 됩니다.
휴대폰 번호를 다루므로 **Apps Script 방식을 권합니다.**

---

## 운영자 패널 (`?admin=1`)

- 알림 신청 수 / 미전송 대기 수 / 전송 연결 상태
- **주로 다니는 때** 분포
- **많이 찜한 프로그램** 순위
- CSV 내려받기·복사 (엑셀에서 한글 안 깨지도록 BOM 포함)
- 미전송분 재전송 / 데이터 초기화

비밀번호가 없는 화면이니 주소를 남에게 공유하지 마세요.
