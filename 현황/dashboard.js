/* ══════════════════════════════════════════════════════════════════════
   의견조사 실시간 현황 — dashboard.js                        🩵물결
   ────────────────────────────────────────────────────────────────────
   이 화면이 지키는 약속 (원칙은 주석이 아니라 «코드로» 박아 두었습니다)

   ① 로그인이 먼저다.
      anon 키로는 survey_responses 를 한 줄도 읽지 못한다(RLS). 로그인 전에는
      구독조차 걸지 않는다.
   ② ⭐ 구독 전에 realtime.setAuth(access_token) 을 «반드시» 부른다.
      이것을 빠뜨리면 상태는 SUBSCRIBED 로 뜨는데 payload 가 0건이다.
      설문조사_260911.sql [7]절에 적힌 «가장 위험한 조용한 실패» 다.
      토큰이 갱신되면(onAuthStateChange) 다시 부른다 — 안 그러면 조용히 끊긴다.
   ③ ⛔ 끊긴 채로 「실시간」 표시를 켜 두지 않는다.
      배지 글자·색이 함께 바뀌고, 화면 위에 띠로 정직하게 말한다.
      되살릴 때까지 RT_POLL_MS 마다 다시 조회한다(공무원앱과 같은 20초).
   ④ ⛔ 0건은 «전부 삭제» 가 아니다.
      행은 «늘어나기만» 한다(서버가 UPDATE·DELETE 를 막아 두었다).
      그래서 merge 는 id 기준 합집합이고, 다시 불러온 결과가 더 적어도 지우지 않는다.
   ⑤ 화면을 갈아엎지 않는다.
      목록은 지웠다 다시 그리지 않고 «있던 줄을 옮겨 끼운다» —
      펼쳐 둔 응답·주관식 창·스크롤 위치가 새 응답 때문에 닫히지 않는다.
   ⑥ ⚠ 재식별 방지 — 기관별 집계에서 3건 미만 칸은 수치도 막대 길이도 감춘다.
      읍·면·동은 한 곳에 담당이 한두 명뿐이라 «어느 읍면동인지» 는 묻지도 보여주지도
      않는다 — 읍·면·동 전체를 «한 덩어리» 로만 센다.
      (원자료 목록은 로그인한 분만 보므로 그대로 보여 드린다)
   ⑦ 시민이 적은 글은 «절대» innerHTML 로 넣지 않는다. 전부 textContent 다.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════════
     [설정] 고치실 값은 «전부 여기» 있습니다
     ────────────────────────────────────────────────────────────────
     ⭐⭐ 목표 건수는 «163명 · 확정» 입니다(2026-09-15 양호창님). 부서별 내역은 표기하지 않습니다.
       고치실 값은 이 파일이 아니라 «현황/survey_const.js» 한 곳에 있습니다.
       「(잠정)」 표기는 S.잠정 플래그를 따릅니다 — ⛔ 문자열에 직접 박지 마십시오.
     ══════════════════════════════════════════════════════════════════ */
  /* 조사 대상·기간·기관·목표 인원은 «현황/survey_const.js» 한 곳에 있습니다.
     두 화면(현황 · t6-status)이 같은 숫자를 말하게 하려는 것이므로
     ⛔ 여기에 같은 값을 다시 적지 마십시오. */
  var S = window.SURVEY;

  var CFG = {
    // 실시간이 끊겼을 때의 폴백 조회 주기.
    //   ⭐ 20초는 이 프로젝트의 기존 관행입니다(sangju-policy-admin app.js RT_POLL_MS).
    //     바꾸실 때는 화면의 안내 문구가 «같은 수» 를 말하는지 반드시 확인하십시오 —
    //     주기와 문구가 갈리면 그 순간부터 화면이 거짓말을 합니다.
    RT_POLL_MS: 20000,

    // 구독을 걸고 이 시간 안에 SUBSCRIBED 가 오지 않으면 «끊긴 것» 으로 본다.
    //   실측 2026-09-11 : 정상일 때 SUBSCRIBED 까지 0.3초.
    WATCHDOG_MS: 15000,

    // 이벤트 묶기(debounce) — 한 번에 여러 건이 들어와도 한 번만 처리합니다.
    RENDER_MS: 150,         // 눈에는 «즉시» 로 보이는 간격
    RECONCILE_MS: 1200,     // 놓친 이벤트가 없는지 다시 맞춰 보는 간격(공무원앱과 같은 1.2초)

    // 로그인 요청이 이 시간 안에 답하지 않으면 단추를 풀고 까닭을 말합니다.
    //   ⛔ 이것이 없으면 답 없는 서버 앞에서 화면이 영영 잠깁니다(2026-09-11 실측).
    LOGIN_TIMEOUT_MS: 15000,

    NEW_MS: 90000,          // 「방금 들어왔음」 표시를 유지하는 시간
    FEED_MAX: 300           // 목록에 그리는 최대 줄 수
  };
