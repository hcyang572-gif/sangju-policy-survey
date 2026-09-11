/* ══════════════════════════════════════════════════════════════════════
   관련부서 의견조사 — 화면 동작
   제6기 미래상주 희망연구팀 「톱니바퀴」

   ⭐ 제출은 rpc('submit_survey') «한 길» 뿐입니다.
      표(survey_responses)에 직접 insert 하면서 .select() 를 붙이면 반드시 실패합니다
      — anon 에게 SELECT 정책이 없기 때문입니다(supabase/설문조사_260911.sql [8]절).
      접수번호는 «서버가 돌려준 값» 을 그대로 보여 드립니다. 여기서 만들지 않습니다.

   ⛔ 이 페이지는 성명·연락처·직원번호를 «묻지도, 보내지도» 않습니다.
      제출 전에는 답변을 어디에도 저장하지 않습니다(안내 화면의 약속).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 잔손질 ───────────────────────────────────────────────────────── */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ── 5점 척도 보기 ────────────────────────────────────────────────
     d = 화면에 보이는 글(두 줄로 끊음) · p = 낭독기가 읽는 글
     ⚠ 두 배열의 «순서와 개수» 가 어긋나면 안 됩니다.               */
  var AGREE = {
    d: ['전혀<br>아니다', '아니다', '보통', '그렇다', '매우<br>그렇다'],
    p: ['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다']
  };
  var BURDEN = {
    d: ['전혀<br>없다', '거의<br>없다', '보통', '다소<br>크다', '매우<br>크다'],
    p: ['전혀 없다', '거의 없다', '보통', '다소 크다', '매우 크다']
  };
  var NEED = {
    d: ['전혀<br>아니다', '아니다', '보통', '필요<br>하다', '매우<br>필요하다'],
    p: ['전혀 아니다', '아니다', '보통', '필요하다', '매우 필요하다']
  };

  /* ── 문항 — 6단계 23문항 (확정 시안 SECTIONS 그대로) ──────────────
     key : DB 칼럼 이름. 없으면 'q<번호>' 를 씁니다(문1~3만 다릅니다).
     ov  : 화면 글과 «DB 에 넣을 값» 이 다를 때의 값.
           지금은 문1 다섯 보기가 모두 화면 글 그대로 저장됩니다(2026-09-11 확정).
           ⚠ 「읍·면·동 행정복지센터」·「그 밖의 부서」는 dept CHECK 와 글자 단위로 같아야 합니다.
     max : 복수선택 최대 개수. ⚠ 문9 만 3개, 나머지는 2개입니다.     */
  var SECTIONS = [
    { name: 'Ⅰ. 응답자 정보',
      lead: '집계를 위한 최소 정보만 여쭙습니다. 성명·연락처는 받지 않으며, 누가 답했는지 가려낼 수 없도록 넓은 구간으로만 여쭙습니다.',
      qs: [
        /* ⚠ 「읍·면·동 행정복지센터」는 가운뎃점(·)까지 이 글자 그대로 보내야 합니다
           — dept 칼럼의 CHECK 제약과 한 글자라도 다르면 제출이 거절됩니다.
           ⛔ 어느 읍면동인지는 «묻지 않습니다» — 읍면동마다 담당이 한두 명뿐이라
              곧바로 응답자가 특정됩니다. 칸을 새로 만들지 마십시오. */
        { n: 1, key: 'dept', t: '소속', type: 'radio',
          o:  ['사회복지과', '노인장애인복지과', '아이여성행복과', '읍·면·동 행정복지센터', '그 밖의 부서'] },
        { n: 2, key: 'role', t: '주로 맡고 계신 업무', type: 'radio',
          o: ['복지사업 기획·총괄', '신청 접수·상담', '자격조사·결정·지급', '공고·홍보 담당',
              '통합사례관리·방문상담', '그 밖'] },
        { n: 3, key: 'career', t: '복지업무 담당 경력',
          h: '응답하신 분이 특정되지 않도록 넓은 구간으로만 여쭙습니다', type: 'radio',
          o: ['3년 미만', '3~10년', '10년 이상'] }
      ] },

    { name: 'Ⅱ. 지금의 업무 — 접수·상담',
      lead: '플랫폼이 필요한 이유를 확인하는 부분입니다. 지금 실제로 겪고 계신 것을 답해 주십시오.',
      qs: [
        { n: 4, t: '시민이 복지사업 정보를 찾기 어려워 생기는 문의 응대가 업무에 부담이 되는 정도',
          type: 'scale', lab: BURDEN, ends: ['전혀 없다', '매우 크다'] },
        { n: 5, t: '하루 평균 정책·사업 관련 문의(전화·방문) 건수', type: 'radio',
          o: ['5건 미만', '5~10건', '10~20건', '20건 이상'] },
        { n: 6, t: '접수 업무에서 가장 큰 애로사항',
          h: '가장 크다고 보시는 것 2개까지 고르실 수 있습니다', type: 'check', max: 2,
          o: ['같은 질문이 반복되는 문의 응대', '자격 요건 설명의 어려움', '신청 서식 안내·배부',
              '사업 정보가 여러 곳에 흩어져 있음', '접수 내용을 손으로 옮겨 적는 일',
              '타 부서 사업까지 안내해야 함', '접수 현황·통계 작성'] },
        { n: 7, t: '시민이 본인에게 맞는 사업을 스스로 찾을 수 있다면 업무 경감에 도움이 될 것이다',
          type: 'scale', lab: AGREE, ends: ['전혀 아니다', '매우 그렇다'] }
      ] },

    { name: 'Ⅲ. 지금의 업무 — 공고·홍보',
      lead: '아무리 좋은 사업도 대상이 되는 분께 닿지 않으면 소용이 없습니다. 담당 사업을 알리실 때 겪으시는 일을 여쭙습니다.',
      qs: [
        { n: 8, t: '담당 사업을 공고·홍보해도 정작 대상이 되는 시민에게 잘 닿지 않아 겪는 어려움의 정도',
          type: 'scale', lab: BURDEN, ends: ['전혀 없다', '매우 크다'] },
        { n: 9, t: '지금 사업을 알리는 데 주로 쓰시는 방법',
          h: '실제로 쓰시는 것 3개까지 고르실 수 있습니다', type: 'check', max: 3,
          o: ['시 홈페이지 고시·공고', '읍면동 협조공문', '마을 방송·이장님 전달',
              '현수막·포스터·전단', '문자·카카오 알림톡', 'SNS(블로그·인스타그램 등)',
              '지역 신문·소식지', '복지관 등 유관기관 협조', '대상자에게 개별 연락'] },
        { n: 10, t: '공고·홍보에서 가장 개선이 필요하다고 보시는 점',
          h: '2개까지 고르실 수 있습니다', type: 'check', max: 2,
          o: ['정보가 여러 곳에 흩어져 시민이 찾지 못한다', '공고문이 어려워 시민이 이해하지 못한다',
              '대상이 될 만한 시민에게 직접 닿지 않는다', '홍보에 쓸 시간과 인력이 부족하다',
              '마감이 임박해서야 알려진다', '홍보가 효과가 있었는지 알 수 없다',
              '어르신 등 디지털에 익숙지 않은 분께 닿지 않는다', '부서마다 따로 알려 시민이 혼란스러워한다'] }
      ] },

    { name: 'Ⅳ. 만들고 있는 기능',
      lead: '앞 화면의 「무엇을 만들고 있는가」에 적어 둔 다섯 가지 기능을 두고 여쭙습니다. 각 기능이 담당 업무에 필요하다고 보시는지 답해 주십시오.',
      qs: [
        { n: 11, t: '㉮ 부서별로 흩어져 있는 사업 공고를 한곳에 모아 보여주는 기능이 필요하다',
          h: '시민이 여러 부서 홈페이지를 돌지 않고 한 화면에서 모든 사업 공고를 보고, 마감일도 함께 확인합니다',
          type: 'scale', lab: AGREE, ends: ['전혀 아니다', '매우 그렇다'] },
        { n: 12, t: '㉯ 시민이 본인에게 맞는 사업을 스스로 찾아 온라인으로 신청하는 기능이 필요하다',
          h: '나이·가구 형태·소득 구간을 넣으면 받을 수 있는 사업만 골라 보여주고, 그 자리에서 신청합니다',
          type: 'scale', lab: AGREE, ends: ['전혀 아니다', '매우 그렇다'] },
        { n: 13, t: '㉰ 담당자가 접수 현황을 한 화면에서 보고 처리 상태를 관리하는 기능이 필요하다',
          h: '누가 무엇을 신청했고 어디까지 처리됐는지 목록으로 보며 상태를 바꿉니다',
          type: 'scale', lab: AGREE, ends: ['전혀 아니다', '매우 그렇다'] },
        { n: 14, t: '㉱ 접수 내용을 엑셀로 주고받고 보고용 현황 자료를 자동으로 만드는 기능이 필요하다',
          h: '접수 대장을 손으로 옮겨 적지 않고, 월별·사업별 현황표가 저절로 만들어집니다',
          type: 'scale', lab: AGREE, ends: ['전혀 아니다', '매우 그렇다'] },
        { n: 15, t: '㉲ 시민이 정책을 제안하면 담당 부서가 검토하고 답을 남기는 기능이 필요하다',
          h: '시민이 「이런 지원이 있었으면」 하고 올리면 부서가 검토 결과를 회신합니다',
          type: 'scale', lab: AGREE, ends: ['전혀 아니다', '매우 그렇다'] },
        { n: 16, t: '이런 기능들이 갖춰진다면 가장 기대되는 점',
          h: '2개까지 고르실 수 있습니다', type: 'check', max: 2,
          o: ['반복 문의가 줄어든다', '접수 누락·기재 오류가 준다', '시민 만족도가 오른다',
              '접수 현황·통계 파악이 쉬워진다', '시민이 무엇을 원하는지 알 수 있다',
              '홍보에 드는 품이 줄어든다', '대상자에게 사업이 제대로 닿는다', '특별히 기대되는 점이 없다'] }
      ] },

    { name: 'Ⅴ. 앞으로의 사용',
      lead: '실제로 쓰이려면 무엇이 필요한지 여쭙습니다.',
      qs: [
        { n: 17, t: '우리 부서 업무에 실제로 도움이 될 것이다',
          type: 'scale', lab: AGREE, ends: ['전혀 아니다', '매우 그렇다'] },
        { n: 18, t: '도입된다면 업무에 사용할 의향이 있다',
          type: 'scale', lab: AGREE, ends: ['전혀 없다', '매우 있다'] },
        { n: 19, t: '도입할 때 가장 우려되는 점',
          h: '2개까지 고르실 수 있습니다', type: 'check', max: 2,
          o: ['기존 행복e음 등 시스템과 중복', '행정망에서 접속이 막힐 우려', '시민 개인정보 보호',
              '입력·관리 업무가 늘어남', '담당자 교육 부담', '공고·자료의 정확성과 최신성 유지',
              '담당자가 바뀌면 관리가 끊김'] },
        { n: 20, t: '실제 도입을 위해 가장 필요한 지원', type: 'radio',
          o: ['사용 교육·설명회', '알기 쉬운 사용설명서', '행정망 접속 허용',
              '공고·자료를 갱신할 전담 인력', '기존 시스템과의 연계', '부서장·시 차원의 방침'] },
        { n: 21, t: '이런 플랫폼이 복지 외 다른 분야에도 필요하다고 보십니까',
          h: '농업·청년·문화 등 다른 부서의 사업까지 넓히는 것',
          type: 'scale', lab: NEED, ends: ['전혀 아니다', '매우 필요하다'] }
      ] },

    { name: 'Ⅵ. 자유 의견',
      lead: '짧게 한 줄이어도 좋습니다. 이 부분이 보고서에 가장 크게 반영됩니다. ⚠ 답을 익명으로 지키기 위해, 소속 읍·면·동 이름이나 본인·동료의 성명은 적지 말아 주십시오.',
      qs: [
        /* ⛔ 읍면동 이름·성명을 «자동으로 걸러내지 않습니다» — 읍면동 이름이 흔한 낱말이라
              정상 의견까지 되돌려보내는 쪽이 더 나쁩니다(🩷자물쇠 판단).
              ⇒ 아래 도움말이 익명을 지키는 «유일한» 방어입니다. 지우지 마십시오. */
        { n: 22, t: '추가되거나 개선되었으면 하는 기능, 또는 공고·홍보와 관련해 바라시는 점',
          h: '읍·면·동 이름·성명은 적지 말아 주십시오 — 적으시면 익명이 깨집니다',
          type: 'text', ph: '예) 공고를 올리면 읍면동에도 자동으로 함께 알려지면 좋겠습니다' },
        { n: 23, t: '그 밖에 하고 싶은 말씀',
          h: '선택 문항입니다 · 읍·면·동 이름·성명은 적지 말아 주십시오', type: 'text', opt: true,
          ph: '자유롭게 적어 주십시오' }
      ] }
  ];

  /* ══════════════════════════════════════════════════════════════════
     조사기간 — «한국시간(KST) 기준» 으로만 판정합니다
     ⭐⭐ 기기의 시간대를 «믿지 않습니다». 해외 로밍 중이거나 시간대를 잘못 맞춘
        PC 에서도 한국 날짜로 열리고 닫혀야 하기 때문입니다.
        · 순간(instant) 비교는 Date 끼리 그대로 하면 시간대와 무관하게 정확합니다.
        · «며칠인가»·«며칠 남았나» 는 UTC 에 9시간을 더해 KST 달력으로 셉니다.
     ⛔ getFullYear()/getMonth()/getDate() 같은 «로컬» 함수를 이 블록에 쓰지 마십시오
        — 그 순간 기기 시간대가 끼어들어 하루가 어긋납니다.
     ══════════════════════════════════════════════════════════════════ */
  var DAY     = 86400000;
  var KST_OFF = 9 * 3600000;                 // UTC+09:00, 한국은 서머타임이 없습니다

  /* config.js 의 ISO 문자열(오프셋 포함) → 순간 */
  var START = new Date(window.SURVEY_START);            // 개시 순간
  var ENDX  = new Date(window.SURVEY_END);              // 마감 순간 «직전» 까지 받습니다
  var ENDD  = new Date(ENDX.getTime() - DAY);           // 화면에 적을 마감 «날짜»(= 9/30)

  /* 어떤 순간을 «한국 달력» 으로 읽습니다 */
  function kst(d) {
    var t = new Date(d.getTime() + KST_OFF);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  /* 한국 달력에서 «며칠째 날인가»(에폭 기준 일련번호). 날짜 차이를 셀 때 씁니다. */
  function kstDayNo(d) { return Math.floor((d.getTime() + KST_OFF) / DAY); }
  function md(d) { var k = kst(d); return k.m + '.' + k.d; }
  function mdKo(d) { var k = kst(d); return k.m + '월 ' + k.d + '일'; }

  function periodState() {
    var now = new Date();
    if (now < START) return 'before';
    if (now >= ENDX) return 'after';
    return 'open';
  }

  /* 안내 화면의 날짜 띠를 «오늘(한국 날짜)» 기준으로 그립니다(시안은 고정값이었습니다). */
  function paintPeriod() {
    var now = new Date();
    var st  = periodState();

    $('pStart').textContent = md(START);
    $('pEnd').textContent   = md(ENDD);
    $('pToday').textContent = '오늘 ' + mdKo(now);

    /* 띠의 진행률은 «순간» 비율로 — 하루 안에서도 조금씩 나아갑니다 */
    var span = ENDX - START;
    var pct  = span > 0 ? Math.max(0, Math.min(1, (now - START) / span)) * 100
                        : (st === 'before' ? 0 : 100);
    $('pFill').style.width = pct + '%';
    $('pDot').style.left   = pct + '%';

    /* 남은 날수는 «한국 달력의 날짜 차이» 로 셉니다(시안 셈법과 같습니다) */
    var left = kstDayNo(ENDD) - kstDayNo(now);
    var txt;
    if (st === 'before')      txt = (kstDayNo(START) - kstDayNo(now)) + '일 뒤 시작';
    else if (st === 'after')  txt = '조사 종료';
    else if (left <= 0)       txt = '오늘 마감';
    else                      txt = '마감 ' + left + '일 남음';
    $('pLeft').textContent = txt;

    /* 기간 밖이면 시작 단추를 감추고 까닭을 말씀드립니다 */
    var btn = $('btnStart'), box = $('periodClosed');
    if (st === 'open') { btn.hidden = false; box.hidden = true; return; }
    btn.hidden = true; box.hidden = false;
    if (st === 'before') {
      $('closedTitle').textContent = mdKo(START) + '부터 받습니다';
      $('closedBody').textContent =
        '아직 조사가 시작되지 않았습니다. ' + mdKo(START) + ' 0시부터 ' + mdKo(ENDD) +
        ' 24시까지(한국시간) 이 화면에서 응답하실 수 있습니다. 그때 다시 찾아 주십시오.';
    } else {
      $('closedTitle').textContent = '조사가 끝났습니다. 참여해 주셔서 감사합니다';
      $('closedBody').textContent =
        '응답 기간(' + md(START) + '~' + md(ENDD) + ')이 지나 더는 받지 않습니다. ' +
        '보내주신 의견은 집계해 각 부서에 회신드리겠습니다.';
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     화면 전환
     ══════════════════════════════════════════════════════════════════ */
  function go(p, push) {
    if (p === 'form' && periodState() !== 'open') { paintPeriod(); p = 'intro'; }
    document.querySelectorAll('.pane').forEach(function (x) {
      x.classList.toggle('on', x.id === 'pane-' + p);
    });
    if (push) {
      try { history.pushState({ p: p }, '', p === 'form' ? '#설문' : '#'); } catch (e) {}
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.addEventListener('popstate', function (e) {
    go((e.state && e.state.p) || 'intro', false);
  });

  /* ══════════════════════════════════════════════════════════════════
     설문지 그리기
     ══════════════════════════════════════════════════════════════════ */
  var cur = 0;

  function optValue(q, i) { return (q.ov ? q.ov[i] : q.o[i]); }

  function qBody(q) {
    var i, out;
    if (q.type === 'scale') {
      out = '<div class="scale" role="radiogroup" aria-labelledby="lbl_q' + q.n + '">';
      for (i = 0; i < q.lab.d.length; i++) {
        out += '<label>' +
          '<input type="radio" name="q' + q.n + '" value="' + (i + 1) + '">' +
          '<em aria-hidden="true">' + (i + 1) + '</em>' +
          '<small aria-hidden="true">' + q.lab.d[i] + '</small>' +
          '<span class="sr-only">' + (i + 1) + '점 · ' + esc(q.lab.p[i]) + '</span>' +
          '</label>';
      }
      out += '</div><p class="scale-ends"><span>' + esc(q.ends[0]) + '</span>' +
             '<span>' + esc(q.ends[1]) + '</span></p>';
      return out;
    }
    if (q.type === 'radio' || q.type === 'check') {
      var tag = q.type === 'radio' ? 'radio' : 'checkbox';
      out = '<div class="opts" data-max="' + (q.max || 0) + '">';
      for (i = 0; i < q.o.length; i++) {
        out += '<label class="opt ' + q.type + '">' +
          '<input type="' + tag + '" name="q' + q.n + '" value="' + i + '">' +
          '<i aria-hidden="true"></i><span>' + esc(q.o[i]) + '</span></label>';
      }
      return out + '</div>';
    }
    /* 주관식 */
    return '<textarea id="f_q' + q.n + '" maxlength="500" rows="4"' +
           ' aria-labelledby="lbl_q' + q.n + '" placeholder="' + esc(q.ph) + '"></textarea>' +
           '<p class="cnt" aria-hidden="true"><span>0</span> / 500자</p>';
  }

  function render() {
    var html = '';
    SECTIONS.forEach(function (s, si) {
      var qs = s.qs.map(function (q) {
        return '<fieldset class="q" data-q="' + q.n + '" data-opt="' + (q.opt ? 1 : 0) + '">' +
          '<legend class="q-l">' +
            '<span class="q-n">문 ' + q.n + '</span>' +
            '<span class="q-t" id="lbl_q' + q.n + '">' + esc(q.t) +
              (q.opt ? '<span class="sr-only"> (선택 문항)</span>'
                     : '<span class="req" aria-hidden="true">*</span><span class="sr-only"> (필수 문항)</span>') +
            '</span>' +
            (q.h ? '<span class="q-h">' + esc(q.h) + '</span>' : '') +
          '</legend>' + qBody(q) +
          '<p class="err" role="alert">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M12 7v6M12 16.2v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
            '답해 주셔야 다음으로 넘어갑니다</p>' +
          '</fieldset>';
      }).join('');

      html += '<section class="qsec' + (si === 0 ? ' on' : '') + '" data-s="' + si + '">' +
        '<div class="qsec-h"><span>' + esc(s.name) + '</span>' +
        '<h2>' + esc(s.name.split('. ')[1]) + '</h2><p>' + esc(s.lead) + '</p></div>' + qs + '</section>';
    });

    $('qbody').innerHTML = html;
    $('stepAll').textContent = SECTIONS.length;
    $('stepDots').innerHTML = SECTIONS.map(function () { return '<b></b>'; }).join('');
    paint();
  }

  function paint() {
    document.querySelectorAll('.qsec').forEach(function (s) {
      s.classList.toggle('on', +s.dataset.s === cur);
    });
    $('stepNo').textContent = cur + 1;
    $('stepName').textContent = SECTIONS[cur].name;
    var pct = Math.round((cur + 1) / SECTIONS.length * 100);
    $('barFill').style.width = pct + '%';
    $('barBox').setAttribute('aria-valuenow', String(pct));
    document.querySelectorAll('#stepDots b').forEach(function (b, i) {
      b.className = i < cur ? 's-done' : (i === cur ? 's-now' : '');  /* ⚠ 'done' 금지 — .done 과 충돌 */
    });
    $('btnPrev').style.visibility = cur === 0 ? 'hidden' : 'visible';
    $('btnNext').textContent = cur === SECTIONS.length - 1 ? '제출하기' : '다음';
  }

  function step(d) {
    if (d > 0 && !checkStep()) return;
    if (d > 0 && cur === SECTIONS.length - 1) { submit(); return; }
    cur = Math.max(0, Math.min(SECTIONS.length - 1, cur + d));
    hideFail();
    paint();
    var first = document.querySelector('.qsec.on .q-t');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
  }

  /* 이 단계의 필수 문항이 다 채워졌는지 */
  function checkStep() {
    var sec = document.querySelector('.qsec[data-s="' + cur + '"]');
    var bad = null;
    sec.querySelectorAll('.q').forEach(function (f) {
      if (f.dataset.opt === '1') return;
      var ta = f.querySelector('textarea');
      var filled = ta ? ta.value.trim().length > 0
                      : f.querySelectorAll('input:checked').length > 0;
      f.classList.toggle('bad', !filled);
      f.querySelector('.err').classList.toggle('on', !filled);
      if (!filled && !bad) bad = f;
    });
    if (bad) {
      bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      var focusable = bad.querySelector('textarea, input');
      if (focusable) { try { focusable.focus({ preventScroll: true }); } catch (e) {} }
      toast('아직 답하지 않은 문항이 있습니다');
      return false;
    }
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════
     답변 모으기 — DB 칼럼 이름에 맞춰 한 덩이로 만듭니다.
     이 덩이가 그대로 answers jsonb 로도 보관됩니다(설문조사_260911.sql [1]절).
     ⛔ 여기에 성명·연락처를 넣지 마십시오.
     ══════════════════════════════════════════════════════════════════ */
  function collect() {
    var a = {};
    SECTIONS.forEach(function (s) {
      s.qs.forEach(function (q) {
        var key = q.key || ('q' + q.n);
        if (q.type === 'text') {
          var ta = $('f_q' + q.n);
          var v = ta ? ta.value.trim() : '';
          if (v) a[key] = v;
          return;
        }
        var on = document.querySelectorAll('#qbody input[name="q' + q.n + '"]:checked');
        if (q.type === 'scale') {
          if (on.length) a[key] = parseInt(on[0].value, 10);       // 숫자 1~5
        } else if (q.type === 'check') {
          a[key] = Array.prototype.map.call(on, function (i) {      // 문자열 배열
            return optValue(q, parseInt(i.value, 10));
          });
        } else {
          if (on.length) a[key] = optValue(q, parseInt(on[0].value, 10));
        }
      });
    });
    return a;
  }

  /* ── 제출토큰 ─────────────────────────────────────────────────────
     무작위 128비트. 한 분이 한 번만 응답하시도록 서버가 해시만 보관하고
     응답 행에는 아무것도 남기지 않습니다. ⛔ 누구인지를 담지 않습니다. */
  function token() {
    var key = window.SURVEY_TOKEN_KEY || 'sv_token';
    var t = null;
    try { t = localStorage.getItem(key); } catch (e) {}
    if (t && /^[A-Za-z0-9_-]{16,128}$/.test(t)) return t;
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    t = btoa(String.fromCharCode.apply(null, b))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    try { localStorage.setItem(key, t); } catch (e) {}
    return t;
  }

  /* ── Supabase — 쓰는 것은 rpc('submit_survey') 하나뿐 ─────────────── */
  var _sb = null;
  function sb() {
    if (_sb) return _sb;
    if (!window.supabase || !window.supabase.createClient) return null;
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return _sb;
  }

  /* ── 제출 실패를 «조용히» 넘기지 않습니다 ────────────────────────── */
  function showFail(why, how, handover) {
    $('failWhy').textContent = why;
    $('failHow').innerHTML = how;          // how 는 우리가 적은 글·서버 hint(escape 완료)만 들어갑니다
    $('failHandover').hidden = !handover;  // SV001 일 때만 길을 열어 둡니다
    $('subFail').hidden = false;
    $('btnNext').textContent = '다시 제출하기';
    $('subFail').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function hideFail() { $('subFail').hidden = true; $('failHandover').hidden = true; }

  var NET_HELP =
    '<b>시청 내부망(행정망)이나 시청 WiFi 에서는 바깥 서버로 나가는 길이 막혀 있을 수 있습니다.</b> ' +
    'WiFi 를 끄시고 <b>휴대전화 데이터로 다시 시도해 주십시오.</b> 대개 그러면 바로 됩니다.';

  /* ⭐⭐ 서버가 붙여 보내는 «오류코드» 로만 분기합니다.
        ⛔ 한국어 문구로 분기하지 마십시오 — 문구를 한 글자만 다듬어도 조용히 깨집니다.
           (submit_survey 가 RAISE … USING ERRCODE 로 실어 보내고
            PostgREST 가 오류 JSON 의 code 에 그대로 담아 줍니다) */
  var CODE = {
    SV001: '이 기기에서는 이미 제출되었습니다.',   // 같은 기기·같은 토큰으로 두 번째
    SV002: '잠시 제출이 몰렸습니다.',              // 전역 도배 상한
    SV003: '제출토큰에 문제가 있습니다.'           // 토큰 없음·형식 오류
  };

  function describe(e) {
    var code = (e && e.code) || '';
    var msg  = (e && (e.message || e.error_description || e.details)) || '';
    var hint = (e && e.hint) || '';
    var net  = (e && e.name === 'TypeError') ||
               /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(msg);
    if (net) {
      return { why: '설문 서버에 연결하지 못했습니다.', how: NET_HELP };
    }

    /* SV001 — 공용 PC 에서 «단추를 누르지 않고 그냥 제출한 둘째 분» 이 여기로 옵니다.
       ⛔ 막다른 길로 두면 그분이 「고장인가」 하고 닫아 응답 한 건을 잃습니다.
          반드시 그 자리에서 길을 알려 드립니다(handover = true). */
    if (code === 'SV001') {
      return {
        why: msg || CODE.SV001,
        how: (hint ? esc(hint) + ' ' : '') +
             '<b>같은 분이라면</b> 앞서 보내신 응답이 이미 접수되어 있으니 다시 보내지 않으셔도 됩니다.<br>' +
             '<b>다른 분이 이 기기로 응답하시는 것이라면</b> 아래를 눌러 주십시오.',
        handover: true
      };
    }
    if (code === 'SV002') {
      return { why: msg || CODE.SV002,
               how: '<b>잠시 후 다시 시도해 주십시오.</b> 짧은 시간에 제출이 몰렸을 뿐이며, ' +
                    '답변은 그대로 남아 있습니다. 1~2분 뒤 「다시 제출하기」를 눌러 주십시오.' };
    }
    if (code === 'SV003') {
      return { why: msg || CODE.SV003,
               how: '<b>페이지를 새로고침한 뒤 다시 제출해 주십시오.</b> ' +
                    '⚠ 새로고침하면 적으신 답변이 지워집니다 — 자유의견(문22·23)에 길게 적으셨다면 ' +
                    '먼저 복사해 두시기를 권합니다.' };
    }
    /* 서버가 «한국어로» 알려 준 까닭이면 그대로 보여 드립니다
       (부서 미선택 · 22번 미기재 · 이미 제출 등 — 응답자가 고칠 수 있는 것들). */
    if (/[가-힣]/.test(msg)) {
      return { why: msg, how: '위 내용을 고치신 뒤 「다시 제출하기」를 눌러 주십시오.' };
    }
    /* 한국어가 아니면 «설정·서버 쪽 문제» 입니다. 응답자 잘못이 아니므로
       영문 원문을 그대로 들이밀지 않고 담당자에게 알리도록 안내합니다.
       (실제로 걸린 예 : PGRST202 — submit_survey 함수가 아직 만들어지지 않음) */
    if (msg) {
      return { why: '설문 서버가 응답을 받지 못했습니다. 응답자 잘못이 아닙니다.',
               how: '잠시 뒤 「다시 제출하기」를 눌러 보시고, 그래도 안 되면 아래 연락처로 알려 주십시오. ' +
                    '(담당자 확인용 : <span class="tech">' + esc(msg) + '</span>)' };
    }
    return { why: '알 수 없는 까닭으로 제출이 되지 않았습니다.', how: NET_HELP };
  }

  var sending = false;
  function submit() {
    if (sending) return;

    if (periodState() !== 'open') {
      showFail('조사기간이 지나 더는 받지 않습니다.',
        '응답 기간은 ' + md(START) + ' ~ ' + md(ENDD) + ' (한국시간) 입니다. ' +
        '늦게라도 의견을 주시려면 아래 연락처로 말씀해 주십시오.');
      return;
    }

    var client = sb();
    if (!client) {
      showFail('설문 프로그램을 불러오지 못했습니다.',
        '인터넷 연결이 끊겼거나, 바깥 주소(cdn.jsdelivr.net)가 막혀 있습니다. ' + NET_HELP +
        ' 그래도 안 되면 페이지를 새로고침해 주십시오.');
      return;
    }

    sending = true;
    hideFail();
    var btn = $('btnNext');
    btn.disabled = true;
    btn.textContent = '보내는 중…';

    client.rpc('submit_survey', { p_answers: collect(), p_submit_token: token() })
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data) throw new Error('접수번호를 돌려받지 못했습니다.');
        done(String(res.data));
      })
      .catch(function (e) {
        var d = describe(e);
        showFail(d.why, d.how, d.handover);
      })
      .then(function () {
        sending = false;
        btn.disabled = false;
        if (!$('subFail').hidden) btn.textContent = '다시 제출하기';
        else btn.textContent = '제출하기';
      });
  }

  /* ── 완료 — 접수번호는 «서버가 준 값» 입니다 ──────────────────────── */
  function done(receiptNo) {
    $('doneNo').textContent = receiptNo;
    $('formLive').hidden = true;
    $('formDone').hidden = false;
    try { localStorage.setItem('sv_receipt', receiptNo); } catch (e) {}
    markDone(receiptNo);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var t = $('doneTitle');
    t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
  }

  /* 이미 제출하신 기기라면 안내 화면에서 미리 알려 드립니다
     — 23문항을 다시 적으신 뒤에야 「이미 제출하셨습니다」를 보시는 일이 없도록. */
  function markDone(receiptNo) {
    $('btnStart').hidden = true;
    var box = $('periodClosed');
    box.hidden = false;
    $('closedTitle').textContent = '이미 응답해 주셨습니다. 감사합니다';
    $('closedBody').innerHTML =
      '이 기기에서 <b>접수번호 ' + esc(receiptNo) + '</b> 로 접수되었습니다. 한 분이 한 번만 응답해 주시면 됩니다.' +
      '<span class="handover"><button type="button" class="linkish" id="btnHandoverIntro">' +
      '다른 분이 이 기기에서 응답하기</button></span>';
    var b = $('btnHandoverIntro');
    if (b) b.addEventListener('click', function () { handOver('fresh'); });
  }

  /* ══════════════════════════════════════════════════════════════════
     기기 넘겨주기 — 공용 PC 에서 «다음 분» 이 응답하실 수 있게 합니다

     ⭐ 이 길을 없애지 마십시오. 사무실 공용 PC 에서 둘째 분부터 정상 응답을
        통째로 잃습니다(🩷자물쇠 판단, 2026-09-11).
     ⛔ 단추 이름을 「다시 응답하기」로 바꾸지 마십시오 — 본인 재응답을 부추깁니다.
     ⛔ 「응답을 수정하려면」 류의 문구를 쓰지 마십시오 — 수정이 아닙니다.
        서버는 UPDATE 를 전면 차단하므로 «새 응답 한 건이 더 쌓입니다».
     ══════════════════════════════════════════════════════════════════ */
  var HANDOVER_ASK =
    '같은 분이 두 번 응답하지 말아 주십시오.\n\n' +
    '이 기기의 접수번호 기록이 지워집니다 — 받으신 번호를 적어 두셨는지 확인해 주십시오.\n\n' +
    '⚠ 앞서 낸 응답은 «고쳐지지 않습니다». 새 응답 한 건이 더 쌓입니다.\n\n' +
    '계속하시겠습니까?';

  function handOver(mode) {
    if (!window.confirm(HANDOVER_ASK)) return;
    try {
      localStorage.removeItem('sv_receipt');
      localStorage.removeItem(window.SURVEY_TOKEN_KEY || 'sv_token');
    } catch (e) {}

    /* 안내 화면을 원래대로 되돌립니다 */
    $('btnStart').hidden = false;
    $('periodClosed').hidden = true;
    paintPeriod();

    if (mode === 'retry') {
      /* SV001 로 거절당한 «둘째 분» — 이미 23문항을 다 적으셨습니다.
         ⛔ 답변을 지우면 안 됩니다. 새 토큰으로 그대로 다시 보내 드립니다. */
      hideFail();
      toast('새 토큰으로 다시 보내 드립니다');
      submit();
      return;
    }

    /* 완료 화면·안내 화면에서 넘겨주는 경우 — 빈 설문지로 새로 시작합니다 */
    cur = 0;
    render();
    $('formDone').hidden = true;
    $('formLive').hidden = false;
    hideFail();
    go('form', true);
    toast('새로 응답하실 수 있습니다');
  }

  /* ══════════════════════════════════════════════════════════════════
     이어붙이기
     ══════════════════════════════════════════════════════════════════ */
  function bind() {
    $('btnStart').addEventListener('click', function () { go('form', true); });
    $('btnPrev').addEventListener('click', function () { step(-1); });
    $('btnNext').addEventListener('click', function () { step(1); });
    $('btnHome').addEventListener('click', function () { go('intro', true); });
    $('btnHandoverDone').addEventListener('click', function () { handOver('fresh'); });
    $('btnHandoverFail').addEventListener('click', function () { handOver('retry'); });

    /* 입력하시는 즉시 빨간 표시를 거두고, 복수선택 개수를 지킵니다 */
    $('qbody').addEventListener('input', function (e) {
      var f = e.target.closest('.q');
      if (f) { f.classList.remove('bad'); f.querySelector('.err').classList.remove('on'); }
      if (e.target.tagName === 'TEXTAREA' && f) {
        var c = f.querySelector('.cnt span');
        if (c) c.textContent = e.target.value.length;
      }
      if (e.target.type === 'checkbox') {
        var wrap = e.target.closest('.opts');
        var max = +wrap.dataset.max;
        if (max) {
          var on = wrap.querySelectorAll('input:checked').length;
          wrap.querySelectorAll('.opt').forEach(function (l) {
            var i = l.querySelector('input');
            var full = on >= max && !i.checked;
            i.disabled = full;
            l.classList.toggle('dim', full);
          });
          if (on >= max) toast(max + '개까지 고르실 수 있습니다');
        }
      }
    });
  }

  /* ── 시작 ─────────────────────────────────────────────────────────── */
  render();
  bind();
  paintPeriod();

  var prev = null;
  try { prev = localStorage.getItem('sv_receipt'); } catch (e) {}
  if (prev && periodState() === 'open') markDone(prev);

  if (location.hash === '#설문' || location.hash === '#form') go('form', false);
})();
