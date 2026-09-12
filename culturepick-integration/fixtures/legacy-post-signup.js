// Extracted unchanged from before-design-20260912-19cd08d.
  function postSignup(entry) {
    if (!isConnected()) return Promise.reject(new Error('not-configured'));

    if (SUBMIT.provider === 'appsscript') {
      /* Google Apps Script — 프리플라이트를 피하려고 폼 인코딩 + no-cors 로 보냅니다.
         응답은 읽을 수 없지만(opaque) 네트워크 실패는 reject 로 잡힙니다.

         ★ 강좌를 여러 개 신청했으면 강좌마다 따로 전송합니다.
           한 줄에 '/' 로 묶이면 강좌별 명단을 뽑을 수 없어 알림 발송이 불가능하기 때문입니다.
           스크립트는 POST 1건 = 시트 1줄이므로, 이렇게 보내면 강좌별로 한 줄씩 쌓입니다.
           강좌명 앞에 접수시작일을 붙여 그 열을 정렬하면 '오늘 보낼 대상'이 위로 모입니다. */
      var progs = entry.programs || [];
      var payloads = progs.length
        ? progs.map(function (g) {
            return {
              name: entry.name, phone: entry.phone, slot: entry.slot,
              likes: (g.openAt ? g.openAt + ' · ' : '') + g.org + ' · ' + g.title,
              likeIds: g.id,
              programs: JSON.stringify([g]),
              at: entry.at, ref: location.href
            };
          })
        : [{
            name: entry.name, phone: entry.phone, slot: entry.slot,
            likes: '', likeIds: '', programs: '[]',
            at: entry.at, ref: location.href
          }];

      /* 스크립트가 LockService 로 한 건씩 처리하므로 순차 전송합니다 */
      return payloads.reduce(function (chain, fields) {
        return chain.then(function () {
          return fetch(SUBMIT.endpoint, {
            method: 'POST', mode: 'no-cors',
            body: new URLSearchParams(fields)
          });
        });
      }, Promise.resolve());
    }

}