;

  /* 23문항 — CSV 머리글·상세 펼치기·평균 막대가 «모두» 이 표를 씁니다.
     ⚠ 문항이 또 바뀌면 여기만 고치십시오. 화면·CSV 가 함께 따라옵니다.
       출처: 설문조사_260911.sql [1]절 + 00_화면시안_확정.html SECTIONS */
  var Q = [
    { part: "Ⅰ. 응답자 배경", key: "dept",   no: 1,  type: "one",   title: "소속" },
    { key: "role",   no: 2,  type: "one",   title: "주로 맡고 계신 업무" },
    { key: "career", no: 3,  type: "one",   title: "복지업무 담당 경력" },

    { part: "Ⅱ. 문의 응대·접수", key: "q4", no: 4, type: "scale",
      title: "시민이 복지사업 정보를 찾기 어려워 생기는 문의 응대가 업무에 부담이 되는 정도",
      short: "문4 · 반복 문의 응대 부담" },
    { key: "q5",  no: 5,  type: "one",   title: "하루 평균 정책·사업 관련 문의(전화·방문) 건수" },
    { key: "q6",  no: 6,  type: "multi", title: "접수 업무에서 가장 큰 애로사항 (최대 2개)" },
    { key: "q7",  no: 7,  type: "scale",
      title: "시민이 본인에게 맞는 사업을 스스로 찾을 수 있다면 업무 경감에 도움이 될 것이다",
      short: "문7 · 시민 스스로 찾으면 업무 경감" },

    { part: "Ⅲ. 사업 공고·홍보", key: "q8", no: 8, type: "scale",
      title: "담당 사업을 공고·홍보해도 정작 대상이 되는 시민에게 잘 닿지 않아 겪는 어려움의 정도",
      short: "문8 · 홍보가 대상자에게 닿지 않는 어려움" },
    { key: "q9",  no: 9,  type: "multi", title: "지금 사업을 알리는 데 주로 쓰시는 방법 (최대 3개)" },
    { key: "q10", no: 10, type: "multi", title: "공고·홍보에서 가장 개선이 필요하다고 보시는 점 (최대 2개)" },

    { part: "Ⅳ. 만들고 있는 기능", key: "q11", no: 11, type: "scale",
      title: "㉮ 부서별로 흩어져 있는 사업 공고를 한곳에 모아 보여주는 기능이 필요하다",
      short: "문11 · ㉮ 공고 한곳에 모으기" },
    { key: "q12", no: 12, type: "scale",
      title: "㉯ 시민이 본인에게 맞는 사업을 스스로 찾아 온라인으로 신청하는 기능이 필요하다",
      short: "문12 · ㉯ 맞춤 검색·온라인 신청" },
    { key: "q13", no: 13, type: "scale",
      title: "㉰ 담당자가 접수 현황을 한 화면에서 보고 처리 상태를 관리하는 기능이 필요하다",
      short: "문13 · ㉰ 접수 현황 관리" },
    { key: "q14", no: 14, type: "scale",
      title: "㉱ 접수 내용을 엑셀로 주고받고 보고용 현황 자료를 자동으로 만드는 기능이 필요하다",
      short: "문14 · ㉱ 엑셀·현황 자동화" },
    { key: "q15", no: 15, type: "scale",
      title: "㉲ 시민이 정책을 제안하면 담당 부서가 검토하고 답을 남기는 기능이 필요하다",
      short: "문15 · ㉲ 정책제안·회신" },
    { key: "q16", no: 16, type: "multi", title: "이런 기능들이 갖춰진다면 가장 기대되는 점 (최대 2개)" },

    { part: "Ⅴ. 기대·우려·도입", key: "q17", no: 17, type: "scale",
      title: "우리 부서 업무에 실제로 도움이 될 것이다",
      short: "문17 · 우리 부서 업무에 도움" },
    { key: "q18", no: 18, type: "scale", title: "도입된다면 업무에 사용할 의향이 있다",
      short: "문18 · 사용할 의향" },
    { key: "q19", no: 19, type: "multi", title: "도입할 때 가장 우려되는 점 (최대 2개)" },
    { key: "q20", no: 20, type: "one",   title: "실제 도입을 위해 가장 필요한 지원" },

    { part: "Ⅵ. 확대·자유의견", key: "q21", no: 21, type: "scale",
      title: "이런 플랫폼이 복지 외 다른 분야에도 필요하다고 보십니까",
      short: "문21 · 복지 밖 분야로 확대 필요" },
    { key: "q22", no: 22, type: "text",
      title: "추가되거나 개선되었으면 하는 기능, 또는 공고·홍보와 관련해 바라시는 점" },
    { key: "q23", no: 23, type: "text", title: "그 밖에 하고 싶은 말씀 (선택)" }
  ];

  /* 시안 ③ 이 보여 주던 「주요 문항 평균」 6줄. 「11문항 모두 보기」를 누르면 전부 나옵니다.
     ⚠ 2026-09-11 시안 개정에서 ㉮·㉯ 가 «맞바뀌었습니다» — 문11 이 「공고 한곳에 모으기」,
       문12 가 「맞춤 검색·온라인 신청」 입니다. 그래서 주요 6줄도 q12 → q11 로 바꿨습니다.
       ⛔ supabase/설문조사_260911.sql 의 q12 칼럼 주석(「공고 모으기·맞춤 알림」)은
          아직 옛 순서로 적혀 있습니다 — 🩷자물쇠가 고쳐야 합니다(집계에는 영향 없음). */
  var MEAN_MAIN = ["q4", "q7", "q8", "q11", "q17", "q18"];
  var SCALE_KEYS = Q.filter(function (q) { return q.type === "scale"; })
                    .map(function (q) { return q.key; });

  /* ══════════════════════════════════════════════════════════════════
     [도구] DOM · 시각 · 문자열
     ⛔ 응답자가 적은 글은 언제나 textContent 로만 넣습니다(innerHTML 금지).
     ══════════════════════════════════════════════════════════════════ */
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // 서울 기준 날짜 문자열 'YYYY-MM-DD' — 브라우저 시계가 다른 지역이어도 흔들리지 않게.
  function seoulDay(d) {
    try { return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }
  function seoulStamp(d) {
    try {
      return d.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
      });
    } catch (e) { return d.toISOString(); }
  }
  function ago(iso) {
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return "";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "방금";
    if (s < 3600) return Math.floor(s / 60) + "분 전";
    var today = seoulDay(new Date()), day = seoulDay(new Date(t));
    if (day === today) return Math.floor(s / 3600) + "시간 전";
    var y = new Date(Date.now() - 86400000);
    if (day === seoulDay(y)) return "어제";
    var d = new Date(t);
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("on"); }, 2800);
  }

  /* ══════════════════════════════════════════════════════════════════
     [상태]
     ══════════════════════════════════════════════════════════════════ */
  var sb = null;              // supabase 클라이언트
  var rows = [];              // 응답 원자료 (submitted_at 내림차순)
  var byId = Object.create(null);
  var freshIds = Object.create(null);   // 이 화면에 «들어오는 것을 본» 응답 id
  var openIds = Object.create(null);    // 펼쳐 둔 응답 id
  var feedEls = Object.create(null);    // id → 목록 줄 element (다시 그리지 않고 옮겨 끼운다)
  var meanAll = false;
  var channel = null;
  var rtGen = 0;          // 구독 세대 — 옛 채널이 뒤늦게 보내는 상태를 버리는 표
  var rtOk = false;
  var rtTries = 0;
  var rtTimer = null, pollTimer = null, renderTimer = null, reconcileTimer = null, watchdog = null;
  var pendingToast = 0, pendingDept = "";
  var tableMissing = false;
  var busy = false;

  /* ══════════════════════════════════════════════════════════════════
     [연결] config.js 를 «읽어서만» 씁니다
     ⚠ 루트 config.js 는 `const SUPABASE_URL = …` 형태라 window 의 속성이
       되지 않습니다. typeof 로 전역 바인딩을 봐야 합니다.
     ⛔ new Function/eval 로 읽지 마십시오 — 이 페이지의 CSP 에는 'unsafe-eval' 이
       없어서 «그 자리에서» 막힙니다. typeof 로 곧장 봐야 합니다.
     ══════════════════════════════════════════════════════════════════ */
  function confUrl() {
    if (typeof SUPABASE_URL !== "undefined" && SUPABASE_URL) return SUPABASE_URL;
    if (window.SUPABASE_URL) return window.SUPABASE_URL;
    return null;
  }
  function confKey() {
    if (typeof SUPABASE_ANON_KEY !== "undefined" && SUPABASE_ANON_KEY) return SUPABASE_ANON_KEY;
    if (window.SUPABASE_ANON_KEY) return window.SUPABASE_ANON_KEY;
    return null;
  }

  function boot() {
    if (!S || !S.기관) {
      gateFail("설정 파일(현황/survey_const.js)을 읽지 못했습니다. 같은 폴더에 함께 배포되었는지 확인해 주십시오.");
      return;
    }
    var url = confUrl(), key = confKey();
    if (!window.supabase || !window.supabase.createClient) {
      gateFail("설문 서버 연결 프로그램(supabase-js)을 불러오지 못했습니다. 인터넷 연결 또는 행정망 차단을 확인해 주십시오.");
      return;
    }
    if (!url || !key) {
      gateFail("접속 설정(config.js)을 읽지 못했습니다. 저장소 루트에 config.js 가 배포되었는지 확인해 주십시오.");
      return;
    }
    sb = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    // 토큰이 갱신·변경되면 소켓에도 «다시» 알려 준다. 이걸 빠뜨리면 조용히 끊긴다.
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") { showGate(); return; }
      if (session && session.access_token) {
        setRealtimeAuth(session.access_token);
        if (event === "TOKEN_REFRESHED" && channel) { resubscribe("토큰 갱신"); }
      }
    });

    // 새로고침해도 다시 로그인하지 않도록 세션을 되살린다.
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (s) { enter(s); } else { showGate(); }
    }).catch(function () { showGate(); });
  }

  function gateFail(msg) {
    $("loginErr").textContent = msg;
    $("loginBtn").disabled = true;
  }

  /* ══════════════════════════════════════════════════════════════════
     [로그인]
     ══════════════════════════════════════════════════════════════════ */
  function showGate() {
    teardown();
    $("dash").hidden = true;
    $("gate").hidden = false;
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "로그인";
  }

  function login() {
    var email = $("email").value.trim(), pw = $("pw").value;
    var err = $("loginErr");
    err.textContent = "";
    if (!email || !pw) { err.textContent = "이메일과 비밀번호를 모두 입력해 주십시오."; return; }
    var btn = $("loginBtn");
    btn.disabled = true; btn.textContent = "확인하고 있습니다…";

    /* ⛔ 답이 «영영 오지 않는» 경우를 반드시 풀어 주어야 합니다.
       2026-09-11 실측 — 서버가 답하지 않자 단추가 「확인하고 있습니다…」인 채로
       13초를 넘겨도 잠겨 있었고, 화면은 까닭을 한 마디도 말하지 않았습니다.
       행정망 안에서는 Supabase 로 나가는 길이 막히는 일이 실제로 있습니다
       (메모리 「행정망은 클라우드를 막는다」). 그때 사람이 할 수 있는 일이
       «새로고침» 밖에 없게 두면 안 됩니다.
       ⇒ 제한 시간이 지나면 단추를 풀고 까닭을 글자로 말합니다. */
    var done = false;
    var late = setTimeout(function () {
      if (done) return;
      done = true;
      btn.disabled = false; btn.textContent = "로그인";
      err.textContent = "서버가 " + Math.round(CFG.LOGIN_TIMEOUT_MS / 1000) +
        "초 동안 답하지 않았습니다. 잠시 뒤 다시 눌러 주십시오. " +
        "(행정망 안에서는 Supabase 접속이 막혀 있을 수 있습니다)";
    }, CFG.LOGIN_TIMEOUT_MS);

    sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      if (done) return;                     // 이미 «답이 없다» 고 알린 뒤 뒤늦게 온 답 — 버린다
      done = true; clearTimeout(late);
      if (r.error) {
        btn.disabled = false; btn.textContent = "로그인";
        var m = String(r.error.message || "");
        err.textContent = /Invalid login/i.test(m)
          ? "이메일 또는 비밀번호가 맞지 않습니다."
          : (/Email not confirmed/i.test(m)
              ? "계정의 메일 인증이 끝나지 않았습니다. Supabase 대시보드에서 확인해 주십시오."
              : "로그인하지 못했습니다 — " + m);
        return;
      }
      $("pw").value = "";
      enter(r.data.session);
    }).catch(function (e) {
      if (done) return;
      done = true; clearTimeout(late);
      btn.disabled = false; btn.textContent = "로그인";
      err.textContent = "서버에 닿지 못했습니다. 행정망에서는 Supabase 접속이 막혀 있을 수 있습니다. (" + (e && e.message) + ")";
    });
  }

  function enter(session) {
    $("gate").hidden = true;
    $("dash").hidden = false;
    $("dashSub").textContent =
      "조사 기간 " + S.기간시작 + "(" + S.시작요일 + ") ~ " + S.기간끝 + "(" + S.마감요일 + ")" +
      " · 3개 과 + 읍·면·동 행정복지센터 · 대상 " + S.GOAL + "명" + (S.잠정 ? "(잠정)" : "")
      + (session && session.user && session.user.email ? " · " + session.user.email : "");
    setLive("wait", "연결 중");
    setRealtimeAuth(session && session.access_token);
    fetchAll(true);
    subscribe();
  }

  function logout() {
    teardown();
    sb.auth.signOut().catch(function () {});
    rows = []; byId = Object.create(null); feedEls = Object.create(null);
    openIds = Object.create(null); freshIds = Object.create(null);
    clear($("feed"));
    showGate();
  }

  /* ══════════════════════════════════════════════════════════════════
     [실시간] ⭐ setAuth → subscribe 순서를 «절대» 뒤집지 마십시오
     ══════════════════════════════════════════════════════════════════ */
  function setRealtimeAuth(token) {
    if (!sb || !token) return;
    try {
      // ⭐ 이 한 줄이 없으면 SUBSCRIBED 는 뜨는데 이벤트가 0건이다(설문조사_260911.sql [7]).
      var r = sb.realtime.setAuth(token);
      if (r && typeof r.catch === "function") {
        r.catch(function (e) { console.warn("[현황] realtime.setAuth 실패", e); });
      }
    } catch (e) {
      console.warn("[현황] realtime.setAuth 실패", e);
    }
  }

  function subscribe() {
    if (!sb) return;
    clearTimeout(rtTimer); rtTimer = null;

    /* ⛔ 옛 채널을 치우면 그 채널이 CLOSED 를 «뒤늦게» 보냅니다.
         그걸 «끊겼다» 로 받으면 다시 붙고 또 끊겼다고 보고… 회오리가 돕니다.
         세대(rtGen)를 올려 두고, 제 세대가 아닌 상태 보고는 통째로 버립니다. */
    var gen = ++rtGen;
    if (channel) { var old = channel; channel = null; try { sb.removeChannel(old); } catch (e) {} }

    /* ⛔ 상태를 «아무것도» 안 알려 주는 경우가 있습니다(소켓이 잠기거나 방화벽이 먹을 때).
         그러면 화면은 「연결 중」인 채로 굳고, 폴백 폴링도 돌지 않아 조용히 멈춥니다.
         그 자리를 시간으로 잡습니다 — WATCHDOG_MS 안에 SUBSCRIBED 가 없으면 끊긴 것으로 봅니다.
         (실측: 정상일 때는 0.3초 만에 SUBSCRIBED 가 옵니다 — 15초는 충분히 넉넉합니다) */
    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      if (gen !== rtGen || rtOk) return;
      console.warn("[현황] 구독 응답이 없습니다 — 끊긴 것으로 봅니다");
      dropped("NO_RESPONSE");
    }, CFG.WATCHDOG_MS);

    try {
      channel = sb
        .channel("survey-rt-" + gen + "-" + Date.now())
        .on("postgres_changes",
            { event: "INSERT", schema: "public", table: "survey_responses" },
            onInsert)
        .subscribe(function (status, err) {
          if (gen !== rtGen) return;          // 옛 채널의 뒷북 — 버린다
          if (status === "SUBSCRIBED") {
            rtOk = true; rtTries = 0;
            clearTimeout(watchdog); watchdog = null;
            refreshLive();
            $("rtBanner").hidden = true;
            stopPoll();
            // 붙는 동안 놓친 응답이 있을 수 있으므로 한 번 맞춰 본다.
            fetchAll(false);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (err) console.warn("[현황] 구독 상태", status, err);
            dropped(status);
          }
        });
    } catch (e) {
      // ⛔ 실시간이 죽어도 화면은 살아 있어야 한다 — 조용히 폴링으로 물러난다.
      console.warn("[현황] 구독을 걸지 못했습니다", e);
      dropped("EXCEPTION");
    }
  }

  function resubscribe(why) {
    console.warn("[현황] 다시 구독합니다 —", why);
    subscribe();
  }

  function dropped(status) {
    rtOk = false;
    clearTimeout(watchdog); watchdog = null;
    refreshLive();
    var sec = Math.round(CFG.RT_POLL_MS / 1000);
    $("rtBannerMsg").textContent =
      sec + "초마다 다시 확인하면서 연결을 되살리고 있습니다. 숫자는 계속 갱신됩니다. (" + status + ")";
    $("rtBanner").hidden = false;
    startPoll();

    // 스스로 되살리기 — 1·2·4·8·15·30초로 늘리며 다시 붙는다(30초에서 멈춘다).
    rtTries = Math.min(rtTries + 1, 6);
    var wait = [1000, 2000, 4000, 8000, 15000, 30000][rtTries - 1];
    clearTimeout(rtTimer);
    rtTimer = setTimeout(function () {
      // 토큰이 만료돼 끊긴 경우가 많으므로 세션을 새로 받아 setAuth 부터 다시 한다.
      sb.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        if (!s) { showGate(); return; }
        setRealtimeAuth(s.access_token);
        subscribe();
      }).catch(function () { subscribe(); });
    }, wait);
  }

  function setLive(state, text) {
    var tag = $("liveTag");
    tag.classList.remove("on", "off", "wait");
    if (state !== "on") tag.classList.add(state);
    $("liveTxt").textContent = text;
  }

  /* ⭐ 배지는 «여기 한 곳» 에서만 정합니다.
       2026-09-11 실측으로 잡은 결함 — 표가 없어 조회가 실패하면 setLive("wait") 가
       이미 켜 둔 「실시간」을 덮어썼고, 나중에 표가 생겨도 「대기 중」인 채로 굳었습니다.
       ⛔ 배지를 여기 말고 다른 곳에서 직접 바꾸지 마십시오. 화면이 곧 거짓말을 합니다. */
  function refreshLive() {
    if (!rtOk) { setLive("off", "연결 끊김"); return; }
    if (tableMissing) { setLive("wait", "대기 중"); return; }   // 붙긴 했지만 받을 표가 아직 없다
    setLive("on", "실시간");
  }

  function startPoll() {
    if (pollTimer !== null) return;   // ⚠ !pollTimer 로 쓰면 타이머 id 0 을 «없음» 으로 오인한다
    pollTimer = setInterval(function () { fetchAll(false); }, CFG.RT_POLL_MS);
  }
  function stopPoll() {
    if (pollTimer === null) return;
    clearInterval(pollTimer); pollTimer = null;
  }
  function teardown() {
    rtGen++;                                   // 치우면서 나가는 상태 보고를 무효로 만든다
    stopPoll();
    clearTimeout(watchdog); watchdog = null;
    clearTimeout(rtTimer); rtTimer = null;
    clearTimeout(renderTimer); renderTimer = null;
    clearTimeout(reconcileTimer); reconcileTimer = null;
    if (channel) { try { sb.removeChannel(channel); } catch (e) {} channel = null; }
    rtOk = false; rtTries = 0;
  }

  /* 새 응답이 도착했다 — payload 에 «행 전체» 가 실려 온다(설문조사_260911.sql [7]).
     ⇒ 다시 조회할 필요가 없다. 그대로 합치고 넷(총계·막대·평균·목록)을 함께 갱신한다. */
  function onInsert(payload) {
    var r = payload && payload.new;
    if (!r || !r.id) return;
    if (byId[r.id]) return;             // 폴링이 먼저 가져온 건이면 조용히 넘긴다
    freshIds[r.id] = Date.now();
    merge([r]);
    pendingToast++;
    pendingDept = r.dept || "";
    scheduleRender();
    scheduleReconcile();
  }

  // 이벤트를 묶는다 — 수십 건이 한꺼번에 들어와도 그리기는 한 번이다.
  function scheduleRender() {
    if (renderTimer !== null) return;
    renderTimer = setTimeout(function () {
      renderTimer = null;
      render();
      if (pendingToast > 0) {
        toast(pendingToast === 1
          ? "새 응답이 들어왔습니다 — " + (pendingDept || "부서 미기재")
          : "새 응답 " + pendingToast + "건이 들어왔습니다");
        pendingToast = 0;
      }
    }, CFG.RENDER_MS);
  }
  // 놓친 이벤트가 없는지 한 박자 뒤에 «한 번만» 맞춰 본다.
  function scheduleReconcile() {
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(function () { fetchAll(false); }, CFG.RECONCILE_MS);
  }

  /* ══════════════════════════════════════════════════════════════════
     [조회] ⛔ 0건은 «전부 삭제» 가 아니다 — 합집합으로만 쌓는다
     ══════════════════════════════════════════════════════════════════ */
  function fetchAll(first) {
    if (!sb) return;
    // ⚠ 이미 조회 중이면 «버리지 말고» 한 박자 뒤로 미룬다.
    //   그냥 return 하면 그 사이에 들어온 응답을 영영 못 가져올 수 있다.
    if (busy) { scheduleReconcile(); return; }
    busy = true;
    sb.from("survey_responses").select("*")
      .order("submitted_at", { ascending: false })
      .limit(1000)
      .then(function (res) {
        busy = false;
        if (res.error) { onFetchError(res.error, first); return; }
        tableMissing = false;
        refreshLive();
        var got = res.data || [];
        // 행은 «늘어나기만» 한다(서버가 UPDATE·DELETE 를 막았다).
        // 조회가 이전보다 적게 왔다면 그것은 «삭제» 가 아니라 통신 문제로 본다.
        if (got.length < rows.length) {
          console.warn("[현황] 조회 결과가 이전보다 적습니다(" + got.length + " < " + rows.length +
                       "). 지우지 않고 그대로 둡니다.");
        }
        merge(got);
        paintNotice();
        render();
      })
      .catch(function (e) { busy = false; onFetchError(e, first); });
  }

  function onFetchError(err, first) {
    var code = String((err && err.code) || "");
    var msg = String((err && err.message) || err || "");
    var missing = code === "42P01" || /PGRST20[05]/.test(code) ||
                  /schema cache/i.test(msg) || /does not exist/i.test(msg);
    var denied = code === "42501" || /permission denied/i.test(msg);

    if (missing) {
      // ⛔ 오류를 토하고 하얗게 죽지 않는다.
      tableMissing = true;
      refreshLive();
      $("dashMain").hidden = true;
      notice("아직 설문이 시작되지 않았습니다",
             "설문 응답을 담을 표(survey_responses)가 아직 서버에 없습니다.\n" +
             "Supabase 대시보드 → SQL Editor 에서 supabase/설문조사_260911.sql 을 한 번 실행하시면 " +
             "이 화면이 바로 살아납니다. (응답이 들어오기 시작하면 새로고침 없이 여기에 쌓입니다)");
      return;
    }
    if (denied) {
      $("dashMain").hidden = true;
      notice("응답을 읽을 권한이 없습니다",
             "로그인은 되었지만 서버가 조회를 거절했습니다. 계정이 authenticated 역할인지, " +
             "survey_read_admin 정책이 들어갔는지 확인해 주십시오.");
      return;
    }
    console.warn("[현황] 조회 실패", err);
    if (first && rows.length === 0) {
      notice("응답을 불러오지 못했습니다",
             "서버에 닿지 못했습니다. 행정망에서는 Supabase 접속이 막혀 있을 수 있습니다.\n" + msg);
    } else {
      toast("잠시 서버에 닿지 못했습니다 — 화면의 숫자는 그대로 둡니다");
    }
  }

  function notice(title, body) {
    $("noticeT").textContent = title;
    $("noticeP").textContent = body;
    $("notice").hidden = false;
  }

  function paintNotice() {
    if (tableMissing) return;
    if (rows.length === 0) {
      $("dashMain").hidden = true;
      notice("아직 들어온 응답이 없습니다",
             "조사 기간은 " + S.기간시작 + "(" + S.시작요일 + ") ~ " + S.기간끝 + "(" + S.마감요일 + ")" +
             " " + S.총일수 + "일간이고, 대상은 " + S.GOAL + "명" + (S.잠정 ? "(잠정)" : "") + "입니다.\n" +
             "첫 응답이 도착하면 새로고침하지 않으셔도 이 자리에 바로 나타납니다.");
    } else {
      $("notice").hidden = true;
      $("dashMain").hidden = false;
    }
  }

  function merge(list) {
    var added = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.id || byId[r.id]) continue;
      byId[r.id] = r; rows.push(r); added++;
    }
    if (added) {
      rows.sort(function (a, b) {
        return new Date(b.submitted_at) - new Date(a.submitted_at);
      });
    }
    return added;
  }

  /* ══════════════════════════════════════════════════════════════════
     [집계]
     ══════════════════════════════════════════════════════════════════ */
  /* 「기관 참여율 n / m」 의 분모 — «그 밖의 부서» 를 뺀 기관 수(지금은 4).
     ⛔⛔ target > 0 으로 세지 마십시오. 부서별 대상 인원을 표기하지 않기로 해서
       (2026-09-15) target 이 전부 0 이고, 그렇게 세면 분모가 0 이 되어 KPI 가
       「0 / 0」으로 깨집니다(아래 drawKpi 의 idx < 참여율모수() 도 항상 false 가 되어
       분자까지 0 이 됩니다).
     ⭐ 「그 밖의 부서」를 «이름» 으로 집지 않습니다 — deptIndex() 가 모르는 소속을
       «목록 마지막 칸» 으로 모으므로, 같은 규칙대로 «마지막 칸 하나» 만 뺍니다.
       (칸이 하나뿐인 비정상 설정에서도 0 으로 나누지 않게 최소 1 로 둡니다) */
  function 참여율모수() {
    return Math.max(1, S.기관.length - 1);
  }

  function deptIndex(name) {
    for (var i = 0; i < S.기관.length; i++) if (S.기관[i].name === name) return i;
    return S.기관.length - 1;   // 모르는 값은 «그 밖의 부서» 로 모은다
  }
  function scaleAvgOf(r) {
    var s = 0, n = 0;
    for (var i = 0; i < SCALE_KEYS.length; i++) {
      var v = Number(r[SCALE_KEYS[i]]);
      if (v >= 1 && v <= 5) { s += v; n++; }
    }
    return n ? s / n : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     [그리기]  — 새 응답 한 건에 ①총계 ②부서막대 ③문항평균 ④목록이 함께 움직인다
     ══════════════════════════════════════════════════════════════════ */
  function render() {
    if (rows.length === 0) { paintNotice(); return; }
    paintNotice();
    drawKpi();
    drawDept();
    drawMean();
    drawFeed();
    if (!$("sheet").hidden) drawVoices();
  }

  function drawKpi() {
    var total = rows.length;
    var today = seoulDay(new Date());
    var yday = seoulDay(new Date(Date.now() - 86400000));
    var nToday = 0, nYday = 0, depts = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var d = seoulDay(new Date(rows[i].submitted_at));
      if (d === today) nToday++;
      else if (d === yday) nYday++;
      var idx = deptIndex(rows[i].dept);
      if (idx < 참여율모수()) depts[idx] = true;
    }
    $("kTotal").textContent = String(total);
    $("kTotalSub").textContent = "목표 " + S.GOAL + "건" + (S.잠정 ? "(잠정)" : "");
    $("kRail").style.width = Math.min(100, (total / S.GOAL) * 100) + "%";
    $("kToday").textContent = String(nToday);
    $("kTodaySub").textContent = "어제 " + nYday + "건";
    $("kRate").textContent = Object.keys(depts).length + " / " + 참여율모수();
    $("kRateSub").textContent = Object.keys(depts).length >= 참여율모수()
      ? "모든 기관 응답" : "아직 응답 없는 기관이 있습니다";

    var last = rows[0];
    $("kLast").textContent = ago(last.submitted_at);
    $("kLastSub").textContent = seoulStamp(new Date(last.submitted_at));
  }

  function drawDept() {
    var counts = S.기관.map(function () { return 0; });
    for (var i = 0; i < rows.length; i++) counts[deptIndex(rows[i].dept)]++;

    /* 막대 길이의 기준 — 부서별 대상 인원을 표기하지 않으므로(target 전부 0)
       실제로는 «가장 많은 칸» 이 기준이 됩니다. target 을 다시 채우면 그 값이 기준으로
       되살아나므로 max 에 남겨 둡니다. 최소 1 — 0 으로 나누지 않게. */
    var base = 1;
    for (var j = 0; j < S.기관.length; j++) {
      base = Math.max(base, S.기관[j].target || 0, counts[j]);
    }
    /* ⚠ 가린 칸은 「3건 미만」 길이로 그리므로, 기준이 최소공개건수보다 작으면 막대가
       100% 를 넘칩니다(응답이 아주 적은 초기). target 이 기준이던 때는 생기지 않던 일입니다. */
    base = Math.max(base, S.최소공개건수);

    var box = $("dbar");
    clear(box);
    var masked = 0;
    S.기관.forEach(function (d, i) {
      var n = counts[i];
      /* 응답이 없는 «그 밖의 부서» 는 숨긴다.
         ⛔ target === 0 으로 판정하지 않는다 — target 이 전부 0 이라(2026-09-15) 그 조건은
           응답 0건인 «정식 기관» 까지 통째로 숨겨 버린다. 참여율모수() 와 같은 규칙으로
           «목록 마지막 칸» 만 본다. */
      if (n === 0 && i === S.기관.length - 1) return;
      var hide = n > 0 && n < S.최소공개건수;      // ⚠ 3건 미만은 수치를 드러내지 않는다
      if (hide) masked++;

      var row = el("div", "dbar-row " + d.cls + (hide ? " masked" : ""));
      row.appendChild(el("b", null, d.name));
      row.appendChild(el("em", null,
        (hide ? S.최소공개건수 + "건 미만" : n + "명") +
        (d.target ? " · 대상 " + d.target + "명" : "")));
      var track = el("i");
      var fill = el("u");
      // 막대 길이도 감춘다 — 1건과 2건이 길이로 구분되면 가린 뜻이 없다.
      fill.style.width = (hide ? (S.최소공개건수 / base) * 100 : (n / base) * 100) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      box.appendChild(row);
    });

    $("dbarNote").textContent = "총 " + rows.length + "건"
      + (masked ? " · " + masked + "개 칸을 가렸습니다" : "");
  }

  function drawMean() {
    var keys = meanAll ? SCALE_KEYS : MEAN_MAIN;
    var box = $("mean");
    clear(box);
    keys.forEach(function (k) {
      var q = Q.filter(function (x) { return x.key === k; })[0];
      if (!q) return;
      var s = 0, n = 0;
      for (var i = 0; i < rows.length; i++) {
        var v = Number(rows[i][k]);
        if (v >= 1 && v <= 5) { s += v; n++; }
      }
      var row = el("div", "mean-row");
      row.appendChild(el("b", null, q.short || ("문" + q.no + " · " + q.title)));
      row.appendChild(el("em", null, n ? (s / n).toFixed(1) : "—"));
      var track = el("div", "mean-track");
      [25, 50, 75].forEach(function (p) {
        var tick = el("s"); tick.style.left = p + "%"; track.appendChild(tick);
      });
      var fill = el("u");
      fill.style.width = n ? (((s / n) - 1) / 4 * 100) + "%" : "0%";
      track.appendChild(fill);
      row.appendChild(track);
      box.appendChild(row);
    });
  }

  /* 목록 — ⛔ 지웠다 다시 그리지 않는다. 있던 줄을 «옮겨 끼운다».
     펼쳐 둔 응답·스크롤 위치·포커스가 새 응답 때문에 닫히지 않게. */
  function drawFeed() {
    var box = $("feed");
    var list = rows.slice(0, CFG.FEED_MAX);
    var frag = document.createDocumentFragment();

    list.forEach(function (r) {
      var node = feedEls[r.id];
      if (!node) { node = buildFeedRow(r); feedEls[r.id] = node; }
      // 「방금」 표시는 시간이 지나면 스스로 내린다.
      var fresh = freshIds[r.id] && (Date.now() - freshIds[r.id] < CFG.NEW_MS);
      node.classList.toggle("new", !!fresh);
      var chip = node.querySelector(".newchip");
      if (chip) chip.hidden = !fresh;
      var t = node.querySelector(".fitem-t .ago");
      if (t) t.textContent = ago(r.submitted_at);
      frag.appendChild(node);   // 이미 붙어 있던 줄이면 «옮겨진다»(다시 만들지 않는다)
    });
    box.appendChild(frag);

    $("feedNote").textContent = rows.length
      ? "행을 누르시면 그 응답의 23문항 답이 모두 펼쳐집니다 · " + rows.length + "건"
      : "새 응답이 들어오면 맨 위에 쌓입니다";
  }

  function buildFeedRow(r) {
    var idx = deptIndex(r.dept);
    var wrap = el("div", "fitem " + S.기관[idx].cls);
    wrap.setAttribute("data-id", r.id);

    var btn = el("button", "fitem-b");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.appendChild(el("i"));

    var m = el("div", "fitem-m");
    var head = el("b");
    var chip = el("span", "newchip", "NEW");
    chip.hidden = true;
    head.appendChild(chip);
    head.appendChild(document.createTextNode(
      (r.dept || "부서 미기재") + " · " + (r.role || "업무 미기재") +
      (r.career ? " · " + r.career : "")));
    m.appendChild(head);
    // ⛔ 응답자가 적은 글 — textContent 로만 넣는다.
    m.appendChild(el("span", null, r.q22 ? "“" + r.q22 + "”" : "(자유의견 없음)"));
    btn.appendChild(m);

    var t = el("div", "fitem-t");
    var avg = scaleAvgOf(r);
    t.appendChild(el("b", null, avg === null ? "—" : avg.toFixed(1)));
    t.appendChild(el("span", "ago", ago(r.submitted_at)));
    btn.appendChild(t);

    btn.addEventListener("click", function () { toggleRow(r, wrap, btn); });
    wrap.appendChild(btn);

    if (openIds[r.id]) { wrap.appendChild(buildDetail(r)); btn.setAttribute("aria-expanded", "true"); }
    return wrap;
  }

  function toggleRow(r, wrap, btn) {
    var d = wrap.querySelector(".detail");
    if (d) {
      wrap.removeChild(d);
      delete openIds[r.id];
      btn.setAttribute("aria-expanded", "false");
    } else {
      wrap.appendChild(buildDetail(r));
      openIds[r.id] = true;
      btn.setAttribute("aria-expanded", "true");
    }
  }

  // 응답 한 건의 23문항 답 «전문»
  function buildDetail(r) {
    var box = el("div", "detail");
    var head = el("p", "part", "접수번호 " + (r.receipt_no || "—") +
                              " · " + seoulStamp(new Date(r.submitted_at)));
    box.appendChild(head);

    var dl = el("dl", "dl");
    Q.forEach(function (q) {
      if (q.part) dl.appendChild(el("div", "part", q.part));
      var row = el("div", "row");
      row.appendChild(el("dt", null, "문" + q.no + ". " + q.title));
      var v = r[q.key];
      var dd;
      if (q.type === "multi") {
        var arr = Array.isArray(v) ? v : [];
        dd = arr.length ? el("dd", null, arr.join(" · ")) : el("dd", "empty", "답하지 않음");
      } else if (q.type === "scale") {
        var n = Number(v);
        dd = el("dd");
        if (n >= 1 && n <= 5) {
          var b = el("span", "scalebox", n + " / 5");
          dd.appendChild(b);
        } else { dd.className = "empty"; dd.textContent = "답하지 않음"; }
      } else {
        var s = (v === null || v === undefined) ? "" : String(v).trim();
        dd = s ? el("dd", null, s) : el("dd", "empty", "답하지 않음");
      }
      row.appendChild(dd);
      dl.appendChild(row);
    });
    box.appendChild(dl);
    return box;
  }

  /* ══════════════════════════════════════════════════════════════════
     [주관식 모아보기] — 문22·문23 만 한 화면에
     보고서에 인용하실 때 가장 많이 쓰시는 보기입니다.
     ══════════════════════════════════════════════════════════════════ */
  function voiceRows() {
    return rows.filter(function (r) {
      return (r.q22 && String(r.q22).trim()) || (r.q23 && String(r.q23).trim());
    });
  }
  function drawVoices() {
    var list = voiceRows();
    var body = $("sheetBody");
    clear(body);
    $("sheetN").textContent = list.length + "건 · 전체 " + rows.length + "건 중";
    if (!list.length) {
      body.appendChild(el("p", "notice", "아직 주관식 답변이 없습니다."));
      return;
    }
    list.forEach(function (r) {
      var v = el("div", "voice");
      var m = el("div", "voice-m");
      m.appendChild(el("b", null, r.dept || "부서 미기재"));
      m.appendChild(el("span", null,
        (r.role || "업무 미기재") + (r.career ? " · " + r.career : "")));
      m.appendChild(el("span", null, (r.receipt_no || "") + " · " + seoulStamp(new Date(r.submitted_at))));
      v.appendChild(m);
      if (r.q22 && String(r.q22).trim()) {
        var p = el("p");
        p.appendChild(el("em", null, "문22. 추가·개선되었으면 하는 기능, 공고·홍보에 바라시는 점"));
        p.appendChild(document.createTextNode(String(r.q22)));
        v.appendChild(p);
      }
      if (r.q23 && String(r.q23).trim()) {
        var p2 = el("p", "q23");
        p2.appendChild(el("em", null, "문23. 그 밖에 하고 싶은 말씀"));
        p2.appendChild(document.createTextNode(String(r.q23)));
        v.appendChild(p2);
      }
      body.appendChild(v);
    });
  }
  function openSheet() { $("sheet").hidden = false; drawVoices(); $("btnSheetClose").focus(); }
  function closeSheet() { $("sheet").hidden = true; $("btnVoices").focus(); }

  function copyVoices() {
    var list = voiceRows();
    var text = list.map(function (r) {
      var head = "[" + (r.receipt_no || "") + "] " + (r.dept || "") + " · " + (r.role || "") +
                 (r.career ? " · " + r.career : "");
      var body = "";
      if (r.q22) body += "문22. " + r.q22 + "\n";
      if (r.q23) body += "문23. " + r.q23 + "\n";
      return head + "\n" + body;
    }).join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast("주관식 " + list.length + "건을 복사했습니다"); })
        .catch(function () { toast("복사하지 못했습니다 — 글자를 직접 끌어서 선택해 주십시오"); });
    } else {
      toast("이 브라우저에서는 복사 단추를 쓸 수 없습니다");
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     [엑셀 내려받기] CSV (UTF-8 BOM) — 엑셀에서 한글이 깨지지 않게
     ⚠ 머리글은 q4 같은 «코드» 가 아니라 사람이 읽는 문항 제목입니다.
     ⚠ =, +, -, @ 로 시작하는 칸은 엑셀이 «수식» 으로 읽습니다(CSV 주입).
       앞에 작은따옴표를 붙여 글자로 고정합니다.
     ══════════════════════════════════════════════════════════════════ */
  function csvCell(v) {
    var s;
    if (v === null || v === undefined) s = "";
    else if (Array.isArray(v)) s = v.join(" | ");
    else s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function downloadCsv() {
    if (!rows.length) { toast("내려받을 응답이 아직 없습니다"); return; }
    var head = ["접수번호", "제출시각(한국시간)"].concat(
      Q.map(function (q) { return "문" + q.no + ". " + q.title; }));
    var lines = [head.map(csvCell).join(",")];
    rows.slice().reverse().forEach(function (r) {   // 접수 순서대로(오래된 것부터)
      var cells = [r.receipt_no || "", seoulStamp(new Date(r.submitted_at))];
      Q.forEach(function (q) { cells.push(r[q.key]); });
      lines.push(cells.map(csvCell).join(","));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    var now = new Date();
    var name = "의견조사_응답_" + seoulDay(now).replace(/-/g, "").slice(2) + "_" +
               String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0") + ".csv";
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast("응답 " + rows.length + "건을 CSV 로 내려받았습니다 (23문항 전체)");
  }

  /* ══════════════════════════════════════════════════════════════════
     [연결]
     ══════════════════════════════════════════════════════════════════ */
  $("loginBtn").addEventListener("click", login);
  ["email", "pw"].forEach(function (id) {
    $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
  });
  $("btnLogout").addEventListener("click", logout);
  $("btnCsv").addEventListener("click", downloadCsv);
  $("btnVoices").addEventListener("click", openSheet);
  $("btnSheetClose").addEventListener("click", closeSheet);
  $("btnCopyVoices").addEventListener("click", copyVoices);
  $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) closeSheet(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("sheet").hidden) closeSheet();
  });
  $("btnReload").addEventListener("click", function () { fetchAll(false); toast("다시 불러왔습니다"); });
  $("btnRetry").addEventListener("click", function () { rtTries = 0; resubscribe("사용자 요청"); });
  $("btnMeanAll").addEventListener("click", function () {
    meanAll = !meanAll;
    this.setAttribute("aria-pressed", String(meanAll));
    this.textContent = meanAll ? "주요 6문항만 보기" : "11문항 모두 보기";
    drawMean();
  });

  // 탭을 다시 켜면 그동안 놓친 것이 없는지 한 번 맞춰 본다(절전으로 소켓이 잠들 수 있다).
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || $("dash").hidden) return;
    fetchAll(false);
    if (!rtOk) { rtTries = 0; resubscribe("탭 복귀"); }
  });

  // 「방금」 표시와 「N분 전」 을 스스로 늙게 한다(응답이 안 와도 시각은 흐른다).
  setInterval(function () {
    if ($("dash").hidden || rows.length === 0) return;
    drawFeed();
    $("kLast").textContent = ago(rows[0].submitted_at);
  }, 30000);

  boot();
})();
